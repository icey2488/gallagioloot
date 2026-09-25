import { describe, expect, it } from 'vitest'
import { buildBossPools } from '../src/core/pool'
import { createStateFor } from '../src/core/knockout'
import { recommend } from '../src/core/rank'
import { compareVault } from '../src/core/vault'
import {
  BELOW_THRESHOLD_TEXT,
  defaultEarnedPerWeek,
  holdAdvice,
  holdAdviceText,
  noTargetText,
  planVoidcores,
  stockpileCheck,
  stockpileWarningText,
  VOIDCORE_ASSUMPTIONS,
  type VoidcoreSupply,
} from '../src/core/supply'
import type { BossEval, PoolEntry, Settings } from '../src/core/types'
import { buildLootTable } from '../src/lookup/lootTable'
import { normalizeRaidbotsReport } from '../src/normalize/raidbots'
import { loadLookup, loadMplusRaw, loadRaidRaw, MPLUS_REPORT_ID, RAID_REPORT_ID } from './fixtures/load'

const BASELINE = 100000

function boss(encounterId: number, name: string, evPct: number, opts: { kind?: 'raid' | 'mplus'; deployable?: boolean; belowThreshold?: boolean } = {}): BossEval {
  const ev = (evPct / 100) * BASELINE
  const entry: PoolEntry = { key: `item:${encounterId}`, itemIds: [encounterId], name: `${name} item`, value: ev, rawDelta: ev, pct: evPct, kind: 'item', specSpecific: false, ownership: 'none', isDud: false, knockedOut: false }
  return {
    encounterId,
    encounterName: name,
    instanceId: 1320,
    targetKey: `${opts.kind ?? 'raid'}:${encounterId}`,
    kind: opts.kind ?? 'raid',
    difficultyLabel: opts.kind === 'mplus' ? '+10 (Myth)' : 'Mythic',
    keyLevel: opts.kind === 'mplus' ? 10 : undefined,
    baseline: BASELINE,
    pool: [entry],
    remaining: 1,
    rollsSpent: 0,
    rollsAttributed: 0,
    rollsUnattributed: 0,
    ev,
    evPct,
    bestCase: entry,
    deployable: opts.deployable ?? true,
    belowThreshold: opts.belowThreshold,
    notes: [],
  }
}

const supply = (onHand: number, earnedPerWeek = 1, extra: Partial<VoidcoreSupply> = {}): VoidcoreSupply => ({ onHand, toSpend: onHand, earnedPerWeek, ...extra })
const names = (evals: BossEval[], s: VoidcoreSupply) => planVoidcores(evals, s).rolls.map((r) => r.encounterName)

