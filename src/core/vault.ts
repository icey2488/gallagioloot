import type { NormalizedReport, NormalizedTopGear, TopGearCandidate } from '../types'
import type { BossEval, PoolEntry, Recommendation, Settings, VaultDecision, VaultItemInput } from './types'
import { isTossUpGap } from './tossup'
import { evalKey } from './targets'
import { planVoidcores, type ExtraVoidcore, type VoidcoreSupply } from './supply'
import { rankTargets, rollSequence } from './rank'

/** EV-contributing value of a pool entry: a dud (owned, not rolled) is worth 0 while still occupying the pool. */
function poolValue(entry: PoolEntry): number {
  return entry.isDud ? 0 : entry.value
}

/**
 * Threshold-truncated rolls to land one specific pool entry via uniform sampling without
 * replacement (knockout: each roll permanently removes the drawn entry), for a player who
 * abandons the hunt once, after a miss, the pool's remaining mean value has fallen below
 * `thresholdValue` (absolute). (The untruncated figures are closed-form, (n+1)/2 and n, and
 * buildBossPools sets them on each entry directly.) Only compareVault needs this, for the one
 * vault target it compares.
 */
/** Largest pool solved by the exact subset recurrence (2^n memoized states); bigger pools use the seeded Monte Carlo estimate. */
export const EXACT_TRUNCATED_LIMIT = 10
/** Monte Carlo sample count above EXACT_TRUNCATED_LIMIT: standard error is well under 0.05 rolls for realistic pools. */
export const TRUNCATED_SAMPLES = 4000

/** Exact up to EXACT_TRUNCATED_LIMIT entries, a deterministic Monte Carlo estimate above that. */
export function expectedTruncatedRolls(pool: PoolEntry[], entryKey: string, thresholdValue: number): number {
  if (pool.length === 0) return 0
  return pool.length <= EXACT_TRUNCATED_LIMIT ? truncatedExact(pool, entryKey, thresholdValue) : truncatedMonteCarlo(pool, entryKey, thresholdValue)
}

/** Exact recurrence over remaining subsets, memoized on a bitmask (exponential: only for small pools). */
export function truncatedExact(pool: PoolEntry[], entryKey: string, thresholdValue: number): number {
  const values = pool.map(poolValue)
  const target = pool.findIndex((p) => p.key === entryKey)
  const memo = new Map<number, number>()

  function solve(mask: number, count: number, sum: number): number {
    if (count === 1) return 1 // the only entry left must be the target
    const cached = memo.get(mask)
    if (cached !== undefined) return cached
    let total = 0
    for (let i = 0; i < values.length; i++) {
      if (!(mask & (1 << i))) continue
      if (i === target) {
        total += 1
        continue
      }
      const afterSum = sum - values[i]
      const keepsHunting = afterSum / (count - 1) >= thresholdValue
      total += 1 + (keepsHunting ? solve(mask & ~(1 << i), count - 1, afterSum) : 0)
    }
    const result = total / count
    memo.set(mask, result)
    return result
  }

  return solve((1 << pool.length) - 1, pool.length, values.reduce((a, b) => a + b, 0))
}

/** mulberry32: a small seeded PRNG, so the estimate is deterministic (core stays pure and testable). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/**
 * Monte Carlo estimate of the same quantity: draw a uniform order without replacement, stop on
 * the target or once a miss leaves the remaining mean below threshold. Seeded from the pool's
 * keys and the target, so the same inputs always give the same estimate.
 */
