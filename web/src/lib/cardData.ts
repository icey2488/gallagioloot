import type { BossEval, PoolEntry, Recommendation, VaultDecision } from '@engine/core/types'
import type { TargetKind } from '@engine/types'
import { evalKey } from '@engine/core/targets'
import { holdAdviceText, noTargetText, stockpileWarningText, type ExtraVoidcore, type VoidcorePlan } from '@engine/core/supply'

/** The fields of a BossEval/Allocation that name a roll target. */
export type TargetLike = { encounterName: string; kind?: TargetKind; difficultyLabel?: string; keyLevel?: number; rolls?: number }

/**
 * The action that spends a roll on a target, split so the card can bold the name:
 * raid "Roll <boss> (<difficulty>)"; Mythic+ "Run <dungeon> at +10 and roll" (a roll is
 * spent at the end of a key, so the verb is running it). A difficulty-less raid target
 * (older payloads) is just "Roll <boss>".
 */
export function targetPhrase(t: TargetLike): { verb: string; name: string; qualifier?: string } {
  if (t.kind === 'mplus') {
    const level = t.keyLevel !== undefined ? `+${t.keyLevel}` : 'your key level'
    const keys = (t.rolls ?? 1) > 1 ? ` (${t.rolls} keys)` : ''
    return { verb: 'Run', name: t.encounterName, qualifier: `at ${level} and roll${keys}` }
  }
  return { verb: 'Roll', name: t.encounterName, qualifier: t.difficultyLabel ? `(${t.difficultyLabel})` : undefined }
}

export function targetPhraseText(t: TargetLike): string {
  const { verb, name, qualifier } = targetPhrase(t)
  return [verb, name, qualifier].filter(Boolean).join(' ')
}

/** A target's name for lists and comparisons: "The Coiled Altar (Mythic)", "Altar of Fangs at +10". */
export function targetDisplayName(t: TargetLike): string {
  if (t.kind === 'mplus') return t.keyLevel !== undefined ? `${t.encounterName} at +${t.keyLevel}` : t.encounterName
  return t.difficultyLabel ? `${t.encounterName} (${t.difficultyLabel})` : t.encounterName
}

/** "Catalyze into <tier piece>: +x%" for an entry whose catalyzed value wins and is a net upgrade. */
export function catalystText(entry: Pick<PoolEntry, 'catalyst'> | null | undefined): string | undefined {
  return entry?.catalyst ? `Catalyze into ${entry.catalyst.name}: +${entry.catalyst.pct.toFixed(2)}%` : undefined
}

/** "~0.92% (roll 1: Ula'tek (Mythic))" / "~0.81% next week (hold for The Coiled Altar (Mythic))": what one more Voidcore is worth and where it goes. */
export function extraVoidcoreText(extra: ExtraVoidcore | null): string {
  if (!extra) return 'no target this week or next'
  const name = targetDisplayName(extra.target)
  return extra.use === 'spend' ? `~${extra.valuePct.toFixed(2)}% (roll ${extra.roll}: ${name})` : `~${extra.valuePct.toFixed(2)}% next week (hold for ${name})`
}

/** Short "where it goes" caption under the vault comparison's Voidcore number. */
export function extraVoidcoreWhere(extra: ExtraVoidcore | null | undefined): string | undefined {
  if (!extra) return undefined
  return extra.use === 'spend' ? `roll ${extra.roll}: ${targetDisplayName(extra.target)}` : `hold: ${targetDisplayName(extra.target)} next week`
}

export type CardVerdict = 'roll' | 'vault' | 'toss-up' | 'tokens'

/** One row of the card's ordered roll list. */
export type CardRoll = {
  roll: number
  name: string
  pct: number
  belowThreshold: boolean
  /** "spend now", or "spend now 0.65% vs hold ~0.81% next week" when holding is worth more. */
  advice: string
  /** True when holding beats spending this Voidcore now. */
  holdBetter: boolean
  /** The kill-order toss-up at this roll (the last roll vs the best target left without one). */
  tossUp?: { name: string; pct: number; gapPct: number }
}

