import { describe, expect, it } from 'vitest'
import { isItemEligibleForSpec } from '../src/lookup/lootEligibility'
import { buildEncounterItemsLookup } from '../src/lookup/encounterItems'
import type { EncounterItemEntry, EncounterItemsLookup, WeaponSpecEntry } from '../src/types'

const ELEMENTAL_SHAMAN = 262 // classId 7, mail
const FROST_MAGE = 64 // classId 8, cloth
const ARMS_WARRIOR = 71 // classId 1, plate

const WEAPON_SPECS: WeaponSpecEntry[] = [
  // Daggers: caster/rogue specs only (mirrors the real itemClass 2 / itemSubClass 15 entry).
  { itemClass: 2, itemSubClass: 15, specsCanDrop: [], specsCanUse: [62, 63, 64, 258, 265, 266, 267, 259, 260, 261] },
]

function lookup(items: EncounterItemEntry[]): EncounterItemsLookup {
  return buildEncounterItemsLookup(items, [], {}, {}, WEAPON_SPECS)
}

describe('isItemEligibleForSpec', () => {
  it('restricts armor by itemSubClass to the matching armor-type classes (plate never eligible for a mage)', () => {
    const plateLegs: EncounterItemEntry = { id: 1, name: 'Plate Legs', itemClass: 4, itemSubClass: 4, inventoryType: 7, sources: [] }
    const l = lookup([plateLegs])
    expect(isItemEligibleForSpec(plateLegs, ARMS_WARRIOR, 1, l)).toBe(true)
    expect(isItemEligibleForSpec(plateLegs, FROST_MAGE, 8, l)).toBe(false)
    expect(isItemEligibleForSpec(plateLegs, ELEMENTAL_SHAMAN, 7, l)).toBe(false)
  })

  it('restricts cloth armor to cloth classes only', () => {
    const clothLegs: EncounterItemEntry = { id: 2, name: 'Cloth Legs', itemClass: 4, itemSubClass: 1, inventoryType: 7, sources: [] }
    const l = lookup([clothLegs])
    expect(isItemEligibleForSpec(clothLegs, FROST_MAGE, 8, l)).toBe(true)
    expect(isItemEligibleForSpec(clothLegs, ARMS_WARRIOR, 1, l)).toBe(false)
  })

  it('restricts mail armor to mail classes only', () => {
    const mailLegs: EncounterItemEntry = { id: 3, name: 'Mail Legs', itemClass: 4, itemSubClass: 3, inventoryType: 7, sources: [] }
    const l = lookup([mailLegs])
    expect(isItemEligibleForSpec(mailLegs, ELEMENTAL_SHAMAN, 7, l)).toBe(true)
    expect(isItemEligibleForSpec(mailLegs, FROST_MAGE, 8, l)).toBe(false)
  })

  it('treats neck/ring/trinket/cloak inventory types as universal regardless of itemSubClass', () => {
    const ring: EncounterItemEntry = { id: 4, name: 'Ring', itemClass: 4, itemSubClass: 0, inventoryType: 11, sources: [] }
    const cloak: EncounterItemEntry = { id: 5, name: 'Cloak', itemClass: 4, itemSubClass: 1, inventoryType: 16, sources: [] }
    const l = lookup([ring, cloak])
    for (const spec of [ELEMENTAL_SHAMAN, FROST_MAGE, ARMS_WARRIOR]) {
      expect(isItemEligibleForSpec(ring, spec, 1, l)).toBe(true)
      expect(isItemEligibleForSpec(cloak, spec, 1, l)).toBe(true)
    }
  })

  it("uses the item's own `specs` field when present, ignoring armor-type rules", () => {
    const restrictedTrinket: EncounterItemEntry = {
      id: 6,
      name: 'Trinket',
      itemClass: 4,
      itemSubClass: 0,
      inventoryType: 12,
      specs: [262, 263, 264],
      sources: [],
    }
    const l = lookup([restrictedTrinket])
    expect(isItemEligibleForSpec(restrictedTrinket, ELEMENTAL_SHAMAN, 7, l)).toBe(true)
    expect(isItemEligibleForSpec(restrictedTrinket, FROST_MAGE, 8, l)).toBe(false)
    expect(isItemEligibleForSpec(restrictedTrinket, ARMS_WARRIOR, 1, l)).toBe(false)
  })

  it("uses the item's own `allowableClasses` field when present (tier tokens)", () => {
    const shamanToken: EncounterItemEntry = { id: 7, name: 'Shaman Token', itemClass: 4, itemSubClass: 3, allowableClasses: [7], sources: [] }
    const l = lookup([shamanToken])
    expect(isItemEligibleForSpec(shamanToken, ELEMENTAL_SHAMAN, 7, l)).toBe(true)
    expect(isItemEligibleForSpec(shamanToken, FROST_MAGE, 8, l)).toBe(false)
  })

  it('filters weapons by weapon-specs.json specsCanUse for the itemSubClass', () => {
    const dagger: EncounterItemEntry = { id: 8, name: 'Dagger', itemClass: 2, itemSubClass: 15, inventoryType: 13, sources: [] }
    const l = lookup([dagger])
    expect(isItemEligibleForSpec(dagger, FROST_MAGE, 8, l)).toBe(true)
    expect(isItemEligibleForSpec(dagger, ELEMENTAL_SHAMAN, 7, l)).toBe(false)
    expect(isItemEligibleForSpec(dagger, ARMS_WARRIOR, 1, l)).toBe(false)
  })

  it('does not restrict a weapon subclass with no weapon-specs.json entry', () => {
    const unknownWeapon: EncounterItemEntry = { id: 9, name: 'Mystery Weapon', itemClass: 2, itemSubClass: 99, sources: [] }
    const l = lookup([unknownWeapon])
    expect(isItemEligibleForSpec(unknownWeapon, ELEMENTAL_SHAMAN, 7, l)).toBe(true)
  })
})
