import { describe, expect, it } from 'vitest'
import { clampCount, MAX_VOIDCORES, recommend, rollSequence } from '../src/core/rank'
import { planVoidcores, stockpileCheck } from '../src/core/supply'
import type { BossEval, PoolEntry } from '../src/core/types'

function boss(encounterId: number, evPct: number, kind: 'raid' | 'mplus' = 'raid'): BossEval {
  const entry: PoolEntry = { key: `item:${encounterId}`, itemIds: [encounterId], name: 'x', value: evPct * 1000, rawDelta: evPct * 1000, pct: evPct, kind: 'item', specSpecific: false, ownership: 'none', isDud: false, knockedOut: false }
  return {
    encounterId, encounterName: `B${encounterId}`, instanceId: 1, targetKey: `${kind}:${encounterId}`, kind, difficultyLabel: 'Mythic', baseline: 100000,
    pool: [entry], remaining: 1, rollsSpent: 0, rollsAttributed: 0, rollsUnattributed: 0, ev: evPct * 1000, evPct, bestCase: entry, deployable: true, notes: [],
  }
}

describe('clampCount / MAX_VOIDCORES', () => {
  it('floors, rejects NaN/Infinity/negatives, caps at MAX_VOIDCORES', () => {
    expect(clampCount(3.9)).toBe(3)
    expect(clampCount(-2)).toBe(0)
    expect(clampCount(NaN)).toBe(0)
    expect(clampCount(Infinity)).toBe(0)
    expect(clampCount(1e9)).toBe(MAX_VOIDCORES)
  })

  it('planVoidcores and stockpileCheck clamp huge inputs', () => {
    const plan = planVoidcores([boss(1, 2, 'mplus')], { onHand: 1e9, toSpend: 1e9, earnedPerWeek: 1e9 })
    expect(plan.toSpend).toBe(MAX_VOIDCORES)
    expect(plan.rolls).toHaveLength(MAX_VOIDCORES)
    expect(stockpileCheck({ onHand: 1e12, earnedPerWeek: 0, weeksLeft: 0, goodRollsPerWeek: 1 }).supply).toBe(MAX_VOIDCORES)
  })

  it('recommend clamps voidcoresToSpend', () => {
    const rec = recommend([boss(1, 2, 'mplus')], { thresholdPct: 0.2, voidcoresToSpend: 1e9, includeOffSpec: false }, [])
    expect(rec.allocations[0].rolls).toBe(MAX_VOIDCORES)
  })
})

describe('rollSequence: arithmetic fill once only a repeatable target is left on top', () => {
  it('raid targets first, then the dungeon takes every remaining roll', () => {
    const ranked = [boss(1, 5), boss(2, 4), boss(3, 3, 'mplus'), boss(4, 1)]
    const seq = rollSequence(ranked, 6).map((b) => b.encounterId)
    expect(seq).toEqual([1, 2, 3, 3, 3, 3])
  })

  it('does not scan the ranking per roll after the fill point (large roll count is cheap)', () => {
    const ranked = [boss(3, 3, 'mplus'), ...Array.from({ length: 50 }, (_, i) => boss(100 + i, 1))]
    let finds = 0
    const spy = new Proxy(ranked, {
      get(target, prop, recv) {
        if (prop === 'find') finds++
        return Reflect.get(target, prop, recv)
      },
    })
    const seq = rollSequence(spy, 100000)
    expect(seq).toHaveLength(100000)
    expect(finds).toBe(1)
  })

  it('raid-only still stops when targets run out; non-finite rolls give an empty sequence', () => {
    expect(rollSequence([boss(1, 5), boss(2, 4)], 5)).toHaveLength(2)
    expect(rollSequence([boss(1, 5, 'mplus')], Infinity)).toEqual([])
  })
})
