import { describe, expect, it } from 'vitest'
import { compareVault, rollsToTarget, vaultItemFromTopGear } from '../src/core/vault'
import { buildBossPools } from '../src/core/pool'
import type { BossEval, KnockoutState, PoolEntry, Recommendation, Settings } from '../src/core/types'
import type { NormalizedItem, NormalizedReport, NormalizedTopGear, TopGearCandidate } from '../src/types'

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
    specSpecific: false,
    ownership: 'none',
    isDud: false,
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
    rollsSpent: pool.filter((p) => p.ownership === 'rolled').length,
    rollsAttributed: pool.filter((p) => p.ownership === 'rolled').length,
    rollsUnattributed: 0,
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

/** `allocated`: the boss evals `recommend()` would spend this week's rolls on (compareVault only credits saved rolls for those). */
function makeRecommendation(totalExpectedGainPct: number, allocated: BossEval[] = []): Recommendation {
  return {
    allocations: allocated.map((b) => ({
      encounterId: b.encounterId,
      encounterName: b.encounterName,
      targetKey: b.targetKey,
      rolls: 1,
      expectedGain: b.ev,
      expectedGainPct: b.evPct,
    })),
    totalExpectedGainPct,
    fallback: null,
    assumptions: [],
    warnings: [],
    tossUp: null,
  }
}

