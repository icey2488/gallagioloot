import { ARMOR_SUBCLASS_TO_TYPE, armorTypeForClass, getSpecById, getWeaponShape, itemPrimaryStats, LOOT_SPEC_WEAPON_RULES } from './specs'
import type { EncounterItemEntry, EncounterItemsLookup } from '../types'

// inventoryType ids that are usable by every class regardless of armor type:
// neck (2), finger/ring (11), trinket (12), back/cloak (16 -- cloaks are itemSubClass
// 1/cloth by Blizzard's raw schema, but wearable by every class; verified 2026-09-08).
const UNIVERSAL_INVENTORY_TYPES = new Set([2, 11, 12, 16])

/**
 * Decides whether a given loot-spec (and its class) can receive/use an item, per the
 * eligibility rules confirmed against live Raidbots static data 2026-09-08:
 *
 *   1. `item.specs`, when present, is authoritative (trinkets, cantrip weapons, Maze-roa).
 *   2. `item.allowableClasses`, when present, is authoritative (tier tokens, class tokens).
 *   3. Primary stat: an item that carries a primary stat (Agility / Strength / Intellect, or a
 *      multi-primary variant) is only that spec's loot if the spec's main stat is one of
 *      them -- a Strength sword or an Agility dagger is never a Mage's loot, even though
 *      weapon-specs.json (equip-based) lists every caster spec for swords and daggers.
 *      Items with no primary stat (rings, necks) are not restricted by this.
 *   4. Weapons (itemClass 2): looked up in weapon-specs.json by itemSubClass, then
 *      further narrowed by LOOT_SPEC_WEAPON_RULES (see specs.ts) where one exists --
 *      weapon-specs.json is equip-based (what the class/spec can wear), not loot-spec
 *      based (what the loot spec actually awards), e.g. it lists Retribution (70) for
 *      1H axes even though the Retribution loot spec is two-handed-only.
 *   5. Armor (itemClass 4):
 *      - neck/ring/trinket/cloak inventoryTypes are always universal;
 *      - itemSubClass 1-4 (cloth/leather/mail/plate) match the class's fixed armor type;
 *      - anything else (misc off-hand implements, subclass 0; shields, subclass 6) falls
 *        back to weapon-specs.json if it has an entry for that (itemClass, itemSubClass)
 *        pair (also narrowed by LOOT_SPEC_WEAPON_RULES for shields), else is treated as
 *        unrestricted (no signal to restrict on).
 *   6. Anything else (curio tokens, relics/idols without their own specs/allowableClasses)
 *      is treated as unrestricted.
 *
 * Step 4's off-hand-implement fallback is a judgment call beyond what the task's
 * explicit armor-type table covers -- see README for the reasoning and the uncertainty
 * this carries.
 */
function passesLootSpecWeaponRule(specId: number, itemClass: number, itemSubClass: number | undefined): boolean {
  const rule = LOOT_SPEC_WEAPON_RULES[specId]
  if (!rule) return true
  const shape = getWeaponShape(itemClass, itemSubClass)
  if (!shape) return true
  return rule.allow.includes(shape)
}
function passesPrimaryStat(item: EncounterItemEntry, specId: number): boolean {
  const spec = getSpecById(specId)
  const primaries = itemPrimaryStats(item.stats)
  if (!spec || !primaries) return true
  return primaries.has(spec.primaryStat)
}

export function isItemEligibleForSpec(item: EncounterItemEntry, specId: number, classId: number, lookup: EncounterItemsLookup): boolean {
  if (item.specs && item.specs.length > 0) return item.specs.includes(specId)
  if (item.allowableClasses && item.allowableClasses.length > 0) return item.allowableClasses.includes(classId)

  if (!passesPrimaryStat(item, specId)) return false

  if (item.itemClass === 2) {
    const weaponSpec = lookup.weaponSpecs.get(`2:${item.itemSubClass}`)
    const equipEligible = weaponSpec ? weaponSpec.specsCanUse.includes(specId) : true
    return equipEligible && passesLootSpecWeaponRule(specId, item.itemClass, item.itemSubClass)
  }

  if (item.itemClass === 4) {
    if (item.inventoryType !== undefined && UNIVERSAL_INVENTORY_TYPES.has(item.inventoryType)) return true

    const armorType = item.itemSubClass !== undefined ? ARMOR_SUBCLASS_TO_TYPE[item.itemSubClass] : undefined
    if (armorType) return armorTypeForClass(classId) === armorType

    const weaponSpec = lookup.weaponSpecs.get(`4:${item.itemSubClass}`)
    const equipEligible = weaponSpec ? weaponSpec.specsCanUse.includes(specId) : true
    return equipEligible && passesLootSpecWeaponRule(specId, item.itemClass, item.itemSubClass)
  }

  return true
}
