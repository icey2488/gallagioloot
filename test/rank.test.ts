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

const SETTINGS_1_ROLL: Settings = { thresholdPct: 0.2, rollsAvailable: 1, includeOffSpec: false }

describe('recommend', () => {
  it('with 1 roll, picks the deployable boss with the highest ev', () => {
    const bossA = makeBoss(2888, 'Boss A', [1000], 0.2)
    const bossB = makeBoss(2887, 'Boss B', [3000], 0.2)
    const rec = recommend([bossA, bossB], SETTINGS_1_ROLL, makeReport())
    expect(rec.allocations).toHaveLength(1)
    expect(rec.allocations[0]).toMatchObject({ encounterId: 2887, rolls: 1, expectedGain: 3000 })
    expect(rec.fallback).toBeNull()
  })

  it('with 2 rolls, computes the exact same-boss expectation on a hand-checked 3-item pool', () => {
    // values [3000, 2000, 1000]: ev1 = 2000. E[second roll | first removed uniformly] = 2000
    // (by symmetry of sampling without replacement), so two rolls on this boss = 4000.
    const bossA = makeBoss(2888, 'Boss A', [3000, 2000, 1000], 0.2)
    const bossB = makeBoss(2887, 'Boss B', [1000], 0.2) // cross total 2000+1000=3000; same-boss-B-twice = 1000+0=1000
    const settings: Settings = { ...SETTINGS_1_ROLL, rollsAvailable: 2 }
    const rec = recommend([bossA, bossB], settings, makeReport())

    expect(rec.allocations).toHaveLength(1)
    expect(rec.allocations[0]).toMatchObject({ encounterId: 2888, rolls: 2, expectedGain: 4000 })
    expect(rec.totalExpectedGainPct).toBeCloseTo(4, 10) // 4000 / 100000 * 100
  })

  it('with 2 rolls, spreads across two bosses when that beats rolling twice on one', () => {
    const bossA = makeBoss(2888, 'Boss A', [3000, 2000, 1000], 0.2) // ev 2000, same-boss-twice = 4000
    const bossB = makeBoss(2887, 'Boss B', [2500], 0.2) // ev 2500; cross = 2000 + 2500 = 4500 > 4000
    const settings: Settings = { ...SETTINGS_1_ROLL, rollsAvailable: 2 }
    const rec = recommend([bossA, bossB], settings, makeReport())

    expect(rec.allocations).toHaveLength(2)
    expect(rec.allocations.map((a) => a.encounterId).sort()).toEqual([2887, 2888])
    expect(rec.allocations.every((a) => a.rolls === 1)).toBe(true)
    expect(rec.totalExpectedGainPct).toBeCloseTo(4.5, 10)
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

  it('always includes the fixed assumptions list, deployable or not', () => {
    const bossA = makeBoss(2888, 'Boss A', [1000], 0.2)
    const deployableRec = recommend([bossA], SETTINGS_1_ROLL, makeReport())
    const noPoolRec = recommend([{ ...bossA, deployable: false }], SETTINGS_1_ROLL, makeReport())
    for (const rec of [deployableRec, noPoolRec]) {
      expect(rec.assumptions.length).toBeGreaterThan(0)
      expect(rec.assumptions.some((a) => a.includes('Uniform draw'))).toBe(true)
      expect(rec.assumptions.some((a) => a.includes('not shared across difficulties'))).toBe(true)
    }
  })
})
