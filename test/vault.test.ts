import { describe, expect, it } from 'vitest'
import { compareVault, rollsToTarget } from '../src/core/vault'
import type { BossEval, PoolEntry, Recommendation, Settings } from '../src/core/types'
import type { NormalizedReport } from '../src/types'

const BASELINE = 100000

function makeEntry(key: string, value: number, overrides: Partial<PoolEntry> = {}): PoolEntry {
  return {
    key,
    itemIds: [Number(key.replace(/\D/g, '')) || 0],
    name: key,
    value,
    rawDelta: value,
    pct: (value / BASELINE) * 100,
    kind: 'item',
    knockedOut: false,
    ...overrides,
  }
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items]
  const result: T[][] = []
  for (let i = 0; i < items.length; i++) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)]
    for (const perm of permutations(rest)) {
      result.push([items[i], ...perm])
    }
  }
  return result
}

/** Brute-force cross-check: enumerate every removal order and average actual rolls spent. */
function bruteForceExpectedTruncated(pool: PoolEntry[], targetKey: string, thresholdValue: number): number {
  const valueByKey = new Map(pool.map((p) => [p.key, p.value]))
  const orders = permutations(pool.map((p) => p.key))

  let total = 0
  for (const order of orders) {
    const remaining = new Set(order)
    let rolls = 0
    for (const key of order) {
      rolls++
      remaining.delete(key)
      if (key === targetKey) break
      const remainingValues = [...remaining].map((k) => valueByKey.get(k)!)
      const mean = remainingValues.reduce((a, b) => a + b, 0) / remainingValues.length
      if (mean < thresholdValue) break // abandon the hunt
    }
    total += rolls
  }
  return total / orders.length
}

describe('rollsToTarget', () => {
  it('computes exact expected ((n+1)/2) and worst-case (n) rolls for n = 1, 3, 5', () => {
    for (const n of [1, 3, 5]) {
      const pool = Array.from({ length: n }, (_, i) => makeEntry(`item${i}`, (i + 1) * 100))
      const result = rollsToTarget(pool, 'item0', 0) // threshold 0 -- never abandons
      expect(result.expected).toBeCloseTo((n + 1) / 2, 10)
      expect(result.worstCase).toBe(n)
    }
  })

  it('cross-checks the truncated recurrence against brute-force enumeration on a 4-item pool with mixed values', () => {
    // target (T) dominates the pool's value, so removing a *small* miss (C=5) keeps the
    // remaining mean above threshold (continue hunting), while removing a larger miss
    // (A=90 or B=80) drops it below (abandon) -- a genuinely branching case, not degenerate.
    const pool = [makeEntry('T', 150), makeEntry('A', 90), makeEntry('B', 80), makeEntry('C', 5)]
    const thresholdValue = 100

    const bruteForce = bruteForceExpectedTruncated(pool, 'T', thresholdValue)
    const { expectedTruncated } = rollsToTarget(pool, 'T', thresholdValue)

    expect(expectedTruncated).toBeCloseTo(bruteForce, 10)
    // Hand-derived via the recurrence (see task notes): 1.5 expected rolls actually spent.
    expect(expectedTruncated).toBeCloseTo(1.5, 10)
  })

  it('never abandons before the first roll, even if the full pool mean starts below threshold', () => {
    const pool = [makeEntry('T', 10), makeEntry('A', 1), makeEntry('B', 1)]
    // Full-pool mean (4) is below threshold (100), but the first roll always happens.
    const result = rollsToTarget(pool, 'T', 100)
    expect(result.expectedTruncated).toBeGreaterThan(0)
  })

  it('returns 1 for a single-item pool regardless of threshold', () => {
    const pool = [makeEntry('T', 10)]
    const result = rollsToTarget(pool, 'T', 1_000_000)
    expect(result).toEqual({ expected: 1, worstCase: 1, expectedTruncated: 1 })
  })
})

