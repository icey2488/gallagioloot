import { getCurioEncounterId, getSeedEncountersForSlot } from './tierSeed'
import type { LearnedTierData } from './tierLearned'

export type TierResolution = { encounterId: number; viaCurio: boolean }

/**
 * Resolves an item that has no positive-instance source in encounter-items.json
 * (tier tokens pointed at the aggregate catalyst bucket) to its real tier-token
 * boss(es). Shared by both normalizers. Resolution order:
 *   1. learned cache for this exact item id (if any encounters are known)
 *   2. static seed for the item's slot
 *   3. empty -- caller keeps its existing "no encounter mapping" warning
 * Pure -- `learned` must already be loaded by the caller.
 */
export function resolveTierEncounters(
  instanceId: number,
  itemId: number,
  slot: string | undefined,
  learned: LearnedTierData | undefined
): TierResolution[] {
  const curioEncounterId = getCurioEncounterId(instanceId)
  const learnedEncounters = learned?.byItem[itemId]
  const encounterIds =
    learnedEncounters && learnedEncounters.length > 0
      ? learnedEncounters
      : slot
        ? getSeedEncountersForSlot(instanceId, slot)
        : []
  return encounterIds.map((encounterId) => ({ encounterId, viaCurio: encounterId === curioEncounterId }))
}
