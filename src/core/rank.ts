import type { NormalizedReport } from '../types'
import type { Allocation, BossEval, Recommendation, Settings } from './types'

export const ASSUMPTIONS: string[] = [
  'Uniform draw over the remaining pool for each boss.',
  'Knockout state is shared across specs at a given difficulty except for spec-specific drops (community-reported, unverified).',
  'Knockout state is not shared across difficulties.',
  'Rolls award at Great Vault item level, as reflected by the source report.',
  'Delves and Prey Hunts are not simmed and are excluded from consideration.',
  'A boss offers a bonus roll only on its first kill at this difficulty this week; decide at the kill, there is no second chance on a repeat kill.',
  'Ranking is limited to bosses you expect to kill this week.',
]

/** Exported so a frontend can override the copy without forking the ranking logic. */
export function fallbackMessage(thresholdPct: number): string {
  return `No boss clears the ${thresholdPct}% threshold this week. Consider taking the 6 Thalassian Tokens of Merit from the Great Vault instead; a socket on your best unsocketed piece is likely the better play.`
}

/**
 * Ranks deployable bosses best-first: highest ev, ties broken by bestCase value, then
 * by original encounter order (index in `deployable`, which preserves bossEvals' order).
 */
function rankDeployable(deployable: BossEval[]): BossEval[] {
  return deployable
    .map((boss, index) => ({ boss, index }))
    .sort((a, b) => {
      if (b.boss.ev !== a.boss.ev) return b.boss.ev - a.boss.ev
      const bestA = a.boss.bestCase?.value ?? 0
      const bestB = b.boss.bestCase?.value ?? 0
      if (bestB !== bestA) return bestB - bestA
      return a.index - b.index
    })
    .map((r) => r.boss)
}

export function recommend(bossEvals: BossEval[], settings: Settings, report: NormalizedReport): Recommendation {
  const deployable = bossEvals.filter((b) => b.deployable)
  const baseline = report.baseline

  const warnings = [
    ...report.warnings,
    ...new Set(bossEvals.flatMap((b) => b.notes).filter((n) => n.includes('knockout state not applied'))),
  ]

  if (deployable.length === 0) {
    const reason = bossEvals.some((b) => b.remaining > 0) ? 'below-threshold' : 'no-pool'
    return {
      allocations: [],
      totalExpectedGainPct: 0,
      fallback: { reason, message: fallbackMessage(settings.thresholdPct) },
      assumptions: ASSUMPTIONS,
      warnings,
    }
  }

  if (settings.rollsAvailable <= 1) {
    const best = rankDeployable(deployable)[0]
    const allocations: Allocation[] = [
      { encounterId: best.encounterId, encounterName: best.encounterName, rolls: 1, expectedGain: best.ev, expectedGainPct: best.evPct },
    ]
    return { allocations, totalExpectedGainPct: best.evPct, fallback: null, assumptions: ASSUMPTIONS, warnings }
  }

  // rollsAvailable >= 2: a boss only offers a bonus roll on its first kill per
  // difficulty per week, so the two rolls must land on two distinct bosses -- the
  // top two deployable bosses by ev (ties: bestCase value, then encounter order).
  const ranked = rankDeployable(deployable)
  const chosen = ranked.slice(0, 2)
  const allocations: Allocation[] = chosen.map((boss) => ({
    encounterId: boss.encounterId,
    encounterName: boss.encounterName,
    rolls: 1,
    expectedGain: boss.ev,
    expectedGainPct: boss.evPct,
  }))

  const totalExpectedGain = allocations.reduce((sum, a) => sum + a.expectedGain, 0)
  return {
    allocations,
    totalExpectedGainPct: baseline > 0 ? (totalExpectedGain / baseline) * 100 : 0,
    fallback: null,
    assumptions: ASSUMPTIONS,
    warnings,
  }
}