export type CardData = {
  verdict: CardVerdict
  headline: string
  pct: number
  /**
   * The best roll target (boss + its expected EV%, and its best-case item when known),
   * independent of the overall verdict -- the player may still hold another Voidcore, so
   * this is always shown once a roll target exists. Undefined only when the roll decision
   * ITSELF is ambiguous (`bossName` unset, `tossUpBosses` set instead) or there is no
   * rollable boss at all (the tokens verdict).
   */
  bestRoll?: { name: string; pct: number; bestCaseItemName?: string; bestCaseCatalyst?: string }
  /**
   * Boss-vs-boss runner-up. Only set (and only meaningful to show) for a clean Voidcore
   * verdict: comparing "next-best boss to roll" against a vault or toss-up verdict would
   * compare unlike things, so it's omitted there.
   */
  secondBest?: { name: string; pct: number }
  vaultCompare?: { voidcorePct: number; vaultPct: number; vaultItemName: string; savedRollsNote?: string; voidcoreWhere?: string }
  tossUp: boolean
  tossUpNote?: string
  message?: string
  /** Voidcores to spend this week, for the eyebrow ("3 Voidcores"). From the plan when one is given, else the rolls the recommendation allocates (1 for the fallback). Display-only. */
  voidcoresToSpend: number
  /** This week's roll order (set when a plan is given): every Voidcore to spend, its target and EV, and spend now vs hold. */
  rolls?: CardRoll[]
  /** Notes under the roll list: nothing to spend, Voidcores without a target, the season-end stockpile warning. */
  rollNotes?: string[]
  /**
   * Per-boss pct for each side of a toss-up headline ("Roll X or Y"), derived by matching
   * recommendation.tossUp.bosses against bossEvals.evPct -- no new engine call, just a lookup
   * over data buildCardData already receives. Undefined when there's no toss-up. This is the
   * boss-vs-boss roll ambiguity (which boss to roll), a different question from the
   * vault-vs-Voidcore verdict toss-up (`verdict: 'toss-up'`) -- only set when there is no
   * vault comparison in play, so the two ambiguities are never shown superimposed.
   */
  tossUpBosses?: [{ name: string; pct: number }, { name: string; pct: number }]
  /** Single boss name for the plain "Roll <boss>" headline (no vault comparison in play) -- lets the card split "Roll" from the boss name without parsing `headline`. Undefined whenever there's a vault comparison (that headline is rendered as complete text) or the roll target is itself ambiguous. */
  bossName?: string
  /** Verb before `bossName`: "Roll" for a raid boss, "Run" for a Mythic+ dungeon. */
  verb?: string
  /** Text after `bossName`: "(Mythic)" for a raid boss, "at +10 and roll" for a dungeon. */
  qualifier?: string
  /** Verb for the toss-up pair headline when both sides share one ("Roll" / "Run"); undefined for a mixed raid/M+ pair, which renders `headline` as text. */
  tossUpVerb?: string
}

/**
 * Reduces a Recommendation (+ optional VaultDecision) into exactly what the
 * "Roll this boss" card needs to render. The vault-vs-Voidcore verdict comes
 * straight from `vaultDecision.verdict` -- the single source of truth for that
 * decision (see compareVault in core/vault.ts) -- so the headline and any
 * detail shown below it can never disagree about which side won.
 */