describe('planVoidcores: this week\'s roll order', () => {
  const raid = [boss(1, 'A', 0.9), boss(2, 'B', 0.7), boss(3, 'C', 0.5)]

  it('raid targets are distinct per week, N = 1..5; Voidcores past the last target have no target this week', () => {
    expect(names(raid, supply(1))).toEqual(['A'])
    expect(names(raid, supply(2))).toEqual(['A', 'B'])
    expect(names(raid, supply(3))).toEqual(['A', 'B', 'C'])
    expect(names(raid, supply(4))).toEqual(['A', 'B', 'C'])
    expect(names(raid, supply(5))).toEqual(['A', 'B', 'C'])
    expect([1, 2, 3, 4, 5].map((n) => planVoidcores(raid, supply(n)).noTargetCount)).toEqual([0, 0, 0, 1, 2])
    expect(noTargetText(1)).toBe('1 Voidcore has no target this week (every rollable boss already takes one); it carries to next week.')
    expect(noTargetText(2)).toBe('2 Voidcores have no target this week (every rollable boss already takes one); they carry to next week.')
  })

  it('a Mythic+ dungeon repeats once it is the best target left, N = 1..5', () => {
    const evals = [boss(1, 'A', 0.9), boss(10, 'Den', 0.6, { kind: 'mplus' }), boss(2, 'B', 0.5)]
    expect(names(evals, supply(1))).toEqual(['A'])
    expect(names(evals, supply(2))).toEqual(['A', 'Den'])
    expect(names(evals, supply(3))).toEqual(['A', 'Den', 'Den'])
    expect(names(evals, supply(5))).toEqual(['A', 'Den', 'Den', 'Den', 'Den'])
    expect(planVoidcores(evals, supply(5)).noTargetCount).toBe(0)
  })

  it('matches recommend() on the deployable targets for the same count', () => {
    const evals = [boss(1, 'A', 0.9), boss(2, 'B', 0.7), boss(10, 'Den', 0.5, { kind: 'mplus' })]
    for (const n of [1, 2, 3, 4, 5]) {
      const rec = recommend(evals, { thresholdPct: 0.2, voidcoresToSpend: n, includeOffSpec: false }, [])
      const expanded = rec.allocations.flatMap((a) => Array.from({ length: a.rolls }, () => a.encounterName))
      expect(names(evals, supply(n))).toEqual(expanded)
    }
  })

  it('spends only the Voidcores set to spend; the rest are carried and queue ahead of a held one next week', () => {
    const plan = planVoidcores(raid, { onHand: 3, toSpend: 1, earnedPerWeek: 1 })
    expect(plan.rolls.map((r) => r.encounterName)).toEqual(['A'])
    expect(plan.nextWeekAhead).toBe(3) // 1 earned + 2 carried
    expect(plan.rolls[0].hold).toBeNull() // A, B, C taken by the 3 ahead: nothing left for a held 4th
    expect(plan.rolls[0].advice).toBe('spend')
  })

  it('zero to spend: an empty order, nothing without a target', () => {
    const plan = planVoidcores(raid, supply(0))
    expect(plan.rolls).toEqual([])
    expect(plan.noTargetCount).toBe(0)
  })

  it('in-play targets below the threshold take rolls after the good ones and are flagged; not-expected targets never do', () => {
    const evals = [boss(1, 'A', 0.9), boss(2, 'Low', 0.1, { deployable: false, belowThreshold: true }), boss(3, 'Skipped', 0.8, { deployable: false })]
    const plan = planVoidcores(evals, supply(3))
    expect(plan.rolls.map((r) => [r.encounterName, r.belowThreshold])).toEqual([
      ['A', false],
      ['Low', true],
    ])
    expect(plan.noTargetCount).toBe(1)
    expect(BELOW_THRESHOLD_TEXT).toBe('below threshold: hold it or take the tokens')
  })

  it('buildBossPools marks in-play targets under the threshold belowThreshold (and not deployable)', () => {
    const lookup = loadLookup()
    const raid = normalizeRaidbotsReport(RAID_REPORT_ID, loadRaidRaw(), lookup)
    const evals = buildBossPools(raid, createStateFor(raid), { thresholdPct: 0.5, voidcoresToSpend: 1, includeOffSpec: false, lootSpecId: 62 }, buildLootTable(1320, 62, lookup))
    for (const b of evals) {
      expect(b.deployable).toBe(b.evPct >= 0.5)
      expect(b.belowThreshold).toBe(b.evPct < 0.5)
    }
    const plan = planVoidcores(evals, supply(5))
    expect(plan.rolls.map((r) => r.belowThreshold)).toEqual([false, false, false, false, true])
  })
})

describe('spend now vs hold', () => {
  it('hold value is next week\'s target after the earned Voidcores take the top: roll N vs next week\'s position earned + 1', () => {
    const evals = [boss(1, 'A', 0.9), boss(2, 'B', 0.8), boss(3, 'C', 0.6), boss(4, 'D', 0.5)]
    const plan = planVoidcores(evals, supply(3, 1))
    expect(plan.rolls.map((r) => [r.encounterName, r.hold?.encounterName ?? null, r.advice])).toEqual([
      ['A', 'D', 'spend'], // held with two others: next week's 4th
      ['B', 'C', 'spend'],
      ['C', 'B', 'compare'], // the lowest roll, held alone, gets next week's 2nd
    ])
    expect(holdAdviceText(plan.rolls[2])).toBe('spend now 0.60% vs hold ~0.80% next week')
    expect(holdAdviceText(plan.rolls[0])).toBe('spend now')
  })

  it('no hold target next week means spend now', () => {
    const plan = planVoidcores([boss(1, 'A', 0.9)], supply(1, 1))
    expect(plan.rolls[0]).toMatchObject({ hold: null, holdPct: 0, advice: 'spend' })
  })

  it('Mythic+ repeat: a held Voidcore gets the same dungeon next week, so holding only delays it', () => {
    const plan = planVoidcores([boss(10, 'Den', 0.6, { kind: 'mplus' })], supply(3, 2))
    expect(plan.rolls.every((r) => r.advice === 'spend' && r.hold?.encounterName === 'Den')).toBe(true)
  })

  it('a hold value within half a display unit (0.005) of the spend value counts as equal', () => {
    expect(holdAdvice(0.648, 0.652)).toBe('spend')
    expect(holdAdvice(0.648, 0.654)).toBe('compare')
    expect(holdAdvice(0.648, 0.648)).toBe('spend')
  })
})

