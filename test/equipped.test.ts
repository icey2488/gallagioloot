import { describe, expect, it } from 'vitest'
import { loadLookup, loadMplusRaw, loadRaidRaw, MPLUS_REPORT_ID, RAID_REPORT_ID } from './fixtures/load'
import { extractEquippedItemIds } from '../src/normalize/equipped'
import { normalizeRaidbotsReport, type RaidbotsRawReport } from '../src/normalize/raidbots'
import { buildBossPools } from '../src/core/pool'
import { knockoutDifficulty } from '../src/core/targets'
import { buildLootTable } from '../src/lookup/lootTable'
import type { KnockoutEntry, KnockoutState, Settings } from '../src/core/types'
import type { LootTableEncounter, NormalizedItem, NormalizedReport } from '../src/types'

describe('extractEquippedItemIds', () => {
  it('returns the sorted, de-duplicated item ids of an equipped-gear object', () => {
    expect(extractEquippedItemIds({ finger1: { id: 240949 }, finger2: { id: 251148 }, trinket1: { id: 251148 }, head: null })).toEqual([240949, 251148])
  })

  it('returns [] for non-objects and skips entries without a positive integer id', () => {
    expect(extractEquippedItemIds(undefined)).toEqual([])
    expect(extractEquippedItemIds(null)).toEqual([])
    expect(extractEquippedItemIds([{ id: 5 }])).toEqual([])
    expect(extractEquippedItemIds({ a: { id: '5' }, b: { id: 0 }, c: { id: 1.5 }, d: {}, e: 'x', f: { id: 7 } })).toEqual([7])
  })
})

describe('normalizeRaidbotsReport equipped gear', () => {
  function raw(equipped?: unknown): RaidbotsRawReport {
    return {
      sim: { players: [{ collected_data: { dps: { mean: 100000 } } }], profilesets: { metric: 'Damage per Second', results: [{ name: '1320/2895/raid-vault-heroic/271484/334/0/hands////', mean: 110000 }] } },
      simbot: {
        simType: 'droptimizer',
        player: 'Iceshaman',
        charClass: 'shaman',
        spec: 'elemental',
        meta: {
          rawFormData: { droptimizer: { instance: 1320, difficulty: 'raid-vault-heroic', equipped } },
          itemLibrary: [{ id: 271484, name: 'Hexing Grips of the Ophidian Oracle', offSpecItem: false }],
          instanceLibrary: [{ id: 1320, name: 'The Venomous Abyss', encounters: [{ id: 2895, name: "Ula'tek" }] }],
        },
      },
    } as RaidbotsRawReport
  }

  it("carries the profile's equipped item ids on the NormalizedReport", () => {
    const report = normalizeRaidbotsReport('abc', raw({ finger1: { id: 240949 }, finger2: { id: 251148 }, trinket1: { id: 251148 }, mainHand: { id: 245770 } }))
    expect(report.equippedItemIds).toEqual([240949, 245770, 251148])
  })

  it('is an empty list when the report carries no equipped gear', () => {
    expect(normalizeRaidbotsReport('abc', raw(undefined)).equippedItemIds).toEqual([])
  })
})