const SETTINGS: Settings = { thresholdPct: 0.2, voidcoresToSpend: 1, includeOffSpec: false }

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

  it('computes savedRolls via rollsToTarget when the vault item matches a PoolEntry by itemId in an allocated target, capped at the pool size', () => {
    const targetEntry = makeEntry('item:999', 4000, { itemIds: [999] })
    const otherEntry = makeEntry('item:1', 1000, { itemIds: [1] })
    const vaultBoss = makeBoss(2888, "Nek'zali the Soulcoiler", [targetEntry, otherEntry], 0.2)
    const altBoss = makeBoss(2887, 'The Twin Fangs', [makeEntry('item:2', 6000, { itemIds: [2] })], 0.2)

    const decision = compareVault({
      vaultItem: { name: 'Target Item', gainPct: 3.0, itemId: 999 },
      bossEvals: [vaultBoss, altBoss],
      recommendation: makeRecommendation(6.0, [vaultBoss]),
      settings: SETTINGS,
      report: makeReport(),
    })

    const { expectedTruncated } = rollsToTarget([targetEntry, otherEntry], 'item:999', (SETTINGS.thresholdPct / 100) * BASELINE)
    const expectedSavedRolls = Math.min(expectedTruncated, 2)

    expect(decision.savedRolls).toBeCloseTo(expectedSavedRolls, 10)
    // altRollEvPct excludes the vault item's own boss (2888) -- picks 2887's evPct (6%).
    expect(decision.vaultItemGainPct).toBeCloseTo(3.0 + expectedSavedRolls * 6.0, 10)
  })

  it("credits no saved rolls when the vault item's target isn't one the recommendation allocates, and says why", () => {
    const targetEntry = makeEntry('item:999', 4000, { itemIds: [999] })
    const otherEntry = makeEntry('item:1', 1000, { itemIds: [1] })
    const vaultBoss = makeBoss(2888, "Nek'zali the Soulcoiler", [targetEntry, otherEntry], 0.2)
    const altBoss = makeBoss(2887, 'The Twin Fangs', [makeEntry('item:2', 6000, { itemIds: [2] })], 0.2)

    const decision = compareVault({
      vaultItem: { name: 'Target Item', gainPct: 3.0, itemId: 999 },
      bossEvals: [vaultBoss, altBoss],
      recommendation: makeRecommendation(6.0, [altBoss]),
      settings: SETTINGS,
      report: makeReport(),
    })

    expect(decision.savedRolls).toBe(0)
    expect(decision.vaultItemGainPct).toBe(3.0)
    expect(decision.savedRollsNote).toBe(`Nek'zali the Soulcoiler isn't a target you'd roll this week, so taking "Target Item" saves no rolls.`)
    expect(decision.notes).toContain(decision.savedRollsNote)
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

// Canonical roll-only-knockout case (operator ruling): taking a raid vault item X does NOT
// knock X out of its boss's roll pool; X becomes a value-0 dud there, so next week's roll on
// that boss is DILUTED, not shrunk. Modeled via a KnockoutEntry with state 'owned'.
describe('compareVault -- roll-only knockout: a taken vault item is a dud, not a removal', () => {
  const WEAPON_ID = 271700 // a weapon that drops from Ula'tek (encounter 2895)
  const ULATEK = 2895

  function ulatekReport(): NormalizedReport {
    const item = (overrides: Partial<NormalizedItem>): NormalizedItem => ({
      itemId: 0,
      name: 'Item',
      encounterId: ULATEK,
      encounterName: "Ula'tek",
      instanceId: 1320,
      ilvl: 334,
      delta: 0,
      pct: 0,
      ...overrides,
    })
    return makeReport({
      items: [
        item({ itemId: WEAPON_ID, name: 'Coilfang Cleaver', delta: 4000 }),
        item({ itemId: 500, name: 'Ring of Depths', delta: 1000 }),
        item({ itemId: 600, name: 'Cloak of Silt', delta: 500 }),
      ],
    })
  }

  const knock = (state: 'owned' | 'rolled'): KnockoutState => ({
    character: 'Iceshaman',
    difficulty: 'raid-vault-heroic',
    version: 2,
    rollsSpent: {},
    entries: [{ itemId: WEAPON_ID, itemName: 'Coilfang Cleaver', encounterId: ULATEK, receivedAt: '2026-09-08T00:00:00Z', source: 'manual', state }],
  })

  it("next week's Ula'tek roll EV reflects the taken weapon as a dud -- lower than the old knockout-removal behavior", () => {
    const report = ulatekReport()
    const asDud = buildBossPools(report, knock('owned'), SETTINGS)[0]
    const asRemoved = buildBossPools(report, knock('rolled'), SETTINGS)[0]

    // Old (knockout-removal) behavior: weapon gone -> EV over {1000, 500} = 750.
    expect(asRemoved.remaining).toBe(2)
    expect(asRemoved.ev).toBe(750)

    // Roll-only behavior: weapon stays as a value-0 dud -> EV over {0, 1000, 500}/3 = 500.
    expect(asDud.remaining).toBe(3)
    expect(asDud.ev).toBeCloseTo(500, 10)
    expect(asDud.ev).toBeLessThan(asRemoved.ev)

    const weaponEntry = asDud.pool.find((p) => p.itemIds[0] === WEAPON_ID)!
    expect(weaponEntry.isDud).toBe(true)
    expect(weaponEntry.knockedOut).toBe(false)
  })

  it('compareVault notes that taking the vault item leaves it in the pool as a value-0 dud', () => {
    const report = ulatekReport()
    const emptyKnockout: KnockoutState = { character: 'Iceshaman', difficulty: 'raid-vault-heroic', version: 2, rollsSpent: {}, entries: [] }
    const bossEvals = buildBossPools(report, emptyKnockout, SETTINGS)
    const decision = compareVault({
      vaultItem: { name: 'Coilfang Cleaver', gainPct: 4.0, itemId: WEAPON_ID },
      bossEvals,
      recommendation: makeRecommendation(2.0),
      settings: SETTINGS,
      report,
    })
    expect(decision.notes.some((n) => n.includes('value-0 dud'))).toBe(true)
  })
})

function makeCandidate(itemId: number, name: string, overrides: Partial<TopGearCandidate> = {}): TopGearCandidate {
  return { itemId, name, slot: 'trinket2', ilvl: 334, ...overrides }
}

function makeTopGear(candidates: TopGearCandidate[], pct = 0.33): NormalizedTopGear {
  return {
    source: 'raidbots',
    reportId: 'abc',
    character: 'Icemagus',
    spec: 'arcane',
    baseline: 554420.23,
    metric: 'dps',
    bestSet: { delta: (pct / 100) * 554420.23, pct, items: candidates },
    equippedItems: [],
    candidates,
    allSets: [],
  }
}

describe('vaultItemFromTopGear', () => {
  it('returns null when the winning combination added no new candidate', () => {
    expect(vaultItemFromTopGear(makeTopGear([]))).toBeNull()
  })

  it('builds a compareVault-shaped vaultItem from the single candidate, using bestSet.pct as gainPct', () => {
    const candidate = makeCandidate(250214, 'Lightspire Core', { encounterId: 2771 })
    const result = vaultItemFromTopGear(makeTopGear([candidate], 0.33))
    expect(result).toEqual({ name: 'Lightspire Core', gainPct: 0.33, itemId: 250214, encounterId: 2771, extraCandidates: undefined })
  })

  it('uses the first candidate as primary and carries the rest as extraCandidates when the winning combo swapped in more than one item', () => {
    const primary = makeCandidate(271483, 'Serpent Crown of the Ophidian Oracle', { slot: 'head', encounterId: 2887 })
    const extra = makeCandidate(250214, 'Lightspire Core', { encounterId: 2894 })
    const result = vaultItemFromTopGear(makeTopGear([primary, extra], 0.5))
    expect(result?.name).toBe('Serpent Crown of the Ophidian Oracle')
    expect(result?.itemId).toBe(271483)
    expect(result?.extraCandidates).toEqual([extra])
  })

  it('leaves itemId/encounterId undefined on the returned vaultItem when the candidate has no resolved boss', () => {
    const candidate = makeCandidate(999, 'Crafted Gizmo')
    const result = vaultItemFromTopGear(makeTopGear([candidate]))
    expect(result?.encounterId).toBeUndefined()
    expect(result?.itemId).toBe(999)
  })
})
