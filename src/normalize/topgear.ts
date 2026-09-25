import { pickBestSource } from '../lookup/encounterItems'
import { resolveTierEncounters } from '../lookup/tierResolve'
import type { LearnedTierData } from '../lookup/tierLearned'
import type { EncounterItemsLookup, NormalizedTopGear, TopGearCandidate, TopGearItem, TopGearSet } from '../types'

export class UnsupportedTopGearReportError extends Error {}

/**
 * Slot order of the 16-element `combinations[].gear` index array. Verified against a
 * live Top Gear report (miriTcb27bfGDYmV6JjvD1, 2026-09-20): `combinations[0].gear`
 * (the implicit equipped baseline -- see below) resolves, slot by slot through this
 * order, to exactly the items `rawFormData.optimize.equippedGear` reports as equipped.
 */
const SLOT_ORDER = [
  'head',
  'neck',
  'shoulder',
  'back',
  'chest',
  'wrist',
  'hands',
  'waist',
  'legs',
  'feet',
  'finger1',
  'finger2',
  'trinket1',
  'trinket2',
  'main_hand',
  'off_hand',
] as const

/** Both ring slots share one candidate pool (`rings`); both trinket slots share `trinkets`. Every other slot's pool is named after the slot itself. */
const POOL_FOR_SLOT: Record<string, string> = { finger1: 'rings', finger2: 'rings', trinket1: 'trinkets', trinket2: 'trinkets' }

function poolNameForSlot(slot: string): string {
  return POOL_FOR_SLOT[slot] ?? slot
}

export type RaidbotsTopGearItem = {
  id: number
  name: string
  itemLevel?: number
  equipped?: boolean
  equippedSlot?: string
}

export type RaidbotsTopGearCombination = {
  gear: Array<number | null>
}

export type RaidbotsTopGearOptimizeFormData = {
  combinations: RaidbotsTopGearCombination[]
  equippedGear: Record<string, RaidbotsTopGearItem[]>
  allGear: Record<string, RaidbotsTopGearItem[]>
}

export type RaidbotsTopGearRawReport = {
  sim: {
    players: Array<{ collected_data: { dps: { mean: number } } }>
    profilesets: {
      metric: string
      results: Array<{ name: string; mean: number }>
    }
  }
  simbot: {
    simType: string
    player: string
    charClass: string
    spec: string
    meta: {
      rawFormData: {
        optimize?: RaidbotsTopGearOptimizeFormData
      }
    }
  }
}

/**
 * Maps a `combinations[].gear` index array to the items it represents, via
 * `rawFormData.optimize.allGear` (the full per-slot candidate pool -- `gear[]` holds
 * each slot's index *into that pool*, not into the narrower `optimize.gear` "selected
 * for combination generation" subset, which is a differently-indexed array despite the
 * similar name).
 */
function itemsForGear(gear: Array<number | null>, allGear: Record<string, RaidbotsTopGearItem[]>): TopGearItem[] {
  const items: TopGearItem[] = []
  SLOT_ORDER.forEach((slot, i) => {
    const idx = gear[i]
    if (idx == null) return
    const pool = allGear[poolNameForSlot(slot)]
    const item = pool?.[idx]
    // Defensive: an out-of-range index would mean allGear and combinations disagree on
    // this report -- not observed live, skip rather than throw.
    if (!item) return
    items.push({ itemId: item.id, name: item.name, slot, ilvl: item.itemLevel ?? 0 })
  })
  return items
}

function equippedItemsFrom(equippedGear: Record<string, RaidbotsTopGearItem[]>): TopGearItem[] {
  const items: TopGearItem[] = []
  for (const [poolName, entries] of Object.entries(equippedGear)) {
    for (const item of entries) {
      items.push({ itemId: item.id, name: item.name, slot: item.equippedSlot ?? poolName, ilvl: item.itemLevel ?? 0 })
    }
  }
  return items
}

/** "Combo 4" -> 4. Null when the name doesn't match the expected "Combo N" shape. */
function parseComboIndex(name: string): number | null {
  const match = name.match(/^Combo (\d+)$/)
  return match ? Number(match[1]) : null
}

function metricFromLabel(label: string): 'dps' | 'hps' {
  return /heal/i.test(label) ? 'hps' : 'dps'
}

/**
 * Resolves a candidate item to the boss that drops it, when it's a raid/dungeon item.
 * Mirrors QE Live's resolution order (`normalizeQELiveReport`): a direct positive
 * source from encounter-items.json first (kept only if its instance is actually a raid
 * or dungeon -- Top Gear candidates can just as easily be crafted/PvP/world gear), else
 * the tier-token seed/learned fallback against the report's dominant instance (the
 * instance most of this report's *other* resolved candidates belong to -- Top Gear
 * carries no instance id of its own, unlike a droptimizer report).
 */
