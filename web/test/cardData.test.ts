import { describe, expect, it } from 'vitest'
import { buildCardData } from '../src/lib/cardData'
import type { BossEval, Recommendation, VaultDecision } from '@engine/core/types'

function makeBoss(encounterId: number, encounterName: string, evPct: number): BossEval {
  return {
    encounterId,
    encounterName,
    instanceId: 1320,
    pool: [],
    remaining: 1,
    rollsSpent: 0,
    rollsAttributed: 0,
    rollsUnattributed: 0,
    ev: evPct * 1000,
    evPct,
    bestCase: null,
    deployable: true,
    notes: [],
  }
}

function makeRecommendation(overrides: Partial<Recommendation> = {}): Recommendation {
  return {
    allocations: [{ encounterId: 2894, encounterName: 'The Lost Explorers', rolls: 1, expectedGain: 2300, expectedGainPct: 2.3 }],
    totalExpectedGainPct: 2.3,
    fallback: null,
    assumptions: [],
    warnings: [],
    tossUp: null,
    ...overrides,
  }
}

describe('buildCardData toss-up headline', () => {
  it('uses the single-boss headline when there is no toss-up', () => {
    const card = buildCardData({
      recommendation: makeRecommendation(),
      bossEvals: [makeBoss(2894, 'The Lost Explorers', 2.3)],
      vaultDecision: null,
    })
    expect(card.headline).toBe('Roll The Lost Explorers')
    expect(card.tossUp).toBe(false)
    expect(card.tossUpNote).toBeUndefined()
  })

  it('uses the "Roll X or Y" headline and a kill-order note when recommendation.tossUp is set', () => {
    const card = buildCardData({
      recommendation: makeRecommendation({
        tossUp: { bosses: ['The Lost Explorers', "Ula'tek"], gapPct: 0.03 },
      }),
      bossEvals: [makeBoss(2894, 'The Lost Explorers', 2.3), makeBoss(2895, "Ula'tek", 2.27)],
      vaultDecision: null,
    })
    expect(card.headline).toBe("Roll The Lost Explorers or Ula'tek")
    expect(card.tossUp).toBe(true)
    expect(card.tossUpNote).toBe('Within 0.03%: let kill order decide; roll whichever you kill first.')
  })
})

function makeVaultDecision(overrides: Partial<VaultDecision> = {}): VaultDecision {
  return {
    voidcoreGainPct: 2.3,
    vaultItemGainPct: 0.74,
    savedRolls: 0,
    verdict: 'voidcore',
    explanation: '',
    notes: [],
    ...overrides,
  }
}

describe('buildCardData vault-vs-Voidcore verdict copy', () => {
  const recommendation = makeRecommendation()
  const bossEvals = [makeBoss(2894, 'The Lost Explorers', 2.3)]

  it('Voidcore wins: names the decision and the boss to roll, and always names the best roll target', () => {
    const card = buildCardData({
      recommendation,
      bossEvals,
      vaultDecision: makeVaultDecision({ verdict: 'voidcore', voidcoreGainPct: 2.3, vaultItemGainPct: 0.74 }),
      vaultItemName: 'Vile Vial of Volatile Venom',
    })
    expect(card.verdict).toBe('roll')
    expect(card.headline).toBe('Take the Voidcore. Roll The Lost Explorers.')
    expect(card.pct).toBe(2.3)
    expect(card.bestRoll).toEqual({ name: 'The Lost Explorers', pct: 2.3, bestCaseItemName: undefined })
    // No contradiction: never says "toss-up" and never claims the pick is clear of noise when it's a real toss-up.
    expect(card.tossUp).toBe(false)
  })

  it('Vault wins: names the specific vault item', () => {
    const card = buildCardData({
      recommendation,
      bossEvals,
      vaultDecision: makeVaultDecision({ verdict: 'vault', voidcoreGainPct: 0.74, vaultItemGainPct: 2.3 }),
      vaultItemName: 'Vile Vial of Volatile Venom',
    })
    expect(card.verdict).toBe('vault')
    expect(card.headline).toBe('Take the vault item: Vile Vial of Volatile Venom')
    // The best roll target is still named even though the verdict is vault.
    expect(card.bestRoll).toEqual({ name: 'The Lost Explorers', pct: 2.3, bestCaseItemName: undefined })
    expect(card.secondBest).toBeUndefined()
  })

  it('Vault wins via a manual % override (no resolved item): says "Take your vault item" instead of a name', () => {
    const card = buildCardData({
      recommendation,
      bossEvals,
      vaultDecision: makeVaultDecision({ verdict: 'vault', voidcoreGainPct: 0.74, vaultItemGainPct: 2.4 }),
      vaultItemName: 'Manual vault gain',
      isManualVaultGain: true,
    })
    expect(card.headline).toBe('Take your vault item')
  })

  it('Toss-up: headline is literally "Toss-up", both sides are exposed via vaultCompare, and it never claims the pick is clear of noise', () => {
    const card = buildCardData({
      recommendation,
      bossEvals,
      vaultDecision: makeVaultDecision({
        verdict: 'toss-up',
        voidcoreGainPct: 2.3,
        vaultItemGainPct: 2.4,
        notes: ['Voidcore and the vault item are close enough to call a toss-up.'],
      }),
      vaultItemName: 'Manual vault gain',
      isManualVaultGain: true,
    })
    expect(card.verdict).toBe('toss-up')
    expect(card.headline).toBe('Toss-up')
    expect(card.headline).not.toContain('the pick holds')
    expect(card.vaultCompare).toEqual({ voidcorePct: 2.3, vaultPct: 2.4, vaultItemName: 'Manual vault gain' })
    // Still always names the best roll target, since the player may hold another Voidcore.
    expect(card.bestRoll).toEqual({ name: 'The Lost Explorers', pct: 2.3, bestCaseItemName: undefined })
    expect(card.secondBest).toBeUndefined()
    expect(card.tossUpNote).toBe('Voidcore and the vault item are close enough to call a toss-up.')
  })
})
