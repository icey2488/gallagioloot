import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { recommend } from '@engine/core/rank'
import { planVoidcores, ROLL_ORDER_REMINDER } from '@engine/core/supply'
import type { BossEval, PoolEntry, Settings } from '@engine/core/types'
import { RecommendationCard } from '../src/components/RecommendationCard'
import { buildCardData } from '../src/lib/cardData'

// Synthetic ranking: two raid bosses and one Mythic+ dungeon that ranks between them, so a plan of 3
// Voidcores reaches the dungeon and a plan of 1 does not.
const BASELINE = 100000
const settings: Settings = { thresholdPct: 0.2, voidcoresToSpend: 1, includeOffSpec: false, lootSpecId: 62 }

function target(id: number, name: string, evPct: number, kind: 'raid' | 'mplus'): BossEval {
  const ev = (evPct / 100) * BASELINE
  const entry: PoolEntry = { key: `item:${id}`, itemIds: [id], name: `${name} item`, value: ev, rawDelta: ev, pct: evPct, kind: 'item', specSpecific: false, ownership: 'none', isDud: false, knockedOut: false }
  return {
    encounterId: id,
    encounterName: name,
    instanceId: 1320,
    targetKey: `${kind}:${id}`,
    kind,
    difficultyLabel: kind === 'mplus' ? '+10 (Myth)' : 'Mythic',
    keyLevel: kind === 'mplus' ? 10 : undefined,
    baseline: BASELINE,
    pool: [entry],
    remaining: 1,
    rollsSpent: 0,
    rollsAttributed: 0,
    rollsUnattributed: 0,
    ev,
    evPct,
    bestCase: entry,
    deployable: true,
    notes: [],
  }
}

const evals = [target(1, "Ula'tek", 0.9, 'raid'), target(2, 'Murder Row', 0.7, 'mplus'), target(3, 'Sszorak', 0.3, 'raid')]

function cardFor(toSpend: number, list = evals) {
  const plan = planVoidcores(list, { onHand: toSpend, toSpend, earnedPerWeek: 1 })
  const recommendation = recommend(list, { ...settings, voidcoresToSpend: Math.max(1, toSpend) }, [])
  const card = buildCardData({ recommendation, bossEvals: list, vaultDecision: null, plan, thresholdPct: 0.2 })
  const text = renderToStaticMarkup(createElement(RecommendationCard, { card })).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
  return { card, text }
}

describe('the roll order states its Mythic+ assumption and the re-run reminder', () => {
  it('a dungeon inside the to-spend count is named with its run count', () => {
    const { card, text } = cardFor(2)
    expect(card.rolls?.map((r) => r.name)).toEqual(["Ula'tek (Mythic)", 'Murder Row at +10'])
    expect(card.rollAssumption).toBe('Plan assumes you run Murder Row at +10 once this week.')
    expect(text).toContain('Plan assumes you run Murder Row at +10 once this week.')
  })

  it('the count is the number of rolls the plan assigns to the dungeon', () => {
    const { card } = cardFor(2, [target(2, 'Murder Row', 0.9, 'mplus'), target(1, "Ula'tek", 0.3, 'raid')])
    expect(card.rollAssumption).toBe('Plan assumes you run Murder Row at +10 twice this week.')
  })

  it('a dungeon outside the to-spend count, or no dungeon at all, says nothing about Mythic+', () => {
    const one = cardFor(1)
    expect(one.card.rollAssumption).toBeUndefined()
    expect(one.text).not.toContain('Plan assumes')
    const raidOnly = cardFor(2, [evals[0], evals[2]])
    expect(raidOnly.card.rollAssumption).toBeUndefined()
    expect(raidOnly.text).not.toMatch(/Mythic\+|Plan assumes|at \+10/)
  })

  it('the re-run reminder shows with at least one roll (raid or Mythic+), verbatim and without em dashes', () => {
    for (const toSpend of [1, 3]) {
      const { card, text } = cardFor(toSpend)
      expect(card.rollReminder).toBe(ROLL_ORDER_REMINDER)
      expect(text).toContain('This order holds until your next roll result. After a win, especially a big one, re-run your droptimizer and GallagioLoot: a jackpot can drop a dungeon or boss off the worthwhile list.')
      expect(text).not.toContain('—')
    }
  })

  it('no reminder when there is nothing to roll', () => {
    const { card, text } = cardFor(0)
    expect(card.rolls).toEqual([])
    expect(card.rollReminder).toBeUndefined()
    expect(text).not.toContain('This order holds')
  })
})
