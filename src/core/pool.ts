import type { NormalizedItem, NormalizedReport } from '../types'
import type { BossEval, KnockoutState, PoolEntry, Settings } from './types'

const CURIO_NOTE = 'Curio counts as one item; value assumes you pick your best missing tier slot'
const CURIO_NAME = 'Curio (any missing tier slot)'

function bestByDelta(rows: NormalizedItem[]): NormalizedItem {
  return rows.reduce((a, b) => (b.delta > a.delta ? b : a))
}

function toEntry(key: string, itemIds: number[], best: NormalizedItem, kind: PoolEntry['kind'], baseline: number): PoolEntry {
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
    knockedOut: false,
  }
}

function isKnockedOut(itemIds: number[], entries: KnockoutState['entries'], reportSpec: string): boolean {
  return entries.some((entry) => itemIds.includes(entry.itemId) && (!entry.specSpecific || entry.spec === reportSpec))
}

/**
 * Groups a report's items into per-boss loot pools and evaluates each against
 * a knockout state. Pure -- no I/O, no clock access.
 */
export function buildBossPools(report: NormalizedReport, knockout: KnockoutState, settings: Settings): BossEval[] {
  const difficultyMismatch = knockout.difficulty !== report.difficulty
  const knockoutEntries = difficultyMismatch ? [] : knockout.entries

  const groups = new Map<number, NormalizedItem[]>()
  for (const item of report.items) {
    if (item.encounterId < 0) continue
    if (item.offSpec && !settings.includeOffSpec) continue
    const list = groups.get(item.encounterId)
    if (list) list.push(item)
    else groups.set(item.encounterId, [item])
  }

  const bossEvals: BossEval[] = []
  for (const [encounterId, items] of groups) {
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

    for (const [itemId, rows] of directByItemId) {
      const best = bestByDelta(rows)
      const entry = toEntry(`item:${itemId}`, [itemId], best, best.tierSlot ? 'tier-token' : 'item', report.baseline)
      entry.knockedOut = isKnockedOut(entry.itemIds, knockoutEntries, report.spec)
      pool.push(entry)
    }

    if (curioRows.length > 0) {
      const best = bestByDelta(curioRows)
      const itemIds = [...new Set(curioRows.map((r) => r.itemId))]
      const entry = toEntry(`curio:${encounterId}`, itemIds, { ...best, name: CURIO_NAME }, 'curio', report.baseline)
      entry.tierSlot = undefined
      entry.knockedOut = isKnockedOut(entry.itemIds, knockoutEntries, report.spec)
      pool.push(entry)
      notes.push(CURIO_NOTE)
    }

    const remainingEntries = pool.filter((p) => !p.knockedOut)
    const remaining = remainingEntries.length
    const ev = remaining > 0 ? remainingEntries.reduce((sum, p) => sum + p.value, 0) / remaining : 0
    const evPct = report.baseline > 0 ? (ev / report.baseline) * 100 : 0
    const bestCase = remaining > 0 ? remainingEntries.reduce((a, b) => (b.value > a.value ? b : a)) : null

    const knockedOutCount = pool.length - remaining
    if (knockedOutCount > 0) notes.push(`${knockedOutCount} item${knockedOutCount === 1 ? '' : 's'} knocked out`)
    if (remaining === 0) notes.push('pool exhausted')

    bossEvals.push({
      encounterId,
      encounterName: items[0].encounterName,
      instanceId: items[0].instanceId,
      pool,
      remaining,
      ev,
      evPct,
      bestCase,
      deployable: remaining > 0 && evPct >= settings.thresholdPct,
      notes,
    })
  }

  return bossEvals
}