describe('real Icemagus fixtures', () => {
  const GEAR = [159255, 239648, 240949, 245770, 250215, 251148, 268241, 268250, 270164, 271559, 271563, 271564, 271565, 271566, 271567]

  it('both reports carry the same 15 equipped item ids, including the Pilfered Precious Band (finger2) and the Gebbo bag trinket', () => {
    const raid = normalizeRaidbotsReport(RAID_REPORT_ID, loadRaidRaw(), loadLookup())
    const mplus = normalizeRaidbotsReport(MPLUS_REPORT_ID, loadMplusRaw(), loadLookup())
    expect(raid.equippedItemIds).toEqual(GEAR)
    expect(mplus.equippedItemIds).toEqual(GEAR)
    expect(mplus.equippedItemIds).toContain(251148)
  })

  it('auto-Owned items and per-target EV on the real data (equipped-aware vs. ignoring the gear)', () => {
    const settings: Settings = { thresholdPct: 0.2, voidcoresToSpend: 1, includeOffSpec: false, lootSpecId: 62 }
    const lookup = loadLookup()
    const run = (report: NormalizedReport, instanceId: number, equipped: boolean) => {
      const r = equipped ? report : { ...report, equippedItemIds: undefined }
      const state: KnockoutState = { character: r.character, difficulty: knockoutDifficulty(r), entries: [], version: 2 }
      return buildBossPools(r, state, settings, buildLootTable(instanceId, 62, lookup))
    }
    const raid = normalizeRaidbotsReport(RAID_REPORT_ID, loadRaidRaw(), lookup)
    const mplus = normalizeRaidbotsReport(MPLUS_REPORT_ID, loadMplusRaw(), lookup)
    const summary = (report: NormalizedReport, instanceId: number) =>
      Object.fromEntries(
        run(report, instanceId, true).map((b) => [
          b.encounterName,
          {
            ev: [Number(run(report, instanceId, false).find((x) => x.encounterId === b.encounterId)!.evPct.toFixed(3)), Number(b.evPct.toFixed(3))],
            owned: b.pool.filter((p) => p.autoOwned).map((p) => p.name).sort(),
            upgrades: b.pool.filter((p) => p.equippedUpgrade).map((p) => p.name).sort(),
          },
        ])
      )
    // Only equipped items the sim does not show as an upgrade are auto-Owned, so every EV equals its ignore-the-gear value.
    expect(summary(raid, 1320)).toEqual({
      "Nek'zali the Soulcoiler": { ev: [0.349, 0.349], owned: [], upgrades: [] },
      'Entombed Sentinels': { ev: [0.348, 0.348], owned: [], upgrades: ["Primal Leywarden's Manashapers", "Sentinel's Vitriolic Chain"] },
      'The Lost Explorers': { ev: [0.614, 0.614], owned: ["Gebbo's Bottomless Bag"], upgrades: [] },
      'Vashnik the Malignant': { ev: [0.245, 0.245], owned: [], upgrades: ['Crest of the Primal Leywarden'] },
      Sszorak: { ev: [0.648, 0.648], owned: [], upgrades: ["Primal Leywarden's Tailored Legwraps"] },
      'The Twin Fangs': { ev: [0.458, 0.458], owned: [], upgrades: ['Crown of the Primal Leywarden', 'Ornaments of the Eternal Coil'] },
      'The Coiled Altar': { ev: [0.812, 0.812], owned: [], upgrades: [] },
      "Ula'tek": { ev: [0.921, 0.921], owned: [], upgrades: [] },
    })
    const m = summary(mplus, -1)
    expect(m['Den of Nalorakk']).toEqual({ ev: [0.348, 0.348], owned: ['Pilfered Precious Band'], upgrades: [] })
    expect(m['Murder Row']).toEqual({ ev: [0.381, 0.381], owned: [], upgrades: ["Freightrunner's Flask"] })
    expect(m['Temple of Sethraliss']).toEqual({ ev: [0.341, 0.341], owned: [], upgrades: ['Ouroborial Sash'] })
    expect(Object.values(m).every((b) => b.ev[0] === b.ev[1])).toBe(true)
  })
})

