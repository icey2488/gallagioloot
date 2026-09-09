import { getCurioEncounterId, getSeedEncountersForSlot, TIER_SLOTS } from './tierSeed'
import { getSpecById } from './specs'
import { isItemEligibleForSpec } from './lootEligibility'
import { INVENTORY_TYPE_TO_SLOT } from '../normalize/qelive'
import type { EncounterItemEntry, EncounterItemsLookup, LootTableEncounter, LootTableItem } from '../types'

/**
 * Finds the class-neutral curio token for an instance (e.g. "Slumbering Coil Curio")
 * by its `contains` field -- the only encounter-items.json entry sourced at the
 * curio boss that also carries a `contains` list. No item ids hardcoded.
 */
function findCurioItem(lookup: EncounterItemsLookup, instanceId: number, curioEncounterId: number): EncounterItemEntry | undefined {
  for (const item of lookup.rawItems.values()) {
    if (!item.contains || item.contains.length === 0) continue
    if ((item.sources || []).some((s) => s.instanceId === instanceId && s.encounterId === curioEncounterId)) return item
  }
  return undefined
}

/**
 * Resolves the curio's `contains` list down to the one item per tier slot that this
 * specific class can use, keyed by slot (head/shoulder/chest/hands/legs). Purely
 * data-driven: `allowableClasses` picks the class's variant, `inventoryType` picks
 * the slot -- no item ids hardcoded, so this works for any class/instance without a
 * per-season update.
 */
function resolveTierItemsForClass(lookup: EncounterItemsLookup, curioItem: EncounterItemEntry, classId: number): Map<string, EncounterItemEntry> {
  const bySlot = new Map<string, EncounterItemEntry>()
  for (const itemId of curioItem.contains ?? []) {
    const candidate = lookup.rawItems.get(itemId)
    if (!candidate || !candidate.allowableClasses?.includes(classId)) continue
    const slot = candidate.inventoryType !== undefined ? INVENTORY_TYPE_TO_SLOT[candidate.inventoryType] : undefined
    if (slot) bySlot.set(slot, candidate)
  }
  return bySlot
}

function toLootTableItem(item: EncounterItemEntry, opts: { isTier: boolean; viaCurio: boolean; tierSlot?: string }): LootTableItem {
  return {
    itemId: item.id,
    name: item.name,
    icon: item.icon,
    slot: opts.tierSlot ?? (item.inventoryType !== undefined ? INVENTORY_TYPE_TO_SLOT[item.inventoryType] : undefined),
    itemClass: item.itemClass,
    itemSubClass: item.itemSubClass,
    specSpecific: !!(item.specs && item.specs.length > 0),
    uniqueEquipped: !!item.uniqueEquipped,
    onUseTrinket: !!item.onUseTrinket,
    isTier: opts.isTier,
    viaCurio: opts.viaCurio,
    tierSlot: opts.tierSlot,
  }
}

/**
 * Builds the full per-boss loot table for an instance, filtered to what the given
 * loot spec can receive -- every item a report's items get checked against, plus
 * the tier-token/curio rows the tier-seed table knows about (resolved to this specific
 * class's variant item, since encounter-items.json points those at an aggregate
 * catalyst bucket rather than a real boss -- see tierSeed.ts/tierResolve.ts). Pure --
 * no I/O; `lookup` must already be loaded by the caller.
 */
export function buildLootTable(instanceId: number, lootSpecId: number, lookup: EncounterItemsLookup): LootTableEncounter[] {
  const spec = getSpecById(lootSpecId)
  if (!spec) return []
  const classId = spec.classId

  const encounters = lookup.encountersByInstance.get(instanceId) ?? []
  const curioEncounterId = getCurioEncounterId(instanceId)
  const curioItem = curioEncounterId !== undefined ? findCurioItem(lookup, instanceId, curioEncounterId) : undefined
  const tierItemsForClass = curioItem ? resolveTierItemsForClass(lookup, curioItem, classId) : new Map<string, EncounterItemEntry>()

  // getSeedEncountersForSlot includes the curio boss for every slot (it can fill any of
  // them) -- exclude it here since the curio boss is handled separately below, as
  // viaCurio rows for every slot rather than a single "direct" slot.
  const slotByEncounterId = new Map<number, string>()
  for (const slot of TIER_SLOTS) {
    for (const encounterId of getSeedEncountersForSlot(instanceId, slot)) {
      if (encounterId === curioEncounterId) continue
      slotByEncounterId.set(encounterId, slot)
    }
  }

  const result: LootTableEncounter[] = []

  for (const encounter of encounters) {
    if (encounter.trash) continue

    const items: LootTableItem[] = []
    const seen = new Set<number>()

    for (const item of lookup.rawItems.values()) {
      // Curio-style container items (`contains` present) are never shown directly --
      // they're resolved to the requesting class's specific constituent item instead,
      // via resolveTierItemsForClass below.
      if (item.contains && item.contains.length > 0) continue
      const matchesSource = (item.sources || []).some((s) => s.instanceId === instanceId && s.encounterId === encounter.id)
      if (!matchesSource) continue
      if (!isItemEligibleForSpec(item, lootSpecId, classId, lookup)) continue
      if (seen.has(item.id)) continue
      seen.add(item.id)
      items.push(toLootTableItem(item, { isTier: false, viaCurio: false }))
    }

    const directTierSlot = slotByEncounterId.get(encounter.id)
    if (directTierSlot) {
      const tierItem = tierItemsForClass.get(directTierSlot)
      if (tierItem && !seen.has(tierItem.id)) {
        seen.add(tierItem.id)
        items.push(toLootTableItem(tierItem, { isTier: true, viaCurio: false, tierSlot: directTierSlot }))
      }
    }

    if (encounter.id === curioEncounterId) {
      for (const [slot, tierItem] of tierItemsForClass) {
        if (seen.has(tierItem.id)) continue
        seen.add(tierItem.id)
        items.push(toLootTableItem(tierItem, { isTier: true, viaCurio: true, tierSlot: slot }))
      }
    }

    result.push({ encounterId: encounter.id, encounterName: encounter.name, items })
  }

  return result
}
