import { pickBestSource } from '../lookup/encounterItems'
import { resolveTierEncounters } from '../lookup/tierResolve'
import type { LearnedTierData } from '../lookup/tierLearned'
import type { ContentType, EncounterItemsLookup, NormalizedItem, NormalizedReport } from '../types'

export type QELiveResult = {
  item: number
  dropLoc: 'Dungeon' | 'Crafted' | 'Delves' | 'Raid'
  dropType: 'drop' | 'max' | 'bonus' | null
  dropDifficulty: number | ''
  level: number
  score: number
  rawDiff: number
  percDiff: number
}

export type QELiveRawReport = {
  id: string
  playername: string
  realm?: string
  region?: string
  spec: string
  contentType: 'Raid' | 'Dungeon' | string
  results: QELiveResult[]
}

/**
 * The QE Live API wraps its JSON payload in a JSON-encoded string, so the raw
 * HTTP body must be parsed twice: once to unwrap the outer string, once to
 * parse the actual report object.
 */
export function parseQELiveResponseBody(bodyText: string): QELiveRawReport {
  const once = JSON.parse(bodyText)
  if (typeof once !== 'string') {
    throw new Error('Expected QE Live response body to decode to a JSON string on first parse')
  }
  return JSON.parse(once) as QELiveRawReport
}

const RAID_DIFFICULTY_NAMES: Record<number, string> = {
  1: 'lfr',
  2: 'normal',
  3: 'heroic',
  4: 'mythic',
}

// Standard WoW inventoryType ids for the slots that can drop as loot.
export const INVENTORY_TYPE_TO_SLOT: Record<number, string> = {
  1: 'head',
  2: 'neck',
  3: 'shoulder',
  5: 'chest',
  6: 'waist',
  7: 'legs',
  8: 'feet',
  9: 'wrist',
  10: 'hands',
  11: 'finger',
  12: 'trinket',
  15: 'ranged',
  16: 'back',
  20: 'chest',
  23: 'holdable',
}

function mapDifficulty(dropDifficulty: number | '', contentType: ContentType): string {
  if (dropDifficulty === '') return 'unknown'
  if (contentType === 'raid') return RAID_DIFFICULTY_NAMES[dropDifficulty] ?? String(dropDifficulty)
  return String(dropDifficulty)
}

