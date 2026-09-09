import { describe, expect, it } from 'vitest'
import { normalizeQELiveReport, parseQELiveResponseBody, INVENTORY_TYPE_TO_SLOT, type QELiveRawReport } from '../src/normalize/qelive'
import type { LearnedTierData } from '../src/lookup/tierLearned'
import type { EncounterItemsLookup } from '../src/types'

function makeLookup(): EncounterItemsLookup {
  return {
    itemSources: new Map([
      [270162, [{ instanceId: 1320, encounterId: 2888 }]],
      [270164, [{ instanceId: 1320, encounterId: 2894 }]],
      // Tier item: static encounter-items.json points it at the aggregate catalyst
      // bucket (-100), so pickBestSource can't resolve it -- only positive sources count.
      [271483, [{ instanceId: -100, encounterId: -100 }]],
    ]),
    itemMeta: new Map([
      [270162, { name: 'Soulcoiler Ritual Vessel', inventoryType: 12 }],
      [270164, { name: "Gebbo's Bottomless Bag", inventoryType: 2 }],
      [271483, { name: 'Serpent Crown of the Ophidian Oracle', inventoryType: 1 }],
    ]),
    encounterNames: new Map([
      [2888, "Nek'zali the Soulcoiler"],
      [2894, 'The Lost Explorers'],
      [2887, 'The Twin Fangs'],
      [2895, "Ula'tek"],
    ]),
    instanceNames: new Map([[1320, 'The Venomous Abyss']]),
    instanceTypes: new Map([[1320, 'raid']]),
    rawItems: new Map(),
    encountersByInstance: new Map(),
    weaponSpecs: new Map(),
  }
}

function makeReport(overrides: Partial<QELiveRawReport> = {}): QELiveRawReport {
  return {
    id: 'wzfyzqxqjqej',
    playername: 'Iceshaman',
    realm: 'Hyjal',
    region: 'US',
    spec: 'Restoration Shaman',
    contentType: 'Raid',
    results: [
      { item: 270162, dropLoc: 'Raid', dropType: 'bonus', dropDifficulty: 3, level: 334, score: 0.056, rawDiff: 19816, percDiff: 5.662 },
      { item: 270164, dropLoc: 'Raid', dropType: 'bonus', dropDifficulty: 3, level: 334, score: 0.045, rawDiff: 15696, percDiff: 4.485 },
      // Not a bonus row -- should be ignored.
      { item: 158366, dropLoc: 'Dungeon', dropType: 'drop', dropDifficulty: 7, level: 334, score: 0, rawDiff: 0, percDiff: 0 },
      // Bonus, but a different content source -- excluded from a "Raid" report with a warning.
      { item: 999001, dropLoc: 'Crafted', dropType: 'bonus', dropDifficulty: '', level: 320, score: 0, rawDiff: 0, percDiff: 0 },
      { item: 999002, dropLoc: 'Delves', dropType: 'bonus', dropDifficulty: '', level: 320, score: 0, rawDiff: 0, percDiff: 0 },
    ],
    ...overrides,
  }
}

describe('parseQELiveResponseBody', () => {
  it('parses a double-encoded JSON body (string-of-JSON)', () => {
    const inner = { id: 'wzfyzqxqjqej', playername: 'Iceshaman', spec: 'Restoration Shaman', contentType: 'Raid', results: [] }
    const bodyText = JSON.stringify(JSON.stringify(inner))
    const parsed = parseQELiveResponseBody(bodyText)
    expect(parsed).toEqual(inner)
  })

  it('throws if the first parse does not yield a string', () => {
    const bodyText = JSON.stringify({ not: 'a string' })
    expect(() => parseQELiveResponseBody(bodyText)).toThrow()
  })
})

