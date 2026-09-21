import { describe, expect, it } from 'vitest'
import { buildLootTable } from '../src/lookup/lootTable'
import { buildEncounterItemsLookup } from '../src/lookup/encounterItems'
import type { EncounterItemEntry, InstanceEntry, WeaponSpecEntry } from '../src/types'

const RETRIBUTION = 70
const PROTECTION_PALADIN = 66
const HOLY_PALADIN = 65

// Same "The Venomous Abyss" (1320) / Nek'zali the Soulcoiler (2888) fixture shape as
// test/lootTable.restoShaman.test.ts, plus "Aman'muso, Warlord's Vengeance" -- the item
// from the bug report: a 1H axe with no `specs` list, which the LOOT_SPEC_WEAPON_RULES
// overlay (specs.ts) must exclude for Retribution even though weapon-specs.json's
// equip-based specsCanUse for itemSubClass 0 lists spec 70.
const INSTANCES: InstanceEntry[] = [
  {
    id: 1320,
    name: 'The Venomous Abyss',
    type: 'raid',
    encounters: [{ id: 2888, name: "Nek'zali the Soulcoiler" }],
  },
]

const ITEMS: EncounterItemEntry[] = [
  { id: 268196, name: 'Venom-Slashed Scuteward', itemClass: 4, itemSubClass: 6, inventoryType: 14, sources: [{ instanceId: 1320, encounterId: 2888 }] }, // shield
  { id: 268198, name: 'Caustic Keeper-Crusher', itemClass: 2, itemSubClass: 5, inventoryType: 17, sources: [{ instanceId: 1320, encounterId: 2888 }] }, // 2H mace
  { id: 268206, name: "Slithering Savage's Gavel", itemClass: 2, itemSubClass: 4, inventoryType: 13, sources: [{ instanceId: 1320, encounterId: 2888 }] }, // 1H mace
  {
    id: 268209,
    name: "Aman'muso, Warlord's Vengeance",
    itemClass: 2,
    itemSubClass: 0, // 1H axe
    inventoryType: 13,
    sources: [{ instanceId: 1320, encounterId: 2888 }],
  },
  {
    id: 268213,
    name: "Maze-roa, Warlord's Fury",
    itemClass: 2,
    itemSubClass: 1, // 2H axe
    inventoryType: 17,
    specs: [70, 71, 72, 250, 251, 252, 255, 1455],
    sources: [{ instanceId: 1320, encounterId: 2888 }],
  },
]

// Real specsCanUse lists (Raidbots weapon-specs.json, fetched live 2026-09-20) -- confirms
// weapon-specs.json is equip-based: it lists 70 (Retribution) for 1H axe/mace, which the
// loot-spec overlay must reject.
const WEAPON_SPECS: WeaponSpecEntry[] = [
  { itemClass: 4, itemSubClass: 6, specsCanDrop: [], specsCanUse: [65, 66, 70, 71, 72, 73, 262, 263, 264] }, // shield
  { itemClass: 2, itemSubClass: 5, specsCanDrop: [], specsCanUse: [65, 66, 70, 71, 72, 73, 102, 103, 104, 105, 250, 251, 252, 262, 263, 264, 1467, 1468, 1473] }, // 2H mace
  { itemClass: 2, itemSubClass: 4, specsCanDrop: [], specsCanUse: [65, 66, 70, 71, 72, 73, 102, 103, 104, 105, 250, 251, 252, 256, 257, 258, 259, 260, 261, 262, 263, 264, 268, 269, 270, 1467, 1468, 1473] }, // 1H mace
  { itemClass: 2, itemSubClass: 0, specsCanDrop: [], specsCanUse: [65, 66, 70, 71, 72, 73, 250, 251, 252, 253, 254, 255, 259, 260, 261, 262, 263, 264, 268, 269, 270, 577, 581, 1467, 1468, 1473, 1480] }, // 1H axe
  { itemClass: 2, itemSubClass: 1, specsCanDrop: [], specsCanUse: [65, 66, 70, 71, 72, 73, 102, 103, 104, 105, 250, 251, 252, 262, 263, 264, 1467, 1468, 1473] }, // 2H axe
]

function itemIds(specId: number): number[] {
  const lookup = buildEncounterItemsLookup(ITEMS, INSTANCES, {}, {}, WEAPON_SPECS)
  const table = buildLootTable(1320, specId, lookup)
  return table.find((e) => e.encounterId === 2888)!.items.map((i) => i.itemId)
}

describe('buildLootTable weapon-shape loot-spec overlay for Paladin specs', () => {
  it('Retribution: excludes Aman\'muso (1H axe, equip-based table wrongly lists spec 70)', () => {
    expect(itemIds(RETRIBUTION)).not.toContain(268209)
  })

  it('Retribution: includes Maze-roa (2H axe, explicit specs list includes 70)', () => {
    expect(itemIds(RETRIBUTION)).toContain(268213)
  })

  it('Retribution: no 1H weapons at all', () => {
    const ids = itemIds(RETRIBUTION)
    expect(ids).not.toContain(268209) // 1H axe
    expect(ids).not.toContain(268206) // 1H mace
  })

  it('Retribution: shields absent', () => {
    expect(itemIds(RETRIBUTION)).not.toContain(268196)
  })

  it('Retribution: 2H mace present', () => {
    expect(itemIds(RETRIBUTION)).toContain(268198)
  })

  it('Protection Paladin: no 2H weapons', () => {
    const ids = itemIds(PROTECTION_PALADIN)
    expect(ids).not.toContain(268198) // 2H mace
    expect(ids).not.toContain(268213) // 2H axe (Maze-roa excludes 66 anyway via specs list)
  })

  it('Protection Paladin: shields present', () => {
    expect(itemIds(PROTECTION_PALADIN)).toContain(268196)
  })

  it('Protection Paladin: 1H weapons present', () => {
    const ids = itemIds(PROTECTION_PALADIN)
    expect(ids).toContain(268209) // 1H axe
    expect(ids).toContain(268206) // 1H mace
  })

  it('Holy Paladin: 1H + shield/off-hand present, no 2H', () => {
    const ids = itemIds(HOLY_PALADIN)
    expect(ids).toContain(268196) // shield
    expect(ids).toContain(268209) // 1H axe
    expect(ids).toContain(268206) // 1H mace
    expect(ids).not.toContain(268198) // 2H mace
  })
})
