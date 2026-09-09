import { describe, expect, it } from 'vitest'
import { buildLootTable } from '../src/lookup/lootTable'
import { buildEncounterItemsLookup } from '../src/lookup/encounterItems'
import type { EncounterItemEntry, InstanceEntry, WeaponSpecEntry } from '../src/types'

const ELEMENTAL_SHAMAN = 262 // classId 7, mail
const FROST_MAGE = 64 // classId 8, cloth
const ARMS_WARRIOR = 71 // classId 1, plate

// Instance 1320's real tier-slot seed: 2887 "The Twin Fangs" = head, 2895 "Ula'tek" = curio
// (see src/lookup/tierSeed.ts) -- reused here since the seed table is keyed by instanceId,
// not injectable per-test.
const INSTANCES: InstanceEntry[] = [
  {
    id: 1320,
    name: 'The Venomous Abyss',
    type: 'raid',
    encounters: [
      { id: 2874, name: 'Entombed Sentinels' },
      { id: 2887, name: 'The Twin Fangs' },
      { id: 2895, name: "Ula'tek" },
      { id: -97, name: 'Trash Drop', trash: true },
    ],
  },
]

const ITEMS: EncounterItemEntry[] = [
  { id: 5000, name: 'Mail Legs of Testing', itemClass: 4, itemSubClass: 3, inventoryType: 7, sources: [{ instanceId: 1320, encounterId: 2887 }] },
  { id: 5001, name: 'Plate Legs of Testing', itemClass: 4, itemSubClass: 4, inventoryType: 7, sources: [{ instanceId: 1320, encounterId: 2887 }] },
  { id: 5002, name: 'Cloth Legs of Testing', itemClass: 4, itemSubClass: 1, inventoryType: 7, sources: [{ instanceId: 1320, encounterId: 2887 }] },
  { id: 5004, name: 'Ring of Testing', itemClass: 4, itemSubClass: 0, inventoryType: 11, sources: [{ instanceId: 1320, encounterId: 2887 }] },
  {
    id: 5003,
    name: 'Restricted Trinket of Testing',
    itemClass: 4,
    itemSubClass: 0,
    inventoryType: 12,
    specs: [262, 263, 264], // Shaman specs only
    sources: [{ instanceId: 1320, encounterId: 2874 }],
  },
  // Curio + its per-class contains list, mirroring live Slumbering Coil Curio / Ophidian Oracle's Prophecy shape.
  { id: 5010, name: 'Test Curio', itemClass: 5, itemSubClass: 2, sources: [{ instanceId: 1320, encounterId: 2895 }], contains: [5011, 5012, 5013] },
  { id: 5011, name: 'Shaman Head Token', itemClass: 4, itemSubClass: 3, inventoryType: 1, itemSetId: 9999, allowableClasses: [7], sources: [{ instanceId: -100, encounterId: -100 }] },
  { id: 5012, name: 'Mage Head Token', itemClass: 4, itemSubClass: 1, inventoryType: 1, itemSetId: 9999, allowableClasses: [8], sources: [{ instanceId: -100, encounterId: -100 }] },
  { id: 5013, name: 'Warrior Head Token', itemClass: 4, itemSubClass: 4, inventoryType: 1, itemSetId: 9999, allowableClasses: [1], sources: [{ instanceId: -100, encounterId: -100 }] },
]

const WEAPON_SPECS: WeaponSpecEntry[] = []

function buildTable(specId: number) {
  const lookup = buildEncounterItemsLookup(ITEMS, INSTANCES, {}, {}, WEAPON_SPECS)
  return buildLootTable(1320, specId, lookup)
}

function itemIds(encounters: ReturnType<typeof buildTable>, encounterId: number): number[] {
  return encounters.find((e) => e.encounterId === encounterId)!.items.map((i) => i.itemId)
}

describe('buildLootTable', () => {
  it('excludes trash encounters', () => {
    const table = buildTable(ELEMENTAL_SHAMAN)
    expect(table.find((e) => e.encounterId === -97)).toBeUndefined()
  })

  it('shows a mail spec only mail armor, the universal ring, and its own tier token at the head boss', () => {
    const ids = itemIds(buildTable(ELEMENTAL_SHAMAN), 2887)
    expect(ids.sort()).toEqual([5000, 5004, 5011].sort())
  })

  it('shows a cloth spec only cloth armor, the universal ring, and its own tier token at the head boss', () => {
    const ids = itemIds(buildTable(FROST_MAGE), 2887)
    expect(ids.sort()).toEqual([5002, 5004, 5012].sort())
  })

  it('shows a plate spec only plate armor, the universal ring, and its own tier token at the head boss -- a plate item never appears for a mage', () => {
    const ids = itemIds(buildTable(ARMS_WARRIOR), 2887)
    expect(ids.sort()).toEqual([5001, 5004, 5013].sort())
    expect(itemIds(buildTable(FROST_MAGE), 2887)).not.toContain(5001)
  })

  it('resolves the tier token at the direct slot boss as non-curio', () => {
    const table = buildTable(ELEMENTAL_SHAMAN)
    const row = table.find((e) => e.encounterId === 2887)!.items.find((i) => i.itemId === 5011)!
    expect(row).toMatchObject({ isTier: true, viaCurio: false, tierSlot: 'head' })
  })

  it("resolves the curio boss's tier item through the curio's `contains` list, marked viaCurio", () => {
    const table = buildTable(ELEMENTAL_SHAMAN)
    const curioRow = table.find((e) => e.encounterId === 2895)!
    expect(curioRow.items.map((i) => i.itemId)).toEqual([5011])
    expect(curioRow.items[0]).toMatchObject({ isTier: true, viaCurio: true, tierSlot: 'head' })
  })

  it('gives each class its own curio-resolved item, never leaking another class\'s tier token', () => {
    expect(itemIds(buildTable(FROST_MAGE), 2895)).toEqual([5012])
    expect(itemIds(buildTable(ARMS_WARRIOR), 2895)).toEqual([5013])
  })

  it('restricts a `specs`-restricted trinket to only the listed specs', () => {
    expect(itemIds(buildTable(ELEMENTAL_SHAMAN), 2874)).toContain(5003)
    expect(itemIds(buildTable(FROST_MAGE), 2874)).not.toContain(5003)
    expect(itemIds(buildTable(ARMS_WARRIOR), 2874)).not.toContain(5003)
  })

  it('marks the specs-restricted trinket specSpecific, and unrestricted armor not specSpecific', () => {
    const table = buildTable(ELEMENTAL_SHAMAN)
    const trinket = table.find((e) => e.encounterId === 2874)!.items.find((i) => i.itemId === 5003)!
    expect(trinket.specSpecific).toBe(true)
    const legs = table.find((e) => e.encounterId === 2887)!.items.find((i) => i.itemId === 5000)!
    expect(legs.specSpecific).toBe(false)
  })

  it('returns an empty list for an unknown loot spec id', () => {
    expect(buildTable(999999)).toEqual([])
  })
})
