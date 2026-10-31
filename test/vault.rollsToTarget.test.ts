import { describe, expect, it } from 'vitest'
import { EXACT_TRUNCATED_LIMIT, expectedTruncatedRolls, truncatedExact, truncatedMonteCarlo } from '../src/core/vault'
import { buildBossPools } from '../src/core/pool'
import type { PoolEntry } from '../src/core/types'
import type { NormalizedReport } from '../src/types'

function entry(key: string, value: number): PoolEntry {
  return { key, itemIds: [0], name: key, value, rawDelta: value, pct: value / 1000, kind: 'item', specSpecific: false, ownership: 'none', isDud: false, knockedOut: false }
}

const pool = (n: number) => Array.from({ length: n }, (_, i) => entry(`e${i}`, ((i * 37) % 11) * 100 + 50))

describe('rollsToTarget truncated count: exact up to n=10, Monte Carlo above', () => {
  it('limit is 10', () => {
    expect(EXACT_TRUNCATED_LIMIT).toBe(10)
  })

  it('threshold 0 never abandons, so truncated == (n+1)/2 on both paths', () => {
    expect(truncatedExact(pool(8), 'e3', 0)).toBeCloseTo(4.5, 10)
    expect(truncatedMonteCarlo(pool(30), 'e3', 0)).toBeCloseTo(15.5, 0)
  })

  it('Monte Carlo agrees with the exact recurrence at n=10 for a branching threshold', () => {
    const p = pool(10)
    for (const threshold of [300, 500, 600]) {
      const exact = truncatedExact(p, 'e2', threshold)
      expect(truncatedMonteCarlo(p, 'e2', threshold, 20000)).toBeCloseTo(exact, 1)
    }
  })

  it('is deterministic (seeded) and fast on a large pool', () => {
    const p = pool(40)
    const t0 = performance.now()
    const a = expectedTruncatedRolls(p, 'e5', 500)
    const b = expectedTruncatedRolls(p, 'e5', 500)
    expect(a).toBe(b)
    expect(performance.now() - t0).toBeLessThan(2000)
    expect(a).toBeGreaterThanOrEqual(1)
    expect(a).toBeLessThanOrEqual(40)
  })

  it('dispatches to the Monte Carlo estimate above the limit', () => {
    expect(expectedTruncatedRolls(pool(12), 'e0', 0)).toBeCloseTo(6.5, 0)
  })
})

describe('buildBossPools no longer runs the truncated recursion per entry', () => {
  it('a 25-item boss builds instantly and only carries the closed-form figures', () => {
    const items = Array.from({ length: 25 }, (_, i) => ({ itemId: 100 + i, name: `I${i}`, encounterId: 1, encounterName: 'Boss', instanceId: 9, ilvl: 300, delta: 1000 + i * 10, pct: 1 }))
    const report = { source: 'raidbots', reportId: 'r', character: 'c', realm: 'r', region: 'us', spec: 's', role: 'dps', metric: 'dps', baseline: 100000, warnings: [], contentType: 'raid', difficulty: 'raid-heroic', items } as unknown as NormalizedReport
    const t0 = performance.now()
    const [boss] = buildBossPools(report, { character: 'c', difficulty: 'heroic', realm: 'r', region: 'us', entries: [] } as never, { thresholdPct: 0.2, voidcoresToSpend: 1, includeOffSpec: false })
    expect(performance.now() - t0).toBeLessThan(500)
    expect(boss.pool[0].rollsToTargetExpected).toBe(13)
    expect(boss.pool[0].rollsToTargetWorst).toBe(25)
  })
})
