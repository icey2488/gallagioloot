import type { NormalizedReport } from '../types'
import type { Allocation, BossEval, Recommendation, Settings } from './types'
import { isTossUpGap } from './tossup'
import { evalKey, isRepeatable } from './targets'

/** Percentage of the leading boss's evPct used as the toss-up band, absent a sim error. */
const TOSS_UP_PCT_OF_TOP = 0.05

export const ASSUMPTIONS: string[] = [
  'Uniform draw over the remaining pool for each boss.',
  'Knockout state is shared across specs at a given difficulty except for spec-specific drops (community-reported, unverified).',
  'Knockout state is not shared across difficulties.',
  'Rolls award at Great Vault item level, as reflected by the source report.',
  'Delves and Prey Hunts are not simmed and are excluded from consideration.',
  'A boss offers a bonus roll only on its first kill at this difficulty this week; decide at the kill, there is no second chance on a repeat kill.',
  'Ranking is limited to bosses you expect to kill this week and Mythic+ keys you will run.',
  'All items are valued at the max upgrade of their track; simming below max upgrade is treated as noise.',
  "An item is worth the better of its own sim gain and the gain of the tier piece it catalyzes into.",
  "Mythic+: a Voidcore spent at the end of a key draws from that dungeon's whole loot table (all bosses pooled) at the Great Vault track for the key level (+10 and above = Myth).",
  'Mythic+: one roll per completed key, and a dungeon can be rerun, so one dungeon can take more than one roll; a raid boss takes at most one roll per difficulty per week.',
]

/** Exported so a frontend can override the copy without forking the ranking logic. */
export function fallbackMessage(thresholdPct: number): string {
  return `No boss clears the ${thresholdPct}% threshold this week. Consider taking the 6 Thalassian Tokens of Merit from the Great Vault instead; a socket on your best unsocketed piece is likely the better play.`
}

/**
 * Ranks deployable targets best-first: highest evPct (EV as % of its own report's baseline,
 * so targets from several reports sit on one scale -- identical to ranking by ev within one
 * report), ties broken by bestCase pct, then by original order (index in `deployable`).
 */
function rankDeployable(deployable: BossEval[]): BossEval[] {
  return deployable
    .map((boss, index) => ({ boss, index }))
    .sort((a, b) => {
      if (b.boss.evPct !== a.boss.evPct) return b.boss.evPct - a.boss.evPct
      const bestA = a.boss.bestCase?.pct ?? 0
      const bestB = b.boss.bestCase?.pct ?? 0
      if (bestB !== bestA) return bestB - bestA
      return a.index - b.index
    })
    .map((r) => r.boss)
}

/**
 * Allocates `rolls` rolls greedily down the ranking. A raid target takes at most one roll
 * (one per boss per difficulty per week, first kill only), so each raid roll goes to a
 * distinct target; a Mythic+ target is repeatable (one roll per completed key, and the
 * dungeon can be rerun), so it keeps taking rolls while it's the best target left. Under
 * uniform draw without replacement the expected value of the k-th draw from a pool equals
 * the pool's mean, so a repeat roll on the same dungeon is worth its same EV.
 */
function allocate(ranked: BossEval[], rolls: number): Allocation[] {
  const allocations: Allocation[] = []
  const byKey = new Map<string, Allocation>()
  for (let roll = 0; roll < rolls; roll++) {
    const target = ranked.find((b) => isRepeatable(b) || !byKey.has(evalKey(b)))
    if (!target) break
    const existing = byKey.get(evalKey(target))
    if (existing) {
      existing.rolls++
      existing.expectedGain += target.ev
      existing.expectedGainPct += target.evPct
      continue
    }
    const allocation: Allocation = {
      encounterId: target.encounterId,
      encounterName: target.encounterName,
      targetKey: target.targetKey,
      kind: target.kind,
      difficultyLabel: target.difficultyLabel,
      rolls: 1,
      expectedGain: target.ev,
      expectedGainPct: target.evPct,
    }
    byKey.set(evalKey(target), allocation)
    allocations.push(allocation)
  }
  return allocations
}

/**
 * Compares the last allocated boss (by rank) against the next-best deployable boss --
 * rank 1 vs 2 for a single roll, rank 2 vs 3 for two rolls, since both of the first two
 * rolls are allocated regardless of how close they are to each other. Uses the combined
 * `evErrorPct` of both bosses as the band when both report one (Raidbots), else falls
 * back to a fixed percentage of the leading boss's evPct (always the case for QE Live).
 */
function computeTossUp(ranked: BossEval[], allocations: Allocation[]): Recommendation['tossUp'] {
  // The last allocated target by rank vs the best target that got no roll -- rank 1 vs 2
  // for one roll, rank 2 vs 3 for two distinct raid rolls, rank 1 vs 2 when a repeatable
  // M+ target took both rolls.
  const allocatedKeys = new Set(allocations.map((a) => a.targetKey ?? String(a.encounterId)))
  const allocatedRanked = ranked.filter((b) => allocatedKeys.has(evalKey(b)))
  const boundary = allocatedRanked[allocatedRanked.length - 1]
  const nextUp = ranked.find((b) => !allocatedKeys.has(evalKey(b)))
  if (!boundary || !nextUp) return null

  const gapPct = boundary.evPct - nextUp.evPct
  const errorBand =
    boundary.evErrorPct !== undefined && nextUp.evErrorPct !== undefined ? boundary.evErrorPct + nextUp.evErrorPct : undefined

  if (!isTossUpGap(gapPct, boundary.evPct, { pctOfReference: TOSS_UP_PCT_OF_TOP, errorBand })) return null
  return { bosses: [boundary.encounterName, nextUp.encounterName], gapPct, targetKeys: [evalKey(boundary), evalKey(nextUp)] }
}

/**
 * `report` may be a single report or every report the evals came from (raid difficulties +
 * Mythic+); it only supplies warnings -- EV% is already per-report in each BossEval.
 */
export function recommend(bossEvals: BossEval[], settings: Settings, report: NormalizedReport | NormalizedReport[]): Recommendation {
  const reports = Array.isArray(report) ? report : [report]
  const deployable = bossEvals.filter((b) => b.deployable)

  const warnings = [
    ...new Set([...reports.flatMap((r) => r.warnings), ...bossEvals.flatMap((b) => b.notes).filter((n) => n.includes('knockout state not applied'))]),
  ]

  if (deployable.length === 0) {
    const reason = bossEvals.some((b) => b.remaining > 0) ? 'below-threshold' : 'no-pool'
    return {
      allocations: [],
      totalExpectedGainPct: 0,
      fallback: { reason, message: fallbackMessage(settings.thresholdPct) },
      assumptions: ASSUMPTIONS,
      warnings,
      tossUp: null,
    }
  }

  const ranked = rankDeployable(deployable)
  const allocations = allocate(ranked, Math.max(1, Math.floor(settings.rollsAvailable)))
  return {
    allocations,
    totalExpectedGainPct: allocations.reduce((sum, a) => sum + a.expectedGainPct, 0),
    fallback: null,
    assumptions: ASSUMPTIONS,
    warnings,
    tossUp: computeTossUp(ranked, allocations),
  }
}
