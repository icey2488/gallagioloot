import { describe, expect, it } from 'vitest'
import { buildBossPools } from '../src/core/pool'
import type { KnockoutState, Settings } from '../src/core/types'
import type { NormalizedItem, NormalizedReport } from '../src/types'

const BASELINE = 100000

function item(overrides: Partial<NormalizedItem> = {}): NormalizedItem {
  return {
    itemId: 1,
    name: 'Test Item',
    encounterId: 2888,
    encounterName: "Nek'zali the Soulcoiler",
    instanceId: 1320,
    ilvl: 333,
    delta: 1000,
    pct: 1,
    ...overrides,
  }
}

function makeReport(items: NormalizedItem[], overrides: Partial<NormalizedReport> = {}): NormalizedReport {
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
    items,
    warnings: [],
    ...overrides,
  }
}

function makeKnockout(overrides: Partial<KnockoutState> = {}): KnockoutState {
  return { character: 'Iceshaman', difficulty: 'raid-vault-heroic', entries: [], version: 1, ...overrides }
}

const SETTINGS: Settings = { thresholdPct: 0.2, rollsAvailable: 1, includeOffSpec: false }

describe('buildBossPools', () => {
  it('collapses duplicate rows for the same itemId into one entry using the max delta', () => {
    const report = makeReport([
      item({ itemId: 100, name: 'Ring of Testing', delta: 800 }),
      item({ itemId: 100, name: 'Ring of Testing', delta: 1500 }),
    ])
    const [boss] = buildBossPools(report, makeKnockout(), SETTINGS)
    expect(boss.pool).toHaveLength(1)
    expect(boss.pool[0]).toMatchObject({ itemIds: [100], value: 1500, rawDelta: 1500, kind: 'item' })
  })

  it('floors a negative delta (downgrade) to zero instead of a negative value', () => {
    const report = makeReport([item({ itemId: 200, delta: -300 })])
    const [boss] = buildBossPools(report, makeKnockout(), SETTINGS)
    expect(boss.pool[0].value).toBe(0)
    expect(boss.pool[0].rawDelta).toBe(-300)
  })

  it('collapses all viaCurio rows for a boss into a single curio entry with the max value', () => {
    const report = makeReport([
      item({ itemId: 300, name: 'Tier Head Token', encounterId: 2895, encounterName: "Ula'tek", delta: 1100, viaCurio: true, tierSlot: 'head' }),
      item({ itemId: 301, name: 'Tier Shoulder Token', encounterId: 2895, encounterName: "Ula'tek", delta: 900, viaCurio: true, tierSlot: 'shoulder' }),
    ])
    const [boss] = buildBossPools(report, makeKnockout(), SETTINGS)
    expect(boss.pool).toHaveLength(1)
    expect(boss.pool[0].kind).toBe('curio')
    expect(boss.pool[0].value).toBe(1100)
    expect(boss.pool[0].itemIds.sort()).toEqual([300, 301])
    expect(boss.notes).toContain('Curio counts as one item; value assumes you pick your best missing tier slot')
  })

  it('marks a tier-token row (has tierSlot, not viaCurio) with kind tier-token', () => {
    const report = makeReport([item({ itemId: 400, encounterId: 2887, encounterName: 'The Twin Fangs', delta: 1200, tierSlot: 'head' })])
    const [boss] = buildBossPools(report, makeKnockout(), SETTINGS)
    expect(boss.pool[0].kind).toBe('tier-token')
    expect(boss.pool[0].tierSlot).toBe('head')
  })

  it('knocks out the right entry and shifts ev accordingly', () => {
    const report = makeReport([item({ itemId: 100, delta: 1000 }), item({ itemId: 200, delta: 2000 })])
    const knockout = makeKnockout({
      entries: [{ itemId: 100, itemName: 'Test Item', encounterId: 2888, receivedAt: '2026-09-01T00:00:00Z', source: 'roll' }],
    })
    const [boss] = buildBossPools(report, knockout, SETTINGS)
    expect(boss.pool.find((p) => p.itemIds[0] === 100)?.knockedOut).toBe(true)
    expect(boss.remaining).toBe(1)
    expect(boss.ev).toBe(2000)
    expect(boss.bestCase?.itemIds).toEqual([200])
  })

  it('applies a spec-specific knockout only when the report spec matches', () => {
    const report = makeReport([item({ itemId: 100, delta: 1000 })])
    const knockout = makeKnockout({
      entries: [
        {
          itemId: 100,
          itemName: 'Test Item',
          encounterId: 2888,
          receivedAt: '2026-09-01T00:00:00Z',
          source: 'roll',
          specSpecific: true,
          spec: 'restoration',
        },
      ],
    })

    const nonMatching = buildBossPools(report, knockout, SETTINGS)
    expect(nonMatching[0].pool[0].knockedOut).toBe(false)

    const matchingReport = makeReport([item({ itemId: 100, delta: 1000 })], { spec: 'restoration' })
    const matching = buildBossPools(matchingReport, knockout, SETTINGS)
    expect(matching[0].pool[0].knockedOut).toBe(true)
  })

  it('does not apply the knockout state and warns when difficulty differs from the report', () => {
    const report = makeReport([item({ itemId: 100, delta: 1000 })])
    const knockout = makeKnockout({
      difficulty: 'raid-vault-normal',
      entries: [{ itemId: 100, itemName: 'Test Item', encounterId: 2888, receivedAt: '2026-09-01T00:00:00Z', source: 'roll' }],
    })
    const [boss] = buildBossPools(report, knockout, SETTINGS)
    expect(boss.pool[0].knockedOut).toBe(false)
    expect(boss.notes.some((n) => n.includes('knockout state not applied'))).toBe(true)
  })

  it('gates deployable on the ev% threshold', () => {
    const report = makeReport([item({ itemId: 100, delta: 300 })]) // 0.3% of baseline
    const belowThreshold = buildBossPools(report, makeKnockout(), { ...SETTINGS, thresholdPct: 0.5 })
    expect(belowThreshold[0].deployable).toBe(false)

    const aboveThreshold = buildBossPools(report, makeKnockout(), { ...SETTINGS, thresholdPct: 0.2 })
    expect(aboveThreshold[0].deployable).toBe(true)
  })

  it('excludes offSpec items unless includeOffSpec is set', () => {
    const report = makeReport([item({ itemId: 100, delta: 1000, offSpec: true })])
    const excluded = buildBossPools(report, makeKnockout(), SETTINGS)
    expect(excluded).toHaveLength(0)

    const included = buildBossPools(report, makeKnockout(), { ...SETTINGS, includeOffSpec: true })
    expect(included[0].pool).toHaveLength(1)
  })

  it('excludes negative (trash) encounter ids', () => {
    const report = makeReport([item({ itemId: 100, encounterId: -97, encounterName: 'Trash Drop' })])
    const bosses = buildBossPools(report, makeKnockout(), SETTINGS)
    expect(bosses).toHaveLength(0)
  })

  it('reports "pool exhausted" once every entry is knocked out', () => {
    const report = makeReport([item({ itemId: 100, delta: 1000 })])
    const knockout = makeKnockout({
      entries: [{ itemId: 100, itemName: 'Test Item', encounterId: 2888, receivedAt: '2026-09-01T00:00:00Z', source: 'roll' }],
    })
    const [boss] = buildBossPools(report, knockout, SETTINGS)
    expect(boss.remaining).toBe(0)
    expect(boss.ev).toBe(0)
    expect(boss.bestCase).toBeNull()
    expect(boss.deployable).toBe(false)
    expect(boss.notes).toContain('pool exhausted')
  })

  it('evaluates every boss regardless of expectedKills, but marks bosses outside it non-deployable with a note', () => {
    const report = makeReport([
      item({ itemId: 100, encounterId: 2888, encounterName: "Nek'zali the Soulcoiler", delta: 1000 }),
      item({ itemId: 200, encounterId: 2887, encounterName: 'The Twin Fangs', delta: 5000 }),
    ])
    const settings: Settings = { ...SETTINGS, expectedKills: [2888] }
    const bosses = buildBossPools(report, makeKnockout(), settings)

    expect(bosses).toHaveLength(2)
    const inList = bosses.find((b) => b.encounterId === 2888)!
    const outOfList = bosses.find((b) => b.encounterId === 2887)!

    expect(inList.deployable).toBe(true)
    expect(outOfList.remaining).toBe(1) // still evaluated, so the table can show it
    expect(outOfList.ev).toBe(5000)
    expect(outOfList.deployable).toBe(false)
    expect(outOfList.notes).toContain('not in expected kills this week')
  })

  it('treats an undefined expectedKills as every boss being in play', () => {
    const report = makeReport([item({ itemId: 100, delta: 1000 })])
    const [boss] = buildBossPools(report, makeKnockout(), SETTINGS)
    expect(boss.deployable).toBe(true)
    expect(boss.notes).not.toContain('not in expected kills this week')
  })

  it('populates rollsToTarget fields on remaining (non-knocked-out) pool entries only', () => {
    const report = makeReport([
      item({ itemId: 100, delta: 1000 }),
      item({ itemId: 200, delta: 2000 }),
      item({ itemId: 300, delta: 3000 }),
    ])
    const knockout = makeKnockout({
      entries: [{ itemId: 100, itemName: 'Test Item', encounterId: 2888, receivedAt: '2026-09-01T00:00:00Z', source: 'roll' }],
    })
    const [boss] = buildBossPools(report, knockout, SETTINGS)

    const knockedOutEntry = boss.pool.find((p) => p.itemIds[0] === 100)!
    expect(knockedOutEntry.rollsToTargetExpected).toBeUndefined()

    const remainingEntry = boss.pool.find((p) => p.itemIds[0] === 200)!
    // 2 remaining entries after the knockout -- (n+1)/2 = 1.5, worst case n = 2.
    expect(remainingEntry.rollsToTargetExpected).toBeCloseTo(1.5, 10)
    expect(remainingEntry.rollsToTargetWorst).toBe(2)
    expect(remainingEntry.rollsToTargetTruncated).toBeGreaterThan(0)
  })

  it('converts an entry meanError to errorPct, and evErrorPct to the mean errorPct of the remaining pool', () => {
    const report = makeReport([
      item({ itemId: 100, delta: 1000, meanError: 200 }), // errorPct 0.2
      item({ itemId: 200, delta: 2000, meanError: 400 }), // errorPct 0.4
    ])
    const [boss] = buildBossPools(report, makeKnockout(), SETTINGS)
    expect(boss.pool.find((p) => p.itemIds[0] === 100)?.errorPct).toBeCloseTo(0.2, 10)
    expect(boss.pool.find((p) => p.itemIds[0] === 200)?.errorPct).toBeCloseTo(0.4, 10)
    expect(boss.evErrorPct).toBeCloseTo(0.3, 10)
  })

  it('leaves evErrorPct undefined when no remaining entry carries a meanError (e.g. QE Live)', () => {
    const report = makeReport([item({ itemId: 100, delta: 1000 }), item({ itemId: 200, delta: 2000 })])
    const [boss] = buildBossPools(report, makeKnockout(), SETTINGS)
    expect(boss.pool.every((p) => p.errorPct === undefined)).toBe(true)
    expect(boss.evErrorPct).toBeUndefined()
  })
})
