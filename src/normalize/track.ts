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
  overrides?: { difficulty?: RaidbotsDifficultyOverride | string; itemLevelOverride?: number }
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

function numbers(values: Array<number | undefined>): number[] {
  return values.filter((v): v is number => typeof v === 'number')
}

/**
 * Reads upgrade-track and key-level metadata off a Raidbots report's itemLibrary. Pure.
 *
 * Verified against live reports 2026-09-24: both the raid droptimizer (6PTZ7TjgU8PdxJhZ97bMUa)
 * and the Mythic+ droptimizer (a8URThoNZqEXDW3tBtavHq) carry `upgrade: { name: "Myth", level: 6,
 * max: 6, fullName: "Myth 6/6", itemLevel: 334 }` on every upgradeable entry (the raid report's
 * very-rare 344 items have none). Only the M+ report has a difficulty OBJECT with `keyLevels`.
 * There is no key-level field anywhere else in the report.
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
  const ilvlSource = upgraded.length > 0 ? upgraded : itemLibrary

  return {
    name: lowest?.upgrade.name,
    upgradeFullName: lowest?.upgrade.fullName,
    upgradeLevel: lowest?.upgrade.level,
    upgradeMax: lowest?.upgrade.max,
    atMaxUpgrade: upgraded.length > 0 ? upgraded.every((e) => e.upgrade.level >= e.upgrade.max) : undefined,
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
