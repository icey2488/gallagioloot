// Voidcore supply (operator rulings, 2026-09-25): a player earns at most one Voidcore a week from
// the Great Vault (choosing it over an item with 3 doors unlocked) and, from season week 8, one more
// a week from a separate source. Voidcores are held until season end (unspent = lost) and there is
// NO weekly spend cap: the only limits are the Voidcores held and the targeting rules (one roll per
// raid boss per difficulty per week; Mythic+ one roll per completed key, dungeons repeatable).
//
// This module turns the ranking into this week's roll order, compares each Voidcore's spend-now EV
// with what it would get if held to next week, checks a stockpile against the season's good
// targets, and values one more Voidcore (the Great Vault's Voidcore option). Pure.

import type { BossEval } from './types'
import { rankTargets, rollSequence } from './rank'

/** Footer copy for the supply model; listed after the ranking assumptions (ASSUMPTIONS in rank.ts). */
export const VOIDCORE_ASSUMPTIONS: string[] = [
  'Voidcores can be held until the end of the season; holding one delays its value rather than losing it.',
  "EV per roll is the average gain across that target's remaining pool; the same target is worth the same next week unless your knockouts change.",
  'Within a week, rolls go down the ranking (one per boss per difficulty; Mythic+ keys can repeat), so later rolls in the same week are worth less.',
  "\"Hold\" compares against next week's best target left after next week's earned Voidcores take the top targets first. It assumes the same bosses, the same sim and no knockout from this week's rolls; gear changes, knockouts and new sims will move it, so treat it as an estimate.",
  'Earning rate is the Voidcores earned per week setting: one from choosing the Voidcore in a 3-door Great Vault, one more per week from season week 8.',
  'Voidcores left at season end are worth nothing; with a large stockpile and few weeks left, spending on lower targets beats holding.',
  'These are expected values, not outcomes. Spreading rolls across weeks does not change the average for a given target; it changes which targets you get to roll. Actual loot varies a lot between players with the same plan.',
]

export type VoidcoreSupply = {
  /** Voidcores held right now. */
  onHand: number
  /** Voidcores to spend this week. The UI defaults it to `onHand` and never lets it exceed that. */
  toSpend: number
  /** Voidcores earned in each future week (see `defaultEarnedPerWeek`); the player can lower it (e.g. skipping the vault one). */
  earnedPerWeek: number
  /** Weeks left in the season AFTER this one. Enables the season-end stockpile check when set. */
  weeksLeft?: number
}

/** 1 a week (the Great Vault's Voidcore), 2 from season week 8 (plus the separate source). */
export function defaultEarnedPerWeek(seasonWeek?: number): number {
  return seasonWeek !== undefined && seasonWeek >= 8 ? 2 : 1
}

/** A roll target as the plan reports it. */
export type RollTarget = Pick<BossEval, 'encounterId' | 'encounterName' | 'targetKey' | 'kind' | 'difficultyLabel' | 'keyLevel' | 'evPct'> & {
  /** In play but below the threshold: worth rolling only if you'd rather not hold the Voidcore or take the tokens. */
  belowThreshold: boolean
}

/**
 * 'spend': holding this Voidcore only delays it (next week's target for it is worth no more).
 * 'compare': the target it would get next week is worth more; the card shows both numbers.
 */
export type HoldAdvice = 'spend' | 'compare'

export type PlannedRoll = RollTarget & {
  /** 1-based position in this week's order. */
  roll: number
  /** The target this Voidcore would get next week if held instead; null when next week has no target left for it. */
  hold: RollTarget | null
  /** `hold.evPct`, 0 when there is no hold target. */
  holdPct: number
  advice: HoldAdvice
}

/** What one more Voidcore (e.g. the Great Vault's) adds: max(spend it as the next roll this week, hold it for next week). */
export type ExtraVoidcore =
  | { use: 'spend'; roll: number; target: RollTarget; valuePct: number; holdPct: number }
  | { use: 'hold'; target: RollTarget; valuePct: number; spendPct: number }