describe('normalizeQELiveReport', () => {
  it('keeps only bonus + matching dropLoc rows', () => {
    const result = normalizeQELiveReport('wzfyzqxqjqej', makeReport(), makeLookup())
    expect(result.items).toHaveLength(2)
    expect(result.items.map((i) => i.itemId).sort()).toEqual([270162, 270164])
  })

  it('warns and excludes Crafted/Delves bonus rows', () => {
    const result = normalizeQELiveReport('wzfyzqxqjqej', makeReport(), makeLookup())
    expect(result.warnings).toContain('2 Crafted/Delves entries excluded')
  })

  it('uses rawDiff as delta and percDiff as pct directly', () => {
    const result = normalizeQELiveReport('wzfyzqxqjqej', makeReport(), makeLookup())
    const item = result.items.find((i) => i.itemId === 270162)!
    expect(item.delta).toBe(19816)
    expect(item.pct).toBe(5.662)
  })

  it('derives baseline as the median of rawDiff / (percDiff/100) across kept rows', () => {
    const result = normalizeQELiveReport('wzfyzqxqjqej', makeReport(), makeLookup())
    // 19816/0.05662 = 349982.4..., 15696/0.04485 = 349966.6...
    const expectedMedian = (19816 / (5.662 / 100) + 15696 / (4.485 / 100)) / 2
    expect(result.baseline).toBeCloseTo(expectedMedian, 0)
  })

  it('falls back to baseline 0 with a warning when no kept row has nonzero percDiff', () => {
    const report = makeReport({
      results: [{ item: 270162, dropLoc: 'Raid', dropType: 'bonus', dropDifficulty: 3, level: 334, score: 0, rawDiff: 0, percDiff: 0 }],
    })
    const result = normalizeQELiveReport('wzfyzqxqjqej', report, makeLookup())
    expect(result.baseline).toBe(0)
    expect(result.warnings).toContain('Could not derive baseline: no rows with nonzero percDiff')
  })

  it('drops items with no encounter mapping and warns with the item id', () => {
    const report = makeReport({
      results: [
        { item: 270162, dropLoc: 'Raid', dropType: 'bonus', dropDifficulty: 3, level: 334, score: 0.056, rawDiff: 19816, percDiff: 5.662 },
        { item: 555555, dropLoc: 'Raid', dropType: 'bonus', dropDifficulty: 3, level: 334, score: 0.02, rawDiff: 7000, percDiff: 2 },
      ],
    })
    const result = normalizeQELiveReport('wzfyzqxqjqej', report, makeLookup())
    expect(result.items.find((i) => i.itemId === 555555)).toBeUndefined()
    expect(result.warnings).toContain('Item 555555 had no encounter mapping')
  })

  it('maps dropDifficulty 3 to "heroic" for a raid report and sets role/metric for healers', () => {
    const result = normalizeQELiveReport('wzfyzqxqjqej', makeReport(), makeLookup())
    expect(result.difficulty).toBe('heroic')
    expect(result.role).toBe('healer')
    expect(result.metric).toBe('hps')
    expect(result.spec).toBe('restoration')
    expect(result.charClass).toBe('Shaman')
  })
})

describe('INVENTORY_TYPE_TO_SLOT', () => {
  it('maps the tier armor inventory type ids to their slots', () => {
    expect(INVENTORY_TYPE_TO_SLOT[1]).toBe('head')
    expect(INVENTORY_TYPE_TO_SLOT[3]).toBe('shoulder')
    expect(INVENTORY_TYPE_TO_SLOT[5]).toBe('chest')
    expect(INVENTORY_TYPE_TO_SLOT[20]).toBe('chest')
    expect(INVENTORY_TYPE_TO_SLOT[7]).toBe('legs')
    expect(INVENTORY_TYPE_TO_SLOT[10]).toBe('hands')
  })
})

