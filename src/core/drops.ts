// What each roll target drops at, read off a report's own profileset rows. Pure.
import type { NormalizedReport } from '../types'

/** An item level and, when the report labels it, its upgrade step ("Myth 6/6"). */
export type DropStep = { ilvl: number; label?: string }

export type DropSummary = {
  /** The drop step most targets share; null when the report has no target rows. */
  common: DropStep | null
  /** Targets dropping at some other step, grouped by step (names alphabetical, groups by ilvl ascending). */
  exceptions: Array<DropStep & { targets: string[] }>
  /** Distinct targets with at least one row: bosses for a raid report, dungeons for Mythic+. */
  targetCount: number
}

/**
 * Per-target drop ilvl = the highest `ilvl` among that target's rows (a target's rows are the boss's whole
 * loot, all at its drop step; catalyst rows carry their source's ilvl). The label comes from the report's own
 * itemLibrary labels for that ilvl (`track.upgradeLabelsByIlvl`), so nothing here knows a season's numbers.
 * `common` is the step most targets share (a tie goes to the lower ilvl).
 */
export function summarizeDrops(report: Pick<NormalizedReport, 'items' | 'track'>): DropSummary {
  const perTarget = new Map<number, { name: string; ilvl: number }>()
  for (const item of report.items) {
    if (item.encounterId < 0) continue
    const seen = perTarget.get(item.encounterId)
    if (!seen || item.ilvl > seen.ilvl) perTarget.set(item.encounterId, { name: item.encounterName, ilvl: item.ilvl })
  }

  const byIlvl = new Map<number, string[]>()
  for (const { name, ilvl } of perTarget.values()) byIlvl.set(ilvl, [...(byIlvl.get(ilvl) ?? []), name])

  let commonIlvl: number | undefined
  for (const [ilvl, names] of byIlvl) {
    const best = commonIlvl === undefined ? undefined : byIlvl.get(commonIlvl)!.length
    if (best === undefined || names.length > best || (names.length === best && ilvl < commonIlvl!)) commonIlvl = ilvl
  }

  const step = (ilvl: number): DropStep => ({ ilvl, label: report.track?.upgradeLabelsByIlvl?.[ilvl] })
  return {
    common: commonIlvl === undefined ? null : step(commonIlvl),
    exceptions: [...byIlvl.entries()]
      .filter(([ilvl]) => ilvl !== commonIlvl)
      .sort((a, b) => a[0] - b[0])
      .map(([ilvl, names]) => ({ ...step(ilvl), targets: [...names].sort((a, b) => a.localeCompare(b)) })),
    targetCount: perTarget.size,
  }
}

export type DropLineInput = {
  common: DropStep | null
  exceptions: Array<DropStep & { targets: string[] }>
  /** Mythic+ reports: how many dungeons the drop line covers. */
  dungeons?: number
}

/** "Drops Myth 6/6 (334) · The Coiled Altar, Ula'tek Myth 9/6 (344)"; Mythic+: "Drops Myth 6/6 (334) · 8 dungeons". */
export function formatDropLine(input: DropLineInput): string {
  const stepText = (step: DropStep): string => (step.label ? `${step.label} (${step.ilvl})` : `${step.ilvl}`)
  const commonPart = input.common ? `Drops ${stepText(input.common)}` : 'Drops item level unknown'
  const exceptionParts = input.exceptions.map((exception) => `${exception.targets.join(', ')} ${stepText(exception)}`)
  const dungeonPart = input.dungeons !== undefined && input.dungeons > 0 ? `${input.dungeons} dungeon${input.dungeons > 1 ? 's' : ''}` : ''
  return [commonPart, ...exceptionParts, dungeonPart].filter((part) => part).join(' · ')
}
