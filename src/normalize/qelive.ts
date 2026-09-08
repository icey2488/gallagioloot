import { pickBestSource } from '../lookup/encounterItems'
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
const INVENTORY_TYPE_TO_SLOT: Record<number, string> = {
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
  lookup: EncounterItemsLookup
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

  const items: NormalizedItem[] = []
  for (const row of kept) {
    const source = pickBestSource(lookup, row.item, contentType)
    if (!source) {
      warnings.push(`Item ${row.item} had no encounter mapping`)
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
    items,
    warnings,
  }
}
