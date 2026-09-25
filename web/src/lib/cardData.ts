import type { BossEval, PoolEntry, Recommendation, VaultDecision } from '@engine/core/types'
import type { TargetKind } from '@engine/types'
import { evalKey } from '@engine/core/targets'

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

export type CardVerdict = 'roll' | 'vault' | 'toss-up' | 'tokens'

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
  vaultCompare?: { voidcorePct: number; vaultPct: number; vaultItemName: string; savedRollsNote?: string }
  tossUp: boolean
  tossUpNote?: string
  message?: string
  /** Rolls this recommendation covers -- from recommendation.allocations.length, falling back to 1 for the fallback (no-allocation) case. Display-only (e.g. "1 Voidcore" / "2 Voidcores" in the card eyebrow row); never drives engine logic. */
  rollsAvailable: number
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
}): CardData {
  const { recommendation, bossEvals, vaultDecision, vaultItemName, isManualVaultGain } = params

  if (recommendation.fallback) {
    return {
      verdict: 'tokens',
      headline: 'Take the tokens',
      pct: 0,
      tossUp: false,
      message: recommendation.fallback.message,
      rollsAvailable: 1,
    }
  }

  const top = recommendation.allocations[0]
  const secondAllocation = recommendation.allocations[1]
  const rollsAvailable = recommendation.allocations.reduce((n, a) => n + a.rolls, 0) || 1
  const topKey = top.targetKey ?? String(top.encounterId)
  const topEval = bossEvals.find((b) => evalKey(b) === topKey)
  const deployableByEv = [...bossEvals].filter((b) => b.deployable && evalKey(b) !== topKey).sort((a, b) => b.evPct - a.evPct)
  const secondBest = secondAllocation
    ? { name: targetDisplayName(secondAllocation), pct: secondAllocation.expectedGainPct }
    : deployableByEv[0]
      ? { name: targetDisplayName(deployableByEv[0]), pct: deployableByEv[0].evPct }
      : undefined

  const rollTossUp = recommendation.tossUp
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
      rollsAvailable,
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
      rollsAvailable,
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
      rollsAvailable,
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
      rollsAvailable,
    }
  }

  // vaultDecision.verdict === 'voidcore'
  return {
    verdict: 'roll',
    headline: rollTossUp ? rollHeadline : `Take the Voidcore. ${targetPhraseText(top)}.`,
    pct: vaultDecision.voidcoreGainPct,
    bestRoll,
    secondBest,
    vaultCompare,
    tossUp: !!rollTossUp,
    tossUpNote: rollTossUpNote,
    rollsAvailable,
    tossUpBosses,
    tossUpVerb,
  }
}
