// Decision-engine types. Pure data -- no Worker/runtime dependencies, importable
// by a future frontend as-is.

export type KnockoutEntry = {
  itemId: number
  itemName: string
  encounterId: number
  /** ISO timestamp. Always supplied by the caller -- core never reads the clock. */
  receivedAt: string
  spec?: string
  /**
   * Manual override of whether this entry is spec-specific. When unset, the automatic
   * value comes from the matching PoolEntry.specSpecific (derived from the loot table)
   * at evaluation time -- see buildBossPools.
   */
  specSpecific?: boolean
  /** The loot spec this item was received/recorded under. Recorded on every entry going forward. */
  lootSpecId?: number
  source: 'roll' | 'manual'
}

export type KnockoutState = {
  character: string
  realm?: string
  region?: string
  difficulty: string
  entries: KnockoutEntry[]
  version: 1
}

export type Settings = {
  /** Minimum EV, as a percentage of baseline (e.g. 0.2 means 0.2%), for a boss to be worth a roll. */
  thresholdPct: number
  /** 1 normally, 2 from season week 8 onward -- caller supplies this, core does not compute it from dates. */
  rollsAvailable: number
  includeOffSpec: boolean
  /**
   * Encounter ids the player expects to kill this week. Undefined (default) means every
   * boss in the report is in play. When set, bosses not listed are still evaluated (so the
   * table can show them) but are marked non-deployable and excluded from allocation.
   */
  expectedKills?: number[]
  /**
   * The loot spec currently in effect (set in-game before rolling). Used to decide
   * whether a spec-specific KnockoutEntry applies: only when its own `lootSpecId`
   * matches this one. Undefined falls back to the legacy string-`spec` comparison.
   */
  lootSpecId?: number
}

export const DEFAULT_SETTINGS: Settings = {
  thresholdPct: 0.2,
  rollsAvailable: 1,
  includeOffSpec: false,
}

export type PoolEntry = {
  key: string
  itemIds: number[]
  name: string
  /** max(delta, 0) -- a downgrade transmute is worth zero, since the player just won't equip it. */
  value: number
  /** The best raw delta among the collapsed rows, before flooring at zero -- kept for display. */
  rawDelta: number
  pct: number
  kind: 'item' | 'tier-token' | 'curio'
  tierSlot?: string
  /**
   * True when this entry only drops for certain loot specs (the loot table's `specs`
   * restriction), so a knockout for it applies only to the loot spec it was received
   * under. Derived from the loot table when available; false when no loot table was
   * supplied to buildBossPools (e.g. older callers, or an instance the loot-table
   * endpoint hasn't been asked about).
   */
  specSpecific: boolean
  /** True for a PoolEntry synthesized from the loot table with no matching report item -- see buildBossPools. */
  notInSimReport?: boolean
  knockedOut: boolean
  /** Expected rolls to land this entry via uniform sampling without replacement: (n+1)/2 for a remaining pool of size n. Set only for non-knocked-out entries. */
  rollsToTargetExpected?: number
  /** Worst-case rolls to land this entry (n, the pool's remaining size). Set only for non-knocked-out entries. */
  rollsToTargetWorst?: number
  /** Expected rolls actually spent hunting this entry, given the player abandons the pool once its remaining mean value falls below threshold after a miss. Set only for non-knocked-out entries. */
  rollsToTargetTruncated?: number
  /** Sim error for this entry's value, as a percentage of baseline (mirrors `pct`). Set only when the source report carries a per-row error (Raidbots' `mean_error`; QE Live never does). */
  errorPct?: number
}

export type BossEval = {
  encounterId: number
  encounterName: string
  instanceId: number
  pool: PoolEntry[]
  remaining: number
  ev: number
  evPct: number
  bestCase: PoolEntry | null
  /** UI vocabulary is "rollable"; the field name is kept for stability. */
  deployable: boolean
  notes: string[]
  /** Mean of the remaining pool's `errorPct` values, where known -- the boss-level sim error used for toss-up detection. Undefined when no remaining entry carries an error (e.g. QE Live). */
  evErrorPct?: number
}

export type Allocation = {
  encounterId: number
  encounterName: string
  rolls: number
  expectedGain: number
  expectedGainPct: number
}

export type Recommendation = {
  allocations: Allocation[]
  totalExpectedGainPct: number
  fallback: null | { reason: string; message: string }
  assumptions: string[]
  warnings: string[]
  /**
   * Set when the boss decided by the last allocated roll and the next-best deployable
   * boss are close enough to call sim noise rather than a real ranking (see `isTossUpGap`
   * in tossup.ts). `bosses` is [the allocated boss's name, the runner-up's name] --
   * for `rollsAvailable` 1 this is rank 1 vs rank 2; for 2 it's rank 2 vs rank 3, since
   * the first two rolls are both allocated regardless. The allocation itself is
   * unaffected -- this only annotates the recommendation for display.
   */
  tossUp: { bosses: [string, string]; gapPct: number } | null
}

export type RollsToTarget = {
  expected: number
  worstCase: number
  expectedTruncated: number
}

export type VaultItemInput = {
  name: string
  gainPct: number
  itemId?: number
  encounterId?: number
}

export type VaultDecision = {
  voidcoreGainPct: number
  vaultItemGainPct: number
  savedRolls: number
  verdict: 'vault' | 'voidcore' | 'tokens' | 'toss-up'
  explanation: string
  notes: string[]
}
