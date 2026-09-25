import { describe, expect, it } from 'vitest'
import { buildBossPools } from '../src/core/pool'
import { createState } from '../src/core/knockout'
import { normalizeRaidbotsReport } from '../src/normalize/raidbots'
import { buildLootTable } from '../src/lookup/lootTable'
import type { Settings } from '../src/core/types'
import type { LootTableEncounter, LootTableItem, NormalizedItem, NormalizedReport } from '../src/types'
import { loadLookup, loadMplusRaw, loadRaidRaw, MPLUS_REPORT_ID, RAID_REPORT_ID } from './fixtures/load'

const BASELINE = 100000
const SETTINGS: Settings = { thresholdPct: 0.2, rollsAvailable: 1, includeOffSpec: false, lootSpecId: 62 }

function row(overrides: Partial<NormalizedItem>): NormalizedItem {
  return { itemId: 1, name: 'Item', encounterId: 2883, encounterName: 'The Coiled Altar', instanceId: 1320, ilvl: 334, delta: 0, pct: 0, ...overrides }
}

function report(items: NormalizedItem[], overrides: Partial<NormalizedReport> = {}): NormalizedReport {
  return {
    source: 'raidbots',
    reportId: 'r',
    character: 'Icemagus',
    spec: 'arcane',
    role: 'dps',
    metric: 'dps',
    contentType: 'raid',
    difficulty: 'raid-vault-mythic',
    baseline: BASELINE,
    items,
    warnings: [],
    ...overrides,
  }
}

function lootItem(itemId: number, name: string, extra: Partial<LootTableItem> = {}): LootTableItem {
  return { itemId, name, specSpecific: false, uniqueEquipped: false, onUseTrinket: false, isTier: false, viaCurio: false, ...extra }
}

const GRASPS = 268243
const MANASHAPERS = 271565

describe('catalyst max rule (raid)', () => {
  it('credits the source item with its catalyzed tier piece when that is worth more, and adds no separate tier entry', () => {
    const rpt = report([
      row({ itemId: GRASPS, name: 'Grasps of the Eternal Shadow', delta: -50 }),
      row({ itemId: MANASHAPERS, name: "Primal Leywarden's Manashapers", slot: 'hands', delta: 1489, catalystSourceId: GRASPS }),
      row({ itemId: 2, name: 'Idol', delta: 1280 }),
    ])
    const [boss] = buildBossPools(rpt, createState('Icemagus', 'raid-vault-mythic'), SETTINGS)
    expect(boss.pool.map((p) => p.key).sort()).toEqual(['item:2', `item:${GRASPS}`])
    const grasps = boss.pool.find((p) => p.key === `item:${GRASPS}`)!
    expect(grasps).toMatchObject({ name: 'Grasps of the Eternal Shadow', value: 1489, pct: 1.489 })
    expect(grasps.catalyst).toEqual({ itemId: MANASHAPERS, name: "Primal Leywarden's Manashapers", tierSlot: 'hands', pct: 1.489, ownPct: 0 })
    expect(boss.ev).toBeCloseTo((1489 + 1280) / 2)
  })

  it("keeps the item's own value, with no catalyst note, when the item beats its catalyzed piece", () => {
    const rpt = report([
      row({ itemId: 268241, name: 'Ornaments of the Eternal Coil', delta: 1173 }),
      row({ itemId: 271562, name: "Primal Leywarden's Manaflux", slot: 'shoulder', delta: 1138, catalystSourceId: 268241 }),
    ])
    const [boss] = buildBossPools(rpt, createState('Icemagus', 'raid-vault-mythic'), SETTINGS)
    expect(boss.pool).toHaveLength(1)
    expect(boss.pool[0]).toMatchObject({ value: 1173 })
    expect(boss.pool[0].catalyst).toBeUndefined()
  })

  it('shows no catalyst credit when the catalyzed piece is not a net upgrade', () => {
    const rpt = report([
      row({ itemId: 10, name: 'Cloak', delta: -300 }),
      row({ itemId: 11, name: 'Tier Chest', slot: 'chest', delta: -100, catalystSourceId: 10 }),
    ])
    const [boss] = buildBossPools(rpt, createState('Icemagus', 'raid-vault-mythic'), SETTINGS)
    expect(boss.pool).toHaveLength(1)
    expect(boss.pool[0]).toMatchObject({ key: 'item:10', value: 0 })
    expect(boss.pool[0].catalyst).toBeUndefined()
  })

  it("does not let a catalyst row inflate the same boss's direct tier drop of that piece", () => {
    const rpt = report([
      row({ itemId: 271564, name: 'Crown of the Primal Leywarden', slot: 'head', tierSlot: 'head', delta: 658 }),
      row({ itemId: 271564, name: 'Crown of the Primal Leywarden', slot: 'head', delta: 843, catalystSourceId: 268242 }),
      row({ itemId: 268242, name: "Errant Scrollsage's Hood", delta: -10 }),
    ])
    const [boss] = buildBossPools(rpt, createState('Icemagus', 'raid-vault-mythic'), SETTINGS)
    expect(boss.pool.find((p) => p.key === 'item:271564')?.value).toBe(658)
    expect(boss.pool.find((p) => p.key === 'item:268242')).toMatchObject({ value: 843, catalyst: { name: 'Crown of the Primal Leywarden' } })
  })

  it('keeps catalyst rows out of the pool even when the tier piece is a curio option; they credit the source instead (Cowl -> Crown)', () => {
    const table: LootTableEncounter[] = [
      {
        encounterId: 2895,
        encounterName: "Ula'tek",
        items: [lootItem(271874, "Venomkeeper's Horrific Cowl"), lootItem(271564, 'Crown', { isTier: true, viaCurio: true, tierSlot: 'head' }), lootItem(271563, 'Legwraps', { isTier: true, viaCurio: true, tierSlot: 'legs' })],
      },
    ]
    const ula = (o: Partial<NormalizedItem>) => row({ encounterId: 2895, encounterName: "Ula'tek", ...o })
    const rpt = report([
      ula({ itemId: 271874, name: "Venomkeeper's Horrific Cowl", delta: -20 }),
      ula({ itemId: 271564, name: 'Crown', slot: 'head', delta: 1316 }),
      ula({ itemId: 271563, name: 'Legwraps', slot: 'legs', delta: 1903 }),
      ula({ itemId: 271564, name: 'Crown', slot: 'head', delta: 2500, catalystSourceId: 271874 }),
    ])
    const [boss] = buildBossPools(rpt, createState('Icemagus', 'raid-vault-mythic'), SETTINGS, table)
    // The curio's own tier pieces (Crown/Legwraps as curio options) are not pool entries.
    expect(boss.pool.map((p) => p.key)).toEqual(['item:271874'])
    expect(boss.pool[0]).toMatchObject({ value: 2500, catalyst: { name: 'Crown', pct: 2.5 } })
  })

  it('names a source item simmed only via its catalyst row from the report, else the loot table', () => {
    const table: LootTableEncounter[] = [{ encounterId: 2883, encounterName: 'The Coiled Altar', items: [lootItem(GRASPS, 'Grasps (loot table name)')] }]
    const rpt = report([row({ itemId: MANASHAPERS, name: 'Manashapers', slot: 'hands', delta: 900, catalystSourceId: GRASPS })])
    const [boss] = buildBossPools(rpt, createState('Icemagus', 'raid-vault-mythic'), SETTINGS, table)
    expect(boss.pool).toHaveLength(1)
    expect(boss.pool[0]).toMatchObject({ key: `item:${GRASPS}`, name: 'Grasps (loot table name)', value: 900, catalyst: { ownPct: 0 } })
    expect(boss.pool[0].notInSimReport).toBeUndefined()
  })
})

