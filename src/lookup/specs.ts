// Static table of all 40 current WoW specs (13 classes). Hand-maintained -- this is
// static game data, not derived from any API. specId/classId/className/specName
// verified 2026-09-08 against Raidbots' static talents.json (which lists exactly 40
// entries with these fields). Demon Hunter's third spec, "Devourer" (specId 1480),
// is new this expansion alongside the existing Havoc/Vengeance -- its role is our
// best inference (not yet documented in-game), noted on the entry below.
export type Role = 'dps' | 'healer' | 'tank'

export type SpecEntry = {
  specId: number
  specName: string
  classId: number
  className: string
  role: Role
}

export const SPECS: SpecEntry[] = [
  { specId: 71, specName: 'Arms', classId: 1, className: 'Warrior', role: 'dps' },
  { specId: 72, specName: 'Fury', classId: 1, className: 'Warrior', role: 'dps' },
  { specId: 73, specName: 'Protection', classId: 1, className: 'Warrior', role: 'tank' },
  { specId: 65, specName: 'Holy', classId: 2, className: 'Paladin', role: 'healer' },
  { specId: 66, specName: 'Protection', classId: 2, className: 'Paladin', role: 'tank' },
  { specId: 70, specName: 'Retribution', classId: 2, className: 'Paladin', role: 'dps' },
  { specId: 253, specName: 'Beast Mastery', classId: 3, className: 'Hunter', role: 'dps' },
  { specId: 254, specName: 'Marksmanship', classId: 3, className: 'Hunter', role: 'dps' },
  { specId: 255, specName: 'Survival', classId: 3, className: 'Hunter', role: 'dps' },
  { specId: 259, specName: 'Assassination', classId: 4, className: 'Rogue', role: 'dps' },
  { specId: 260, specName: 'Outlaw', classId: 4, className: 'Rogue', role: 'dps' },
  { specId: 261, specName: 'Subtlety', classId: 4, className: 'Rogue', role: 'dps' },
  { specId: 256, specName: 'Discipline', classId: 5, className: 'Priest', role: 'healer' },
  { specId: 257, specName: 'Holy', classId: 5, className: 'Priest', role: 'healer' },
  { specId: 258, specName: 'Shadow', classId: 5, className: 'Priest', role: 'dps' },
  { specId: 250, specName: 'Blood', classId: 6, className: 'Death Knight', role: 'tank' },
  { specId: 251, specName: 'Frost', classId: 6, className: 'Death Knight', role: 'dps' },
  { specId: 252, specName: 'Unholy', classId: 6, className: 'Death Knight', role: 'dps' },
  { specId: 262, specName: 'Elemental', classId: 7, className: 'Shaman', role: 'dps' },
  { specId: 263, specName: 'Enhancement', classId: 7, className: 'Shaman', role: 'dps' },
  { specId: 264, specName: 'Restoration', classId: 7, className: 'Shaman', role: 'healer' },
  { specId: 62, specName: 'Arcane', classId: 8, className: 'Mage', role: 'dps' },
  { specId: 63, specName: 'Fire', classId: 8, className: 'Mage', role: 'dps' },
  { specId: 64, specName: 'Frost', classId: 8, className: 'Mage', role: 'dps' },
  { specId: 265, specName: 'Affliction', classId: 9, className: 'Warlock', role: 'dps' },
  { specId: 266, specName: 'Demonology', classId: 9, className: 'Warlock', role: 'dps' },
  { specId: 267, specName: 'Destruction', classId: 9, className: 'Warlock', role: 'dps' },
  { specId: 268, specName: 'Brewmaster', classId: 10, className: 'Monk', role: 'tank' },
  { specId: 269, specName: 'Windwalker', classId: 10, className: 'Monk', role: 'dps' },
  { specId: 270, specName: 'Mistweaver', classId: 10, className: 'Monk', role: 'healer' },
  { specId: 102, specName: 'Balance', classId: 11, className: 'Druid', role: 'dps' },
  { specId: 103, specName: 'Feral', classId: 11, className: 'Druid', role: 'dps' },
  { specId: 104, specName: 'Guardian', classId: 11, className: 'Druid', role: 'tank' },
  { specId: 105, specName: 'Restoration', classId: 11, className: 'Druid', role: 'healer' },
  { specId: 577, specName: 'Havoc', classId: 12, className: 'Demon Hunter', role: 'dps' },
  { specId: 581, specName: 'Vengeance', classId: 12, className: 'Demon Hunter', role: 'tank' },
  // Inferred, not confirmed in-game: Demon Hunter already has a dps (Havoc) and a
  // tank (Vengeance) spec, and "Devourer" reads as a dps theme (devouring souls) --
  // see README/final summary for this being flagged as uncertain.
  { specId: 1480, specName: 'Devourer', classId: 12, className: 'Demon Hunter', role: 'dps' },
  { specId: 1467, specName: 'Devastation', classId: 13, className: 'Evoker', role: 'dps' },
  { specId: 1468, specName: 'Preservation', classId: 13, className: 'Evoker', role: 'healer' },
  { specId: 1473, specName: 'Augmentation', classId: 13, className: 'Evoker', role: 'dps' },
]

