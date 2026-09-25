import { describe, expect, it } from 'vitest'
import { isItemEligibleForSpec } from '../src/lookup/lootEligibility'
import { buildEncounterItemsLookup } from '../src/lookup/encounterItems'
import { buildLootTable } from '../src/lookup/lootTable'
import { itemPrimaryStats } from '../src/lookup/specs'
import type { EncounterItemEntry, EncounterItemsLookup, WeaponSpecEntry } from '../src/types'
import { loadLookup } from './fixtures/load'

const ARCANE = 62
const HOLY_PALADIN = 65
const RETRIBUTION = 70
const RESTO_SHAMAN = 264
const ENHANCEMENT = 263
const HAVOC = 577
const DEVOURER = 1480

const STR = 4
const AGI = 3
const INT = 5
const STAMINA = 7
const HASTE = 36

// Real weapon-specs.json equip-based lists (2026-09-24): sword / dagger list every caster spec, and
// 2H mace / shield list the paladin + shaman specs -- none of them know about primary stat.
const WEAPON_SPECS: WeaponSpecEntry[] = [
  { itemClass: 2, itemSubClass: 7, specsCanDrop: [], specsCanUse: [62, 63, 64, 65, 66, 70, 71, 72, 73, 250, 251, 252, 253, 254, 255, 259, 260, 261, 265, 266, 267, 268, 269, 270, 577, 581, 1467, 1468, 1473, 1480] },
  { itemClass: 2, itemSubClass: 15, specsCanDrop: [], specsCanUse: [62, 63, 64, 73, 102, 105, 255, 256, 257, 258, 259, 261, 262, 264, 265, 266, 267, 1467, 1468, 1473, 1480] },
  { itemClass: 2, itemSubClass: 5, specsCanDrop: [], specsCanUse: [65, 66, 70, 71, 72, 73, 102, 103, 104, 105, 250, 251, 252, 262, 263, 264, 1467, 1468, 1473] },
  { itemClass: 4, itemSubClass: 6, specsCanDrop: [], specsCanUse: [65, 66, 70, 71, 72, 73, 262, 263, 264] },
]

const lookup = (items: EncounterItemEntry[]): EncounterItemsLookup => buildEncounterItemsLookup(items, [], {}, {}, WEAPON_SPECS)
const stats = (...ids: number[]) => ids.map((id) => ({ id, alloc: 5000 }))
const weapon = (id: number, itemSubClass: number, primary: number[]): EncounterItemEntry => ({
  id,
  name: `Weapon ${id}`,
  itemClass: 2,
  itemSubClass,
  inventoryType: itemSubClass === 5 ? 17 : 13,
  stats: stats(...primary, STAMINA, HASTE),
  sources: [],
})

describe('itemPrimaryStats', () => {
  it('reads the primary stat ids, including the multi-primary variants, and ignores secondary stats', () => {
    expect([...itemPrimaryStats(stats(STR, STAMINA, HASTE))!]).toEqual(['strength'])
    expect([...itemPrimaryStats(stats(INT, STAMINA, INT))!]).toEqual(['intellect'])
    expect([...itemPrimaryStats(stats(72))!].sort()).toEqual(['agility', 'strength'])
    expect([...itemPrimaryStats(stats(73))!].sort()).toEqual(['agility', 'intellect'])
    expect([...itemPrimaryStats(stats(74))!].sort()).toEqual(['intellect', 'strength'])
    expect([...itemPrimaryStats(stats(71))!].sort()).toEqual(['agility', 'intellect', 'strength'])
    expect([...itemPrimaryStats(stats(INT, 73))!].sort()).toEqual(['agility', 'intellect'])
    expect(itemPrimaryStats(stats(STAMINA, HASTE))).toBeUndefined()
    expect(itemPrimaryStats(undefined)).toBeUndefined()
  })
})