describe('the season-end stockpile check', () => {
  it('stockpileCheck: on hand + earned x weeks left vs good rolls per week x (weeks left + this week)', () => {
    expect(stockpileCheck({ onHand: 9, earnedPerWeek: 2, weeksLeft: 2, goodRollsPerWeek: 3 })).toEqual({ supply: 13, goodRolls: 9, excess: 4, warn: true })
    expect(stockpileCheck({ onHand: 2, earnedPerWeek: 1, weeksLeft: 3, goodRollsPerWeek: 2 })).toEqual({ supply: 5, goodRolls: 8, excess: 0, warn: false })
    expect(stockpileCheck({ onHand: 4, earnedPerWeek: 2, weeksLeft: 0, goodRollsPerWeek: 4 })).toEqual({ supply: 4, goodRolls: 4, excess: 0, warn: false })
    expect(stockpileCheck({ onHand: 50, earnedPerWeek: 2, weeksLeft: 1, goodRollsPerWeek: Infinity })).toEqual({ supply: 52, goodRolls: Infinity, excess: 0, warn: false })
  })

  it('stockpileCheck: negative, fractional and non-finite inputs', () => {
    expect(stockpileCheck({ onHand: -3, earnedPerWeek: 1.9, weeksLeft: 2.5, goodRollsPerWeek: -1 })).toEqual({ supply: 2, goodRolls: 0, excess: 2, warn: true })
    expect(stockpileCheck({ onHand: NaN, earnedPerWeek: Infinity, weeksLeft: 1, goodRollsPerWeek: NaN })).toEqual({ supply: 0, goodRolls: 0, excess: 0, warn: false })
  })

  it('raid-only: more Voidcores than good raid rolls before season end warns; below-threshold targets are not good rolls', () => {
    const evals = [boss(1, 'A', 0.9), boss(2, 'B', 0.7), boss(3, 'Low', 0.1, { deployable: false, belowThreshold: true })]
    const plan = planVoidcores(evals, supply(6, 2, { weeksLeft: 1 }))
    expect(plan.stockpile).toEqual({ supply: 8, goodRolls: 4, excess: 4, warn: true })
    expect(stockpileWarningText(plan.stockpile!, 0.2)).toBe(
      'You have more Voidcores than good targets before season end (8 Voidcores vs 4 rolls at or above 0.2%); spend down lower targets.'
    )
    expect(planVoidcores(evals, supply(1, 1, { weeksLeft: 3 })).stockpile?.warn).toBe(false)
  })

  it('a good Mythic+ dungeon is repeatable, so there are always enough good rolls; no weeks left set means no check', () => {
    const evals = [boss(1, 'A', 0.9), boss(10, 'Den', 0.3, { kind: 'mplus' })]
    expect(planVoidcores(evals, supply(40, 2, { weeksLeft: 1 })).stockpile?.warn).toBe(false)
    expect(planVoidcores(evals, supply(40, 2)).stockpile).toBeNull()
  })
})

