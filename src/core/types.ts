// Decision-engine types. Pure data -- no Worker/runtime dependencies, importable
// by a future frontend as-is.

export type KnockoutEntry = {
  itemId: number
  itemName: string
  encounterId: number
  /** ISO timestamp. Always supplied by the caller -- core never reads the clock. */
  receivedAt: string
  spec?: string
  specSpecific?: boolean
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
  knockedOut: boolean
  /** Expected rolls to land this entry via uniform sampling without replacement: (n+1)/2 for a remaining pool of size n. Set only for non-knocked-out entries. */
  rollsToTargetExpected?: number
  /** Worst-case rolls to land this entry (n, the pool's remaining size). Set only for non-knocked-out entries. */
  rollsToTargetWorst?: number
  /** Expected rolls actually spent hunting this entry, given the player abandons the pool once its remaining mean value falls below threshold after a miss. Set only for non-knocked-out entries. */
  rollsToTargetTruncated?: number
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
  deployable: boolean
  notes: string[]
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