describe('primary-stat eligibility (Jaw of the Shackled Goddess / Zatha-tek regression)', () => {
  const strSword = weapon(268202, 7, [STR]) // Jaw of the Shackled Goddess: 1H sword, Strength
  const agiDagger = weapon(271093, 15, [AGI]) // Zatha'tek, Breath of Corruption: dagger, Agility
  const intDagger = weapon(271092, 15, [INT]) // Jan'thrazet, the Soul Fang: dagger, Intellect
  const intSword = weapon(268211, 7, [INT]) // Baleful Hexblade: 1H sword, Intellect
  const l = lookup([strSword, agiDagger, intDagger, intSword])

  it('a Mage gets the Intellect sword/dagger but never the Strength sword or Agility dagger, though weapon-specs.json lists Arcane for both weapon types', () => {
    expect(l.weaponSpecs.get('2:7')!.specsCanUse).toContain(ARCANE)
    expect(l.weaponSpecs.get('2:15')!.specsCanUse).toContain(ARCANE)
    expect(isItemEligibleForSpec(intDagger, ARCANE, 8, l)).toBe(true)
    expect(isItemEligibleForSpec(intSword, ARCANE, 8, l)).toBe(true)
    expect(isItemEligibleForSpec(strSword, ARCANE, 8, l)).toBe(false)
    expect(isItemEligibleForSpec(agiDagger, ARCANE, 8, l)).toBe(false)
  })

  it('an Agility dagger is not Resto Shaman loot; the Intellect one is', () => {
    expect(isItemEligibleForSpec(agiDagger, RESTO_SHAMAN, 7, l)).toBe(false)
    expect(isItemEligibleForSpec(intDagger, RESTO_SHAMAN, 7, l)).toBe(true)
  })

  it('does not restrict items with no primary stat, or with no stats at all', () => {
    const ring: EncounterItemEntry = { id: 1, name: 'Ring', itemClass: 4, itemSubClass: 0, inventoryType: 11, stats: stats(STAMINA, HASTE), sources: [] }
    const bare: EncounterItemEntry = { id: 2, name: 'No stats', itemClass: 2, itemSubClass: 7, inventoryType: 13, sources: [] }
    expect(isItemEligibleForSpec(ring, ARCANE, 8, l)).toBe(true)
    expect(isItemEligibleForSpec(bare, ARCANE, 8, l)).toBe(true)
  })

  it('multi-primary items satisfy every spec whose stat they list (Strength/Intellect shield and plate, all-primary cloak)', () => {
    const shield: EncounterItemEntry = { id: 3, name: 'Shield', itemClass: 4, itemSubClass: 6, inventoryType: 14, stats: stats(STR, INT, STAMINA), sources: [] }
    expect(isItemEligibleForSpec(shield, RESTO_SHAMAN, 7, l)).toBe(true) // int
    expect(isItemEligibleForSpec(shield, ENHANCEMENT, 7, l)).toBe(false) // agility only
    const plate: EncounterItemEntry = { id: 4, name: 'Plate', itemClass: 4, itemSubClass: 4, inventoryType: 5, stats: stats(74), sources: [] }
    expect(isItemEligibleForSpec(plate, RETRIBUTION, 2, l)).toBe(true)
    expect(isItemEligibleForSpec(plate, HOLY_PALADIN, 2, l)).toBe(true)
    const cloak: EncounterItemEntry = { id: 5, name: 'Cloak', itemClass: 4, itemSubClass: 1, inventoryType: 16, stats: stats(71), sources: [] }
    expect(isItemEligibleForSpec(cloak, ARCANE, 8, l)).toBe(true)
    expect(isItemEligibleForSpec(cloak, RETRIBUTION, 2, l)).toBe(true)
  })

  it("the item's own `specs` / `allowableClasses` stay authoritative over its stats", () => {
    const trinket: EncounterItemEntry = { id: 6, name: 'Spec trinket', itemClass: 4, itemSubClass: 0, inventoryType: 12, stats: stats(STR), specs: [ARCANE], sources: [] }
    const token: EncounterItemEntry = { id: 7, name: 'Token', itemClass: 4, itemSubClass: 0, stats: stats(STR), allowableClasses: [8], sources: [] }
    expect(isItemEligibleForSpec(trinket, ARCANE, 8, l)).toBe(true)
    expect(isItemEligibleForSpec(token, ARCANE, 8, l)).toBe(true)
  })

  it('Devourer (inferred Intellect Demon Hunter) takes the Intellect glaive variant, not the Agility-only one', () => {
    const glaive: EncounterItemEntry = { id: 8, name: 'Glaive', itemClass: 2, itemSubClass: 9, inventoryType: 13, stats: stats(INT, 73), sources: [] }
    const agiGlaive: EncounterItemEntry = { id: 9, name: 'Agi glaive', itemClass: 2, itemSubClass: 9, inventoryType: 13, stats: stats(AGI), sources: [] }
    expect(isItemEligibleForSpec(glaive, DEVOURER, 12, l)).toBe(true)
    expect(isItemEligibleForSpec(glaive, HAVOC, 12, l)).toBe(true) // 73 = agility/intellect
    expect(isItemEligibleForSpec(agiGlaive, DEVOURER, 12, l)).toBe(false)
    expect(isItemEligibleForSpec(agiGlaive, HAVOC, 12, l)).toBe(true)
  })
})

