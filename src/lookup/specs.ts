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