export function truncatedMonteCarlo(pool: PoolEntry[], entryKey: string, thresholdValue: number, samples = TRUNCATED_SAMPLES): number {
  const values = pool.map(poolValue)
  const target = pool.findIndex((p) => p.key === entryKey)
  const totalSum = values.reduce((a, b) => a + b, 0)
  const rand = mulberry32(hashString(`${entryKey}#${pool.map((p) => p.key).sort().join('|')}`))
  const idx = values.map((_, i) => i)
  let total = 0
  for (let s = 0; s < samples; s++) {
    let sum = totalSum
    let rolls = 0
    for (let k = 0; k < idx.length; k++) {
      // Partial Fisher-Yates: pick the k-th draw from the not-yet-drawn tail.
      const j = k + Math.floor(rand() * (idx.length - k))
      const t = idx[k]
      idx[k] = idx[j]
      idx[j] = t
      const drawn = idx[k]
      rolls++
      if (drawn === target) break
      sum -= values[drawn]
      const left = idx.length - k - 1
      if (left === 0 || sum / left < thresholdValue) break
    }
    total += rolls
  }
  return total / samples
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
 * The marginal target: the next one in this week's roll order (deployable targets, best first,
 * targeting rules applied, `excludeKey`'s target left out) after the rolls the recommendation
 * already places elsewhere -- i.e. the best target that got no roll. Rolls freed by taking the
 * vault item go there, not to the best other boss (which already has its roll). Null when the
 * order has nothing left.
 */
export function marginalTarget(bossEvals: BossEval[], recommendation: Recommendation, excludeKey: string | undefined): BossEval | null {
  const placedElsewhere = recommendation.allocations.filter((a) => evalKey(a) !== excludeKey).reduce((n, a) => n + a.rolls, 0)
  const ranked = rankTargets(bossEvals.filter((b) => b.deployable && (excludeKey === undefined || evalKey(b) !== excludeKey)))
  return rollSequence(ranked, placedElsewhere + 1)[placedElsewhere] ?? null
}

/** EV% of `savedRolls` freed rolls, each valued at the marginal target (see marginalTarget). */
export function freedRollsValuePct(bossEvals: BossEval[], recommendation: Recommendation, excludeKey: string | undefined, savedRolls: number): number {
  if (!(savedRolls > 0)) return 0
  return savedRolls * (marginalTarget(bossEvals, recommendation, excludeKey)?.evPct ?? 0)
}

/** Why a vault item credits no saved rolls when its loot source isn't one of this week's allocated roll targets. */
export function noSavedRollsNote(itemName: string, targetName: string): string {
  return `${targetName} isn't a target you'd roll this week, so taking "${itemName}" saves no rolls.`
}

/** A player with no Voidcores and the default earning rate: one more Voidcore is simply their first roll. */
const FRESH_SUPPLY: VoidcoreSupply = { onHand: 0, toSpend: 0, earnedPerWeek: 1 }

/** "roll 4: The Lost Explorers (Mythic)" / "next week: The Coiled Altar (Mythic)" -- where one more Voidcore goes. */
export function extraVoidcoreWhere(extra: ExtraVoidcore): string {
  const name = extra.target.kind === 'mplus' || !extra.target.difficultyLabel ? extra.target.encounterName : `${extra.target.encounterName} (${extra.target.difficultyLabel})`
  return extra.use === 'spend' ? `roll ${extra.roll}: ${name}` : `next week: ${name}`
}

/**
 * Compares the Great Vault's two options for the week: take a specific vault item outright, or
 * take the Nebulous Voidcore, which adds ONE Voidcore to supply. That Voidcore is worth
 * max(its spend-now EV as the next roll in this week's order, its hold value next week) under
 * `supply` (see `planVoidcores`; defaults to a player with none on hand, for whom it is simply
 * roll 1). `bossEvals` may span several reports (raid difficulties + Mythic+): the vault item is
 * matched against every target's pool, and the rolls it frees are valued at the marginal targets
 * (see freedRollsValuePct). `report` only supplies a fallback baseline for evals built without one.
 *
 * The saved-rolls credit only applies when the vault item's target is among the targets
 * `recommendation` allocates rolls to this week: you can't save rolls you would never have
 * spent hunting there. Otherwise savedRolls is 0 and the comparison is the plain vault item
 * gain against the Voidcore (`savedRollsNote` says why).
 */
export function compareVault(input: {
  vaultItem: VaultItemInput | null
  bossEvals: BossEval[]
  recommendation: Recommendation
  settings: Settings
  report: NormalizedReport
  supply?: VoidcoreSupply
}): VaultDecision {
  const { vaultItem, bossEvals, recommendation, settings, report } = input
  const notes: string[] = []

  const voidcoreUse = planVoidcores(bossEvals, input.supply ?? FRESH_SUPPLY).extra
  const voidcoreGainPct = voidcoreUse?.valuePct ?? 0

  if (!vaultItem) {
    notes.push('No vault item specified this week; comparing the Voidcore against a zero-value alternative.')
  }

  const found = vaultItem ? findVaultPool(vaultItem, bossEvals) : null
  if (vaultItem && !found) {
    notes.push(`Could not identify the loot pool for "${vaultItem.name}"; assuming 0 saved rolls.`)
  }

  const thresholdValue = (settings.thresholdPct / 100) * (found?.boss.baseline ?? report.baseline)

  // Roll-only knockout: taking the vault item X does NOT remove X from its boss's roll
  // pool -- X becomes a value-0 dud there, so next week's roll on that boss is diluted, not
  // shrunk (see buildBossPools' `owned` handling). The saved-rolls credit is kept as-is: it
  // stands for the bonus rolls you'd otherwise spend hunting X, freed to spend on the MARGINAL
  // targets -- the next ones in this week's order that got no roll (freedRollsValuePct), not
  // the best other boss, which already has a roll. X's own boss is excluded, so its post-vault
  // dud state doesn't feed back into this figure.
  let savedRolls = 0
  let savedRollsNote: string | undefined
  if (found) {
    const allocated = recommendation.allocations.some((a) => evalKey(a) === evalKey(found.boss))
    if (allocated) {
      const remainingPool = found.boss.pool.filter((p) => !p.knockedOut)
      // Computed here, for the one target being compared -- not for every pool entry on every render.
      savedRolls = Math.min(expectedTruncatedRolls(remainingPool, found.target.key, thresholdValue), remainingPool.length)
    } else {
      savedRollsNote = noSavedRollsNote(vaultItem!.name, found.boss.encounterName)
      notes.push(savedRollsNote)
    }
    notes.push(`Taking "${vaultItem!.name}" leaves it in ${found.boss.encounterName}'s roll pool as a value-0 dud (roll-only knockout).`)
  }

  const excludeKey = found ? evalKey(found.boss) : undefined
  const freedPct = freedRollsValuePct(bossEvals, recommendation, excludeKey, savedRolls)

  const vaultItemGainPct = (vaultItem?.gainPct ?? 0) + freedPct

  const belowThresholdA = voidcoreGainPct < settings.thresholdPct
  const belowThresholdB = vaultItemGainPct < settings.thresholdPct

  let verdict: VaultDecision['verdict']
  let explanation: string

  if (belowThresholdA && belowThresholdB) {
    verdict = 'tokens'
    explanation = `Neither the Voidcore (~${voidcoreGainPct.toFixed(2)}%) nor "${vaultItem?.name ?? 'the vault item'}" (~${vaultItemGainPct.toFixed(2)}%) clears the ${settings.thresholdPct}% threshold this week; take the Great Vault's Thalassian Tokens of Merit instead.`
  } else {
    const diff = Math.abs(voidcoreGainPct - vaultItemGainPct)
    if (isTossUpGap(diff, Math.max(voidcoreGainPct, vaultItemGainPct), { pctOfReference: 0.1 })) {
      verdict = 'toss-up'
      explanation = `Voidcore (~${voidcoreGainPct.toFixed(2)}%) and "${vaultItem?.name ?? 'the vault item'}" (~${vaultItemGainPct.toFixed(2)}%) are close enough to call a toss-up.`
      notes.push("When it's close, prefer the vault item if it removes a dungeon from your weekly farm.")
    } else if (vaultItemGainPct > voidcoreGainPct) {
      verdict = 'vault'
      explanation = `"${vaultItem?.name ?? 'The vault item'}" (~${vaultItemGainPct.toFixed(2)}%) beats the Voidcore (~${voidcoreGainPct.toFixed(2)}%) by ${(vaultItemGainPct - voidcoreGainPct).toFixed(2)} points.`
    } else {
      verdict = 'voidcore'
      explanation = `The Voidcore (~${voidcoreGainPct.toFixed(2)}%) beats "${vaultItem?.name ?? 'the vault item'}" (~${vaultItemGainPct.toFixed(2)}%) by ${(voidcoreGainPct - vaultItemGainPct).toFixed(2)} points.`
    }
  }

  return { voidcoreGainPct, voidcoreUse, vaultItemGainPct, savedRolls, savedRollsNote, verdict, explanation, notes }
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
