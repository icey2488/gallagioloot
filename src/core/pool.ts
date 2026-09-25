import type { LootTableEncounter, LootTableItem, NormalizedItem, NormalizedReport } from '../types'
import type { BossEval, KnockoutState, PoolEntry, Settings } from './types'
import { rollsToTarget } from './vault'
import { difficultyLabel, keyLevelOf, knockoutDifficulty, targetKey, targetKindOf } from './targets'
import { curioEntryKeys } from './curio'

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

/**
 * Models `unattributedCount` unattributed bonus rolls (rollsSpent beyond the count of
 * attributed 'rolled' entries) as uniform, information-free draws from the boss's
 * remaining "unknown" pool (ownership 'none' -- never a dud, already known to be owned;
 * never rolled, those are excluded from `remainingEntries` already since they're knocked
 * out). A forgotten roll's result is unknown, so the unbiased estimate of what it took is
 * the MEAN of that unknown subset -- returned as a fractional adjustment to subtract from
 * the boss's raw EV sum/count, rather than physically removing a specific entry (which
 * would bias the remaining mean upward if it always removed the worst item, as the old
 * "remove the lowest-value none entry" approach did). Clamped so denominatorDelta never
 * exceeds the unknown subset's own size.
 */
function unattributedAdjustment(remainingEntries: PoolEntry[], unattributedCount: number): { numeratorDelta: number; denominatorDelta: number } {
  const unknownEntries = remainingEntries.filter((e) => e.ownership === 'none')
  const unknownCount = unknownEntries.length

  if (unattributedCount <= 0 || unknownCount === 0) {
    return { numeratorDelta: 0, denominatorDelta: 0 }
  }

  const n = Math.min(unattributedCount, unknownCount)
  const meanValue = unknownEntries.reduce((acc, e) => acc + effectiveValue(e), 0) / unknownCount

  return { numeratorDelta: meanValue * n, denominatorDelta: n }
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
  const expectedDifficulty = knockoutDifficulty(report)
  const difficultyMismatch = knockout.difficulty !== expectedDifficulty
  // Stored entries that refer to a curio (recorded when it was still modeled as a pool entry)
  // are ignored: the curio can't be won with a bonus roll, and an entry keyed by one of its
  // tier pieces would otherwise mark that piece owned/rolled at the boss that really drops it.
  const curioKeys = curioEntryKeys(report, lootTable)
  const knockoutEntries = difficultyMismatch ? [] : knockout.entries.filter((e) => !curioKeys.has(`${e.encounterId}:${e.itemId}`))
  const equippedIds = new Set(report.equippedItemIds ?? [])
  const expectedTargets = settings.expectedTargets ? new Set(settings.expectedTargets) : null
  const expectedKills = settings.expectedKills ? new Set(settings.expectedKills) : null
  const kind = targetKindOf(report)
  const label = difficultyLabel(report)
  const keyLevel = kind === 'mplus' ? keyLevelOf(report) : undefined

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
        `Knockout state is for difficulty "${knockout.difficulty}" but report is for "${expectedDifficulty}"; knockout state not applied`
      )
    }

    const pool: PoolEntry[] = []

    // Curio-routed rows (Ula'tek's Slumbering Coil Curio -> any tier slot) are not a bonus-roll
    // outcome at all, so they never enter the pool -- see ./curio.ts. The loot table's `viaCurio`
    // flag identifies them; the report's own `item.viaCurio` covers callers with no loot table.
    // (Live Raidbots profileset rows mark a catalyst conversion via `catalystSourceId` on an
    // otherwise-normal row rather than `viaCurio`, see normalize/raidbots.ts.)
    const lootDirectById = new Map<number, LootTableItem>()
    const lootCurioIds = new Set<number>()
    for (const row of lootItems) {
      if (row.viaCurio) lootCurioIds.add(row.itemId)
      else lootDirectById.set(row.itemId, row)
    }

    // Catalyst rows (`catalystSourceId` set) are the tier piece a dropped item converts
    // into. A roll yields the SOURCE item, never the tier piece, so a catalyst row is never a
    // pool entry of its own -- it only credits its source item: value = max(own delta,
    // catalyzed delta). Same rule for raid and Mythic+.
    const catalystBySource = new Map<number, NormalizedItem>()
    const directByItemId = new Map<number, NormalizedItem[]>()
    for (const item of items) {
      if (item.catalystSourceId !== undefined) {
        const existing = catalystBySource.get(item.catalystSourceId)
        if (!existing || item.delta > existing.delta) catalystBySource.set(item.catalystSourceId, item)
        continue
      }
      if (item.viaCurio || lootCurioIds.has(item.itemId)) continue
      const list = directByItemId.get(item.itemId)
      if (list) list.push(item)
      else directByItemId.set(item.itemId, [item])
    }

    let notInSimReportCount = 0
    let notInLootTableCount = 0

    const directItemIds = new Set<number>([...directByItemId.keys(), ...lootDirectById.keys(), ...catalystBySource.keys()])
    for (const itemId of directItemIds) {
      const rows = directByItemId.get(itemId)
      const lootRow = lootDirectById.get(itemId)
      const catalystRow = catalystBySource.get(itemId)
      if (lootTable && !lootRow) notInLootTableCount++

      const specSpecific = lootRow?.specSpecific ?? false
      let entry: PoolEntry
      if (rows || catalystRow) {
        const own = rows ? bestByDelta(rows) : undefined
        const ownValue = Math.max(own?.delta ?? 0, 0)
        const catalyzedWins = !!catalystRow && catalystRow.delta > ownValue
        const valueRow: NormalizedItem = catalyzedWins
          ? {
              ...catalystRow!,
              itemId,
              name: own?.name ?? catalystRow!.catalystSourceName ?? lootRow?.name ?? `Item ${itemId}`,
              tierSlot: own?.tierSlot,
            }
          : own ?? { ...catalystRow!, itemId, name: catalystRow!.catalystSourceName ?? lootRow?.name ?? `Item ${itemId}`, delta: 0, tierSlot: undefined, meanError: undefined }
        entry = toEntry(`item:${itemId}`, [itemId], valueRow, own?.tierSlot ? 'tier-token' : 'item', report.baseline, specSpecific)
        if (catalyzedWins) {
          entry.catalyst = {
            itemId: catalystRow!.itemId,
            name: catalystRow!.name,
            tierSlot: catalystRow!.slot,
            pct: entry.pct,
            ownPct: report.baseline > 0 ? (ownValue / report.baseline) * 100 : 0,
          }
        }
      } else {
        // lootRow must be defined here -- itemId came from the union of both key sets.
        notInSimReportCount++
        entry = phantomEntry(`item:${itemId}`, [itemId], lootRow!.name, lootRow!.isTier ? 'tier-token' : 'item', lootRow!.tierSlot, specSpecific)
      }
      let ownership = resolveOwnership(entry.itemIds, entry.specSpecific, knockoutEntries, report.spec, settings.lootSpecId)
      // Equipped gear defaults to Owned (a value-0 dud) only when the sim doesn't show the drop as an upgrade
      // (no sim row, or best delta incl. catalyst credit <= 0) -- a positive delta means the drop copy is the
      // better one. A state the user set always wins.
      if (entry.itemIds.some((id) => equippedIds.has(id))) {
        entry.equipped = true
        entry.equippedUpgrade = entry.rawDelta > 0
        if (ownership === 'none' && !entry.equippedUpgrade) {
          ownership = 'owned'
          entry.autoOwned = true
        }
      }
      applyOwnership(entry, ownership)
      pool.push(entry)
    }

    // Unattributed bonus rolls: a roll counted against this boss but not tied to a specific
    // 'rolled' entry still happened, but a forgotten roll carries no information about what
    // it gave -- so rather than removing a specific (and therefore biased-toward-worst)
    // entry, it's modeled as a fractional uniform draw from the remaining unknown pool (see
    // unattributedAdjustment): the EV numerator/denominator both shrink by the unknown
    // subset's mean/count, but no PoolEntry is actually knocked out.
    const rolledCount = pool.filter((p) => p.ownership === 'rolled').length
    const storedRollsSpent = difficultyMismatch ? 0 : knockout.rollsSpent?.[encounterId] ?? 0
    const effectiveRollsSpent = Math.max(storedRollsSpent, rolledCount)
    const rollsUnattributed = effectiveRollsSpent - rolledCount

    const remainingEntries = pool.filter((p) => !p.knockedOut)
    const { numeratorDelta, denominatorDelta } = unattributedAdjustment(remainingEntries, rollsUnattributed)
    const remaining = remainingEntries.length - denominatorDelta
    const rawSum = remainingEntries.reduce((sum, p) => sum + effectiveValue(p), 0)
    const ev = remaining > 0 ? (rawSum - numeratorDelta) / remaining : 0
    const evPct = report.baseline > 0 ? (ev / report.baseline) * 100 : 0
    const bestCase = remainingEntries.length > 0 ? remainingEntries.reduce((a, b) => (effectiveValue(b) > effectiveValue(a) ? b : a)) : null

    const thresholdValue = (settings.thresholdPct / 100) * report.baseline
    for (const entry of remainingEntries) {
      const { expected, worstCase, expectedTruncated } = rollsToTarget(remainingEntries, entry.key, thresholdValue, remaining)
      entry.rollsToTargetExpected = expected
      entry.rollsToTargetWorst = worstCase
      entry.rollsToTargetTruncated = expectedTruncated
    }

    const knockedOutCount = pool.filter((p) => p.ownership === 'rolled').length
    if (knockedOutCount > 0) notes.push(`${knockedOutCount} item${knockedOutCount === 1 ? '' : 's'} rolled (knocked out)`)
    const dudCount = pool.filter((p) => p.isDud).length
    if (dudCount > 0) notes.push(`${dudCount} owned dud${dudCount === 1 ? '' : 's'} in pool (value 0)`)
    if (rollsUnattributed > 0) {
      notes.push(`${rollsUnattributed} unattributed roll${rollsUnattributed === 1 ? '' : 's'} modeled as a uniform draw from the unknown pool (mean value, fractional denominator)`)
    }
    if (remaining === 0) notes.push('pool exhausted')

    if (notInSimReportCount > 0) {
      notes.push(`${notInSimReportCount} item${notInSimReportCount === 1 ? '' : 's'} in the loot table but not in sim report (valued 0)`)
    }
    if (notInLootTableCount > 0) {
      notes.push(`${notInLootTableCount} item${notInLootTableCount === 1 ? '' : 's'} in sim report but not in this boss's loot table`)
    }

    const key = targetKey(report, encounterId)
    const inExpectedKills = expectedTargets ? expectedTargets.has(key) : !expectedKills || expectedKills.has(encounterId)
    if (!inExpectedKills) notes.push('not in expected kills this week')

    bossEvals.push({
      encounterId,
      encounterName: items[0]?.encounterName ?? lootNameByEncounter.get(encounterId) ?? `Encounter ${encounterId}`,
      instanceId: items[0]?.instanceId ?? report.instanceId ?? 0,
      targetKey: key,
      kind,
      difficultyLabel: label,
      keyLevel,
      baseline: report.baseline,
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
