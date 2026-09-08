import type { NormalizedReport } from '../types'
import type { Allocation, BossEval, Recommendation, Settings } from './types'

export const ASSUMPTIONS: string[] = [
  'Uniform draw over the remaining pool for each boss.',
  'Knockout state is shared across specs at a given difficulty except for spec-specific drops (community-reported, unverified).',
  'Knockout state is not shared across difficulties.',
  'Rolls award at Great Vault item level, as reflected by the source report.',
  'Delves and Prey Hunts are not simmed and are excluded from consideration.',
]

/** Exported so a frontend can override the copy without forking the ranking logic. */
export function fallbackMessage(thresholdPct: number): string {
  return `No boss clears the ${thresholdPct}% threshold this week. Consider taking the 6 Thalassian Tokens of Merit from the Great Vault instead; a socket on your best unsocketed piece is likely the better play.`
}

/**
 * E[value of a uniform draw from `values` after one uniformly random element has
 * already been removed], averaged over which element was removed. Computed
 * directly (not via the mean-preserving shortcut) so the arithmetic is auditable
 * against a hand-checked pool.
 */
function expectedSecondRollValue(values: number[]): number {
  const n = values.length
  if (n <= 1) return 0
  const total = values.reduce((a, b) => a + b, 0)
  let sum = 0
  for (const v of values) sum += (total - v) / (n - 1)
  return sum / n
}

function remainingValues(boss: BossEval): number[] {
  return boss.pool.filter((p) => !p.knockedOut).map((p) => p.value)
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
    const best = deployable.reduce((a, b) => (b.ev > a.ev ? b : a))
    const allocations: Allocation[] = [
      { encounterId: best.encounterId, encounterName: best.encounterName, rolls: 1, expectedGain: best.ev, expectedGainPct: best.evPct },
    ]
    return { allocations, totalExpectedGainPct: best.evPct, fallback: null, assumptions: ASSUMPTIONS, warnings }
  }

  // rollsAvailable >= 2: enumerate every multiset of size 2 over deployable bosses --
  // two rolls on the same boss (without replacement within that boss's pool), or one
  // roll each on two different bosses (independent draws).
  let bestTotal = -Infinity
  let bestAllocations: Allocation[] = []

  for (let i = 0; i < deployable.length; i++) {
    const bossA = deployable[i]
    const sameBossTotal = bossA.ev + expectedSecondRollValue(remainingValues(bossA))
    if (sameBossTotal > bestTotal) {
      bestTotal = sameBossTotal
      bestAllocations = [
        {
          encounterId: bossA.encounterId,
          encounterName: bossA.encounterName,
          rolls: 2,
          expectedGain: sameBossTotal,
          expectedGainPct: baseline > 0 ? (sameBossTotal / baseline) * 100 : 0,
        },
      ]
    }

    for (let j = i + 1; j < deployable.length; j++) {
      const bossB = deployable[j]
      const crossTotal = bossA.ev + bossB.ev
      if (crossTotal > bestTotal) {
        bestTotal = crossTotal
        bestAllocations = [
          { encounterId: bossA.encounterId, encounterName: bossA.encounterName, rolls: 1, expectedGain: bossA.ev, expectedGainPct: bossA.evPct },
          { encounterId: bossB.encounterId, encounterName: bossB.encounterName, rolls: 1, expectedGain: bossB.ev, expectedGainPct: bossB.evPct },
        ]
      }
    }
  }

  const totalExpectedGain = bestAllocations.reduce((sum, a) => sum + a.expectedGain, 0)
  return {
    allocations: bestAllocations,
    totalExpectedGainPct: baseline > 0 ? (totalExpectedGain / baseline) * 100 : 0,
    fallback: null,
    assumptions: ASSUMPTIONS,
    warnings,
  }
}