export function getSpecById(specId: number): SpecEntry | undefined {
  return SPECS.find((spec) => spec.specId === specId)
}

/** Case-insensitive; disambiguates by className when a spec name is shared (e.g. "Restoration", "Protection"). */
export function getSpecByName(specName: string, className?: string): SpecEntry | undefined {
  const nameLower = specName.toLowerCase()
  const classLower = className?.toLowerCase()
  return SPECS.find(
    (spec) => spec.specName.toLowerCase() === nameLower && (classLower === undefined || spec.className.toLowerCase() === classLower)
  )
}

export type ArmorType = 'cloth' | 'leather' | 'mail' | 'plate'

/** Fixed per-WoW-class armor type, per class id. Static game data (armor types don't change per season). */
const ARMOR_TYPE_BY_CLASS_ID: Record<number, ArmorType> = {
  8: 'cloth', // Mage
  5: 'cloth', // Priest
  9: 'cloth', // Warlock
  11: 'leather', // Druid
  10: 'leather', // Monk
  4: 'leather', // Rogue
  12: 'leather', // Demon Hunter
  3: 'mail', // Hunter
  7: 'mail', // Shaman
  13: 'mail', // Evoker
  6: 'plate', // Death Knight
  2: 'plate', // Paladin
  1: 'plate', // Warrior
}

export function armorTypeForClass(classId: number): ArmorType | undefined {
  return ARMOR_TYPE_BY_CLASS_ID[classId]
}

/** Blizzard's itemSubClass id (for itemClass 4, armor) -> armor type, e.g. from encounter-items.json. */
export const ARMOR_SUBCLASS_TO_TYPE: Record<number, ArmorType> = {
  1: 'cloth',
  2: 'leather',
  3: 'mail',
  4: 'plate',
}

export type WeaponShape = '1H' | '2H' | 'ranged' | 'shield'

/**
 * Fixed Blizzard itemSubClass enum for itemClass 2 (weapons) -> physical shape.
 * Not spec-dependent -- this is just "what kind of weapon is this."
 */
const WEAPON_SUBCLASS_SHAPE: Record<number, WeaponShape> = {
  0: '1H', // One-Hand Axe
  1: '2H', // Two-Hand Axe
  2: 'ranged', // Bow
  3: 'ranged', // Gun
  4: '1H', // One-Hand Mace
  5: '2H', // Two-Hand Mace
  6: '2H', // Polearm
  7: '1H', // One-Hand Sword
  8: '2H', // Two-Hand Sword
  10: '2H', // Staff
  13: '1H', // Fist Weapon
  15: '1H', // Dagger
  18: 'ranged', // Crossbow
}

/** itemClass 4 subclass 6 is a shield; itemClass 2 subclasses map via WEAPON_SUBCLASS_SHAPE. Anything else (off-hand frills, relics, misc implements, unrecognized weapon subclasses) has no shape and isn't restricted by a loot-spec weapon rule. */
export function getWeaponShape(itemClass: number, itemSubClass: number | undefined): WeaponShape | undefined {
  if (itemSubClass === undefined) return undefined
  if (itemClass === 2) return WEAPON_SUBCLASS_SHAPE[itemSubClass]
  if (itemClass === 4 && itemSubClass === 6) return 'shield'
  return undefined
}

export type LootSpecWeaponRule = {
  allow: WeaponShape[]
  source: string
}

