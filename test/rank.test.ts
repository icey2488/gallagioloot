import { describe, expect, it } from 'vitest'
import { recommend } from '../src/core/rank'
import type { BossEval, PoolEntry, Settings } from '../src/core/types'
import type { NormalizedReport } from '../src/types'

const BASELINE = 100000

function pool(values: number[]): PoolEntry[] {
  return values.map((value, i) => ({
    key: `item:${i}`,
    itemIds: [i],
    name: `Item ${i}`,
    value,
    rawDelta: value,
    pct: (value / BASELINE) * 100,
    kind: 'item',
    specSpecific: false,
    ownership: 'none',
    isDud: false,
    knockedOut: false,
  }))
}

function makeBoss(encounterId: number, encounterName: string, values: number[], thresholdPct: number): BossEval {
  const ev = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0
  const evPct = (ev / BASELINE) * 100
  return {
    encounterId,
    encounterName,
    instanceId: 1320,
    pool: pool(values),
    remaining: values.length,
    rollsSpent: 0,
    rollsAttributed: 0,
    rollsUnattributed: 0,
    ev,
    evPct,
    bestCase: values.length > 0 ? pool(values).reduce((a, b) => (b.value > a.value ? b : a)) : null,
    deployable: values.length > 0 && evPct >= thresholdPct,
    notes: [],
  }
}

function makeReport(overrides: Partial<NormalizedReport> = {}): NormalizedReport {
  return {
    source: 'raidbots',
    reportId: 'abc',
    character: 'Iceshaman',
    spec: 'elemental',
    role: 'dps',
    metric: 'dps',
    contentType: 'raid',
    difficulty: 'raid-vault-heroic',
    baseline: BASELINE,
    items: [],
    warnings: [],
    ...overrides,
  }
}

const SETTINGS_1_ROLL: Settings = { thresholdPct: 0.2, voidcoresToSpend: 1, includeOffSpec: false }