function mapContentType(raw: string): ContentType {
  const lower = raw.toLowerCase()
  if (lower === 'raid') return 'raid'
  if (lower === 'dungeon') return 'dungeon'
  return 'other'
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export function normalizeQELiveReport(
  reportId: string,
  raw: QELiveRawReport,
  lookup: EncounterItemsLookup,
  learnedByInstance?: Map<number, LearnedTierData>
): NormalizedReport {
  const warnings: string[] = []
  const contentType = mapContentType(raw.contentType)
  const keptDropLoc = contentType === 'raid' ? 'Raid' : contentType === 'dungeon' ? 'Dungeon' : null

  const bonusRows = raw.results.filter((r) => r.dropType === 'bonus')
  const kept = keptDropLoc ? bonusRows.filter((r) => r.dropLoc === keptDropLoc) : []

  const craftedOrDelvesExcluded = bonusRows.filter(
    (r) => r.dropLoc === 'Crafted' || r.dropLoc === 'Delves'
  ).length
  if (craftedOrDelvesExcluded > 0) {
    warnings.push(`${craftedOrDelvesExcluded} Crafted/Delves entries excluded`)
  }

  const baselineCandidates = kept
    .filter((r) => r.percDiff !== 0)
    .map((r) => r.rawDiff / (r.percDiff / 100))
  let baseline: number
  if (baselineCandidates.length > 0) {
    baseline = median(baselineCandidates)
  } else {
    baseline = 0
    warnings.push('Could not derive baseline: no rows with nonzero percDiff')
  }

  const difficulty = mapDifficulty(kept[0]?.dropDifficulty ?? '', contentType)

  const [specWord, ...classWords] = raw.spec.split(' ')
  const charClass = classWords.join(' ') || undefined

  // QE Live rows carry no instance id of their own -- pickBestSource resolves each row
  // independently, purely by item id, so a row can legitimately resolve to *any* raid
  // instance active this tier (e.g. the main raid and a smaller "raid lair"), not just
  // the one instance this report is meant to represent. A NormalizedReport is
  // single-instance by schema (matching the Raidbots normalizer, which reads the
  // instance directly off the report's own droptimizer metadata), so a first pass
  // resolves every row and tallies instances to find the dominant (most-represented)
  // one; a second pass keeps only rows resolving to that instance.
  const resolved: Array<{ row: QELiveResult; source: { instanceId: number; encounterId: number } }> = []
  const unresolved: QELiveResult[] = []
  const resolvedInstanceCounts = new Map<number, number>()

  for (const row of kept) {
    const source = pickBestSource(lookup, row.item, contentType)
    if (!source) {
      unresolved.push(row)
      continue
    }
    resolved.push({ row, source })
    resolvedInstanceCounts.set(source.instanceId, (resolvedInstanceCounts.get(source.instanceId) ?? 0) + 1)
  }

  let dominantInstanceId: number | undefined
  let dominantCount = 0
  for (const [id, count] of resolvedInstanceCounts) {
    if (count > dominantCount) {
      dominantInstanceId = id
      dominantCount = count
    }
  }

  const items: NormalizedItem[] = []
  let otherInstanceExcluded = 0

  for (const { row, source } of resolved) {
    if (source.instanceId !== dominantInstanceId) {
      otherInstanceExcluded++
      continue
    }

    const encounterName = lookup.encounterNames.get(source.encounterId) ?? `Encounter ${source.encounterId}`
    const itemMeta = lookup.itemMeta.get(row.item)

    items.push({
      itemId: row.item,
      name: itemMeta?.name ?? `Item ${row.item}`,
      slot: itemMeta?.inventoryType !== undefined ? INVENTORY_TYPE_TO_SLOT[itemMeta.inventoryType] : undefined,
      encounterId: source.encounterId,
      encounterName,
      instanceId: source.instanceId,
      ilvl: row.level,
      delta: row.rawDiff,
      pct: row.percDiff,
    })
  }

  if (otherInstanceExcluded > 0) {
    const dominantName = dominantInstanceId !== undefined ? lookup.instanceNames.get(dominantInstanceId) : undefined
    warnings.push(
      `${otherInstanceExcluded} item${otherInstanceExcluded === 1 ? '' : 's'} excluded: belong to a different raid instance than ${dominantName ?? 'this report'}`
    )
  }

  for (const row of unresolved) {
    const itemMeta = lookup.itemMeta.get(row.item)
    const slot = itemMeta?.inventoryType !== undefined ? INVENTORY_TYPE_TO_SLOT[itemMeta.inventoryType] : undefined
    const tierSources =
      dominantInstanceId !== undefined
        ? resolveTierEncounters(dominantInstanceId, row.item, slot, learnedByInstance?.get(dominantInstanceId))
        : []

    if (tierSources.length === 0) {
      warnings.push(`Item ${row.item} had no encounter mapping`)
      continue
    }

    for (const { encounterId, viaCurio } of tierSources) {
      const encounterName = lookup.encounterNames.get(encounterId) ?? `Encounter ${encounterId}`
      items.push({
        itemId: row.item,
        name: itemMeta?.name ?? `Item ${row.item}`,
        slot,
        encounterId,
        encounterName,
        instanceId: dominantInstanceId!,
        ilvl: row.level,
        delta: row.rawDiff,
        pct: row.percDiff,
        viaCurio,
        tierSlot: slot,
      })
    }
  }

  return {
    source: 'qelive',
    reportId,
    character: raw.playername,
    realm: raw.realm,
    region: raw.region,
    spec: (specWord ?? raw.spec).toLowerCase(),
    charClass,
    role: 'healer',
    metric: 'hps',
    contentType,
    difficulty,
    baseline,
    instanceId: dominantInstanceId,
    instanceName: dominantInstanceId !== undefined ? lookup.instanceNames.get(dominantInstanceId) : undefined,
    items,
    warnings,
  }
}
