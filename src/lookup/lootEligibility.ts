import { ARMOR_SUBCLASS_TO_TYPE, armorTypeForClass } from './specs'
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
 *   3. Weapons (itemClass 2): looked up in weapon-specs.json by itemSubClass.
 *   4. Armor (itemClass 4):
 *      - neck/ring/trinket/cloak inventoryTypes are always universal;
 *      - itemSubClass 1-4 (cloth/leather/mail/plate) match the class's fixed armor type;
 *      - anything else (misc off-hand implements, subclass 0; shields, subclass 6) falls
 *        back to weapon-specs.json if it has an entry for that (itemClass, itemSubClass)
 *        pair, else is treated as unrestricted (no signal to restrict on).
 *   5. Anything else (curio tokens, relics/idols without their own specs/allowableClasses)
 *      is treated as unrestricted.
 *
 * Steps 3 and the shield/off-hand half of step 4 are a judgment call beyond what the
 * task's explicit armor-type table covers -- see README for the reasoning and the
 * uncertainty this carries.
 */
export function isItemEligibleForSpec(item: EncounterItemEntry, specId: number, classId: number, lookup: EncounterItemsLookup): boolean {
  if (item.specs && item.specs.length > 0) return item.specs.includes(specId)
  if (item.allowableClasses && item.allowableClasses.length > 0) return item.allowableClasses.includes(classId)

  if (item.itemClass === 2) {
    const weaponSpec = lookup.weaponSpecs.get(`2:${item.itemSubClass}`)
    return weaponSpec ? weaponSpec.specsCanUse.includes(specId) : true
  }

  if (item.itemClass === 4) {
    if (item.inventoryType !== undefined && UNIVERSAL_INVENTORY_TYPES.has(item.inventoryType)) return true

    const armorType = item.itemSubClass !== undefined ? ARMOR_SUBCLASS_TO_TYPE[item.itemSubClass] : undefined
    if (armorType) return armorTypeForClass(classId) === armorType

    const weaponSpec = lookup.weaponSpecs.get(`4:${item.itemSubClass}`)
    if (weaponSpec) return weaponSpec.specsCanUse.includes(specId)
    return true
  }

  return true
}