function makeBoss(encounterId: number, encounterName: string, pool: PoolEntry[], thresholdPct: number, overrides: Partial<BossEval> = {}): BossEval {
  const remainingEntries = pool.filter((p) => !p.knockedOut)
  const remaining = remainingEntries.length
  const ev = remaining > 0 ? remainingEntries.reduce((sum, p) => sum + p.value, 0) / remaining : 0
  const evPct = (ev / BASELINE) * 100
  const bestCase = remaining > 0 ? remainingEntries.reduce((a, b) => (b.value > a.value ? b : a)) : null
  return {
    encounterId,
    encounterName,
    instanceId: 1320,
    pool,
    remaining,
    ev,
    evPct,
    bestCase,
    deployable: remaining > 0 && evPct >= thresholdPct,
    notes: [],
    ...overrides,
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

function makeRecommendation(totalExpectedGainPct: number): Recommendation {
  return {
    allocations: [],
    totalExpectedGainPct,
    fallback: null,
    assumptions: [],
    warnings: [],
  }
}

const SETTINGS: Settings = { thresholdPct: 0.2, rollsAvailable: 1, includeOffSpec: false }

describe('compareVault', () => {
  it('returns verdict "voidcore" when the Voidcore path clearly beats the vault item', () => {
    const bossEvals = [makeBoss(2888, 'Boss A', [makeEntry('item1', 5000)], 0.2)]
    const decision = compareVault({
      vaultItem: { name: 'Random Trinket', gainPct: 1.0 },
      bossEvals,
      recommendation: makeRecommendation(5.0),
      settings: SETTINGS,
      report: makeReport(),
    })
    expect(decision.verdict).toBe('voidcore')
    expect(decision.voidcoreGainPct).toBe(5.0)
    expect(decision.vaultItemGainPct).toBe(1.0)
  })

  it('returns verdict "vault" when the vault item clearly beats the Voidcore path', () => {
    const bossEvals = [makeBoss(2888, 'Boss A', [makeEntry('item1', 1000)], 0.2)]
    const decision = compareVault({
      vaultItem: { name: 'Great Vault BiS', gainPct: 5.0 },
      bossEvals,
      recommendation: makeRecommendation(1.0),
      settings: SETTINGS,
      report: makeReport(),
    })
    expect(decision.verdict).toBe('vault')
  })

  it('returns verdict "toss-up" with a note when the two options are close', () => {
    const bossEvals = [makeBoss(2888, 'Boss A', [makeEntry('item1', 3000)], 0.2)]
    const decision = compareVault({
      vaultItem: { name: 'Close Call Trinket', gainPct: 3.05 },
      bossEvals,
      recommendation: makeRecommendation(3.0),
      settings: SETTINGS,
      report: makeReport(),
    })
    expect(decision.verdict).toBe('toss-up')
    expect(decision.notes.some((n) => n.includes('prefer the vault item if it removes a dungeon'))).toBe(true)
  })

  it('returns verdict "tokens" when neither option clears the threshold', () => {
    const bossEvals = [makeBoss(2888, 'Boss A', [makeEntry('item1', 50)], 0.2)]
    const decision = compareVault({
      vaultItem: { name: 'Marginal Trinket', gainPct: 0.05 },
      bossEvals,
      recommendation: makeRecommendation(0.05),
      settings: SETTINGS,
      report: makeReport(),
    })
    expect(decision.verdict).toBe('tokens')
    expect(decision.explanation).toContain('Thalassian Tokens of Merit')
  })

  it('computes savedRolls via rollsToTarget when the vault item matches a PoolEntry by itemId, capped at the pool size', () => {
    const targetEntry = makeEntry('item:999', 4000, { itemIds: [999] })
    const otherEntry = makeEntry('item:1', 1000, { itemIds: [1] })
    const vaultBoss = makeBoss(2888, "Nek'zali the Soulcoiler", [targetEntry, otherEntry], 0.2)
    const altBoss = makeBoss(2887, 'The Twin Fangs', [makeEntry('item:2', 6000, { itemIds: [2] })], 0.2)

    const decision = compareVault({
      vaultItem: { name: 'Target Item', gainPct: 3.0, itemId: 999 },
      bossEvals: [vaultBoss, altBoss],
      recommendation: makeRecommendation(6.0),
      settings: SETTINGS,
      report: makeReport(),
    })

    const { expectedTruncated } = rollsToTarget([targetEntry, otherEntry], 'item:999', (SETTINGS.thresholdPct / 100) * BASELINE)
    const expectedSavedRolls = Math.min(expectedTruncated, 2)

    expect(decision.savedRolls).toBeCloseTo(expectedSavedRolls, 10)
    // altRollEvPct excludes the vault item's own boss (2888) -- picks 2887's evPct (6%).
    expect(decision.vaultItemGainPct).toBeCloseTo(3.0 + expectedSavedRolls * 6.0, 10)
  })

  it('warns and assumes 0 saved rolls when the vault item pool cannot be identified', () => {
    const bossEvals = [makeBoss(2888, 'Boss A', [makeEntry('item1', 1000)], 0.2)]
    const decision = compareVault({
      vaultItem: { name: 'Unmapped Item', gainPct: 2.0 },
      bossEvals,
      recommendation: makeRecommendation(1.0),
      settings: SETTINGS,
      report: makeReport(),
    })
    expect(decision.savedRolls).toBe(0)
    expect(decision.notes.some((n) => n.includes('Could not identify the loot pool'))).toBe(true)
    expect(decision.vaultItemGainPct).toBe(2.0)
  })
})