function resolveCandidateBoss(
  itemId: number,
  slot: string,
  lookup: EncounterItemsLookup,
  dominantInstanceId: number | undefined,
  learnedByInstance: Map<number, LearnedTierData> | undefined
): { instanceId: number; encounterId: number } | null {
  const direct = pickBestSource(lookup, itemId, 'other')
  if (direct) {
    const type = lookup.instanceTypes.get(direct.instanceId)
    if (type === 'raid' || type === 'dungeon') return direct
  }
  if (dominantInstanceId !== undefined) {
    const tierMatches = resolveTierEncounters(dominantInstanceId, itemId, slot, learnedByInstance?.get(dominantInstanceId))
    // The curio can't be won with a bonus roll, so it is never a candidate's roll source.
    const primary = tierMatches.find((m) => !m.viaCurio)
    if (primary) return { instanceId: dominantInstanceId, encounterId: primary.encounterId }
  }
  return null
}

export function normalizeTopGearReport(
  reportId: string,
  raw: RaidbotsTopGearRawReport,
  lookup: EncounterItemsLookup,
  learnedByInstance?: Map<number, LearnedTierData>
): NormalizedTopGear {
  const optimize = raw.simbot.meta.rawFormData.optimize
  if (raw.simbot.simType !== 'optimize' || !optimize) {
    throw new UnsupportedTopGearReportError(`Unsupported simType: ${raw.simbot.simType} (expected a Raidbots Top Gear "optimize" report)`)
  }

  const baseline = raw.sim.players[0].collected_data.dps.mean
  const spec = raw.simbot.spec.toLowerCase()
  const metric = metricFromLabel(raw.sim.profilesets.metric)

  const equippedItems = equippedItemsFrom(optimize.equippedGear)
  const equippedIds = new Set(equippedItems.map((i) => i.itemId))

  type RichSet = TopGearSet & { candidateItems: TopGearItem[] }
  const sets: RichSet[] = []

  for (const result of raw.sim.profilesets.results) {
    const comboIdx = parseComboIndex(result.name)
    if (comboIdx == null) continue
    const combo = optimize.combinations[comboIdx - 1]
    if (!combo) continue

    const items = itemsForGear(combo.gear, optimize.allGear)
    const delta = result.mean - baseline
    const pct = (delta / baseline) * 100
    const candidateItems = items.filter((it) => !equippedIds.has(it.itemId))

    sets.push({ delta, pct, items, candidateItems })
  }

  sets.sort((a, b) => b.pct - a.pct)

  const best = sets[0] ?? { delta: 0, pct: 0, items: equippedItems, candidateItems: [] }

  // Resolve the winning set's candidates to bosses. First pass: direct resolution only,
  // to establish the dominant instance for the tier-token fallback (same two-pass shape
  // as normalizeQELiveReport).
  const directResolutions = new Map<number, { instanceId: number; encounterId: number }>()
  const instanceCounts = new Map<number, number>()
  for (const item of best.candidateItems) {
    const direct = pickBestSource(lookup, item.itemId, 'other')
    if (!direct) continue
    const type = lookup.instanceTypes.get(direct.instanceId)
    if (type !== 'raid' && type !== 'dungeon') continue
    directResolutions.set(item.itemId, direct)
    instanceCounts.set(direct.instanceId, (instanceCounts.get(direct.instanceId) ?? 0) + 1)
  }
  let dominantInstanceId: number | undefined
  let dominantCount = 0
  for (const [id, count] of instanceCounts) {
    if (count > dominantCount) {
      dominantInstanceId = id
      dominantCount = count
    }
  }

  const candidates: TopGearCandidate[] = best.candidateItems.map((item) => {
    const resolved = directResolutions.get(item.itemId) ?? resolveCandidateBoss(item.itemId, item.slot, lookup, dominantInstanceId, learnedByInstance)
    if (!resolved) return { ...item }
    return {
      ...item,
      instanceId: resolved.instanceId,
      encounterId: resolved.encounterId,
      encounterName: lookup.encounterNames.get(resolved.encounterId) ?? `Encounter ${resolved.encounterId}`,
    }
  })

  const allSets: TopGearSet[] = sets.slice(0, 10).map(({ delta, pct, items }) => ({ delta, pct, items }))

  return {
    source: 'raidbots',
    reportId,
    character: raw.simbot.player,
    spec,
    baseline,
    metric,
    bestSet: { delta: best.delta, pct: best.pct, items: best.items },
    equippedItems,
    candidates,
    allSets,
  }
}