describe('one more Voidcore: max(spend now as the next roll, hold)', () => {
  it('spend now when the next roll this week is worth at least its hold value', () => {
    const evals = [boss(1, 'A', 0.9), boss(2, 'B', 0.8), boss(3, 'C', 0.7)]
    expect(planVoidcores(evals, supply(0, 1)).extra).toMatchObject({ use: 'spend', roll: 1, target: { encounterName: 'A' }, valuePct: 0.9 })
    // on hand 1: roll 2 is B (0.8); held, it gets next week's 2nd (B): equal, so spend.
    expect(planVoidcores(evals, supply(1, 1)).extra).toMatchObject({ use: 'spend', roll: 2, target: { encounterName: 'B' }, valuePct: 0.8 })
  })

  it('hold when next week\'s target for it beats the next roll this week', () => {
    const evals = [boss(1, 'A', 0.9), boss(2, 'B', 0.8), boss(3, 'C', 0.4)]
    expect(planVoidcores(evals, supply(2, 1)).extra).toMatchObject({ use: 'hold', target: { encounterName: 'B' }, valuePct: 0.8, spendPct: 0.4 })
  })

  it('no target this week (raid used up): its hold value, or null when next week has none either', () => {
    const evals = [boss(1, 'A', 0.9), boss(2, 'B', 0.8)]
    expect(planVoidcores(evals, supply(2, 1)).extra).toMatchObject({ use: 'hold', target: { encounterName: 'B' }, spendPct: 0 })
    expect(planVoidcores(evals, supply(2, 2)).extra).toBeNull()
  })
})

describe('earning rate', () => {
  it('defaults to 1 a week, 2 once NEXT week is season week 8 or later (earning only matters for future weeks)', () => {
    expect(defaultEarnedPerWeek()).toBe(1)
    expect(defaultEarnedPerWeek(1)).toBe(1)
    expect(defaultEarnedPerWeek(6)).toBe(1)
    expect(defaultEarnedPerWeek(7)).toBe(2)
    expect(defaultEarnedPerWeek(8)).toBe(2)
    expect(defaultEarnedPerWeek(12)).toBe(2)
  })

  it('the seven supply assumptions are disclosed, with no em dashes', () => {
    expect(VOIDCORE_ASSUMPTIONS).toHaveLength(7)
    expect(VOIDCORE_ASSUMPTIONS.join(' ')).not.toMatch(/—/)
  })
})

