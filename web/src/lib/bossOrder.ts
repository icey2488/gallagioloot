import type { BossEval } from '@engine/core/types'
import type { LootTable, TargetKind } from '@engine/types'

/**
 * Display order for a Run settings section. Raid bosses follow the in-game Adventure
 * Journal order, which is the order of the loot table's encounters (the proxy builds it
 * from Raidbots instances.json, whose encounters array is in journal order -- its `order`
 * field is 1..n and matches the array). Bosses the loot table doesn't know, or every boss
 * when no loot table has loaded yet, keep their incoming (EV) order after the known ones.
 * Mythic+ dungeons have no authoritative journal order in any data source (instances.json
 * lists them alphabetically), so they are sorted alphabetically by name, stably by key
 * level. Pure; does not touch the engine's own ranking.
 */
export function orderBossEvals(evals: BossEval[], kind: TargetKind, lootTable: LootTable | null): BossEval[] {
  if (kind === 'mplus') {
    return [...evals].sort((a, b) => a.encounterName.localeCompare(b.encounterName) || (a.keyLevel ?? 0) - (b.keyLevel ?? 0))
  }
  const position = new Map((lootTable?.encounters ?? []).map((e, i) => [e.encounterId, i]))
  const rank = (b: BossEval) => position.get(b.encounterId) ?? Number.MAX_SAFE_INTEGER
  return [...evals].sort((a, b) => rank(a) - rank(b))
}
