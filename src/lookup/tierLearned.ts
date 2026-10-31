import { parseProfilesetName, type RaidbotsItemLibraryEntry, type RaidbotsRawReport } from '../normalize/raidbots'
import { getCurioEncounterId } from './tierSeed'
import type { LookupEnv } from './encounterItems'
import type { EncounterItemsLookup } from '../types'

export type LearnedTierData = {
  /** itemId -> encounterId[] (direct, non-catalyst sources only). */
  byItem: Record<number, number[]>
  /** tier slot -> encounterId[] (direct, non-catalyst sources only). */
  bySlot: Record<string, number[]>
}

/**
 * Identifies which itemLibrary entries are tier-set items.
 *
 * Primary method (used on live data): `itemSetId` is present directly on tier items'
 * itemLibrary entries -- confirmed live 2026-09-08 (e.g. item 271483 carries
 * `itemSetId: 2065`, matching Raidbots' static item-sets.json entry "Ophidian
 * Oracle's Prophecy", which lists all 5 armor tier pieces for the class). This made a
 * separate item-sets.json fetch unnecessary -- the set membership Raidbots' spec asked
 * us to check for is already inlined onto the item.
 *
 * Fallback (not exercised by current season data): an item with more than one distinct
 * source encounter within the report, one of which is the seed's curio encounter, is
 * treated as a tier item.
 */
function detectTierItemIds(itemLibrary: RaidbotsItemLibraryEntry[], instanceId: number): Set<number> {
  const bySetId = new Set(itemLibrary.filter((e) => e.itemSetId != null).map((e) => e.id))
  if (bySetId.size > 0) return bySetId

  const curioEncounterId = getCurioEncounterId(instanceId)
  if (curioEncounterId === undefined) return new Set()

  const encountersByItem = new Map<number, Set<number>>()
  for (const entry of itemLibrary) {
    const encounterId = entry.sources?.[0]?.encounterId
    if (encounterId === undefined) continue
    if (!encountersByItem.has(entry.id)) encountersByItem.set(entry.id, new Set())
    encountersByItem.get(entry.id)!.add(encounterId)
  }

  const result = new Set<number>()
  for (const [itemId, encounters] of encountersByItem) {
    if (encounters.size > 1 && encounters.has(curioEncounterId)) result.add(itemId)
  }
  return result
}

/**
 * Extracts tier-item -> encounter mappings from a single Raidbots droptimizer report.
 * `allowedEncounterIds`, when given, is the instance's non-trash encounter list from the
 * static data (`lookup.encountersByInstance`, see `instanceEncounterIds`); rows naming any
 * other encounter are ignored.
 * Pure -- no I/O. Only direct (non-catalyst, non-trash) profileset rows for the given
 * instance are counted, so catalyst-conversion sources don't pollute the learned boss
 * mapping.
 */
export function extractLearnedTierData(raw: RaidbotsRawReport, instanceId: number, allowedEncounterIds?: ReadonlySet<number>): LearnedTierData {
  const tierItemIds = detectTierItemIds(raw.simbot.meta.itemLibrary, instanceId)
  const byItem: Record<number, Set<number>> = {}
  const bySlot: Record<string, Set<number>> = {}

  for (const result of raw.sim.profilesets.results) {
    const parsed = parseProfilesetName(result.name)
    if (parsed.instanceId !== instanceId) continue
    if (parsed.encounterId <= 0) continue
    // Only encounters the static data lists for this instance: a malformed or crafted report
    // can't teach a tier piece to drop from another instance's (or a made-up) boss.
    if (allowedEncounterIds && !allowedEncounterIds.has(parsed.encounterId)) continue
    if (parsed.catalystSourceId !== undefined) continue
    if (!tierItemIds.has(parsed.itemId)) continue

    if (!byItem[parsed.itemId]) byItem[parsed.itemId] = new Set()
    byItem[parsed.itemId].add(parsed.encounterId)

    if (parsed.slot) {
      if (!bySlot[parsed.slot]) bySlot[parsed.slot] = new Set()
      bySlot[parsed.slot].add(parsed.encounterId)
    }
  }

  return {
    byItem: Object.fromEntries(Object.entries(byItem).map(([id, set]) => [id, [...set].sort((a, b) => a - b)])),
    bySlot: Object.fromEntries(Object.entries(bySlot).map(([slot, set]) => [slot, [...set].sort((a, b) => a - b)])),
  }
}

