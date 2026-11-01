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

  it('the gap (0.109) is past the combined pool-mean noise sqrt(a^2 + b^2) and the 0.1 floor, so the engine calls no toss-up', () => {
    const ulatek = evals.find((b) => b.encounterName === "Ula'tek")!
    const altar = evals.find((b) => b.encounterName === 'The Coiled Altar')!
    expect(ulatek.evPct).toBeCloseTo(0.921, 3)
    expect(altar.evPct).toBeCloseTo(0.812, 3)
    const gap = ulatek.evPct - altar.evPct
    const noise = Math.hypot(ulatek.evErrorPct!, altar.evErrorPct!)
    expect(gap).toBeCloseTo(0.109, 3)
    expect(noise).toBeLessThan(0.1)
    // The old band (sum of each boss's MEAN entry error, ~0.167) overstated the noise of a pool mean.
    expect(ulatek.evErrorPct! + altar.evErrorPct!).toBeLessThan(gap)
    expect(rec.tossUp).toBeNull()
  })

  it('is not a toss-up, and the card says the pick holds (one determination)', () => {
    expect(vaultDecision.verdict).toBe('voidcore')
    expect(card.tossUp).toBe(false)
    expect(card.secondBest).toMatchObject({ name: 'The Coiled Altar (Mythic)', clearOfNoise: true })
    const text = cardText(card)
    expect(text).toContain('Clear of sim noise, so the pick holds.')
    expect(text).not.toContain('Toss-up')
  })

  it('a toss-up never says the pick holds (the same determination, the other way)', () => {
    const tossRec = { ...rec, tossUp: { bosses: ["Ula'tek", 'The Coiled Altar'] as [string, string], gapPct: 0.109, targetKeys: [evalKeyOf("Ula'tek"), evalKeyOf('The Coiled Altar')] as [string, string] } }
    const toss = buildCardData({ recommendation: tossRec, bossEvals: evals, vaultDecision, vaultItemName: vaultItem.name, plan, thresholdPct: 0.2 })
    expect(toss.tossUp).toBe(true)
    const text = cardText(toss)
    expect(text).toMatch(/Toss-up[^:]*: Within 0\.11%/)
    expect(text).not.toContain('the pick holds')
    expect(text).not.toContain('Clear of sim noise')
  })
})

function evalKeyOf(name: string): string {
  const b = evals.find((e) => e.encounterName === name)!
  return b.targetKey ?? String(b.encounterId)
}
