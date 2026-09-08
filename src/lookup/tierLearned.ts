import { parseProfilesetName, type RaidbotsItemLibraryEntry, type RaidbotsRawReport } from '../normalize/raidbots'
import { getCurioEncounterId } from './tierSeed'
import type { LookupEnv } from './encounterItems'

export type LearnedTierData = {
  /** itemId -> encounterId[] (direct, non-catalyst sources only). */
  byItem: Record<number, number[]>
  /** tier slot -> encounterId[] (direct, non-catalyst sources only). */
  bySlot: Record<string, number[]>
}

function emptyLearnedTierData(): LearnedTierData {
  return { byItem: {}, bySlot: {} }
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
 * Pure -- no I/O. Only direct (non-catalyst, non-trash) profileset rows for the given
 * instance are counted, so catalyst-conversion sources don't pollute the learned boss
 * mapping.
 */
export function extractLearnedTierData(raw: RaidbotsRawReport, instanceId: number): LearnedTierData {
  const tierItemIds = detectTierItemIds(raw.simbot.meta.itemLibrary, instanceId)
  const byItem: Record<number, Set<number>> = {}
  const bySlot: Record<string, Set<number>> = {}

  for (const result of raw.sim.profilesets.results) {
    const parsed = parseProfilesetName(result.name)
    if (parsed.instanceId !== instanceId) continue
    if (parsed.encounterId <= 0) continue
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

const memoryStore = new Map<number, LearnedTierData>()

function tierLearnedCacheKey(instanceId: number): Request {
  return new Request(`https://cache.gallagioloot.local/tier-learned/${instanceId}`)
}

export async function getLearnedTierData(env: LookupEnv, instanceId: number): Promise<LearnedTierData> {
  if (env.ENCOUNTER_ITEMS_KV) {
    const raw = await env.ENCOUNTER_ITEMS_KV.get(`tier-learned:${instanceId}`)
    return raw ? (JSON.parse(raw) as LearnedTierData) : emptyLearnedTierData()
  }
  if (typeof caches !== 'undefined') {
    const cached = await caches.default.match(tierLearnedCacheKey(instanceId))
    return cached ? ((await cached.json()) as LearnedTierData) : emptyLearnedTierData()
  }
  return memoryStore.get(instanceId) ?? emptyLearnedTierData()
}

/** Merges `update` into whatever is already cached for `instanceId` and persists the result. */
export async function saveLearnedTierData(env: LookupEnv, instanceId: number, update: LearnedTierData): Promise<LearnedTierData> {
  const existing = await getLearnedTierData(env, instanceId)
  const merged = mergeLearnedTierData(existing, update)

  if (env.ENCOUNTER_ITEMS_KV) {
    await env.ENCOUNTER_ITEMS_KV.put(`tier-learned:${instanceId}`, JSON.stringify(merged), {
      expirationTtl: TIER_LEARNED_TTL_SECONDS,
    })
  } else if (typeof caches !== 'undefined') {
    await caches.default.put(
      tierLearnedCacheKey(instanceId),
      new Response(JSON.stringify(merged), {
        headers: { 'Cache-Control': `public, max-age=${TIER_LEARNED_TTL_SECONDS}` },
      })
    )
  } else {
    memoryStore.set(instanceId, merged)
  }
  return merged
}

export async function getAllLearnedTierData(env: LookupEnv, instanceIds: number[]): Promise<Map<number, LearnedTierData>> {
  const entries = await Promise.all(instanceIds.map(async (id) => [id, await getLearnedTierData(env, id)] as const))
  return new Map(entries)
}