/** The non-trash encounter ids the static data lists for `instanceId` (empty when unknown). */
export function instanceEncounterIds(lookup: Pick<EncounterItemsLookup, 'encountersByInstance'>, instanceId: number): Set<number> {
  return new Set((lookup.encountersByInstance.get(instanceId) ?? []).filter((e) => !e.trash).map((e) => e.id))
}

/** Union-merges two LearnedTierData maps -- never replaces, only adds encounter ids. */
export function mergeLearnedTierData(existing: LearnedTierData, update: LearnedTierData): LearnedTierData {
  const mergeMaps = (a: Record<string, number[]>, b: Record<string, number[]>): Record<string, number[]> => {
    const out: Record<string, number[]> = {}
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      out[key] = [...new Set([...(a[key] ?? []), ...(b[key] ?? [])])].sort((x, y) => x - y)
    }
    return out
  }
  return { byItem: mergeMaps(existing.byItem, update.byItem), bySlot: mergeMaps(existing.bySlot, update.bySlot) }
}

// ============================================================
// Persistence (I/O): KV if bound, else Cache API, else an in-memory
// module-level map (so this is exercisable under plain vitest, which has
// neither KV nor the Workers `caches` global).
// ============================================================

const TIER_LEARNED_TTL_SECONDS = 30 * 24 * 60 * 60

/** A learned mapping is trusted (returned by getLearnedTierData) once this many distinct reports showed it. */
export const MIN_LEARNED_REPORTS = 2

/** Report ids that showed each mapping: key ("itemId" or slot) -> encounterId -> report ids (at most MIN_LEARNED_REPORTS kept). */
type Evidence = Record<string, Record<string, string[]>>

/**
 * What's persisted: candidate mappings with the reports that showed them. v1 (a bare
 * LearnedTierData, trusted after one report) is read as one report of evidence under the
 * synthetic id "legacy", so a v1 mapping needs one more real report to become trusted.
 */
export type LearnedTierStore = { version: 2; byItem: Evidence; bySlot: Evidence }

const LEGACY_REPORT_ID = 'legacy'

function emptyStore(): LearnedTierStore {
  return { version: 2, byItem: {}, bySlot: {} }
}

function parseStore(raw: unknown): LearnedTierStore {
  if (!raw || typeof raw !== 'object') return emptyStore()
  const obj = raw as Partial<LearnedTierStore> & Partial<LearnedTierData>
  if (obj.version === 2) return { version: 2, byItem: obj.byItem ?? {}, bySlot: obj.bySlot ?? {} }
  const fromV1 = (m: Record<string, number[]> | undefined): Evidence =>
    Object.fromEntries(Object.entries(m ?? {}).map(([k, encs]) => [k, Object.fromEntries(encs.map((e) => [String(e), [LEGACY_REPORT_ID]]))]))
  return { version: 2, byItem: fromV1(obj.byItem as Record<string, number[]> | undefined), bySlot: fromV1(obj.bySlot as Record<string, number[]> | undefined) }
}

/** Adds one report's mappings to the store (pure). Report ids are deduplicated and capped, so a repeat or a 3rd+ report changes nothing. */
export function addLearnedEvidence(store: LearnedTierStore, update: LearnedTierData, reportId: string): LearnedTierStore {
  const add = (evidence: Evidence, m: Record<string, number[]>): Evidence => {
    const out: Evidence = Object.fromEntries(Object.entries(evidence).map(([k, encs]) => [k, Object.fromEntries(Object.entries(encs).map(([e, ids]) => [e, [...ids]]))]))
    for (const [key, encs] of Object.entries(m)) {
      for (const enc of encs) {
        const byEnc = (out[key] ??= {})
        const ids = (byEnc[String(enc)] ??= [])
        if (!ids.includes(reportId) && ids.length < MIN_LEARNED_REPORTS) ids.push(reportId)
      }
    }
    return out
  }
  return { version: 2, byItem: add(store.byItem, update.byItem), bySlot: add(store.bySlot, update.bySlot) }
}

