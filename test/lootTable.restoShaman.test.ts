import { describe, expect, it } from 'vitest'
import { buildLootTable } from '../src/lookup/lootTable'
import { buildEncounterItemsLookup } from '../src/lookup/encounterItems'
import type { EncounterItemEntry, InstanceEntry, WeaponSpecEntry } from '../src/types'

const RESTO_SHAMAN = 264
const ELEMENTAL_SHAMAN = 262
const ENHANCEMENT_SHAMAN = 263

// Real instance 1320 ("The Venomous Abyss") shape: Nek'zali the Soulcoiler (2888) is
// the seed table's only non-tier, non-curio boss, so it's used here as a plain weapon
// drop boss. Item ids/subclasses/specs below are the real live values fetched from
// Raidbots static data on 2026-09-08 (encounter-items.json / weapon-specs.json),
// verified against a live /loot-table/1320 response.
const INSTANCES: InstanceEntry[] = [
  {
    id: 1320,
    name: 'The Venomous Abyss',
    type: 'raid',
    encounters: [{ id: 2888, name: "Nek'zali the Soulcoiler" }],
  },
]

const ITEMS: EncounterItemEntry[] = [
  { id: 268196, name: 'Venom-Slashed Scuteward', itemClass: 4, itemSubClass: 6, inventoryType: 14, sources: [{ instanceId: 1320, encounterId: 2888 }] },
  { id: 268198, name: 'Caustic Keeper-Crusher', itemClass: 2, itemSubClass: 5, inventoryType: 17, sources: [{ instanceId: 1320, encounterId: 2888 }] },
  { id: 268206, name: 'Slithering Savage\'s Gavel', itemClass: 2, itemSubClass: 4, inventoryType: 13, sources: [{ instanceId: 1320, encounterId: 2888 }] },
  { id: 268208, name: 'Strongblood\'s Ceremonial Cleaver', itemClass: 2, itemSubClass: 0, inventoryType: 13, sources: [{ instanceId: 1320, encounterId: 2888 }] },
  { id: 268203, name: 'Hexing Spiritrender', itemClass: 2, itemSubClass: 15, inventoryType: 13, sources: [{ instanceId: 1320, encounterId: 2888 }] },
  { id: 270930, name: "Tomb-Creeper's Claw", itemClass: 2, itemSubClass: 13, inventoryType: 13, sources: [{ instanceId: 1320, encounterId: 2888 }] },
  { id: 268205, name: "Venomancer's Winged Channeler", itemClass: 2, itemSubClass: 10, inventoryType: 17, sources: [{ instanceId: 1320, encounterId: 2888 }] },
  { id: 268202, name: 'Jaw of the Shackled Goddess', itemClass: 2, itemSubClass: 7, inventoryType: 13, sources: [{ instanceId: 1320, encounterId: 2888 }] }, // 1H sword
  { id: 268215, name: "Abyssal Broodfiend's Bardiche", itemClass: 2, itemSubClass: 6, inventoryType: 17, sources: [{ instanceId: 1320, encounterId: 2888 }] }, // polearm
  { id: 268207, name: 'Caustic Repose Greatbow', itemClass: 2, itemSubClass: 2, inventoryType: 15, sources: [{ instanceId: 1320, encounterId: 2888 }] }, // bow
  {
    id: 268213,
    name: "Maze-roa, Warlord's Fury",
    itemClass: 2,
    itemSubClass: 1, // 2H axe
    inventoryType: 17,
    specs: [70, 71, 72, 250, 251, 252, 255, 1455], // excludes all 3 shaman specs
    sources: [{ instanceId: 1320, encounterId: 2888 }],
  },
]