/**
 * Loot-spec weapon-shape overlay, on top of weapon-specs.json.
 *
 * Raidbots' weapon-specs.json is EQUIP-based: `specsCanUse` for a given (itemClass,
 * itemSubClass) lists every spec that can physically wear that weapon type, not what
 * that spec's LOOT SPEC (personal loot / Great Vault / Voidcore transmute) will actually
 * award. Confirmed 2026-09-20 by fetching live weapon-specs.json and checking spec 70
 * (Retribution Paladin): it's listed under itemSubClass 0/1/4/5/6/7/8 (every weapon
 * shape a Paladin can wear) -- including one-handed axes, maces, and swords, which
 * Retribution has never used as a loot spec. This is why "Aman'muso, Warlord's
 * Vengeance" (a 1H axe with no `specs` list) showed up for Retribution: the equip-based
 * table alone doesn't know Retribution is two-handed-only.
 *
 * Each entry below encodes which weapon "shapes" (see WeaponShape) that spec's loot
 * spec actually awards, sourced from well-established WoW class/spec mechanics (which
 * weapon shape is required for the spec's core rotation/tanking kit), not from any
 * Raidbots field -- Raidbots doesn't expose loot-spec-narrowed weapon data. Applied as
 * an additional AND-filter in lootEligibility.ts on top of weapon-specs.json, only for
 * itemClass 2 weapons and itemClass 4 shields (itemSubClass 6) that don't already carry
 * their own `specs`/`allowableClasses` list (those remain authoritative and skip this
 * overlay entirely).
 *
 * Specs deliberately omitted here (no entry = no override, falls back to the
 * equip-based weapon-specs.json result as-is) because the loot-spec-narrowed shape
 * couldn't be verified with confidence -- "unverified: equip-based fallback":
 *   - Survival Hunter (255): melee shape (2H polearm/staff vs. dual 1H) has changed
 *     across expansions and isn't confidently pinned down here.
 *   - Monk (268/269/270): Brewmaster/Windwalker/Mistweaver each favor a different
 *     shape (2H vs. dual 1H fist weapons) but, like Shaman, may legitimately accept
 *     more than one -- not confidently narrowed.
 *   - Priest/Mage/Warlock (256/257/258/62/63/64/265/266/267): pure casters that can
 *     use 1H+off-hand or a 2H staff interchangeably; no narrowing expected, but not
 *     independently confirmed.
 *   - Balance/Restoration Druid (102/105): same flexible 1H+off-hand-or-2H-staff
 *     situation as casters above.
 *   - Elemental/Enhancement/Restoration Shaman (262/263/264): flexible by design (the
 *     existing Resto Shaman regression test already covers this -- shield + 2H mace +
 *     several 1H types, no swords/polearms/bows -- and is deliberately left unchanged).
 *   - Evoker (1467/1468/1473): weapon-specs.json lists all three Evoker specs under
 *     both 1H and 2H weapon subclasses; whether Evokers have a real off-hand slot that
 *     makes 1H weapons loot-spec-relevant isn't confirmed here.
 *   - Devourer (1480): a new/unreleased Demon Hunter spec with no documented loot-spec
 *     behavior to verify against (see the "inferred" note on its SPECS entry above).
 *
 * Demon Hunter (577/581) and Rogue (259/260/261) are included below even though they're
 * effectively redundant with the class-level equip restriction (both classes are
 * already excluded from every 2H/ranged weapon subclass in weapon-specs.json, verified
 * live 2026-09-20) -- kept explicit for documentation/defense-in-depth.
 */
export const LOOT_SPEC_WEAPON_RULES: Record<number, LootSpecWeaponRule> = {
  // Paladin
  65: { allow: ['1H', 'shield'], source: 'Holy Paladin heals with a 1H weapon + shield/off-hand; never 2H.' },
  66: { allow: ['1H', 'shield'], source: 'Protection Paladin tanks with a 1H weapon + shield; never 2H.' },
  70: { allow: ['2H'], source: 'Retribution Paladin has been two-handed-only since Legion; never 1H, never a shield.' },
  // Warrior
  71: { allow: ['2H'], source: 'Arms Warrior has been two-handed-only since Legion; never 1H, never a shield.' },
  72: { allow: ['1H', '2H'], source: "Fury Warrior dual-wields via Titan's Grip, including two two-handers; both shapes are valid." },
  73: { allow: ['1H', 'shield'], source: 'Protection Warrior tanks with a 1H weapon + shield; never 2H.' },
  // Hunter (ranged-only specs; current-era Hunters have no meaningful melee weapon slot)
  253: { allow: ['ranged'], source: 'Beast Mastery Hunter uses only its ranged weapon.' },
  254: { allow: ['ranged'], source: 'Marksmanship Hunter uses only its ranged weapon.' },
  // Death Knight (no shield slot for this class)
  250: { allow: ['2H'], source: 'Blood DK tanks with a single 2H weapon; Death Knights have no shield.' },
  251: { allow: ['1H', '2H'], source: 'Frost DK build can be dual-wield 1H or single 2H depending on talents; both shapes are valid.' },
  252: { allow: ['2H'], source: 'Unholy DK wields a single 2H weapon, not dual-wield.' },
  // Rogue (redundant with class-level equip restriction; see note above)
  259: { allow: ['1H'], source: 'Rogues cannot equip 2H weapons at all (class restriction).' },
  260: { allow: ['1H'], source: 'Rogues cannot equip 2H weapons at all (class restriction).' },
  261: { allow: ['1H'], source: 'Rogues cannot equip 2H weapons at all (class restriction).' },
  // Demon Hunter (redundant with class-level equip restriction; see note above)
  577: { allow: ['1H'], source: 'Demon Hunters cannot equip 2H weapons at all (class restriction).' },
  581: { allow: ['1H'], source: 'Demon Hunters cannot equip 2H weapons at all (class restriction).' },
  // Druid (Feral/Guardian gain no stat benefit from an off-hand while shapeshifted, so
  // their loot spec only awards the 2H staff/polearm types Druids can equip; the class
  // restriction already excludes swords/axes/etc. for Druids)
  103: { allow: ['2H'], source: 'Feral Druid gains no off-hand benefit in form; loot spec awards only 2H staff/polearm.' },
  104: { allow: ['2H'], source: 'Guardian Druid gains no off-hand benefit in form; loot spec awards only 2H staff/polearm.' },
}