/** The trusted mappings: those shown by at least MIN_LEARNED_REPORTS distinct reports (pure). */
export function trustedLearnedTierData(store: LearnedTierStore): LearnedTierData {
  const view = (evidence: Evidence): Record<string, number[]> => {
    const out: Record<string, number[]> = {}
    for (const [key, encs] of Object.entries(evidence)) {
      const trusted = Object.entries(encs)
        .filter(([, ids]) => new Set(ids).size >= MIN_LEARNED_REPORTS)
        .map(([e]) => Number(e))
        .sort((a, b) => a - b)
      if (trusted.length) out[key] = trusted
    }
    return out
  }
  return { byItem: view(store.byItem), bySlot: view(store.bySlot) }
}

/** Order-independent serialization, so "unchanged" is a string compare. */
function canonical(store: LearnedTierStore): string {
  const sortEvidence = (e: Evidence) =>
    Object.fromEntries(
      Object.keys(e)
        .sort()
        .map((k) => [k, Object.fromEntries(Object.keys(e[k]).sort().map((enc) => [enc, [...e[k][enc]].sort()]))])
    )
  return JSON.stringify({ version: 2, byItem: sortEvidence(store.byItem), bySlot: sortEvidence(store.bySlot) })
}

const memoryStore = new Map<number, string>()

function tierLearnedCacheKey(instanceId: number): Request {
  return new Request(`https://cache.gallagioloot.local/tier-learned/${instanceId}`)
}

async function readStore(env: LookupEnv, instanceId: number): Promise<{ store: LearnedTierStore; raw: string | null }> {
  let raw: string | null = null
  if (env.ENCOUNTER_ITEMS_KV) raw = await env.ENCOUNTER_ITEMS_KV.get(`tier-learned:${instanceId}`)
  else if (typeof caches !== 'undefined') {
    const cached = await caches.default.match(tierLearnedCacheKey(instanceId))
    raw = cached ? await cached.text() : null
  } else raw = memoryStore.get(instanceId) ?? null
  if (!raw) return { store: emptyStore(), raw: null }
  try {
    return { store: parseStore(JSON.parse(raw)), raw }
  } catch {
    return { store: emptyStore(), raw }
  }
}

/** The trusted learned mappings for an instance (see MIN_LEARNED_REPORTS). */
export async function getLearnedTierData(env: LookupEnv, instanceId: number): Promise<LearnedTierData> {
  return trustedLearnedTierData((await readStore(env, instanceId)).store)
}

/**
 * Records `update` as evidence from report `reportId` and persists the result -- skipping the
 * write entirely (KV puts are metered) when the merged store is unchanged, e.g. the same report
 * fetched again or a mapping already trusted. Returns the trusted view.
 */
export async function saveLearnedTierData(env: LookupEnv, instanceId: number, update: LearnedTierData, reportId: string): Promise<LearnedTierData> {
  const { store: existing, raw } = await readStore(env, instanceId)
  const merged = addLearnedEvidence(existing, update, reportId)
  const body = canonical(merged)
  if (raw === body) return trustedLearnedTierData(merged)

  if (env.ENCOUNTER_ITEMS_KV) {
    await env.ENCOUNTER_ITEMS_KV.put(`tier-learned:${instanceId}`, body, {
      expirationTtl: TIER_LEARNED_TTL_SECONDS,
    })
  } else if (typeof caches !== 'undefined') {
    await caches.default.put(
      tierLearnedCacheKey(instanceId),
      new Response(body, {
        headers: { 'Cache-Control': `public, max-age=${TIER_LEARNED_TTL_SECONDS}` },
      })
    )
  } else {
    memoryStore.set(instanceId, body)
  }
  return trustedLearnedTierData(merged)
}

export async function getAllLearnedTierData(env: LookupEnv, instanceIds: number[]): Promise<Map<number, LearnedTierData>> {
  const entries = await Promise.all(instanceIds.map(async (id) => [id, await getLearnedTierData(env, id)] as const))
  return new Map(entries)
}
