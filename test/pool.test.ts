import { describe, expect, it } from 'vitest'
import { buildBossPools } from '../src/core/pool'
import type { KnockoutState, Settings } from '../src/core/types'
import type { LootTableEncounter, LootTableItem, NormalizedItem, NormalizedReport } from '../src/types'

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
  return { character: 'Iceshaman', difficulty: 'raid-vault-heroic', entries: [], version: 2, ...overrides }
}

const SETTINGS: Settings = { thresholdPct: 0.2, voidcoresToSpend: 1, includeOffSpec: false }

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

  it('never puts viaCurio report rows in the pool (the curio cannot be won with a bonus roll)', () => {
    const report = makeReport([
      item({ itemId: 300, name: 'Tier Head Token', encounterId: 2895, encounterName: "Ula'tek", delta: 1100, viaCurio: true, tierSlot: 'head' }),
      item({ itemId: 301, name: 'Tier Shoulder Token', encounterId: 2895, encounterName: "Ula'tek", delta: 900, viaCurio: true, tierSlot: 'shoulder' }),
      item({ itemId: 302, name: 'Neck of Testing', encounterId: 2895, encounterName: "Ula'tek", delta: 500 }),
    ])
    const [boss] = buildBossPools(report, makeKnockout(), SETTINGS)
    expect(boss.pool.map((p) => p.itemIds)).toEqual([[302]])
    expect(boss.remaining).toBe(1)
    expect(boss.ev).toBe(500)
    expect(boss.bestCase?.itemIds).toEqual([302])
    expect(boss.notes.some((n) => n.toLowerCase().includes('curio'))).toBe(false)
  })

  it('a boss whose only rows are curio-routed has an empty pool, not an empty-but-counted curio entry', () => {
    const report = makeReport([item({ itemId: 300, encounterId: 2895, encounterName: "Ula'tek", delta: 1100, viaCurio: true, tierSlot: 'head' })])
    const [boss] = buildBossPools(report, makeKnockout(), SETTINGS)
    expect(boss.pool).toHaveLength(0)
    expect(boss.remaining).toBe(0)
    expect(boss.deployable).toBe(false)
  })

  it('excludes tier pieces the loot table (not the report) marks viaCurio: no pool entry, not in the denominator, no phantom', () => {
    // Mirrors live Raidbots season data: a tier piece keeps a normal encounter id in the
    // report (conversions are marked via catalystSourceId, not item.viaCurio), so the
    // classification comes from the loot table when one is supplied. The loot table's
    // viaCurio-only pieces are neither pool entries nor phantom (valued 0) entries.
    const report = makeReport([
      item({ itemId: 300, name: 'Tier Head Token', encounterId: 2895, encounterName: "Ula'tek", delta: 1100, tierSlot: 'head' }),
      item({ itemId: 301, name: 'Tier Shoulder Token', encounterId: 2895, encounterName: "Ula'tek", delta: 900, tierSlot: 'shoulder' }),
      item({ itemId: 302, name: 'Neck of Testing', encounterId: 2895, encounterName: "Ula'tek", delta: 500 }),
    ])
    const lootTable: LootTableEncounter[] = [
      {
        encounterId: 2895,
        encounterName: "Ula'tek",
        items: [
          { itemId: 300, name: 'Tier Head Token', specSpecific: false, uniqueEquipped: false, onUseTrinket: false, isTier: true, viaCurio: true, tierSlot: 'head' },
          { itemId: 301, name: 'Tier Shoulder Token', specSpecific: false, uniqueEquipped: false, onUseTrinket: false, isTier: true, viaCurio: true, tierSlot: 'shoulder' },
          { itemId: 302, name: 'Neck of Testing', specSpecific: false, uniqueEquipped: false, onUseTrinket: false, isTier: false, viaCurio: false },
        ],
      },
    ]
    const [boss] = buildBossPools(report, makeKnockout(), SETTINGS, lootTable)
    expect(boss.pool).toHaveLength(1)
    expect(boss.pool[0]).toMatchObject({ itemIds: [302], kind: 'item', value: 500 })
    expect(boss.remaining).toBe(1)
    expect(boss.notes.some((n) => n.includes('not in this boss'))).toBe(false)
  })

  it('ignores a stored knockout entry saved against the curio: no crash, and it does not mark the same tier piece at the boss that really drops it', () => {
    // Older builds recorded a curio knockout as { itemId: <a tier piece>, encounterId: 2895 }.
    // Item 300 is also a real direct drop at The Twin Fangs (2887); the stale entry must not touch it.
    const report = makeReport([
      item({ itemId: 300, name: 'Tier Head Token', encounterId: 2887, encounterName: 'The Twin Fangs', delta: 1100, tierSlot: 'head' }),
      item({ itemId: 300, name: 'Tier Head Token', encounterId: 2895, encounterName: "Ula'tek", delta: 1100, viaCurio: true, tierSlot: 'head' }),
      item({ itemId: 302, name: 'Neck of Testing', encounterId: 2895, encounterName: "Ula'tek", delta: 500 }),
    ])
    const stale = makeKnockout({
      entries: [{ itemId: 300, itemName: 'Tier Head Token', encounterId: 2895, receivedAt: '', source: 'manual', state: 'rolled' }],
      rollsSpent: { 2895: 1 },
    })
    const bosses = buildBossPools(report, stale, SETTINGS)
    const twinFangs = bosses.find((b) => b.encounterId === 2887)!
    expect(twinFangs.pool[0]).toMatchObject({ itemIds: [300], ownership: 'none', knockedOut: false })
    expect(twinFangs.remaining).toBe(1)
    const ulatek = bosses.find((b) => b.encounterId === 2895)!
    expect(ulatek.pool.map((p) => p.itemIds)).toEqual([[302]])
    expect(ulatek.pool[0].knockedOut).toBe(false)
  })

  it('pins Ula\'tek pool size for the Iceshaman (elemental heroic) fixture: 5 (curio excluded), not 11', () => {
    const report = makeReport(
      [
        item({ itemId: 268265, name: 'Aqirbane Reliquary', encounterId: 2895, encounterName: "Ula'tek", delta: 3223 }),
        item({ itemId: 271876, name: 'Awoken Dreadfang Cuirass', encounterId: 2895, encounterName: "Ula'tek", delta: 0 }),
        item({ itemId: 271092, name: "Jan'thrazet, the Soul Fang", encounterId: 2895, encounterName: "Ula'tek", delta: 5182 }),
        item({ itemId: 270168, name: 'Font of Venomous Rage', encounterId: 2895, encounterName: "Ula'tek", delta: 10095 }),
        item({ itemId: 271093, name: "Zatha'tek, Breath of Corruption", encounterId: 2895, encounterName: "Ula'tek", delta: 0 }),
        // Five Ophidian Oracle tier pieces -- simmed as plain rows (no item.viaCurio), same as live data.
        item({ itemId: 271484, name: 'Hexing Grips of the Ophidian Oracle', encounterId: 2895, encounterName: "Ula'tek", delta: 3135, tierSlot: 'hands' }),
        item({ itemId: 271483, name: 'Serpent Crown of the Ophidian Oracle', encounterId: 2895, encounterName: "Ula'tek", delta: 2913, tierSlot: 'head' }),
        item({ itemId: 271482, name: 'Leggings of the Ophidian Oracle', encounterId: 2895, encounterName: "Ula'tek", delta: 662, tierSlot: 'legs' }),
        item({ itemId: 271481, name: 'Hissing Mantle of the Ophidian Oracle', encounterId: 2895, encounterName: "Ula'tek", delta: 3340, tierSlot: 'shoulder' }),
        item({ itemId: 271486, name: 'Fanged Raiment of the Ophidian Oracle', encounterId: 2895, encounterName: "Ula'tek", delta: 4367, tierSlot: 'chest' }),
      ],
      { baseline: 161000 }
    )
    const tierPiece = (itemId: number, name: string, tierSlot: string): LootTableItem => ({
      itemId,
      name,
      specSpecific: false,
      uniqueEquipped: false,
      onUseTrinket: false,
      isTier: true,
      viaCurio: true,
      tierSlot,
    })
    const lootTable: LootTableEncounter[] = [
      {
        encounterId: 2895,
        encounterName: "Ula'tek",
        items: [
          { itemId: 268265, name: 'Aqirbane Reliquary', specSpecific: false, uniqueEquipped: false, onUseTrinket: false, isTier: false, viaCurio: false },
          {
            itemId: 270168,
            name: 'Font of Venomous Rage',
            specSpecific: true,
            uniqueEquipped: true,
            onUseTrinket: true,
            isTier: false,
            viaCurio: false,
          },
          { itemId: 271092, name: "Jan'thrazet, the Soul Fang", specSpecific: false, uniqueEquipped: true, onUseTrinket: false, isTier: false, viaCurio: false },
          {
            itemId: 271093,
            name: "Zatha'tek, Breath of Corruption",
            specSpecific: false,
            uniqueEquipped: true,
            onUseTrinket: false,
            isTier: false,
            viaCurio: false,
          },
          { itemId: 271876, name: 'Awoken Dreadfang Cuirass', specSpecific: false, uniqueEquipped: false, onUseTrinket: false, isTier: false, viaCurio: false },
          tierPiece(271486, 'Fanged Raiment of the Ophidian Oracle', 'chest'),
          tierPiece(271484, 'Hexing Grips of the Ophidian Oracle', 'hands'),
          tierPiece(271483, 'Serpent Crown of the Ophidian Oracle', 'head'),
          tierPiece(271482, 'Leggings of the Ophidian Oracle', 'legs'),
          tierPiece(271481, 'Hissing Mantle of the Ophidian Oracle', 'shoulder'),
        ],
      },
    ]
    const [boss] = buildBossPools(report, makeKnockout(), { ...SETTINGS, lootSpecId: 262 }, lootTable)
    // The five Ophidian Oracle pieces are the curio's contents: not roll outcomes, so 5, not 6.
    expect(boss.pool).toHaveLength(5)
    expect(boss.remaining).toBe(5)
    expect(boss.pool.map((p) => p.itemIds[0]).sort()).toEqual([268265, 270168, 271092, 271093, 271876])
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
      entries: [{ itemId: 100, itemName: 'Test Item', encounterId: 2888, receivedAt: '2026-09-01T00:00:00Z', source: 'roll', state: 'rolled' }],
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
          state: 'rolled',
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
      entries: [{ itemId: 100, itemName: 'Test Item', encounterId: 2888, receivedAt: '2026-09-01T00:00:00Z', source: 'roll', state: 'rolled' }],
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
      entries: [{ itemId: 100, itemName: 'Test Item', encounterId: 2888, receivedAt: '2026-09-01T00:00:00Z', source: 'roll', state: 'rolled' }],
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
      entries: [{ itemId: 100, itemName: 'Test Item', encounterId: 2888, receivedAt: '2026-09-01T00:00:00Z', source: 'roll', state: 'rolled' }],
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

  it('defaults specSpecific to false on every entry when no loot table is supplied', () => {
    const report = makeReport([item({ itemId: 100, delta: 1000 })])
    const [boss] = buildBossPools(report, makeKnockout(), SETTINGS)
    expect(boss.pool[0].specSpecific).toBe(false)
  })
})

