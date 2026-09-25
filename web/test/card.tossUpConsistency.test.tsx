import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { buildBossPools } from '@engine/core/pool'
import { createStateFor } from '@engine/core/knockout'
import { recommend } from '@engine/core/rank'
import { compareVault } from '@engine/core/vault'
import { planVoidcores } from '@engine/core/supply'
import type { Settings } from '@engine/core/types'
import type { LootTable, NormalizedReport } from '@engine/types'
import raidFixture from '../design/fixtures/raidbots-6PTZ7TjgU8PdxJhZ97bMUa.json'
import mplusFixture from '../design/fixtures/raidbots-a8URThoNZqEXDW3tBtavHq.json'
import raidLoot from '../design/fixtures/loot-table-1320-62.json'
import mplusLoot from '../design/fixtures/loot-table--1-62.json'
import { RecommendationCard } from '../src/components/RecommendationCard'
import { buildCardData } from '../src/lib/cardData'

// The real Icemagus fixtures (Mythic raid 6PTZ7 + Mythic+ a8URT, Arcane). One roll, the vault comparison layout.
// (The design fixtures are the proxy's normalized responses for those two reports, with the Arcane loot tables.)
const raid = { ...(raidFixture as unknown as NormalizedReport), equippedItemIds: undefined }
const mplus = { ...(mplusFixture as unknown as NormalizedReport), equippedItemIds: undefined }
const settings: Settings = { thresholdPct: 0.2, voidcoresToSpend: 1, includeOffSpec: false, lootSpecId: 62 }
const evals = [
  ...buildBossPools(raid, createStateFor(raid), settings, (raidLoot as unknown as LootTable).encounters),
  ...buildBossPools(mplus, createStateFor(mplus), settings, (mplusLoot as unknown as LootTable).encounters),
]
const vaultItem = { name: 'Vile Vial of Volatile Venom', gainPct: 0.7439364712473122, itemId: 273796, encounterId: 2878 }

function cardText(card: ReturnType<typeof buildCardData>): string {
  return renderToStaticMarkup(createElement(RecommendationCard, { card })).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
}

describe("Icemagus, 1 roll, vault comparison: Ula'tek 0.921 vs The Coiled Altar 0.812", () => {
  const rec = recommend(evals, settings, [raid, mplus])
  const vaultDecision = compareVault({ vaultItem, bossEvals: evals, recommendation: rec, settings, report: raid })
  const plan = planVoidcores(evals, { onHand: 0, toSpend: 0, earnedPerWeek: 1 })
  const card = buildCardData({ recommendation: rec, bossEvals: evals, vaultDecision, vaultItemName: vaultItem.name, plan, thresholdPct: 0.2 })

  it('the two values behind the old contradiction: the engine band is the sum of the two bosses\' sim errors (0.167), wider than the 0.109 gap; the "clear" copy had no band at all', () => {
    const ulatek = evals.find((b) => b.encounterName === "Ula'tek")!
    const altar = evals.find((b) => b.encounterName === 'The Coiled Altar')!
    expect(ulatek.evPct).toBeCloseTo(0.921, 3)
    expect(altar.evPct).toBeCloseTo(0.812, 3)
    const gap = ulatek.evPct - altar.evPct
    const errorBand = ulatek.evErrorPct! + altar.evErrorPct!
    expect(gap).toBeCloseTo(0.109, 3)
    expect(errorBand).toBeCloseTo(0.167, 3)
    expect(gap).toBeLessThan(errorBand) // the fixed band (max(0.1, 5% of 0.921) = 0.1) alone would not call it
    expect(rec.tossUp?.gapPct).toBeCloseTo(gap, 10)
  })

  it('is a toss-up, and the card never says the pick holds', () => {
    expect(vaultDecision.verdict).toBe('voidcore')
    expect(card.tossUp).toBe(true)
    expect(card.secondBest).toMatchObject({ name: 'The Coiled Altar (Mythic)', clearOfNoise: false })
    const text = cardText(card)
    expect(text).toMatch(/Toss-up[^:]*: Within 0\.11%/)
    expect(text).toContain('Next best: The Coiled Altar (Mythic), ~0.81%.')
    expect(text).not.toContain('the pick holds')
    expect(text).not.toContain('Clear of sim noise')
  })

  it('a clear gap still says so (the same determination, the other way)', () => {
    const clearRec = { ...rec, tossUp: null }
    const clear = buildCardData({ recommendation: clearRec, bossEvals: evals, vaultDecision, vaultItemName: vaultItem.name, plan, thresholdPct: 0.2 })
    expect(clear.tossUp).toBe(false)
    expect(clear.secondBest?.clearOfNoise).toBe(true)
    const text = cardText(clear)
    expect(text).toContain('Clear of sim noise, so the pick holds.')
    expect(text).not.toContain('Toss-up')
  })
})
