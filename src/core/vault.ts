import type { NormalizedReport, NormalizedTopGear, TopGearCandidate } from '../types'
import type { BossEval, PoolEntry, Recommendation, RollsToTarget, Settings, VaultDecision, VaultItemInput } from './types'
import { isTossUpGap } from './tossup'

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length
}

/** EV-contributing value of a pool entry: a dud (owned, not rolled) is worth 0 while still occupying the pool. */
function poolValue(entry: PoolEntry): number {
  return entry.isDud ? 0 : entry.value
}

/**
 * Exact expected/worst-case/threshold-truncated roll counts to land one specific pool
 * entry via uniform sampling without replacement (knockout: each roll permanently
 * removes the drawn entry). `expected` and `worstCase` ignore truncation -- (n+1)/2 and
 * n for a remaining pool of size n, by the standard without-replacement rank argument.
 *
 * `expectedTruncated` models a player who abandons the hunt once, after a miss, the
 * pool's remaining mean value has fallen below `thresholdValue` (absolute). Computed
 * exactly via a recurrence over remaining subsets (memoized on the subset's sorted keys)
 * rather than simulation: each state's continuation depends only on which entries remain,
 * not the order they were drawn in, so this is provably exact, not an approximation.
 */
export function rollsToTarget(pool: PoolEntry[], entryKey: string, thresholdValue: number): RollsToTarget {
  const n = pool.length
  if (n === 0) return { expected: 0, worstCase: 0, expectedTruncated: 0 }

  const expected = (n + 1) / 2
  const worstCase = n

  const memo = new Map<string, number>()

  function stateKey(remaining: PoolEntry[]): string {
    return remaining
      .map((p) => p.key)
      .sort()
      .join('|')
  }

  function expectedRemainingRolls(remaining: PoolEntry[]): number {
    const m = remaining.length
    if (m === 1) return 1 // the only entry left must be the target

    const key = stateKey(remaining)
    const cached = memo.get(key)
    if (cached !== undefined) return cached

    let total = 0
    for (const drawn of remaining) {
      if (drawn.key === entryKey) {
        total += 1
        continue
      }
      const after = remaining.filter((p) => p.key !== drawn.key)
      const keepsHunting = mean(after.map((p) => poolValue(p))) >= thresholdValue
      total += 1 + (keepsHunting ? expectedRemainingRolls(after) : 0)
    }

    const result = total / m
    memo.set(key, result)
    return result
  }

  return { expected, worstCase, expectedTruncated: expectedRemainingRolls(pool) }
}

/**
 * Locates the BossEval/PoolEntry a vault item corresponds to, so its saved-rolls math
 * can be computed against that specific loot pool. Matches by itemId first (the vault
 * item is a specific piece of gear also obtainable via bonus roll), falling back to
 * encounterId (the vault item represents a whole dungeon/boss's reward and the pool's
 * current bestCase entry stands in as the target).
 */
function findVaultPool(vaultItem: VaultItemInput, bossEvals: BossEval[]): { boss: BossEval; target: PoolEntry } | null {
  if (vaultItem.itemId !== undefined) {
    for (const boss of bossEvals) {
      const target = boss.pool.find((p) => !p.knockedOut && p.itemIds.includes(vaultItem.itemId!))
      if (target) return { boss, target }
    }
  }
  if (vaultItem.encounterId !== undefined) {
    const boss = bossEvals.find((b) => b.encounterId === vaultItem.encounterId)
    if (boss?.bestCase) return { boss, target: boss.bestCase }
  }
  return null
}

/**
 * Compares the Great Vault's two options for the week: take a specific vault item
 * outright, or take the Nebulous Voidcore and spend `settings.rollsAvailable` bonus
 * rolls per `recommend()`'s allocation.
 */