describe('Icemagus fixtures (Mythic raid 6PTZ7 + Mythic+ a8URT, Arcane): 3 Voidcores on hand, all spent', () => {
  const lookup = loadLookup()
  const raid = normalizeRaidbotsReport(RAID_REPORT_ID, loadRaidRaw(), lookup)
  const mplus = normalizeRaidbotsReport(MPLUS_REPORT_ID, loadMplusRaw(), lookup)
  const settings: Settings = { thresholdPct: 0.2, voidcoresToSpend: 3, includeOffSpec: false, lootSpecId: 62 }
  const evals = [
    ...buildBossPools(raid, createStateFor(raid), settings, buildLootTable(1320, 62, lookup)),
    ...buildBossPools(mplus, createStateFor(mplus), settings, buildLootTable(-1, 62, lookup)),
  ]
  const vaultItem = { name: 'Vile Vial of Volatile Venom', gainPct: 0.7439364712473122, itemId: 273796, encounterId: 2878 }
  const row = (r: ReturnType<typeof planVoidcores>['rolls'][number]) => `${r.roll}. ${r.encounterName} ${r.evPct.toFixed(3)} · ${holdAdviceText(r)}`

  it('earned 1 a week: Ula\'tek, The Coiled Altar, Sszorak; the 3rd, held, would get The Coiled Altar next week', () => {
    const plan = planVoidcores(evals, supply(3, 1))
    expect(plan.rolls.map(row)).toEqual([
      "1. Ula'tek 0.921 · spend now",
      '2. The Coiled Altar 0.812 · spend now',
      '3. Sszorak 0.648 · spend now 0.65% vs hold ~0.81% next week',
    ])
    expect(plan.rolls[2].hold?.encounterName).toBe('The Coiled Altar')
    expect(plan.noTargetCount).toBe(0)
    // One more Voidcore: roll 4 would be The Lost Explorers (0.614); held, it gets The Coiled Altar (0.812).
    expect(plan.extra).toMatchObject({ use: 'hold', target: { encounterName: 'The Coiled Altar' }, valuePct: expect.closeTo(0.8117, 3), spendPct: expect.closeTo(0.614, 3) })
  })

  it('earned 2 a week: next week\'s two take Ula\'tek and The Coiled Altar, so a held 3rd gets Sszorak, its spend-now value: spend now', () => {
    const plan = planVoidcores(evals, supply(3, 2))
    expect(plan.rolls.map(row)).toEqual(["1. Ula'tek 0.921 · spend now", '2. The Coiled Altar 0.812 · spend now', '3. Sszorak 0.648 · spend now'])
    expect(plan.rolls[2].hold?.encounterName).toBe('Sszorak')
    expect(plan.extra).toMatchObject({ use: 'hold', target: { encounterName: 'Sszorak' }, valuePct: expect.closeTo(0.6475, 3) })
  })

  it('stockpile: the good Mythic+ dungeons are repeatable, so even 20 Voidcores with 1 week left do not warn', () => {
    expect(planVoidcores(evals, supply(20, 2, { weeksLeft: 1 })).stockpile).toMatchObject({ goodRolls: Infinity, warn: false })
  })

  it('compareVault values the Voidcore the vault adds: 0.92% with none on hand (roll 1), 0.81% held with 3 on hand earning 1, 0.65% earning 2', () => {
    const decide = (s: VoidcoreSupply) => compareVault({ vaultItem, bossEvals: evals, recommendation: recommend(evals, { ...settings, voidcoresToSpend: Math.max(1, s.toSpend) }, [raid, mplus]), settings, report: raid, supply: s })
    const fresh = decide(supply(0, 1))
    expect(fresh.voidcoreUse).toMatchObject({ use: 'spend', roll: 1, target: { encounterName: "Ula'tek" } })
    expect(fresh.voidcoreGainPct).toBeCloseTo(0.9206, 3)
    expect(fresh.verdict).toBe('voidcore')
    const earnOne = decide(supply(3, 1))
    expect(earnOne.voidcoreGainPct).toBeCloseTo(0.8117, 3)
    expect(earnOne.verdict).toBe('toss-up')
    const earnTwo = decide(supply(3, 2))
    expect(earnTwo.voidcoreGainPct).toBeCloseTo(0.6475, 3)
    expect(earnTwo.verdict).toBe('toss-up') // 0.65 vs 0.74: gap 0.096 is inside the 0.1 floor
    // The saved-rolls rule is unchanged: the Vial is from Altar of Fangs, which none of the three rolls goes to.
    for (const d of [fresh, earnOne, earnTwo]) expect(d.savedRolls).toBe(0)
    // Without a supply, compareVault assumes none on hand: the old 1-roll number.
    const noSupply = compareVault({ vaultItem, bossEvals: evals, recommendation: recommend(evals, settings, [raid, mplus]), settings, report: raid })
    expect(noSupply.voidcoreGainPct).toBeCloseTo(0.9206, 3)
  })
})

describe('compareVault: the saved-rolls credit still requires an allocated target', () => {
  const settings: Settings = { thresholdPct: 0.2, voidcoresToSpend: 1, includeOffSpec: false }
  const report = { baseline: BASELINE, warnings: [] } as never

  it('credits saved rolls when the vault item is in an allocated target\'s pool, valued against the extra Voidcore', () => {
    const a = boss(1, 'A', 0.9)
    a.pool = [0, 1, 2].map((i) => ({ ...a.pool[0], key: `a${i}`, itemIds: [100 + i], value: 900 * (i + 1), pct: 0.9 * (i + 1) }))
    a.remaining = 3
    const evals = [a, boss(2, 'B', 0.5)]
    const rec = recommend(evals, settings, [])
    const d = compareVault({ vaultItem: { name: 'X', gainPct: 0.3, itemId: 102 }, bossEvals: evals, recommendation: rec, settings, report, supply: supply(1, 1) })
    expect(d.savedRolls).toBeGreaterThan(0)
    expect(d.voidcoreUse).toMatchObject({ use: 'spend', roll: 2, target: { encounterName: 'B' } })
    expect(d.vaultItemGainPct).toBeCloseTo(0.3 + d.savedRolls * 0.5, 10)
  })
})
