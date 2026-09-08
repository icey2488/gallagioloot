export type TierSlot = 'head' | 'shoulder' | 'chest' | 'hands' | 'legs'

export const TIER_SLOTS: TierSlot[] = ['head', 'shoulder', 'chest', 'hands', 'legs']

type SeedBoss = {
  encounterId: number
  name: string
  /** Tier slots this boss drops a token for directly. Empty for non-token bosses. */
  tierSlots: TierSlot[]
  /** True for a class-neutral "curio" token exchangeable for any of TIER_SLOTS. */
  curio?: boolean
}

type SeedInstance = {
  instanceId: number
  name: string
  bosses: SeedBoss[]
}

/**
 * Hand-maintained per-instance tier-token source table (Layer 1 of tier resolution;
 * see Layer 2 in tierLearned.ts). Raidbots' static encounter-items.json points tier
 * items at an aggregate source bucket (instanceId -100) rather than a boss, so this
 * seed is the only way to resolve them without a live-learned report.
 *
 * Does NOT hardcode item ids -- tier item ids differ per class/armor type. Resolution
 * joins on tier slot (see TIER_SLOTS) instead.
 *
 * Verified 2026-09-08 against a live Raidbots droptimizer report
 * (jk6WmLFEnBpEqWueDkyRqA) and a live QE Live report (wzfyzqxqjqej): each tier slot's
 * direct boss below matches a non-catalyst profileset source row for that slot's token,
 * and every "tierSlots: []" boss below only appears as a catalyst-conversion source
 * (trailing catalystSourceId set) for tier items, never a direct one.
 */
const SEED: SeedInstance[] = [
  {
    instanceId: 1320,
    name: 'The Venomous Abyss',
    bosses: [
      { encounterId: 2888, name: "Nek'zali the Soulcoiler", tierSlots: [] },
      { encounterId: 2874, name: 'Entombed Sentinels', tierSlots: ['hands'] },
      { encounterId: 2894, name: 'The Lost Explorers', tierSlots: ['shoulder'] },
      { encounterId: 2882, name: 'Vashnik the Malignant', tierSlots: ['chest'] },
      { encounterId: 2871, name: 'Sszorak', tierSlots: ['legs'] },
      { encounterId: 2887, name: 'The Twin Fangs', tierSlots: ['head'] },
      { encounterId: 2883, name: 'The Coiled Altar', tierSlots: [] },
      // Ula'tek drops the "Slumbering Coil Curio", a class-neutral token exchangeable
      // for any one of the five tier slots.
      { encounterId: 2895, name: "Ula'tek", tierSlots: [...TIER_SLOTS], curio: true },
    ],
  },
  {
    // NOTE: the task spec that seeded this table said "instanceId 1322, encounterId
    // 2878". Live Raidbots static data (2026-09-08) shows instanceId 1322 is actually
    // a different zone ("Altar of Fangs", a 3-boss Mythic+ dungeon; encounter 2878 is
    // its first boss "Rav'i") -- registering the spec's numbers here would have
    // silently corrupted that unrelated dungeon's seed entry. The real Tidebound
    // Grotto (a single-boss raid Lair) is instanceId 1317, encounterId 2849
    // ("Nymrissa Wavecaller"); those are the verified values used below. Not yet open
    // for bonus rolls as of 2026-09-08 -- registered with no tier slots so it's
    // recognized once it opens.
    instanceId: 1317,
    name: 'The Tidebound Grotto',
    bosses: [{ encounterId: 2849, name: 'Nymrissa Wavecaller', tierSlots: [] }],
  },
]

const seedByInstanceId = new Map(SEED.map((s) => [s.instanceId, s]))

export function isKnownSeedInstance(instanceId: number): boolean {
  return seedByInstanceId.has(instanceId)
}

export function getCurioEncounterId(instanceId: number): number | undefined {
  return seedByInstanceId.get(instanceId)?.bosses.find((b) => b.curio)?.encounterId
}

/** (instanceId, tierSlot) -> encounterId[]. Always includes the instance's curio encounter, if any. */
export function getSeedEncountersForSlot(instanceId: number, slot: string): number[] {
  const instance = seedByInstanceId.get(instanceId)
  if (!instance) return []
  return instance.bosses.filter((b) => b.tierSlots.includes(slot as TierSlot)).map((b) => b.encounterId)
}

/** Full slot -> encounterId[] seed mapping for an instance, for the /tier-map debug endpoint. */
export function getSeedTierMap(instanceId: number): Record<string, number[]> {
  const instance = seedByInstanceId.get(instanceId)
  if (!instance) return {}
  const map: Record<string, number[]> = {}
  for (const slot of TIER_SLOTS) {
    const encounters = getSeedEncountersForSlot(instanceId, slot)
    if (encounters.length > 0) map[slot] = encounters
  }
  return map
}

export function getAllSeedInstanceIds(): number[] {
  return SEED.map((s) => s.instanceId)
}