describe('buildBossPools -- roll-only knockout (owned vs rolled)', () => {
  const knock = (itemId: number, state: 'owned' | 'rolled') =>
    makeKnockout({ entries: [{ itemId, itemName: `Item ${itemId}`, encounterId: 2888, receivedAt: '2026-09-01T00:00:00Z', source: 'manual', state }] })

  it('keeps an owned (non-roll) item in the pool as a value-0 dud, still counted in the denominator', () => {
    const report = makeReport([item({ itemId: 100, delta: 1000 }), item({ itemId: 200, delta: 3000 })])
    const [boss] = buildBossPools(report, knock(100, 'owned'), SETTINGS)

    const dud = boss.pool.find((p) => p.itemIds[0] === 100)!
    expect(dud.ownership).toBe('owned')
    expect(dud.isDud).toBe(true)
    expect(dud.knockedOut).toBe(false)
    // Denominator still 2 (dud stays), numerator only the 3000 upgrade -> EV = 3000/2 = 1500.
    expect(boss.remaining).toBe(2)
    expect(boss.ev).toBe(1500)
    expect(boss.bestCase?.itemIds).toEqual([200])
    expect(boss.notes.some((n) => n.includes('owned dud'))).toBe(true)
  })

  it('gives a lower EV for an owned dud than the same item rolled (removed) -- the roll-only correction', () => {
    const report = makeReport([item({ itemId: 100, delta: 1000 }), item({ itemId: 200, delta: 3000 })])
    const owned = buildBossPools(report, knock(100, 'owned'), SETTINGS)[0]
    const rolled = buildBossPools(report, knock(100, 'rolled'), SETTINGS)[0]

    // Rolled: item removed -> EV over the single 3000 upgrade = 3000. Owned dud: 3000/2 = 1500.
    expect(rolled.ev).toBe(3000)
    expect(owned.ev).toBe(1500)
    expect(owned.ev).toBeLessThan(rolled.ev)
  })

  it('models unattributed rolls as a fractional uniform draw, not a physical removal, and reports rolls spent/attributed', () => {
    const report = makeReport([
      item({ itemId: 100, delta: 500 }),
      item({ itemId: 200, delta: 1000 }),
      item({ itemId: 300, delta: 3000 }),
    ])
    // 2 rolls spent on this boss, none attributed to a specific rolled item.
    const knockout = makeKnockout({ rollsSpent: { 2888: 2 } })
    const [boss] = buildBossPools(report, knockout, SETTINGS)

    expect(boss.rollsSpent).toBe(2)
    expect(boss.rollsAttributed).toBe(0)
    expect(boss.rollsUnattributed).toBe(2)
    // Denominator: 3 - 2 = 1. Numerator: mean(500,1000,3000)=1500, minus 2*1500=3000 -> (4500-3000)/1 = 1500.
    expect(boss.remaining).toBe(1)
    expect(boss.ev).toBe(1500)
    // No entry is actually knocked out -- all three are still real, interactable pool members.
    expect(boss.pool.every((p) => !p.knockedOut)).toBe(true)
    expect(boss.pool).toHaveLength(3)
  })

  it('EV with 2 unattributed rolls on a known pool: unbiased mean-based model vs. the old lowest-value-removal model', () => {
    const report = makeReport([
      item({ itemId: 100, delta: 100 }),
      item({ itemId: 200, delta: 500 }),
      item({ itemId: 300, delta: 1000 }),
      item({ itemId: 400, delta: 5000 }),
    ])
    const knockout = makeKnockout({ rollsSpent: { 2888: 2 } })
    const [boss] = buildBossPools(report, knockout, SETTINGS)

    // Old approach: physically remove the 2 lowest-value entries (100, 500), leaving
    // [1000, 5000] as the "remaining" pool -> EV = (1000 + 5000) / 2 = 3000. That biases EV
    // upward, since it always strips the worst performers rather than an average draw.
    const oldApproachEv = 3000
    // New approach: mean of the full unknown pool (100+500+1000+5000)/4 = 1650, remove 2
    // roll-equivalents' worth of that mean from both sides -> ((100+500+1000+5000) - 2*1650) / (4-2) = 1650.
    const newApproachEv = 1650
    expect(boss.ev).toBe(newApproachEv)
    expect(boss.ev).toBeLessThan(oldApproachEv)
  })

  it('clamps the effective rolls-spent counter up to the count of rolled (attributed) items', () => {
    const report = makeReport([item({ itemId: 100, delta: 1000 }), item({ itemId: 200, delta: 2000 })])
    // Two items rolled, but rollsSpent stored as 1 -- effective counter clamps up to 2, so no
    // extra unattributed removal happens.
    const knockout = makeKnockout({
      rollsSpent: { 2888: 1 },
      entries: [
        { itemId: 100, itemName: 'A', encounterId: 2888, receivedAt: '2026-09-01T00:00:00Z', source: 'roll', state: 'rolled' },
        { itemId: 200, itemName: 'B', encounterId: 2888, receivedAt: '2026-09-01T00:00:00Z', source: 'roll', state: 'rolled' },
      ],
    })
    const [boss] = buildBossPools(report, knockout, SETTINGS)
    expect(boss.rollsAttributed).toBe(2)
    expect(boss.rollsSpent).toBe(2)
    expect(boss.rollsUnattributed).toBe(0)
    expect(boss.remaining).toBe(0)
  })

  it('never knocks out the BIS (or any specific item) to model an unattributed roll -- the whole unknown pool absorbs it as a fractional mean draw', () => {
    const report = makeReport([item({ itemId: 100, delta: 500 }), item({ itemId: 999, delta: 9000 })])
    const [boss] = buildBossPools(report, makeKnockout({ rollsSpent: { 2888: 1 } }), SETTINGS)
    // Denominator: 2 - 1 = 1. Numerator: mean(500,9000)=4750, minus 1*4750 -> (9500-4750)/1 = 4750.
    expect(boss.remaining).toBe(1)
    expect(boss.ev).toBe(4750)
    expect(boss.pool.find((p) => p.itemIds[0] === 999)?.knockedOut).toBe(false)
    expect(boss.pool.find((p) => p.itemIds[0] === 100)?.knockedOut).toBe(false)
  })
})