describe('catalyst max rule on the live fixtures', () => {
  const lookup = loadLookup()

  it('raid 6PTZ7: catalyst credit moves the per-boss EVs (before: separate tier-piece entries)', () => {
    // Before this rule each catalyst row was its own pool entry keyed by the tier piece
    // (e.g. a 6th Coiled Altar entry "Manashapers 1.489%" not in its loot table) while the
    // source item stayed at 0. Before -> after, % of baseline:
    //   Coiled Altar 0.676 -> 0.812 (pool 6 -> 5), Ula'tek 0.588 -> 0.798, Lost Explorers 0.461 -> 0.614,
    //   Twin Fangs 0.495 -> 0.366 (its phantom Manaflux entry is gone), Nek'zali 0.279 -> 0.349;
    //   Sszorak 0.648, Entombed Sentinels 0.278, Vashnik 0.245 unchanged.
    // Then the curio stopped being a pool entry (2026-09-24): Ula'tek 0.798 (7 entries) -> 0.614 (6).
    const rpt = normalizeRaidbotsReport(RAID_REPORT_ID, loadRaidRaw(), lookup)
    const evals = buildBossPools(rpt, createState(rpt.character, rpt.difficulty), SETTINGS, buildLootTable(1320, 62, lookup))
    const ev = Object.fromEntries(evals.map((b) => [b.encounterName, Number(b.evPct.toFixed(3))]))
    expect(ev).toEqual({
      'The Coiled Altar': 0.812,
      "Ula'tek": 0.614,
      Sszorak: 0.648,
      'The Lost Explorers': 0.614,
      'The Twin Fangs': 0.366,
      "Nek'zali the Soulcoiler": 0.349,
      'Entombed Sentinels': 0.278,
      'Vashnik the Malignant': 0.245,
    })
    const altar = evals.find((b) => b.encounterId === 2883)!
    expect(altar.pool).toHaveLength(5)
    expect(altar.bestCase).toMatchObject({ name: 'Grasps of the Eternal Shadow', catalyst: { name: "Primal Leywarden's Manashapers" } })
  })

  it('M+ a8URT: the same rule credits dungeon drops with their catalyzed tier piece', () => {
    const rpt = normalizeRaidbotsReport(MPLUS_REPORT_ID, loadMplusRaw(), lookup)
    const evals = buildBossPools(rpt, createState(rpt.character, 'mplus-myth'), SETTINGS, buildLootTable(-1, 62, lookup))
    const altar = evals.find((b) => b.encounterId === 1322)!
    const source = altar.pool.find((p) => p.itemIds.includes(273786))!
    expect(source.catalyst).toMatchObject({ itemId: 271563, name: "Primal Leywarden's Tailored Legwraps" })
    expect(source.pct).toBeCloseTo(1.12, 2)
    // No tier piece becomes a pool entry of its own: every dungeon pool is exactly its loot table.
    for (const b of evals) expect(b.pool.every((p) => !p.itemIds.some((id) => [271562, 271563, 271564, 271565, 271567].includes(id)))).toBe(true)
    expect(evals.reduce((n, b) => n + b.pool.length, 0)).toBe(80)
  })
})
