// Decision-engine types. Pure data -- no Worker/runtime dependencies, importable
// by a future frontend as-is.

import type { TargetKind } from '../types'

/**
 * How the player obtained an item, under the roll-only knockout model (operator ruling):
 * - `'rolled'`: received FROM A BONUS ROLL. Removed from that boss's roll pool -- a true
 *   knockout, it can no longer be drawn.
 * - `'owned'`: obtained any OTHER way (regular drop, Great Vault, trade). Stays in the pool
 *   as a value-0 "dud": still counted in the EV denominator, but worth nothing if drawn.
 * The absence of a KnockoutEntry for an item is the implicit third state, "none".
 * `'rolled'` implies `'owned'`.
 */
export type ItemOwnership = 'owned' | 'rolled'

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
  /**
   * Roll-only knockout state (see ItemOwnership). A pre-v2 entry has no `state`; it meant
   * "removed from the pool", i.e. `'rolled'` -- `deserialize()` migrates it to that.
   */
  state: ItemOwnership
}

export type KnockoutState = {
  character: string
  realm?: string
  region?: string
  difficulty: string
  entries: KnockoutEntry[]
  /**
   * Bonus rolls spent per boss (encounterId -> count), for the unattributed-rolls model.
   * A roll not attributed to a specific `'rolled'` entry still removes one unknown, non-BIS
   * item from that boss's pool (had it been a BIS hit, the player would have marked it).
   * The effective counter is never below the boss's count of `'rolled'` entries (buildBossPools
   * clamps it up); an absent/missing key means no unattributed rolls for that boss.
   */
  rollsSpent?: Record<number, number>
  version: 2
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
   * Target keys (see targetKey in targets.ts) the player expects to kill -- or, for a
   * Mythic+ dungeon, will run a key for -- this week. Takes precedence over `expectedKills`
   * when set; needed once several reports are loaded, since the same boss on two
   * difficulties shares an encounter id.
   */
  expectedTargets?: string[]
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
  kind: 'item' | 'tier-token'
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
  /**
   * Set when this entry is worth more catalyzed than as-is: an item's value is
   * max(its own sim delta, the delta of the tier piece it catalyzes into -- the report's
   * catalyst row whose `catalystSourceId` is this item). Present only when the catalyzed
   * value wins AND is a net upgrade, so the UI can say "Catalyze into <name>: +x%". `ownPct`
   * is the item's own floored gain (0 when it wasn't simmed as-is).
   */
  catalyst?: { itemId: number; name: string; tierSlot?: string; pct: number; ownPct: number }
  /**
   * Roll-only ownership state from the knockout state:
   * - `'none'`: no knockout entry -- a normal, full-value pool member.
   * - `'owned'`: owned from a non-roll source -- a value-0 dud that stays in the pool (`isDud: true`, `knockedOut: false`).
   * - `'rolled'`: received via a bonus roll -- removed from the pool (`knockedOut: true`).
   */
  ownership: 'none' | 'owned' | 'rolled'
  /** True when one of this entry's item ids is equipped in the report's sim profile (`NormalizedReport.equippedItemIds`), whatever its ownership state. */
  equipped?: boolean
  /**
   * True when `ownership` is `'owned'` only because the item is equipped -- the automatic
   * default. Never stored: a stored knockout entry (the user's own choice) always wins over
   * it, and it is re-derived from each report's gear on every evaluation.
   */
  autoOwned?: boolean
  /** True when this entry is a dud (owned but not rolled): kept in the pool denominator, but contributes 0 to EV. */
  isDud: boolean
  /**
   * True only for a `'rolled'` entry. Unattributed bonus rolls (rollsSpent exceeding the
   * count of `'rolled'` entries) do NOT knock out any specific entry -- a forgotten roll
   * carries no information about what it gave, so it's modeled as a fractional mean draw
   * against the boss's whole remaining "unknown" pool instead (see `BossEval.remaining`,
   * which is reduced by that fraction, and `buildBossPools`' `unattributedAdjustment`).
   */
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
  /**
   * Identity of this roll target across every loaded report (see targetKey in targets.ts),
   * e.g. "raid-vault-mythic:2883" or "mplus-myth:1322". Set by buildBossPools; optional only
   * so hand-built evals (tests, design fixtures) stay valid -- use `evalKey()` to read it.
   */
  targetKey?: string
  /** 'raid': (boss, difficulty), one roll per week. 'mplus': a dungeon at a key level, repeatable. Undefined = 'raid'. */
  kind?: TargetKind
  /** Human label for the target's difficulty/track, e.g. "Mythic" or "+10 (Myth)". */
  difficultyLabel?: string
  /** Mythic+ only: the lowest key level the report's rolls come from (10 = "+10 and above"). */
  keyLevel?: number
  /** The source report's baseline, so EV% from different reports sits on one scale. */
  baseline?: number
  pool: PoolEntry[]
  /**
   * Count of non-knocked-out pool entries, minus the fractional denominator taken by any
   * unattributed bonus rolls (see `unattributedAdjustment` in pool.ts) -- so this can be
   * less than the number of entries actually still present in `pool` with `knockedOut:
   * false`. Not necessarily an integer number of *entries* conceptually, but always an
   * integer value: each unattributed roll subtracts exactly 1.
   */
  remaining: number
  /** Bonus rolls spent on this boss: the effective counter, max(stored rollsSpent, count of `'rolled'` entries). */
  rollsSpent: number
  /** How many of `rollsSpent` are attributed to a specific `'rolled'` pool entry. */
  rollsAttributed: number
  /** `rollsSpent - rollsAttributed`: rolls that each removed one unknown, non-BIS item from the pool. */
  rollsUnattributed: number
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
  targetKey?: string
  kind?: TargetKind
  difficultyLabel?: string
  keyLevel?: number
  /** Always 1 for a raid target (one roll per boss per difficulty per week); an M+ target can take more than one (one per key run). */
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
  tossUp: { bosses: [string, string]; gapPct: number; targetKeys?: [string, string] } | null
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
  /** Set when the vault item was found in a loot pool but that target isn't one of this week's allocated rolls, so no saved-rolls credit was given. */
  savedRollsNote?: string
  verdict: 'vault' | 'voidcore' | 'tokens' | 'toss-up'
  explanation: string
  notes: string[]
}