export function buildCardData(params: {
  recommendation: Recommendation
  bossEvals: BossEval[]
  vaultDecision: VaultDecision | null
  vaultItemName?: string
  /** True when the vault gain came from a manual % override rather than a resolved Top Gear item -- changes the vault-wins headline from naming the item to "Take your vault item". */
  isManualVaultGain?: boolean
  /** This week's Voidcore plan (planVoidcores); adds the ordered roll list. */
  plan?: VoidcorePlan
  /** For the stockpile warning's wording. */
  thresholdPct?: number
}): CardData {
  const { recommendation, bossEvals, vaultDecision, vaultItemName, isManualVaultGain, plan } = params
  const planned = plan ? buildRollList(plan, recommendation, bossEvals, params.thresholdPct ?? 0) : {}

  if (recommendation.fallback) {
    return {
      verdict: 'tokens',
      headline: 'Take the tokens',
      pct: 0,
      tossUp: false,
      message: recommendation.fallback.message,
      voidcoresToSpend: plan ? plan.toSpend : 1,
      ...planned,
    }
  }

  const top = recommendation.allocations[0]
  const secondAllocation = recommendation.allocations[1]
  const voidcoresToSpend = plan ? plan.toSpend : recommendation.allocations.reduce((n, a) => n + a.rolls, 0) || 1
  const topKey = top.targetKey ?? String(top.encounterId)
  const topEval = bossEvals.find((b) => evalKey(b) === topKey)
  const deployableByEv = [...bossEvals].filter((b) => b.deployable && evalKey(b) !== topKey).sort((a, b) => b.evPct - a.evPct)
  const secondBest = secondAllocation
    ? { name: targetDisplayName(secondAllocation), pct: secondAllocation.expectedGainPct }
    : deployableByEv[0]
      ? { name: targetDisplayName(deployableByEv[0]), pct: deployableByEv[0].evPct }
      : undefined

  // The kill-order toss-up is the headline only when it decides the first (only) roll; with a roll
  // list of several Voidcores, a toss-up at a later roll sits on that roll's row (see buildRollList).
  const rollTossUp = planned.rolls && planned.rolls.length > 1 ? null : recommendation.tossUp
  // Toss-up sides by target key when the engine supplies them (names alone are ambiguous
  // once the same boss can appear on two difficulties), else by name.
  const tossUpEvals = rollTossUp
    ? ([0, 1] as const).map((i) =>
        rollTossUp.targetKeys ? bossEvals.find((b) => evalKey(b) === rollTossUp.targetKeys![i]) : bossEvals.find((b) => b.encounterName === rollTossUp.bosses[i])
      )
    : []
  const tossUpSide = (i: 0 | 1): TargetLike => tossUpEvals[i] ?? { encounterName: rollTossUp!.bosses[i] }
  const tossUpVerbs = rollTossUp ? [targetPhrase(tossUpSide(0)).verb, targetPhrase(tossUpSide(1)).verb] : []
  const tossUpVerb = rollTossUp && tossUpVerbs[0] === tossUpVerbs[1] ? tossUpVerbs[0] : undefined
  const topPhrase = targetPhrase(top)
  const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1)
  const rollHeadline = rollTossUp
    ? tossUpVerb
      ? `${tossUpVerb} ${targetDisplayName(tossUpSide(0))} or ${targetDisplayName(tossUpSide(1))}`
      : `${targetPhraseText(tossUpSide(0))} or ${lowerFirst(targetPhraseText(tossUpSide(1)))}`
    : targetPhraseText(top)
  const rollTossUpNote = rollTossUp
    ? `Within ${rollTossUp.gapPct.toFixed(2)}%: let kill order decide; roll whichever you kill first.`
    : undefined
  const tossUpBosses: CardData['tossUpBosses'] = rollTossUp
    ? [
        { name: targetDisplayName(tossUpSide(0)), pct: top.expectedGainPct },
        { name: targetDisplayName(tossUpSide(1)), pct: tossUpEvals[1]?.evPct ?? 0 },
      ]
    : undefined

  // The best roll target (the top-ranked boss), named regardless of the eventual
  // vault-vs-Voidcore verdict -- and regardless of whether that top boss is itself in a
  // razor-thin roll-vs-roll toss-up with the runner-up (rollTossUp): rank 1 is still the
  // best roll target to report, even when it's a close call against rank 2.
  const bestRoll: CardData['bestRoll'] = {
    name: targetDisplayName(top),
    pct: top.expectedGainPct,
    bestCaseItemName: topEval?.bestCase?.name,
    bestCaseCatalyst: catalystText(topEval?.bestCase),
  }

  if (!vaultDecision) {
    return {
      verdict: 'roll',
      headline: rollHeadline,
      pct: top.expectedGainPct,
      bestRoll,
      secondBest,
      tossUp: !!rollTossUp,
      tossUpNote: rollTossUpNote,
      voidcoresToSpend,
      ...planned,
      tossUpBosses,
      tossUpVerb,
      bossName: rollTossUp ? undefined : topPhrase.name,
      verb: rollTossUp ? undefined : topPhrase.verb,
      qualifier: rollTossUp ? undefined : topPhrase.qualifier,
    }
  }

  const vaultCompare = {
    voidcorePct: vaultDecision.voidcoreGainPct,
    vaultPct: vaultDecision.vaultItemGainPct,
    vaultItemName: vaultItemName ?? 'the vault item',
    savedRollsNote: vaultDecision.savedRollsNote,
    voidcoreWhere: extraVoidcoreWhere(vaultDecision.voidcoreUse),
  }

  if (vaultDecision.verdict === 'tokens') {
    return {
      verdict: 'tokens',
      headline: 'Take the tokens',
      pct: 0,
      bestRoll,
      tossUp: false,
      vaultCompare,
      message: vaultDecision.explanation,
      voidcoresToSpend,
      ...planned,
    }
  }

  if (vaultDecision.verdict === 'toss-up') {
    const tossUpNote = vaultDecision.notes.find((n) => n.toLowerCase().includes('vault item')) ?? vaultDecision.explanation
    return {
      verdict: 'toss-up',
      headline: 'Toss-up',
      pct: vaultDecision.voidcoreGainPct,
      bestRoll,
      vaultCompare,
      tossUp: true,
      tossUpNote,
      voidcoresToSpend,
      ...planned,
    }
  }

  if (vaultDecision.verdict === 'vault') {
    return {
      verdict: 'vault',
      headline: isManualVaultGain ? 'Take your vault item' : `Take the vault item: ${vaultCompare.vaultItemName}`,
      pct: vaultDecision.vaultItemGainPct,
      bestRoll,
      vaultCompare,
      tossUp: false,
      voidcoresToSpend,
      ...planned,
    }
  }

  // vaultDecision.verdict === 'voidcore'
  return {
    verdict: 'roll',
    // The vault adds ONE Voidcore: take it, then roll down the list (or hold it when next week's target is worth more).
    headline: rollTossUp
      ? rollHeadline
      : vaultDecision.voidcoreUse?.use === 'hold'
        ? 'Take the Voidcore and hold it for next week.'
        : `Take the Voidcore. ${targetPhraseText(top)}.`,
    pct: vaultDecision.voidcoreGainPct,
    bestRoll,
    secondBest,
    vaultCompare,
    tossUp: !!rollTossUp,
    tossUpNote: rollTossUpNote,
    voidcoresToSpend,
    ...planned,
    tossUpBosses,
    tossUpVerb,
  }
}

