// Validation for a set of reports loaded together for one character. Pure.
import type { NormalizedReport } from '../types'
import { difficultyLabel, knockoutDifficulty, targetKindOf } from './targets'

export type DriftLimits = {
  /** Baseline drift (% of the first report's baseline) above which a report gets a warning. */
  warnPct: number
  /** Baseline drift above which a report is refused -- its deltas aren't on the same scale. */
  refusePct: number
}

export const DEFAULT_DRIFT_LIMITS: DriftLimits = { warnPct: 0.5, refusePct: 3 }

export type ReportSetCheck = { errors: string[]; warnings: string[] }

function describe(report: NormalizedReport): string {
  return `${report.instanceName ?? 'report'} (${difficultyLabel(report)})`
}

function sameCharacter(a: NormalizedReport, b: NormalizedReport): boolean {
  const eq = (x?: string, y?: string) => x === undefined || y === undefined || x.toLowerCase() === y.toLowerCase()
  return a.character.toLowerCase() === b.character.toLowerCase() && eq(a.realm, b.realm) && eq(a.region, b.region)
}

function sameLootSpec(a: NormalizedReport, b: NormalizedReport): boolean {
  if (a.lootSpecId !== undefined && b.lootSpecId !== undefined) return a.lootSpecId === b.lootSpecId
  return a.spec.toLowerCase() === b.spec.toLowerCase()
}

/** Percent difference of `b`'s baseline from `a`'s. */
export function baselineDriftPct(a: NormalizedReport, b: NormalizedReport): number {
  return a.baseline > 0 ? (Math.abs(b.baseline - a.baseline) / a.baseline) * 100 : 0
}

/**
 * Checks whether `candidate` can join `existing` (the reports already loaded). Errors mean
 * refuse: a different character or loot spec, a duplicate target set, a second Mythic+
 * report, or baseline drift above `limits.refusePct` against the first loaded report.
 * Drift above `limits.warnPct` is a warning.
 */
export function checkCandidate(existing: NormalizedReport[], candidate: NormalizedReport, limits: DriftLimits = DEFAULT_DRIFT_LIMITS): ReportSetCheck {
  const errors: string[] = []
  const warnings: string[] = []
  const first = existing[0]
  if (!first) return { errors, warnings }

  const who = (r: NormalizedReport) => `${r.character}${r.realm ? `-${r.realm}` : ''}${r.region ? ` (${r.region})` : ''}`
  if (!sameCharacter(first, candidate)) {
    errors.push(`This report is for ${who(candidate)}, but the loaded reports are for ${who(first)}. Load reports for one character at a time.`)
  }
  if (!sameLootSpec(first, candidate)) {
    errors.push(`This report uses loot spec ${candidate.lootSpecId ?? candidate.spec}, but the loaded reports use ${first.lootSpecId ?? first.spec}. Re-run it with the same loot spec.`)
  }

  const kind = targetKindOf(candidate)
  if (kind === 'mplus' && existing.some((r) => targetKindOf(r) === 'mplus')) {
    errors.push('A Mythic+ report is already loaded. Remove it first to load a different one.')
  } else if (existing.some((r) => r.reportId === candidate.reportId)) {
    errors.push('This report is already loaded.')
  } else if (existing.some((r) => targetKindOf(r) === kind && r.instanceId === candidate.instanceId && knockoutDifficulty(r) === knockoutDifficulty(candidate))) {
    errors.push(`A report for ${describe(candidate)} is already loaded. Remove it first to replace it.`)
  }

  const drift = baselineDriftPct(first, candidate)
  if (drift > limits.refusePct) {
    errors.push(
      `Baseline differs from the first report by ${drift.toFixed(2)}% (limit ${limits.refusePct}%). Re-sim both with the same gear so their gains are comparable.`
    )
  } else if (drift > limits.warnPct) {
    warnings.push(`${describe(candidate)} baseline differs from the first report by ${drift.toFixed(2)}% (above ${limits.warnPct}%); gains across reports may not be comparable.`)
  }

  return { errors, warnings }
}

/** Re-checks a whole loaded set (e.g. after the drift limits change): each report against the ones before it. */
export function checkReportSet(reports: NormalizedReport[], limits: DriftLimits = DEFAULT_DRIFT_LIMITS): ReportSetCheck {
  const errors: string[] = []
  const warnings: string[] = []
  for (let i = 1; i < reports.length; i++) {
    const result = checkCandidate(reports.slice(0, i), reports[i], limits)
    errors.push(...result.errors)
    warnings.push(...result.warnings)
  }
  return { errors, warnings }
}