describe('recommend', () => {
  it('with 1 roll, picks the deployable boss with the highest ev', () => {
    const bossA = makeBoss(2888, 'Boss A', [1000], 0.2)
    const bossB = makeBoss(2887, 'Boss B', [3000], 0.2)
    const rec = recommend([bossA, bossB], SETTINGS_1_ROLL, makeReport())
    expect(rec.allocations).toHaveLength(1)
    expect(rec.allocations[0]).toMatchObject({ encounterId: 2887, rolls: 1, expectedGain: 3000 })
    expect(rec.fallback).toBeNull()
  })

  it('with 2 rolls, allocates one roll each to the top two distinct deployable bosses by ev (a boss cannot be rolled twice -- only its first kill per difficulty per week offers a bonus roll)', () => {
    const bossA = makeBoss(2888, 'Boss A', [3000, 2000, 1000], 0.2) // ev 2000
    const bossB = makeBoss(2887, 'Boss B', [2500], 0.2) // ev 2500
    const bossC = makeBoss(2871, 'Boss C', [500], 0.2) // ev 500 -- not in the top two
    const settings: Settings = { ...SETTINGS_1_ROLL, voidcoresToSpend: 2 }
    const rec = recommend([bossA, bossB, bossC], settings, makeReport())

    expect(rec.allocations).toHaveLength(2)
    expect(rec.allocations.map((a) => a.encounterId).sort()).toEqual([2887, 2888])
    expect(rec.allocations.every((a) => a.rolls === 1)).toBe(true)
    expect(rec.totalExpectedGainPct).toBeCloseTo(4.5, 10) // (2000 + 2500) / 100000 * 100
  })

  it('with 2 rolls but only one deployable boss, allocates just the single roll', () => {
    const bossA = makeBoss(2888, 'Boss A', [1000], 0.2)
    const settings: Settings = { ...SETTINGS_1_ROLL, voidcoresToSpend: 2 }
    const rec = recommend([bossA], settings, makeReport())
    expect(rec.allocations).toHaveLength(1)
    expect(rec.allocations[0]).toMatchObject({ encounterId: 2888, rolls: 1, expectedGain: 1000 })
  })

  it('with 2 rolls, breaks an ev tie by bestCase value, then by encounter order', () => {
    const bossA = makeBoss(2888, 'Boss A', [1000], 0.2) // ev 1000, bestCase 1000
    const bossB = makeBoss(2887, 'Boss B', [1000], 0.2) // ev 1000, bestCase 1000 -- ties A on both; A wins (earlier)
    const bossC = makeBoss(2871, 'Boss C', [1500, 500], 0.2) // ev 1000, bestCase 1500 -- wins the tie over A/B
    const settings: Settings = { ...SETTINGS_1_ROLL, voidcoresToSpend: 2 }
    const rec = recommend([bossA, bossB, bossC], settings, makeReport())

    expect(rec.allocations.map((a) => a.encounterId)).toEqual([2871, 2888])
  })

  it('falls back with a threshold-aware message when no boss is deployable', () => {
    const bossA = makeBoss(2888, 'Boss A', [50], 0.2) // 0.05% < 0.2% threshold
    const rec = recommend([bossA], SETTINGS_1_ROLL, makeReport())
    expect(rec.allocations).toEqual([])
    expect(rec.fallback).not.toBeNull()
    expect(rec.fallback?.reason).toBe('below-threshold')
    expect(rec.fallback?.message).toContain('0.2%')
    expect(rec.fallback?.message).toContain('Thalassian Tokens of Merit')
  })

  it('reports fallback reason no-pool when every boss is fully knocked out', () => {
    const bossA: BossEval = { ...makeBoss(2888, 'Boss A', [], 0.2), remaining: 0, ev: 0, evPct: 0, bestCase: null, deployable: false }
    const rec = recommend([bossA], SETTINGS_1_ROLL, makeReport())
    expect(rec.fallback?.reason).toBe('no-pool')
  })

  describe('tossUp', () => {
    it('flags a toss-up when the gap is inside the fixed band (max(0.1, 5% of top evPct))', () => {
      // top evPct 2.3, runner-up 2.27 -- gap 0.03, band max(0.1, 0.115) = 0.115
      const bossA = makeBoss(2894, 'The Lost Explorers', [2300], 0.2)
      const bossB = makeBoss(2895, "Ula'tek", [2270], 0.2)
      const rec = recommend([bossA, bossB], SETTINGS_1_ROLL, makeReport())
      expect(rec.tossUp).not.toBeNull()
      expect(rec.tossUp?.bosses).toEqual(['The Lost Explorers', "Ula'tek"])
      expect(rec.tossUp?.gapPct).toBeCloseTo(0.03, 10)
    })

    it('does not flag a toss-up when the gap exceeds the fixed band', () => {
      // top evPct 5, runner-up 3 -- gap 2, band max(0.1, 0.25) = 0.25
      const bossA = makeBoss(2888, 'Boss A', [5000], 0.2)
      const bossB = makeBoss(2887, 'Boss B', [3000], 0.2)
      const rec = recommend([bossA, bossB], SETTINGS_1_ROLL, makeReport())
      expect(rec.tossUp).toBeNull()
    })

    it('falls back to the fixed band when no boss carries evErrorPct (e.g. QE Live)', () => {
      const bossA = makeBoss(2888, 'Boss A', [5000], 0.2)
      const bossB = makeBoss(2887, 'Boss B', [3000], 0.2)
      expect(bossA.evErrorPct).toBeUndefined()
      const rec = recommend([bossA, bossB], SETTINGS_1_ROLL, makeReport())
      expect(rec.tossUp).toBeNull()
    })

    it('flags a toss-up via combined evErrorPct even when the gap exceeds the fixed band', () => {
      // top evPct 5, runner-up 4.5 -- gap 0.5, fixed band max(0.1, 0.25) = 0.25 (would not toss-up alone)
      // but combined evErrorPct (0.3 + 0.3 = 0.6) exceeds the gap, so it tosses up on sim error
      const bossA: BossEval = { ...makeBoss(2888, 'Boss A', [5000], 0.2), evErrorPct: 0.3 }
      const bossB: BossEval = { ...makeBoss(2887, 'Boss B', [4500], 0.2), evErrorPct: 0.3 }
      const rec = recommend([bossA, bossB], SETTINGS_1_ROLL, makeReport())
      expect(rec.tossUp).not.toBeNull()
      expect(rec.tossUp?.bosses).toEqual(['Boss A', 'Boss B'])
      expect(rec.tossUp?.gapPct).toBeCloseTo(0.5, 10)
    })

    it('with 2 rolls, reports a toss-up between ranks 2 and 3, not ranks 1 and 2', () => {
      // rank 1 (10) vs rank 2 (5): gap 5, way outside the band -- not a toss-up
      // rank 2 (5) vs rank 3 (4.97): gap 0.03, inside max(0.1, 0.25) -- toss-up
      const bossA = makeBoss(2888, 'Boss A', [10000], 0.2)
      const bossB = makeBoss(2887, 'Boss B', [5000], 0.2)
      const bossC = makeBoss(2871, 'Boss C', [4970], 0.2)
      const settings: Settings = { ...SETTINGS_1_ROLL, voidcoresToSpend: 2 }
      const rec = recommend([bossA, bossB, bossC], settings, makeReport())
      expect(rec.allocations.map((a) => a.encounterId).sort()).toEqual([2887, 2888])
      expect(rec.tossUp).not.toBeNull()
      expect(rec.tossUp?.bosses).toEqual(['Boss B', 'Boss C'])
      expect(rec.tossUp?.gapPct).toBeCloseTo(0.03, 10)
    })
  })

  it('always includes the fixed assumptions list, deployable or not', () => {
    const bossA = makeBoss(2888, 'Boss A', [1000], 0.2)
    const deployableRec = recommend([bossA], SETTINGS_1_ROLL, makeReport())
    const noPoolRec = recommend([{ ...bossA, deployable: false }], SETTINGS_1_ROLL, makeReport())
    for (const rec of [deployableRec, noPoolRec]) {
      expect(rec.assumptions.length).toBeGreaterThan(0)
      expect(rec.assumptions.some((a) => a.includes('Uniform draw'))).toBe(true)
      expect(rec.assumptions.some((a) => a.includes('not shared across difficulties'))).toBe(true)
      expect(rec.assumptions.some((a) => a.includes('no second chance on a repeat kill'))).toBe(true)
      expect(rec.assumptions.some((a) => a.includes('bosses you expect to kill this week'))).toBe(true)
    }
  })
})