/**
 * The card's roll list: one row per Voidcore spent this week, in order, with its EV and the spend
 * now / hold comparison, plus the notes under it. With several Voidcores, a kill-order toss-up at
 * the last roll (recommendation.tossUp) goes on that roll's row rather than in the headline.
 */
function buildRollList(plan: VoidcorePlan, recommendation: Recommendation, bossEvals: BossEval[], thresholdPct: number): Pick<CardData, 'rolls' | 'rollNotes'> {
  const rolls: CardRoll[] = plan.rolls.map((r) => ({
    roll: r.roll,
    name: targetDisplayName(r),
    pct: r.evPct,
    belowThreshold: r.belowThreshold,
    advice: holdAdviceText(r),
    holdBetter: r.advice === 'compare',
  }))
  const tossUp = recommendation.tossUp
  if (tossUp?.targetKeys && rolls.length > 1) {
    const [boundaryKey, nextKey] = tossUp.targetKeys
    const index = plan.rolls.map((r) => evalKey(r)).lastIndexOf(boundaryKey)
    const next = bossEvals.find((b) => evalKey(b) === nextKey)
    if (index >= 0 && next) rolls[index].tossUp = { name: targetDisplayName(next), pct: next.evPct, gapPct: tossUp.gapPct }
  }
  const rollNotes: string[] = []
  if (plan.toSpend === 0) rollNotes.push('No Voidcores to spend this week. Set Voidcores on hand in Run settings.')
  if (plan.noTargetCount > 0) rollNotes.push(noTargetText(plan.noTargetCount))
  if (plan.stockpile?.warn) rollNotes.push(stockpileWarningText(plan.stockpile, thresholdPct))
  return { rolls, rollNotes }
}