export type StockpileInput = {
  /** Voidcores held right now. */
  onHand: number
  /** Voidcores earned per future week. */
  earnedPerWeek: number
  /** Weeks left in the season AFTER the current week. */
  weeksLeft: number
  /** Rolls per week on targets at or above threshold. May be Infinity (a repeatable dungeon is above threshold). */
  goodRollsPerWeek: number
}

export type StockpileCheck = {
  /** onHand + earnedPerWeek * weeksLeft */
  supply: number
  /** goodRollsPerWeek * (weeksLeft + 1): this week plus the remaining weeks. */
  goodRolls: number
  /** supply - goodRolls when positive, else 0. */
  excess: number
  /** true when supply > goodRolls. */
  warn: boolean
}

export type VoidcorePlan = {
  /** This week's rolls in order (at most `toSpend`). */
  rolls: PlannedRoll[]
  toSpend: number
  /** Voidcores set to spend this week that have no target left this week (raid bosses used up, no Mythic+ in play). */
  noTargetCount: number
  /** Voidcores ahead of a held one in next week's order: next week's earned ones plus those already carried (held by choice or without a target). */
  nextWeekAhead: number
  /** Set when `supply.weeksLeft` is. */
  stockpile: StockpileCheck | null
  extra: ExtraVoidcore | null
}

/** Displayed to 2 decimals: a hold value within half a display unit of the spend-now value reads as the same number, so it counts as equal. */
const HOLD_EPSILON = 0.005

const whole = (n: number) => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0)

/**
 * Season-end stockpile check: more Voidcores (on hand + earned over the remaining weeks) than rolls
 * worth taking at or above threshold over this week and the remaining ones.
 *
 * Body first generated by qwen2.5-coder:7b (Ollama) from the exact signature and one example, then
 * edited: its non-finite guards let NaN/Infinity through (`Math.max(0, NaN)` is NaN).
 */
export function stockpileCheck(input: StockpileInput): StockpileCheck {
  const onHand = whole(input.onHand)
  const earnedPerWeek = whole(input.earnedPerWeek)
  const weeksLeft = whole(input.weeksLeft)
  const goodRollsPerWeek = input.goodRollsPerWeek === Infinity ? Infinity : Number.isNaN(input.goodRollsPerWeek) ? 0 : Math.max(0, input.goodRollsPerWeek)

  const supply = onHand + earnedPerWeek * weeksLeft
  const goodRolls = goodRollsPerWeek === Infinity ? Infinity : goodRollsPerWeek * (weeksLeft + 1)
  const excess = Math.max(0, supply - goodRolls)
  const warn = supply > goodRolls

  return { supply, goodRolls, excess, warn }
}

export function holdAdvice(spendPct: number, holdPct: number): HoldAdvice {
  return holdPct <= spendPct + HOLD_EPSILON ? 'spend' : 'compare'
}

/** "spend now" or "spend now 0.65% vs hold ~0.81% next week". */
export function holdAdviceText(roll: Pick<PlannedRoll, 'evPct' | 'holdPct' | 'advice'>): string {
  return roll.advice === 'spend' ? 'spend now' : `spend now ${roll.evPct.toFixed(2)}% vs hold ~${roll.holdPct.toFixed(2)}% next week`
}

export const BELOW_THRESHOLD_TEXT = 'below threshold: hold it or take the tokens'

export function noTargetText(count: number): string {
  return `${count} Voidcore${count === 1 ? ' has' : 's have'} no target this week (every rollable boss already takes one); ${count === 1 ? 'it carries' : 'they carry'} to next week.`
}

export function stockpileWarningText(check: StockpileCheck, thresholdPct: number): string {
  return `You have more Voidcores than good targets before season end (${check.supply} Voidcores vs ${check.goodRolls} rolls at or above ${thresholdPct}%); spend down lower targets.`
}