describe('primary-stat rule keeps the earlier weapon-shape rulings (Retribution 2H-only, Restoration Shaman shield + 2H mace)', () => {
  const intTwoHandMace = weapon(20, 5, [INT])
  const strTwoHandMace = weapon(21, 5, [STR])
  const strOneHandSword = weapon(22, 7, [STR])
  const shield: EncounterItemEntry = { id: 23, name: 'Shield', itemClass: 4, itemSubClass: 6, inventoryType: 14, stats: stats(STR, INT, STAMINA), sources: [] }
  const l = lookup([intTwoHandMace, strTwoHandMace, strOneHandSword, shield])

  it('Resto Shaman still gets shields and a 2H mace when the mace is an Intellect one', () => {
    expect(isItemEligibleForSpec(shield, RESTO_SHAMAN, 7, l)).toBe(true)
    expect(isItemEligibleForSpec(intTwoHandMace, RESTO_SHAMAN, 7, l)).toBe(true)
    expect(isItemEligibleForSpec(strTwoHandMace, RESTO_SHAMAN, 7, l)).toBe(false) // wrong primary stat
  })

  it('Retribution still gets only 2H weapons: Strength 2H mace yes; 1H sword and shield still no', () => {
    expect(isItemEligibleForSpec(strTwoHandMace, RETRIBUTION, 2, l)).toBe(true)
    expect(isItemEligibleForSpec(strOneHandSword, RETRIBUTION, 2, l)).toBe(false)
    expect(isItemEligibleForSpec(shield, RETRIBUTION, 2, l)).toBe(false)
    expect(isItemEligibleForSpec(intTwoHandMace, RETRIBUTION, 2, l)).toBe(false) // wrong primary stat
  })
})

describe('The Venomous Abyss (1320), real Raidbots data 2026-09-24', () => {
  const lk = loadLookup()
  const table = (specId: number) => buildLootTable(1320, specId, lk)
  const names = (specId: number, boss: string) =>
    table(specId)
      .find((e) => e.encounterName === boss)!
      .items.filter((i) => !i.viaCurio)
      .map((i) => i.name)

  it("Arcane Mage's Ula'tek bonus-roll pool is exactly the journal's 4 items (no Jaw of the Shackled Goddess, no Zatha'tek)", () => {
    expect(names(ARCANE, "Ula'tek").sort()).toEqual(
      ['Aqirbane Reliquary', 'Font of Venomous Rage', "Jan'thrazet, the Soul Fang", "Venomkeeper's Horrific Cowl"].sort()
    )
  })

  it('the other Agility dagger drops are not Arcane loot either', () => {
    expect(names(ARCANE, 'Entombed Sentinels')).not.toContain("Ancient Construct's Venomshiv")
    expect(names(ARCANE, 'The Twin Fangs')).not.toContain("Ravenous Feaster's Fang")
  })

  it('Retribution Paladin: two-handers only (the Strength Keeper-Crusher / Toothed Edge stay, plus Maze-roa), no 1H weapon or shield', () => {
    const items = table(RETRIBUTION).flatMap((e) => e.items)
    const weapons = items.filter((i) => i.itemClass === 2).map((i) => i.name)
    expect(weapons.sort()).toEqual(['Caustic Keeper-Crusher', 'Malignant Toothed Edge', "Maze-roa, Warlord's Fury"].sort())
    expect(items.some((i) => i.itemClass === 4 && i.itemSubClass === 6)).toBe(false)
  })

  it('Restoration Shaman: the shield is still there; the only 2H mace in this raid is Strength, so it is no longer Resto loot', () => {
    const items = table(RESTO_SHAMAN).flatMap((e) => e.items.map((i) => i.name))
    expect(items).toContain('Venom-Slashed Scuteward')
    expect(items).not.toContain('Caustic Keeper-Crusher')
  })
})