describe('equipped items in the pool', () => {
  const RING = 251148
  const SETTINGS: Settings = { thresholdPct: 0.2, voidcoresToSpend: 1, includeOffSpec: false }
  const simmed = (itemId: number, delta: number): NormalizedItem => ({ itemId, name: `Item ${itemId}`, encounterId: 1311, encounterName: 'Den of Nalorakk', instanceId: -1, ilvl: 334, delta, pct: delta / 1000 })
  const report = (equippedItemIds: number[] | undefined, items: NormalizedItem[] = [simmed(1, 2000), simmed(2, 1000)]): NormalizedReport => ({
    source: 'raidbots', reportId: 'r', character: 'Icemagus', spec: 'arcane', role: 'dps', metric: 'dps', contentType: 'raid', difficulty: 'raid-vault-mythic', baseline: 100000, items, warnings: [], equippedItemIds,
  })
  const loot: LootTableEncounter[] = [
    { encounterId: 1311, encounterName: 'Den of Nalorakk', items: [1, 2, RING].map((itemId) => ({ itemId, name: `Item ${itemId}`, specSpecific: false, uniqueEquipped: false, onUseTrinket: false, isTier: false, viaCurio: false })) },
  ]
  const knockout = (entries: KnockoutEntry[] = []): KnockoutState => ({ character: 'Icemagus', difficulty: 'raid-vault-mythic', entries, version: 2 })
  const entry = (state: KnockoutEntry['state']): KnockoutEntry => ({ itemId: RING, itemName: 'Ring', encounterId: 1311, receivedAt: '', source: 'manual', state })
  const ring = (r: NormalizedReport, k: KnockoutState) => buildBossPools(r, k, SETTINGS, loot)[0].pool.find((p) => p.itemIds.includes(RING))!

  it('defaults an equipped item to Owned (value 0, stays in the pool) and flags it Equipped', () => {
    const boss = buildBossPools(report([RING]), knockout(), SETTINGS, loot)[0]
    const e = boss.pool.find((p) => p.itemIds.includes(RING))!
    expect(e).toMatchObject({ equipped: true, autoOwned: true, ownership: 'owned', isDud: true, knockedOut: false })
    expect(boss.pool).toHaveLength(3)
    expect(boss.remaining).toBe(3)
  })

  it('does not touch items that are not equipped', () => {
    const e = buildBossPools(report([RING]), knockout(), SETTINGS, loot)[0].pool.find((p) => p.itemIds.includes(1))!
    expect(e.equipped).toBeUndefined()
    expect(e.ownership).toBe('none')
  })

  it('a stored Rolled state wins over the equipped default (knocked out of the pool)', () => {
    const e = ring(report([RING]), knockout([entry('rolled')]))
    expect(e).toMatchObject({ equipped: true, ownership: 'rolled', knockedOut: true })
    expect(e.autoOwned).toBeUndefined()
  })

  it('a stored Owned state is the user-set state, not the auto default', () => {
    const e = ring(report([RING]), knockout([entry('owned')]))
    expect(e).toMatchObject({ equipped: true, ownership: 'owned' })
    expect(e.autoOwned).toBeUndefined()
  })

  it('re-derives from each report: the same knockout state with different gear changes the default', () => {
    const k = knockout()
    expect(ring(report([RING]), k).ownership).toBe('owned')
    expect(ring(report([999]), k).ownership).toBe('none')
    expect(k.entries).toEqual([])
  })

  it('EV is unchanged for an item that was never simmed (owned = value 0 = not simmed)', () => {
    const withGear = buildBossPools(report([RING]), knockout(), SETTINGS, loot)[0]
    const without = buildBossPools(report([]), knockout(), SETTINGS, loot)[0]
    expect(withGear.ev).toBe(without.ev)
  })

  it('an equipped item with a positive sim delta is an upgrade: keeps its value, state None, not auto-Owned', () => {
    const items = [simmed(1, 2000), simmed(2, 1000), simmed(RING, 3000)]
    const withGear = buildBossPools(report([RING], items), knockout(), SETTINGS, loot)[0]
    const without = buildBossPools(report([], items), knockout(), SETTINGS, loot)[0]
    expect(withGear.ev).toBe(without.ev)
    expect(withGear.pool.find((p) => p.itemIds.includes(RING))).toMatchObject({ equipped: true, equippedUpgrade: true, ownership: 'none', isDud: false, value: 3000 })
  })

  it('an equipped item whose best delta is <= 0 is auto-Owned', () => {
    const e = ring(report([RING], [simmed(1, 2000), simmed(RING, -500)]), knockout())
    expect(e).toMatchObject({ equipped: true, equippedUpgrade: false, autoOwned: true, ownership: 'owned' })
  })

  it('a stored state still wins on an upgrade row', () => {
    const items = [simmed(1, 2000), simmed(RING, 3000)]
    expect(ring(report([RING], items), knockout([entry('owned')]))).toMatchObject({ equippedUpgrade: true, ownership: 'owned' })
    expect(ring(report([RING], items), knockout([entry('rolled')]))).toMatchObject({ equippedUpgrade: true, ownership: 'rolled', knockedOut: true })
  })
})
