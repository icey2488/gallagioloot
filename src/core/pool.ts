import type { LootTableEncounter, LootTableItem, NormalizedItem, NormalizedReport } from '../types'
import type { BossEval, KnockoutState, PoolEntry, Settings } from './types'
import { rollsToTarget } from './vault'

const CURIO_NOTE = 'Curio counts as one item; value assumes you pick your best missing tier slot'
const CURIO_NAME = 'Curio (any missing tier slot)'

function bestByDelta(rows: NormalizedItem[]): NormalizedItem {
  return rows.reduce((a, b) => (b.delta > a.delta ? b : a))
}

function toEntry(key: string, itemIds: number[], best: NormalizedItem, kind: PoolEntry['kind'], baseline: number, specSpecific: boolean): PoolEntry {
  const value = Math.max(best.delta, 0)
  return {
    key,
    itemIds,
    name: best.name,
    value,
    rawDelta: best.delta,
    pct: baseline > 0 ? (value / baseline) * 100 : 0,
    kind,
    tierSlot: best.tierSlot,
    specSpecific,
    ownership: 'none',
    isDud: false,
    knockedOut: false,
    errorPct: best.meanError !== undefined && baseline > 0 ? (best.meanError / baseline) * 100 : undefined,
  }
}

/** A PoolEntry for an item the loot table knows about but the sim report never simmed -- valued 0 (no sim data to draw a real value from), still counted in the pool denominator. */
function phantomEntry(key: string, itemIds: number[], name: string, kind: PoolEntry['kind'], tierSlot: string | undefined, specSpecific: boolean): PoolEntry {
  return {
    key,
    itemIds,
    name,
    value: 0,
    rawDelta: 0,
    pct: 0,
    kind,
    tierSlot,
    specSpecific,
    ownership: 'none',
    isDud: false,
    knockedOut: false,
    notInSimReport: true,
  }
}

/** The value an entry contributes to EV: a dud (owned, not rolled) is worth 0 even though it stays in the pool. */
function effectiveValue(entry: PoolEntry): number {
  return entry.isDud ? 0 : entry.value
}

/** Mean of the remaining pool's `errorPct` values, or undefined if none carry one (e.g. QE Live). */
function meanErrorPct(entries: PoolEntry[]): number | undefined {
  const known = entries.map((e) => e.errorPct).filter((e): e is number => e !== undefined)
  if (known.length === 0) return undefined
  return known.reduce((a, b) => a + b, 0) / known.length
}

/**
 * Resolves the roll-only ownership state for a pool entry: the state of the matching
 * knockout entry (`'owned'` or `'rolled'`), or `'none'` when no entry matches. A match
 * requires the item id AND that the spec-specific gate passes: an entry isn't spec-specific,
 * or it's spec-specific for the loot spec currently in effect. "Spec-specific" is automatic
 * from the PoolEntry (derived from the loot table) unless the KnockoutEntry sets `specSpecific`
 * explicitly -- the manual override for a spec restriction the loot table doesn't know yet.
 * When both sides carry a numeric loot spec id, that's compared directly; otherwise this falls
 * back to the legacy string `spec` comparison for older data.
 */
function resolveOwnership(
  itemIds: number[],
  poolEntrySpecSpecific: boolean,
  entries: KnockoutState['entries'],
  reportSpec: string,
  currentLootSpecId: number | undefined
): 'none' | 'owned' | 'rolled' {
  let result: 'none' | 'owned' | 'rolled' = 'none'
  for (const entry of entries) {
    if (!itemIds.includes(entry.itemId)) continue
    const specSpecific = entry.specSpecific ?? poolEntrySpecSpecific
    if (specSpecific) {
      const matches =
        entry.lootSpecId !== undefined && currentLootSpecId !== undefined
          ? entry.lootSpecId === currentLootSpecId
          : entry.spec === reportSpec
      if (!matches) continue
    }
    // 'rolled' wins over 'owned' if the same item somehow carries both (rolled implies owned).
    if (entry.state === 'rolled') return 'rolled'
    result = 'owned'
  }
  return result
}

/** Stamps a pool entry with its ownership state: a dud stays in the pool at value 0; a rolled item is knocked out. */
function applyOwnership(entry: PoolEntry, ownership: 'none' | 'owned' | 'rolled'): void {
  entry.ownership = ownership
  entry.isDud = ownership === 'owned'
  entry.knockedOut = ownership === 'rolled'
}