function toRollTarget(b: BossEval): RollTarget {
  return {
    encounterId: b.encounterId,
    encounterName: b.encounterName,
    targetKey: b.targetKey,
    kind: b.kind,
    difficultyLabel: b.difficultyLabel,
    keyLevel: b.keyLevel,
    evPct: b.evPct,
    belowThreshold: !b.deployable,
  }
}

/**
 * Targets a Voidcore can go to, best first: deployable ones, then in-play targets below the threshold
 * (flagged). Not-expected kills, emptied pools and zero-EV targets never take a roll.
 */
function rollableRanked(bossEvals: BossEval[]): BossEval[] {
  return rankTargets(bossEvals.filter((b) => (b.deployable || b.belowThreshold) && b.evPct > 0))
}

/** Rolls per week on at-or-above-threshold targets: one per deployable raid target, unlimited once a deployable Mythic+ dungeon exists. */
function goodRollsPerWeek(bossEvals: BossEval[]): number {
  const good = bossEvals.filter((b) => b.deployable && b.evPct > 0)
  return good.some((b) => b.kind === 'mplus') ? Infinity : good.length
}

/**
 * This week's Voidcore plan. `supply.toSpend` Voidcores go down the ranking under the targeting
 * rules (the same greedy order `recommend` uses, extended past the deployable targets to in-play
 * ones below the threshold, which are flagged).
 *
 * Spend now vs hold: next week is modeled as the same targets at the same EVs (same reports, no
 * knockout from this week's rolls, targeting rules reset), so its order is this week's order again.
 * Next week's earned Voidcores and the ones already carried take the top of it first; a held
 * Voidcore gets the next position. Holding the j-th lowest of this week's rolls (roll N-j+1) is
 * weighed against next week's position ahead+j: the exchange that decides how many to hold, since
 * the rolls given up get better and the next-week targets gained get worse as j grows.
 */
export function planVoidcores(bossEvals: BossEval[], supply: VoidcoreSupply): VoidcorePlan {
  const toSpend = whole(supply.toSpend)
  const onHand = whole(supply.onHand)
  const earned = whole(supply.earnedPerWeek)
  const ranked = rollableRanked(bossEvals)

  const thisWeek = rollSequence(ranked, toSpend)
  const placed = thisWeek.length
  const ahead = earned + Math.max(0, onHand - placed)
  // One order serves both weeks (see above); long enough for every hold position and the extra Voidcore.
  const order = rollSequence(ranked, Math.max(toSpend + 1, ahead + placed + 1))
  const at = (position: number): RollTarget | null => (order[position - 1] ? toRollTarget(order[position - 1]) : null)

  const rolls: PlannedRoll[] = thisWeek.map((target, i) => {
    const roll = i + 1
    const hold = at(ahead + (placed - roll + 1))
    const holdPct = hold?.evPct ?? 0
    return { ...toRollTarget(target), roll, hold, holdPct, advice: holdAdvice(target.evPct, holdPct) }
  })

  const spendTarget = placed === toSpend ? at(toSpend + 1) : null
  const holdTarget = at(ahead + 1)
  let extra: ExtraVoidcore | null = null
  if (spendTarget && (!holdTarget || holdAdvice(spendTarget.evPct, holdTarget.evPct) === 'spend')) {
    extra = { use: 'spend', roll: toSpend + 1, target: spendTarget, valuePct: spendTarget.evPct, holdPct: holdTarget?.evPct ?? 0 }
  } else if (holdTarget) {
    extra = { use: 'hold', target: holdTarget, valuePct: holdTarget.evPct, spendPct: spendTarget?.evPct ?? 0 }
  }

  const stockpile =
    supply.weeksLeft !== undefined ? stockpileCheck({ onHand, earnedPerWeek: earned, weeksLeft: supply.weeksLeft, goodRollsPerWeek: goodRollsPerWeek(bossEvals) }) : null

  return { rolls, toSpend, noTargetCount: toSpend - placed, nextWeekAhead: ahead, stockpile, extra }
}
