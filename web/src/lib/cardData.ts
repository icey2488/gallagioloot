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
    }
  }

  const top = recommendation.allocations[0]
  const secondAllocation = recommendation.allocations[1]
  const deployableByEv = [...bossEvals].filter((b) => b.deployable && b.encounterId !== top.encounterId).sort((a, b) => b.evPct - a.evPct)
  const secondBest = secondAllocation
    ? { name: secondAllocation.encounterName, pct: secondAllocation.expectedGainPct }
    : deployableByEv[0]
      ? { name: deployableByEv[0].encounterName, pct: deployableByEv[0].evPct }
      : undefined

  if (!vaultDecision) {
    return {
      verdict: 'roll',
      headline: `Roll ${top.encounterName}`,
      pct: top.expectedGainPct,
      secondBest,
      tossUp: false,
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
    }
  }

  return {
    verdict: 'roll',
    headline: `Roll ${top.encounterName}`,
    pct: vaultDecision.voidcoreGainPct,
    secondBest,
    vaultCompare,
    tossUp,
    tossUpNote,
  }
}
