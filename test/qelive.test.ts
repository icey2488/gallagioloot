import { describe, expect, it } from 'vitest'
import { normalizeQELiveReport, parseQELiveResponseBody, type QELiveRawReport } from '../src/normalize/qelive'
import type { EncounterItemsLookup } from '../src/types'

function makeLookup(): EncounterItemsLookup {
  return {
    itemSources: new Map([
      [270162, [{ instanceId: 1320, encounterId: 2888 }]],
      [270164, [{ instanceId: 1320, encounterId: 2894 }]],
    ]),
    itemMeta: new Map([
      [270162, { name: 'Soulcoiler Ritual Vessel', inventoryType: 12 }],
      [270164, { name: "Gebbo's Bottomless Bag", inventoryType: 2 }],
    ]),
    encounterNames: new Map([
      [2888, "Nek'zali the Soulcoiler"],
      [2894, 'The Lost Explorers'],
    ]),
    instanceNames: new Map([[1320, 'The Venomous Abyss']]),
    instanceTypes: new Map([[1320, 'raid']]),
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