describe('normalizeQELiveReport tier fallback', () => {
  function reportWithTierRow(): QELiveRawReport {
    return makeReport({
      results: [
        { item: 270162, dropLoc: 'Raid', dropType: 'bonus', dropDifficulty: 3, level: 334, score: 0.056, rawDiff: 19816, percDiff: 5.662 },
        { item: 270164, dropLoc: 'Raid', dropType: 'bonus', dropDifficulty: 3, level: 334, score: 0.045, rawDiff: 15696, percDiff: 4.485 },
        { item: 271483, dropLoc: 'Raid', dropType: 'bonus', dropDifficulty: 3, level: 334, score: 0.04, rawDiff: 14000, percDiff: 4.0 },
      ],
    })
  }

  it('resolves a tier item with no positive encounter-items.json source via the seed, emitting one row per boss with viaCurio flags', () => {
    const result = normalizeQELiveReport('wzfyzqxqjqej', reportWithTierRow(), makeLookup())
    const tierItems = result.items.filter((i) => i.itemId === 271483)
    expect(tierItems.map((i) => i.encounterId).sort()).toEqual([2887, 2895])
    expect(tierItems.every((i) => i.tierSlot === 'head')).toBe(true)
    expect(tierItems.find((i) => i.encounterId === 2895)?.viaCurio).toBe(true)
    expect(tierItems.find((i) => i.encounterId === 2887)?.viaCurio).toBe(false)
    expect(result.warnings.some((w) => w.includes('271483'))).toBe(false)
  })

  it('prefers the learned cache over the seed when a learned mapping exists for the item', () => {
    const learned = new Map<number, LearnedTierData>([[1320, { byItem: { 271483: [9001] }, bySlot: {} }]])
    const result = normalizeQELiveReport('wzfyzqxqjqej', reportWithTierRow(), makeLookup(), learned)
    const tierItems = result.items.filter((i) => i.itemId === 271483)
    expect(tierItems.map((i) => i.encounterId)).toEqual([9001])
  })

  it('scopes the report to the dominant raid instance, excluding rows resolved to a different raid instance active this tier (regression: QE Live reports span every "Raid" dropLoc row across the whole raid tier, not just one instance -- a second raid lair boss otherwise leaks in as an extra deployable encounter)', () => {
    const lookup = makeLookup()
    // A boss from a *different* raid instance (1317, "The Tidebound Grotto") that also
    // resolves cleanly via pickBestSource -- not a Dungeon/Delves leak, not a tier-token
    // misattachment, just a second real raid instance sharing dropLoc "Raid".
    lookup.itemSources.set(268217, [{ instanceId: 1317, encounterId: 2849 }])
    lookup.itemMeta.set(268217, { name: 'Rising Tide Wristguards', inventoryType: 9 })
    lookup.encounterNames.set(2849, 'Nymrissa Wavecaller')
    lookup.instanceNames.set(1317, 'The Tidebound Grotto')
    lookup.instanceTypes.set(1317, 'raid')

    const report = makeReport({
      results: [
        { item: 270162, dropLoc: 'Raid', dropType: 'bonus', dropDifficulty: 3, level: 334, score: 0.056, rawDiff: 19816, percDiff: 5.662 },
        { item: 270164, dropLoc: 'Raid', dropType: 'bonus', dropDifficulty: 3, level: 334, score: 0.045, rawDiff: 15696, percDiff: 4.485 },
        { item: 268217, dropLoc: 'Raid', dropType: 'bonus', dropDifficulty: 3, level: 334, score: 0.03, rawDiff: 10000, percDiff: 3.0 },
      ],
    })
    const result = normalizeQELiveReport('wzfyzqxqjqej', report, lookup)

    expect(result.items.map((i) => i.itemId).sort()).toEqual([270162, 270164])
    expect(result.items.find((i) => i.itemId === 268217)).toBeUndefined()
    expect(new Set(result.items.map((i) => i.instanceId))).toEqual(new Set([1320]))
    expect(result.instanceId).toBe(1320)
    expect(result.instanceName).toBe('The Venomous Abyss')
    expect(result.warnings.some((w) => w.includes('different raid instance'))).toBe(true)
  })

  it('still drops and warns when the item has no slot and no learned/seed mapping', () => {
    const lookup = makeLookup()
    lookup.itemSources.set(555555, [{ instanceId: -100, encounterId: -100 }])
    // No itemMeta entry -- inventoryType/slot unknown.
    const report = makeReport({
      results: [
        { item: 270162, dropLoc: 'Raid', dropType: 'bonus', dropDifficulty: 3, level: 334, score: 0.056, rawDiff: 19816, percDiff: 5.662 },
        { item: 555555, dropLoc: 'Raid', dropType: 'bonus', dropDifficulty: 3, level: 334, score: 0.02, rawDiff: 7000, percDiff: 2 },
      ],
    })
    const result = normalizeQELiveReport('wzfyzqxqjqej', report, lookup)
    expect(result.items.find((i) => i.itemId === 555555)).toBeUndefined()
    expect(result.warnings).toContain('Item 555555 had no encounter mapping')
  })
})