function lootItem(overrides: Partial<LootTableItem> = {}): LootTableItem {
  return {
    itemId: 999,
    name: 'Loot Table Item',
    specSpecific: false,
    uniqueEquipped: false,
    onUseTrinket: false,
    isTier: false,
    viaCurio: false,
    ...overrides,
  }
}

describe('buildBossPools with a loot table (full pool denominator)', () => {
  it('adds a value-0 "not in sim report" entry for a loot-table item absent from the report, growing the pool denominator', () => {
    const report = makeReport([item({ itemId: 100, delta: 1000 })])
    const lootTable: LootTableEncounter[] = [
      { encounterId: 2888, encounterName: "Nek'zali the Soulcoiler", items: [lootItem({ itemId: 100, name: 'Test Item' }), lootItem({ itemId: 200, name: 'Unsimmed Item' })] },
    ]

    const withoutTable = buildBossPools(report, makeKnockout(), SETTINGS)
    expect(withoutTable[0].pool).toHaveLength(1)
    expect(withoutTable[0].remaining).toBe(1)

    const [boss] = buildBossPools(report, makeKnockout(), SETTINGS, lootTable)
    expect(boss.pool).toHaveLength(2)
    expect(boss.remaining).toBe(2) // denominator grows -- the Voidcore draws from the whole pool
    const phantom = boss.pool.find((p) => p.itemIds[0] === 200)!
    expect(phantom).toMatchObject({ value: 0, rawDelta: 0, notInSimReport: true, name: 'Unsimmed Item' })
    // ev is now the mean over BOTH entries (1000 + 0) / 2, not just the simmed one.
    expect(boss.ev).toBe(500)
    expect(boss.notes.some((n) => n.includes('not in sim report'))).toBe(true)
  })

  it("keeps a report item absent from the boss's loot table, with a warning note", () => {
    const report = makeReport([item({ itemId: 100, delta: 1000 })])
    const lootTable: LootTableEncounter[] = [{ encounterId: 2888, encounterName: "Nek'zali the Soulcoiler", items: [] }]

    const [boss] = buildBossPools(report, makeKnockout(), SETTINGS, lootTable)
    expect(boss.pool).toHaveLength(1)
    expect(boss.pool[0].itemIds).toEqual([100])
    expect(boss.notes.some((n) => n.includes("not in this boss's loot table"))).toBe(true)
  })

  it('derives PoolEntry.specSpecific true from a loot-table row that carries a spec restriction', () => {
    const report = makeReport([item({ itemId: 100, delta: 1000 })])
    const lootTable: LootTableEncounter[] = [
      { encounterId: 2888, encounterName: "Nek'zali the Soulcoiler", items: [lootItem({ itemId: 100, specSpecific: true })] },
    ]
    const [boss] = buildBossPools(report, makeKnockout(), SETTINGS, lootTable)
    expect(boss.pool[0].specSpecific).toBe(true)
  })

  it('applies a specSpecific (loot-table-derived) knockout only when the currently active lootSpecId matches the one it was recorded under', () => {
    const report = makeReport([item({ itemId: 100, delta: 1000 })])
    const lootTable: LootTableEncounter[] = [
      { encounterId: 2888, encounterName: "Nek'zali the Soulcoiler", items: [lootItem({ itemId: 100, specSpecific: true })] },
    ]
    const knockout = makeKnockout({
      entries: [{ itemId: 100, itemName: 'Test Item', encounterId: 2888, receivedAt: '2026-09-01T00:00:00Z', source: 'roll', lootSpecId: 262, state: 'rolled' }],
    })

    const differentSpec = buildBossPools(report, knockout, { ...SETTINGS, lootSpecId: 264 }, lootTable)
    expect(differentSpec[0].pool[0].knockedOut).toBe(false)

    const matchingSpec = buildBossPools(report, knockout, { ...SETTINGS, lootSpecId: 262 }, lootTable)
    expect(matchingSpec[0].pool[0].knockedOut).toBe(true)
  })

  it('lets a manual specSpecific override on the KnockoutEntry take precedence over the loot table (and legacy spec fallback still applies when lootSpecId is absent)', () => {
    const report = makeReport([item({ itemId: 100, delta: 1000 })])
    // Loot table says this item is NOT spec-specific, but the player manually overrode it.
    const lootTable: LootTableEncounter[] = [
      { encounterId: 2888, encounterName: "Nek'zali the Soulcoiler", items: [lootItem({ itemId: 100, specSpecific: false })] },
    ]
    const knockout = makeKnockout({
      entries: [
        { itemId: 100, itemName: 'Test Item', encounterId: 2888, receivedAt: '2026-09-01T00:00:00Z', source: 'manual', specSpecific: true, spec: 'restoration', state: 'rolled' },
      ],
    })

    const nonMatching = buildBossPools(report, knockout, SETTINGS, lootTable)
    expect(nonMatching[0].pool[0].knockedOut).toBe(false) // report.spec is 'elemental' by default

    const matchingReport = makeReport([item({ itemId: 100, delta: 1000 })], { spec: 'restoration' })
    const matching = buildBossPools(matchingReport, knockout, SETTINGS, lootTable)
    expect(matching[0].pool[0].knockedOut).toBe(true)
  })
})