export function compareVault(input: {
  vaultItem: VaultItemInput | null
  bossEvals: BossEval[]
  recommendation: Recommendation
  settings: Settings
  report: NormalizedReport
}): VaultDecision {
  const { vaultItem, bossEvals, recommendation, settings, report } = input
  const notes: string[] = []

  const voidcoreGainPct = recommendation.totalExpectedGainPct

  if (!vaultItem) {
    notes.push('No vault item specified this week; comparing the Voidcore path against a zero-value alternative.')
  }

  const found = vaultItem ? findVaultPool(vaultItem, bossEvals) : null
  if (vaultItem && !found) {
    notes.push(`Could not identify the loot pool for "${vaultItem.name}"; assuming 0 saved rolls.`)
  }

  const thresholdValue = (settings.thresholdPct / 100) * report.baseline

  // Roll-only knockout: taking the vault item X does NOT remove X from its boss's roll
  // pool -- X becomes a value-0 dud there, so next week's roll on that boss is diluted, not
  // shrunk (see buildBossPools' `owned` handling). The saved-rolls credit is kept as-is: it
  // stands for the bonus rolls you'd otherwise spend hunting X, freed to spend on the best
  // OTHER boss (altRollEvPct below already excludes X's own boss, so X's post-vault dud state
  // doesn't feed back into this figure).
  let savedRolls = 0
  if (found) {
    const remainingPool = found.boss.pool.filter((p) => !p.knockedOut)
    const { expectedTruncated } = rollsToTarget(remainingPool, found.target.key, thresholdValue)
    savedRolls = Math.min(expectedTruncated, remainingPool.length)
    notes.push(`Taking "${vaultItem!.name}" leaves it in ${found.boss.encounterName}'s roll pool as a value-0 dud (roll-only knockout).`)
  }

  const excludeEncounterId = found?.boss.encounterId
  let altBoss: BossEval | null = null
  for (const boss of bossEvals) {
    if (!boss.deployable) continue
    if (excludeEncounterId !== undefined && boss.encounterId === excludeEncounterId) continue
    if (!altBoss || boss.evPct > altBoss.evPct) altBoss = boss
  }
  const altRollEvPct = altBoss?.evPct ?? 0

  const vaultItemGainPct = (vaultItem?.gainPct ?? 0) + savedRolls * altRollEvPct

  const belowThresholdA = voidcoreGainPct < settings.thresholdPct
  const belowThresholdB = vaultItemGainPct < settings.thresholdPct

  let verdict: VaultDecision['verdict']
  let explanation: string

  if (belowThresholdA && belowThresholdB) {
    verdict = 'tokens'
    explanation = `Neither the Voidcore path (~${voidcoreGainPct.toFixed(2)}%) nor "${vaultItem?.name ?? 'the vault item'}" (~${vaultItemGainPct.toFixed(2)}%) clears the ${settings.thresholdPct}% threshold this week; take the Great Vault's Thalassian Tokens of Merit instead.`
  } else {
    const diff = Math.abs(voidcoreGainPct - vaultItemGainPct)
    if (isTossUpGap(diff, Math.max(voidcoreGainPct, vaultItemGainPct), { pctOfReference: 0.1 })) {
      verdict = 'toss-up'
      explanation = `Voidcore (~${voidcoreGainPct.toFixed(2)}%) and "${vaultItem?.name ?? 'the vault item'}" (~${vaultItemGainPct.toFixed(2)}%) are close enough to call a toss-up.`
      notes.push("When it's close, prefer the vault item if it removes a dungeon from your weekly farm.")
    } else if (vaultItemGainPct > voidcoreGainPct) {
      verdict = 'vault'
      explanation = `"${vaultItem?.name ?? 'The vault item'}" (~${vaultItemGainPct.toFixed(2)}%) beats the Voidcore path (~${voidcoreGainPct.toFixed(2)}%) by ${(vaultItemGainPct - voidcoreGainPct).toFixed(2)} points.`
    } else {
      verdict = 'voidcore'
      explanation = `The Voidcore path (~${voidcoreGainPct.toFixed(2)}%) beats "${vaultItem?.name ?? 'the vault item'}" (~${vaultItemGainPct.toFixed(2)}%) by ${(voidcoreGainPct - vaultItemGainPct).toFixed(2)} points.`
    }
  }

  return { voidcoreGainPct, vaultItemGainPct, savedRolls, verdict, explanation, notes }
}

export type TopGearVaultItem = VaultItemInput & {
  /** Other items the winning Top Gear combination also swapped in, beyond the primary one -- for display only, not fed into compareVault. */
  extraCandidates?: TopGearCandidate[]
}

/**
 * Builds a `compareVault` `vaultItem` input from a normalized Top Gear report:
 * `gainPct` is the winning combination's `pct` over baseline, and the item is the
 * candidate the winning combination added over what's currently equipped. Null when
 * the winning combination added nothing new (every candidate was already equipped, or
 * no combination beat the baseline).
 *
 * A Top Gear combination can swap in more than one item at once (e.g. two trinkets).
 * Top Gear never reports a per-item delta, only the whole combination's -- so there's
 * no principled way to split credit between candidates, and the first one (the
 * normalizer's emission order, which follows armor-slot order) is used as the primary;
 * the rest ride along as `extraCandidates` for the UI to list, not fed into `compareVault`.
 */
export function vaultItemFromTopGear(tg: NormalizedTopGear): TopGearVaultItem | null {
  const [primary, ...rest] = tg.candidates
  if (!primary) return null
  return {
    name: primary.name,
    gainPct: tg.bestSet.pct,
    itemId: primary.itemId,
    encounterId: primary.encounterId,
    extraCandidates: rest.length > 0 ? rest : undefined,
  }
}
