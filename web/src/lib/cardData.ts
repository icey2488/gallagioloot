import type { BossEval, Recommendation, VaultDecision } from '@engine/core/types'

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
  bestRoll?: { name: string; pct: number; bestCaseItemName?: string }
  /**
   * Boss-vs-boss runner-up. Only set (and only meaningful to show) for a clean Voidcore
   * verdict: comparing "next-best boss to roll" against a vault or toss-up verdict would
   * compare unlike things, so it's omitted there.
   */
  secondBest?: { name: string; pct: number }
  vaultCompare?: { voidcorePct: number; vaultPct: number; vaultItemName: string }
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
  const rollsAvailable = recommendation.allocations.length || 1
  const deployableByEv = [...bossEvals].filter((b) => b.deployable && b.encounterId !== top.encounterId).sort((a, b) => b.evPct - a.evPct)
  const secondBest = secondAllocation
    ? { name: secondAllocation.encounterName, pct: secondAllocation.expectedGainPct }
    : deployableByEv[0]
      ? { name: deployableByEv[0].encounterName, pct: deployableByEv[0].evPct }
      : undefined

  const rollTossUp = recommendation.tossUp
  const rollHeadline = rollTossUp ? `Roll ${rollTossUp.bosses[0]} or ${rollTossUp.bosses[1]}` : `Roll ${top.encounterName}`
  const rollTossUpNote = rollTossUp
    ? `Within ${rollTossUp.gapPct.toFixed(2)}%: let kill order decide; roll whichever you kill first.`
    : undefined
  const tossUpBosses: CardData['tossUpBosses'] = rollTossUp
    ? [
        { name: rollTossUp.bosses[0], pct: top.expectedGainPct },
        { name: rollTossUp.bosses[1], pct: bossEvals.find((b) => b.encounterName === rollTossUp.bosses[1])?.evPct ?? 0 },
      ]
    : undefined

  // The best roll target (the top-ranked boss), named regardless of the eventual
  // vault-vs-Voidcore verdict -- and regardless of whether that top boss is itself in a
  // razor-thin roll-vs-roll toss-up with the runner-up (rollTossUp): rank 1 is still the
  // best roll target to report, even when it's a close call against rank 2.
  const bestRoll: CardData['bestRoll'] = {
    name: top.encounterName,
    pct: top.expectedGainPct,
    bestCaseItemName: bossEvals.find((b) => b.encounterId === top.encounterId)?.bestCase?.name,
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
      bossName: rollTossUp ? undefined : top.encounterName,
    }
  }

  const vaultCompare = {
    voidcorePct: vaultDecision.voidcoreGainPct,
    vaultPct: vaultDecision.vaultItemGainPct,
    vaultItemName: vaultItemName ?? 'the vault item',
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
    headline: rollTossUp ? rollHeadline : `Take the Voidcore. Roll ${top.encounterName}.`,
    pct: vaultDecision.voidcoreGainPct,
    bestRoll,
    secondBest,
    vaultCompare,
    tossUp: !!rollTossUp,
    tossUpNote: rollTossUpNote,
    rollsAvailable,
    tossUpBosses,
  }
}
