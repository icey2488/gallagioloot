import type { TrackInfo } from '../types'

/** `itemLibrary[].upgrade` as Raidbots serves it, trimmed to the fields we read. */
export type RaidbotsUpgradeInfo = { name?: string; level?: number; max?: number; fullName?: string; itemLevel?: number }

/**
 * `itemLibrary[].overrides.difficulty`: an object on Mythic+ reports
 * (`{ id: "dungeon-mythic-weekly10", name: "+10 Vault", keyLevels: [10, 999], itemLevelOverride: 318, ... }`),
 * a bare difficulty string on raid reports (`"raid-vault-mythic"`).
 */
export type RaidbotsDifficultyOverride = { id?: string; name?: string; keyLevels?: number[]; itemLevelOverride?: number }

export type TrackLibraryEntry = {
  itemLevel?: number
  dropLevel?: number
  upgrade?: RaidbotsUpgradeInfo
  overrides?: { difficulty?: RaidbotsDifficultyOverride | string; itemLevelOverride?: number; itemLevel?: string }
}

type UpgradedEntry = TrackLibraryEntry & { upgrade: RaidbotsUpgradeInfo & { level: number; max: number } }

/** Most common value; ties go to the smaller number. */
function modeOf(values: number[]): number | undefined {
  const counts = new Map<number, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  let best: number | undefined
  let bestCount = 0
  for (const [v, c] of counts) {
    if (c > bestCount || (c === bestCount && best !== undefined && v < best)) {
      best = v
      bestCount = c
    }
  }
  return best
}

/**
 * `overrides.itemLevel` is the report's own upgrade label for an item: "Myth 6/6", or, on items dropping past the
 * track's max step (the last two Mythic bosses' 344 items, which carry no `upgrade` object), "Myth 9" with no max.
 */
function parseUpgradeLabel(label: unknown): { name: string; level: number; max?: number } | undefined {
  if (typeof label !== 'string') return undefined
  const m = /^(\S+)\s+(\d+)(?:\/(\d+))?$/.exec(label.trim())
  return m ? { name: m[1], level: Number(m[2]), max: m[3] !== undefined ? Number(m[3]) : undefined } : undefined
}

function numbers(values: Array<number | undefined>): number[] {
  return values.filter((v): v is number => typeof v === 'number')
}

/**
 * Reads upgrade-track and key-level metadata off a Raidbots report's itemLibrary. Pure.
 *
 * Verified against live reports 2026-09-24: both the raid droptimizer (6PTZ7TjgU8PdxJhZ97bMUa)
 * and the Mythic+ droptimizer (a8URThoNZqEXDW3tBtavHq) carry `upgrade: { name: "Myth", level: 6,
 * max: 6, fullName: "Myth 6/6", itemLevel: 334 }` on every upgradeable entry. The raid report's 344
 * items (the last two Mythic bosses' bonus-roll drops, one step past the track max) carry no `upgrade`
 * object, only `overrides.itemLevel: "Myth 9"`; that label counts as a step too (9 >= max 6, so it is
 * never a "not at max upgrade" case) and yields `upgradeLabelsByIlvl[344] = "Myth 9/6"`. Only the M+
 * report has a difficulty OBJECT with `keyLevels`. There is no key-level field anywhere else in the report.
 */
export function parseTrackInfo(itemLibrary: TrackLibraryEntry[]): TrackInfo {
  const upgraded = itemLibrary.filter(
    (e): e is UpgradedEntry => typeof e.upgrade?.level === 'number' && typeof e.upgrade?.max === 'number'
  )

  let lowest: UpgradedEntry | undefined
  for (const e of upgraded) {
    if (!lowest || e.upgrade.level < lowest.upgrade.level) lowest = e
  }

  let difficulty: RaidbotsDifficultyOverride | undefined
  for (const e of itemLibrary) {
    const d = e.overrides?.difficulty
    if (typeof d === 'object' && d !== null) {
      difficulty = d
      break
    }
  }

  const keyLevel = difficulty?.keyLevels?.[0]

  // Every item's step against the track max, including label-only items ("Myth 9": past max, so never a
  // "not at max upgrade" case) that carry no `upgrade` object. A label with no max borrows the track's.
  const trackMax = lowest?.upgrade.max
  let lowestStep = lowest && { name: lowest.upgrade.name, level: lowest.upgrade.level, max: lowest.upgrade.max, fullName: lowest.upgrade.fullName }
  const steps: Array<{ level: number; max: number }> = upgraded.map((e) => ({ level: e.upgrade.level, max: e.upgrade.max }))
  const labelsByIlvl: Record<string, string> = {}
  for (const e of itemLibrary) {
    if (e.upgrade?.fullName && typeof e.itemLevel === 'number') labelsByIlvl[e.itemLevel] ??= e.upgrade.fullName
    if (typeof e.upgrade?.level === 'number') continue
    const label = parseUpgradeLabel(e.overrides?.itemLevel)
    const max = label?.max ?? trackMax
    if (!label || max === undefined) continue
    steps.push({ level: label.level, max })
    if (!lowestStep || label.level < lowestStep.level) lowestStep = { name: label.name, level: label.level, max, fullName: `${label.name} ${label.level}/${max}` }
    if (typeof e.itemLevel === 'number') labelsByIlvl[e.itemLevel] ??= `${label.name} ${label.level}/${max}`
  }

  const ilvlSource = upgraded.length > 0 ? upgraded : itemLibrary

  return {
    name: lowestStep?.name,
    upgradeFullName: lowestStep?.fullName,
    upgradeLevel: lowestStep?.level,
    upgradeMax: lowestStep?.max,
    atMaxUpgrade: steps.length > 0 ? steps.every((s) => s.level >= s.max) : undefined,
    upgradeLabelsByIlvl: Object.keys(labelsByIlvl).length > 0 ? labelsByIlvl : undefined,
    simmedIlvl: modeOf(numbers(ilvlSource.map((e) => e.itemLevel))),
    keyLevelMin: typeof keyLevel === 'number' ? keyLevel : undefined,
    dropIlvl: typeof difficulty?.itemLevelOverride === 'number' ? difficulty.itemLevelOverride : modeOf(numbers(upgraded.map((e) => e.dropLevel))),
  }
}

/**
 * The warning a report gets when it wasn't simmed at max upgrade of its track -- every item is
 * valued as if fully upgraded, so a lower-upgrade sim understates (or reorders) the pool. Null
 * when the report is at max or carries no upgrade info.
 */
export function maxUpgradeWarning(track: TrackInfo | undefined): string | null {
  if (!track || track.atMaxUpgrade !== false) return null
  const simmed = track.upgradeFullName ?? `${track.name ?? 'track'} ${track.upgradeLevel}/${track.upgradeMax}`
  const max = track.name && track.upgradeMax !== undefined ? `${track.name} ${track.upgradeMax}/${track.upgradeMax}` : 'max upgrade'
  return `Simmed at ${simmed}, not ${max}. All items are valued at the max upgrade of their track; re-run the droptimizer at max upgrade.`
}