// Real specsCanUse lists (Raidbots weapon-specs.json, 2026-09-08) for the subclasses above.
const WEAPON_SPECS: WeaponSpecEntry[] = [
  { itemClass: 4, itemSubClass: 6, specsCanDrop: [], specsCanUse: [65, 66, 70, 71, 72, 73, 262, 263, 264] }, // shield
  { itemClass: 2, itemSubClass: 5, specsCanDrop: [], specsCanUse: [65, 66, 70, 71, 72, 73, 102, 103, 104, 105, 250, 251, 252, 262, 263, 264, 1467, 1468, 1473] }, // 2H mace
  { itemClass: 2, itemSubClass: 4, specsCanDrop: [], specsCanUse: [65, 66, 70, 71, 72, 73, 102, 103, 104, 105, 250, 251, 252, 256, 257, 258, 259, 260, 261, 262, 263, 264, 268, 269, 270, 1467, 1468, 1473] }, // 1H mace
  { itemClass: 2, itemSubClass: 0, specsCanDrop: [], specsCanUse: [65, 66, 70, 71, 72, 73, 250, 251, 252, 253, 254, 255, 259, 260, 261, 262, 263, 264, 268, 269, 270, 577, 581, 1467, 1468, 1473, 1480] }, // 1H axe
  { itemClass: 2, itemSubClass: 15, specsCanDrop: [], specsCanUse: [62, 63, 64, 71, 72, 73, 102, 103, 104, 105, 253, 254, 255, 256, 257, 258, 259, 260, 261, 262, 263, 264, 265, 266, 267, 577, 581, 1467, 1468, 1473, 1480] }, // dagger
  { itemClass: 2, itemSubClass: 13, specsCanDrop: [], specsCanUse: [71, 72, 73, 102, 103, 104, 105, 253, 254, 255, 259, 260, 261, 262, 263, 264, 268, 269, 270, 577, 581, 1467, 1468, 1473, 1480] }, // fist
  { itemClass: 2, itemSubClass: 10, specsCanDrop: [], specsCanUse: [62, 63, 64, 71, 72, 73, 102, 103, 104, 105, 253, 254, 255, 256, 257, 258, 262, 263, 264, 265, 266, 267, 268, 269, 270, 1467, 1468, 1473] }, // staff
  { itemClass: 2, itemSubClass: 7, specsCanDrop: [], specsCanUse: [62, 63, 64, 65, 66, 70, 71, 72, 73, 250, 251, 252, 253, 254, 255, 259, 260, 261, 265, 266, 267, 268, 269, 270, 577, 581, 1467, 1468, 1473, 1480] }, // 1H sword
  { itemClass: 2, itemSubClass: 6, specsCanDrop: [], specsCanUse: [65, 66, 70, 71, 72, 73, 102, 103, 104, 105, 250, 251, 252, 253, 254, 255, 268, 269, 270] }, // polearm
  { itemClass: 2, itemSubClass: 2, specsCanDrop: [], specsCanUse: [253, 254] }, // bow
  { itemClass: 2, itemSubClass: 1, specsCanDrop: [], specsCanUse: [65, 66, 70, 71, 72, 73, 102, 103, 104, 105, 250, 251, 252, 262, 263, 264, 1467, 1468, 1473] }, // 2H axe
]

function buildTable(specId: number) {
  const lookup = buildEncounterItemsLookup(ITEMS, INSTANCES, {}, {}, WEAPON_SPECS)
  return buildLootTable(1320, specId, lookup)
}

function itemIds(specId: number): number[] {
  const table = buildTable(specId)
  return table.find((e) => e.encounterId === 2888)!.items.map((i) => i.itemId)
}

describe('buildLootTable weapon/shield eligibility for Restoration Shaman (regression, real live data 2026-09-08)', () => {
  it('includes at least one shield', () => {
    expect(itemIds(RESTO_SHAMAN)).toContain(268196)
  })

  it('includes the 2H mace this raid drops', () => {
    expect(itemIds(RESTO_SHAMAN)).toContain(268198)
  })

  it('excludes Maze-roa because its `specs` list excludes 264', () => {
    expect(itemIds(RESTO_SHAMAN)).not.toContain(268213)
  })

  it('excludes swords, polearms, and ranged weapons', () => {
    const ids = itemIds(RESTO_SHAMAN)
    expect(ids).not.toContain(268202) // 1H sword
    expect(ids).not.toContain(268215) // polearm
    expect(ids).not.toContain(268207) // bow
  })

  it('includes the usable weapon types: 1H mace, 1H axe, dagger, fist, staff', () => {
    const ids = itemIds(RESTO_SHAMAN)
    expect(ids).toContain(268206) // 1H mace
    expect(ids).toContain(268208) // 1H axe
    expect(ids).toContain(268203) // dagger
    expect(ids).toContain(270930) // fist
    expect(ids).toContain(268205) // staff
  })

  it('Elemental and Enhancement share the same weapon eligibility as Restoration for this data set (per weapon-specs.json, shields are usable by all 3 shaman specs)', () => {
    const resto = itemIds(RESTO_SHAMAN).sort()
    const elemental = itemIds(ELEMENTAL_SHAMAN).sort()
    const enhancement = itemIds(ENHANCEMENT_SHAMAN).sort()
    expect(elemental).toEqual(resto)
    expect(enhancement).toEqual(resto)
  })
})