/**
 * Groups a report's items into per-boss loot pools and evaluates each against a
 * knockout state. Pure -- no I/O, no clock access.
 *
 * When `lootTable` is supplied (the full per-boss loot table for the report's
 * instance at the current loot spec -- see src/lookup/lootTable.ts), the pool for
 * each boss is built from the FULL table rather than just what the report simmed:
 * items in the loot table absent from the report are added at value 0 (no sim data
 * to draw a value from) with `notInSimReport: true`, so the EV denominator reflects
 * the whole pool a Voidcore actually draws from. Items the report has that the loot
 * table doesn't is surfaced as a boss-level note rather than dropped. Omitting
 * `lootTable` preserves the old report-only behavior exactly (specSpecific always
 * false, no phantom entries) -- existing callers are unaffected.
 */
export function buildBossPools(report: NormalizedReport, knockout: KnockoutState, settings: Settings, lootTable?: LootTableEncounter[]): BossEval[] {
  const difficultyMismatch = knockout.difficulty !== report.difficulty
  const knockoutEntries = difficultyMismatch ? [] : knockout.entries
  const expectedKills = settings.expectedKills ? new Set(settings.expectedKills) : null

  const groups = new Map<number, NormalizedItem[]>()
  for (const item of report.items) {
    if (item.encounterId < 0) continue
    if (item.offSpec && !settings.includeOffSpec) continue
    const list = groups.get(item.encounterId)
    if (list) list.push(item)
    else groups.set(item.encounterId, [item])
  }

  const lootItemsByEncounter = new Map<number, LootTableItem[]>()
  const lootNameByEncounter = new Map<number, string>()
  for (const enc of lootTable ?? []) {
    lootItemsByEncounter.set(enc.encounterId, enc.items)
    lootNameByEncounter.set(enc.encounterId, enc.encounterName)
  }

  const encounterIds = new Set<number>([...groups.keys(), ...lootItemsByEncounter.keys()])

  const bossEvals: BossEval[] = []
  for (const encounterId of encounterIds) {
    const items = groups.get(encounterId) ?? []
    const lootItems = lootItemsByEncounter.get(encounterId) ?? []

    const notes: string[] = []
    if (difficultyMismatch) {
      notes.push(
        `Knockout state is for difficulty "${knockout.difficulty}" but report is for "${report.difficulty}"; knockout state not applied`
      )
    }

    const pool: PoolEntry[] = []

    const directByItemId = new Map<number, NormalizedItem[]>()
    const curioRows: NormalizedItem[] = []
    for (const item of items) {
      if (item.viaCurio) {
        curioRows.push(item)
        continue
      }
      const list = directByItemId.get(item.itemId)
      if (list) list.push(item)
      else directByItemId.set(item.itemId, [item])
    }

    const lootDirectById = new Map<number, LootTableItem>()
    const lootCurioById = new Map<number, LootTableItem>()
    for (const row of lootItems) {
      if (row.viaCurio) lootCurioById.set(row.itemId, row)
      else lootDirectById.set(row.itemId, row)
    }

    let notInSimReportCount = 0
    let notInLootTableCount = 0

    const directItemIds = new Set<number>([...directByItemId.keys(), ...lootDirectById.keys()])
    for (const itemId of directItemIds) {
      const rows = directByItemId.get(itemId)
      const lootRow = lootDirectById.get(itemId)
      if (lootTable && !lootRow) notInLootTableCount++

      const specSpecific = lootRow?.specSpecific ?? false
      let entry: PoolEntry
      if (rows) {
        const best = bestByDelta(rows)
        entry = toEntry(`item:${itemId}`, [itemId], best, best.tierSlot ? 'tier-token' : 'item', report.baseline, specSpecific)
      } else {
        // lootRow must be defined here -- itemId came from the union of both key sets.
        notInSimReportCount++
        entry = phantomEntry(`item:${itemId}`, [itemId], lootRow!.name, lootRow!.isTier ? 'tier-token' : 'item', lootRow!.tierSlot, specSpecific)
      }
      applyOwnership(entry, resolveOwnership(entry.itemIds, entry.specSpecific, knockoutEntries, report.spec, settings.lootSpecId))
      pool.push(entry)
    }

    const curioItemIds = new Set<number>([...curioRows.map((r) => r.itemId), ...lootCurioById.keys()])
    if (curioItemIds.size > 0) {
      const best = curioRows.length > 0 ? bestByDelta(curioRows) : undefined
      if (lootTable) {
        const missingFromReport = [...curioItemIds].filter((id) => !curioRows.some((r) => r.itemId === id))
        notInSimReportCount += missingFromReport.length > 0 && curioRows.length === 0 ? 1 : 0
      }
      const entry = best
        ? toEntry(`curio:${encounterId}`, [...curioItemIds], { ...best, name: CURIO_NAME }, 'curio', report.baseline, false)
        : phantomEntry(`curio:${encounterId}`, [...curioItemIds], lootCurioById.values().next().value?.name ?? CURIO_NAME, 'curio', undefined, false)
      entry.tierSlot = undefined
      applyOwnership(entry, resolveOwnership(entry.itemIds, entry.specSpecific, knockoutEntries, report.spec, settings.lootSpecId))
      pool.push(entry)
      notes.push(CURIO_NOTE)
    }

    // Unattributed bonus rolls: a roll counted against this boss but not tied to a
    // specific 'rolled' entry still removed one item from the pool. It can't have been
    // the player's BIS (they'd have marked that), so model it as removing the lowest-value
    // remaining "none" (unknown) entry -- never a dud (already known) and never below the
    // count of attributed rolls (the effective counter is clamped up to it).
    const rolledCount = pool.filter((p) => p.ownership === 'rolled').length
    const storedRollsSpent = difficultyMismatch ? 0 : knockout.rollsSpent?.[encounterId] ?? 0
    const effectiveRollsSpent = Math.max(storedRollsSpent, rolledCount)
    let unattributed = effectiveRollsSpent - rolledCount
    if (unattributed > 0) {
      const unknownRemaining = pool
        .filter((p) => p.ownership === 'none' && !p.knockedOut)
        .sort((a, b) => effectiveValue(a) - effectiveValue(b))
      for (const entry of unknownRemaining) {
        if (unattributed <= 0) break
        entry.knockedOut = true
        entry.removedAsUnattributed = true
        unattributed--
      }
    }

    const remainingEntries = pool.filter((p) => !p.knockedOut)
    const remaining = remainingEntries.length
    const ev = remaining > 0 ? remainingEntries.reduce((sum, p) => sum + effectiveValue(p), 0) / remaining : 0
    const evPct = report.baseline > 0 ? (ev / report.baseline) * 100 : 0
    const bestCase = remaining > 0 ? remainingEntries.reduce((a, b) => (effectiveValue(b) > effectiveValue(a) ? b : a)) : null

    const thresholdValue = (settings.thresholdPct / 100) * report.baseline
    for (const entry of remainingEntries) {
      const { expected, worstCase, expectedTruncated } = rollsToTarget(remainingEntries, entry.key, thresholdValue)
      entry.rollsToTargetExpected = expected
      entry.rollsToTargetWorst = worstCase
      entry.rollsToTargetTruncated = expectedTruncated
    }

    const knockedOutCount = pool.filter((p) => p.ownership === 'rolled').length
    if (knockedOutCount > 0) notes.push(`${knockedOutCount} item${knockedOutCount === 1 ? '' : 's'} rolled (knocked out)`)
    const dudCount = pool.filter((p) => p.isDud).length
    if (dudCount > 0) notes.push(`${dudCount} owned dud${dudCount === 1 ? '' : 's'} in pool (value 0)`)
    const rollsUnattributed = effectiveRollsSpent - rolledCount
    if (rollsUnattributed > 0) {
      notes.push(`${rollsUnattributed} unattributed roll${rollsUnattributed === 1 ? '' : 's'} removed an unknown item from the pool`)
    }
    if (remaining === 0) notes.push('pool exhausted')

    if (notInSimReportCount > 0) {
      notes.push(`${notInSimReportCount} item${notInSimReportCount === 1 ? '' : 's'} in the loot table but not in sim report (valued 0)`)
    }
    if (notInLootTableCount > 0) {
      notes.push(`${notInLootTableCount} item${notInLootTableCount === 1 ? '' : 's'} in sim report but not in this boss's loot table`)
    }

    const inExpectedKills = !expectedKills || expectedKills.has(encounterId)
    if (!inExpectedKills) notes.push('not in expected kills this week')

    bossEvals.push({
      encounterId,
      encounterName: items[0]?.encounterName ?? lootNameByEncounter.get(encounterId) ?? `Encounter ${encounterId}`,
      instanceId: items[0]?.instanceId ?? report.instanceId ?? 0,
      pool,
      remaining,
      rollsSpent: effectiveRollsSpent,
      rollsAttributed: rolledCount,
      rollsUnattributed,
      ev,
      evPct,
      bestCase,
      deployable: inExpectedKills && remaining > 0 && evPct >= settings.thresholdPct,
      notes,
      evErrorPct: meanErrorPct(remainingEntries),
    })
  }

  return bossEvals
}
