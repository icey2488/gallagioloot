import type { BossEval, Recommendation, VaultDecision } from '@engine/core/types'

export type CardVerdict = 'roll' | 'vault' | 'tokens'

export type CardData = {
  verdict: CardVerdict
  headline: string
  pct: number
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
   * over data buildCardData already receives. Undefined when there's no toss-up.
   */
  tossUpBosses?: [{ name: string; pct: number }, { name: string; pct: number }]
  /** Single boss name for the non-toss-up "roll" verdict (top.encounterName) -- lets the card split "Roll" from the boss name without parsing `headline`. Undefined for toss-up/vault/tokens verdicts. */
  bossName?: string
}

/**
 * Reduces a Recommendation (+ optional VaultDecision) into exactly what the
 * "Roll this boss" card needs to render. Headline is always one of the three
 * fixed phrases the aesthetic brief specifies.
 */
export function buildCardData(params: {
  recommendation: Recommendation
  bossEvals: BossEval[]
  vaultDecision: VaultDecision | null
  vaultItemName?: string
}): CardData {
  const { recommendation, bossEvals, vaultDecision, vaultItemName } = params

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

  if (!vaultDecision) {
    return {
      verdict: 'roll',
      headline: rollHeadline,
      pct: top.expectedGainPct,
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
      tossUp: false,
      vaultCompare,
      message: vaultDecision.explanation,
      rollsAvailable,
    }
  }

  const tossUp = vaultDecision.verdict === 'toss-up'
  const vaultWins = vaultDecision.verdict === 'vault' || (tossUp && vaultDecision.vaultItemGainPct >= vaultDecision.voidcoreGainPct)
  const tossUpNote = tossUp ? vaultDecision.notes.find((n) => n.toLowerCase().includes('vault item')) : undefined

  if (vaultWins) {
    return {
      verdict: 'vault',
      headline: 'Take the vault item',
      pct: vaultDecision.vaultItemGainPct,
      secondBest,
      vaultCompare,
      tossUp,
      tossUpNote,
      rollsAvailable,
    }
  }

  return {
    verdict: 'roll',
    headline: rollHeadline,
    pct: vaultDecision.voidcoreGainPct,
    secondBest,
    vaultCompare,
    tossUp: tossUp || !!rollTossUp,
    tossUpNote: tossUpNote ?? rollTossUpNote,
    rollsAvailable,
    tossUpBosses,
    bossName: rollTossUp ? undefined : top.encounterName,
  }
}
