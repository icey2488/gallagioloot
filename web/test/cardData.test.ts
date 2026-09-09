import { describe, expect, it } from 'vitest'
import { buildCardData } from '../src/lib/cardData'
import type { BossEval, Recommendation } from '@engine/core/types'

function makeBoss(encounterId: number, encounterName: string, evPct: number): BossEval {
  return {
    encounterId,
    encounterName,
    instanceId: 1320,
    pool: [],
    remaining: 1,
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
