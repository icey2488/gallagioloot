import { describe, expect, it } from 'vitest'
import { normalizeRaidbotsReport } from '../src/normalize/raidbots'
import { maxUpgradeWarning, parseTrackInfo } from '../src/normalize/track'
import { buildLootTable } from '../src/lookup/lootTable'
import { loadLookup, loadMplusRaw, loadRaidRaw, MPLUS_REPORT_ID, RAID_REPORT_ID } from './fixtures/load'

const ARCANE = 62

describe('normalizeRaidbotsReport: Mythic+ droptimizer (a8URThoNZqEXDW3tBtavHq)', () => {
  const report = normalizeRaidbotsReport(MPLUS_REPORT_ID, loadMplusRaw(), loadLookup())

  it('attributes all 101 "-1/-1/..." rows to a dungeon via the itemLibrary sources join, none unmapped', () => {
    expect(report.items).toHaveLength(101)
    expect(report.warnings).toEqual([])
    const perDungeon = new Map<number, number>()
    for (const item of report.items) perDungeon.set(item.encounterId, (perDungeon.get(item.encounterId) ?? 0) + 1)
    expect(Object.fromEntries(perDungeon)).toEqual({ 1030: 17, 1041: 16, 1202: 8, 1304: 12, 1309: 12, 1311: 8, 1313: 12, 1322: 16 })
  })

  it('models each dungeon as an mplus target on the aggregate instance (-1), named after the dungeon', () => {
    expect(report.targetKind).toBe('mplus')
    expect(report.contentType).toBe('dungeon')
    expect(report.instanceId).toBe(-1)
    expect(report.instanceName).toBe('Mythic+ Dungeons')
    expect(new Set(report.items.map((i) => i.instanceId))).toEqual(new Set([-1]))
    const names = new Map(report.items.map((i) => [i.encounterId, i.encounterName]))
    expect(names.get(1322)).toBe('Altar of Fangs')
    expect(names.get(1313)).toBe('Voidscar Arena')
    expect(names.size).toBe(8)
  })

  it('attributes a catalyst row by its SOURCE item (the one that drops), keeping the tier piece as the row item', () => {
    // -1/-1/dungeon-mythic-weekly10/271563/334/7935/legs////273786: Tailored Legwraps, converted from an Altar of Fangs drop.
    const row = report.items.find((i) => i.itemId === 271563 && i.catalystSourceId === 273786)
    expect(row).toMatchObject({ encounterId: 1322, encounterName: 'Altar of Fangs', name: "Primal Leywarden's Tailored Legwraps", slot: 'legs' })
    expect(row?.catalystSourceName).toBeTruthy()
    expect(report.items.filter((i) => i.catalystSourceId !== undefined)).toHaveLength(17)
  })

  it('parses key level and track: +10 and above, Myth, drop 318, simmed 334 at 6/6 (max)', () => {
    expect(report.difficulty).toBe('dungeon-mythic-weekly10')
    expect(report.track).toEqual({
      name: 'Myth',
      upgradeFullName: 'Myth 6/6',
      upgradeLevel: 6,
      upgradeMax: 6,
      atMaxUpgrade: true,
      simmedIlvl: 334,
      keyLevelMin: 10,
      dropIlvl: 318,
    })
  })

  it('joins against /loot-table/-1: 8 dungeon pseudo-encounters, 80 Arcane items, every direct simmed item inside its dungeon pool', () => {
    const table = buildLootTable(-1, ARCANE, loadLookup())
    expect(table).toHaveLength(8)
    expect(table.reduce((n, e) => n + e.items.length, 0)).toBe(80)
    for (const item of report.items.filter((i) => i.catalystSourceId === undefined)) {
      const dungeon = table.find((e) => e.encounterId === item.encounterId)
      expect(dungeon?.items.some((li) => li.itemId === item.itemId), `${item.name} in ${item.encounterName}`).toBe(true)
    }
  })
})

describe('normalizeRaidbotsReport: raid droptimizer track (6PTZ7TjgU8PdxJhZ97bMUa)', () => {
  it('is a raid target set with Myth 6/6 track info and no key level', () => {
    const report = normalizeRaidbotsReport(RAID_REPORT_ID, loadRaidRaw(), loadLookup())
    expect(report.targetKind).toBe('raid')
    expect(report.instanceId).toBe(1320)
    expect(report.track).toMatchObject({ name: 'Myth', upgradeLevel: 6, upgradeMax: 6, atMaxUpgrade: true, simmedIlvl: 334, dropIlvl: 334 })
    expect(report.track?.keyLevelMin).toBeUndefined()
    expect(report.warnings.some((w) => w.includes('max upgrade'))).toBe(false)
  })
})

describe('max-upgrade detection', () => {
  it('warns when a report was simmed below max upgrade of its track', () => {
    const raw = loadMplusRaw()
    for (const entry of raw.simbot.meta.itemLibrary) {
      if (entry.upgrade) entry.upgrade = { ...entry.upgrade, level: 3, fullName: 'Myth 3/6' }
    }
    const report = normalizeRaidbotsReport(MPLUS_REPORT_ID, raw, loadLookup())
    expect(report.track?.atMaxUpgrade).toBe(false)
    expect(report.track?.upgradeLevel).toBe(3)
    expect(report.warnings).toContain(
      'Simmed at Myth 3/6, not Myth 6/6. All items are valued at the max upgrade of their track; re-run the droptimizer at max upgrade.'
    )
  })

  it('flags a single below-max entry even when the rest are maxed', () => {
    const track = parseTrackInfo([
      { itemLevel: 334, upgrade: { name: 'Myth', level: 6, max: 6, fullName: 'Myth 6/6' } },
      { itemLevel: 327, upgrade: { name: 'Myth', level: 5, max: 6, fullName: 'Myth 5/6' } },
    ])
    expect(track).toMatchObject({ atMaxUpgrade: false, upgradeLevel: 5, upgradeFullName: 'Myth 5/6' })
  })

  it('is unknown (no warning) when the report carries no upgrade info', () => {
    const track = parseTrackInfo([{ itemLevel: 344, dropLevel: 344 }])
    expect(track.atMaxUpgrade).toBeUndefined()
    expect(track.simmedIlvl).toBe(344)
    expect(maxUpgradeWarning(track)).toBeNull()
  })

  it('reads keyLevelMin only from an object difficulty override, ignoring raid-style string overrides', () => {
    const track = parseTrackInfo([
      { itemLevel: 334, upgrade: { name: 'Myth', level: 6, max: 6 }, overrides: { difficulty: 'raid-vault-mythic' } },
      { itemLevel: 334, upgrade: { name: 'Myth', level: 6, max: 6 }, overrides: { difficulty: { keyLevels: [12, 999], itemLevelOverride: 318 } } },
    ])
    expect(track.keyLevelMin).toBe(12)
    expect(track.dropIlvl).toBe(318)
  })
})
