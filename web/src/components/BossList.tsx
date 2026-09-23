import { useState } from 'react'
import type { BossEval, ItemOwnership, PoolEntry } from '@engine/core/types'
import type { LootTable, LootTableItem, NormalizedReport } from '@engine/types'
import { getSpecById } from '@engine/lookup/specs'
import { Tooltip } from './Tooltip'

export type ItemStateChange = { itemId: number; name: string; encounterId: number; encounterName: string; state: ItemOwnership | 'none' }

function findPoolEntry(boss: BossEval | undefined, itemId: number): PoolEntry | undefined {
  return boss?.pool.find((p) => p.itemIds.includes(itemId))
}

/** The current ownership state of a pool entry (none/owned/rolled), for the segmented control. */
function ownershipOf(entry: PoolEntry | undefined): ItemOwnership | 'none' {
  return entry?.ownership ?? 'none'
}

const STATE_OPTIONS: Array<{ value: ItemOwnership | 'none'; label: string; title: string }> = [
  { value: 'none', label: 'None', title: "Not obtained -- a normal pool member at its full sim value" },
  { value: 'owned', label: 'Owned', title: 'Owned from a drop/vault/trade -- stays in the pool as a value-0 dud (a wasted roll)' },
  { value: 'rolled', label: 'Rolled', title: 'Received from a bonus roll -- removed from this boss’s roll pool' },
]

function StateControl(props: { current: ItemOwnership | 'none'; onChange: (state: ItemOwnership | 'none') => void; label: string }) {
  return (
    <div className="state-seg" role="group" aria-label={`Ownership of ${props.label}`}>
      {STATE_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`state-seg__btn${props.current === opt.value ? ' state-seg__btn--on' : ''}`}
          aria-pressed={props.current === opt.value}
          title={opt.title}
          onClick={() => props.onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

/** One expandable boss row: collapsed summary + (when open) its inline loot table with per-item state controls. */
function BossRow(props: {
  boss: BossEval
  index: number
  report: NormalizedReport | null
  lootItems: LootTableItem[] | null
  specName: string | null
  expanded: boolean
  onToggleExpand: () => void
  expectedKill: boolean
  onToggleExpectedKill: () => void
  onSetItemState: (change: ItemStateChange) => void
  onSetRollsSpent: (encounterId: number, count: number) => void
}) {
  const { boss, index, lootItems, specName, expanded, onToggleExpand, expectedKill, onToggleExpectedKill, onSetItemState, onSetRollsSpent } = props

  // Rows come from the full loot table when available (the true pool), else from what the
  // report simmed (the pool entries directly) so the control still works without a loot table.
  const rows: Array<{ key: string; itemId: number; name: string; slot?: string; entry: PoolEntry | undefined; item?: LootTableItem }> = lootItems
    ? lootItems.map((item) => ({ key: `l:${item.itemId}`, itemId: item.itemId, name: item.name, slot: item.slot, entry: findPoolEntry(boss, item.itemId), item }))
    : boss.pool.map((entry) => ({ key: entry.key, itemId: entry.itemIds[0], name: entry.name, slot: entry.tierSlot, entry }))

  return (
    <div className={`boss-row${expanded ? ' boss-row--open' : ''}${boss.deployable ? '' : ' boss-row--excluded'}`}>
      <div className="boss-row__head">
        <label className="boss-row__kill" title="Expected to kill this week">
          <input type="checkbox" checked={expectedKill} onChange={onToggleExpectedKill} aria-label={`Expect to kill ${boss.encounterName}`} />
        </label>
        <button type="button" className="boss-row__summary" aria-expanded={expanded} onClick={onToggleExpand}>
          <span className="boss-row__rank num">{index + 1}</span>
          <span className="boss-row__name">{boss.encounterName}</span>
          <span className="boss-row__remaining num">
            {boss.remaining} / {boss.pool.length} <span className="boss-row__remaining-label">remaining</span>
          </span>
          <span className="boss-row__ev num">{boss.evPct.toFixed(2)}%</span>
          <span className="boss-row__chevron" aria-hidden="true">
            {expanded ? '−' : '+'}
          </span>
        </button>
      </div>

      {expanded && (
        <div className="boss-row__body">
          <div className="boss-row__rolls">
            <label htmlFor={`rolls-spent-${boss.encounterId}`}>
              <Tooltip term="knockout">Rolls spent</Tooltip>
            </label>
            <input
              id={`rolls-spent-${boss.encounterId}`}
              type="number"
              min={boss.rollsAttributed}
              value={boss.rollsSpent}
              className="boss-row__rolls-input num"
              onChange={(e) => onSetRollsSpent(boss.encounterId, Number(e.target.value) || 0)}
            />
            <span className="boss-row__rolls-note">
              {boss.rollsSpent} spent, {boss.rollsAttributed} attributed
              {boss.rollsUnattributed > 0 ? ` · ${boss.rollsUnattributed} removed an unknown item` : ''}
            </span>
          </div>

          <table className="loot-item-table fold-table boss-row__table">
            <thead>
              <tr>
                <th>Item</th>
                <th className="num">Slot</th>
                <th className="num">
                  <Tooltip term="ev">Sim gain</Tooltip>
                </th>
                <th className="num">
                  <Tooltip term="rollsToTarget">Rolls to target</Tooltip>
                </th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const entry = row.entry
                const current = ownershipOf(entry)
                return (
                  <tr key={row.key} className={current === 'rolled' ? 'boss-row__item--rolled' : current === 'owned' ? 'boss-row__item--owned' : undefined}>
                    <td data-label="Item">
                      {row.name}
                      {row.item?.isTier && !row.item?.viaCurio && <span className="item-tag">Tier</span>}
                      {row.item?.viaCurio && <span className="item-tag">Curio</span>}
                      {row.item?.specSpecific && specName && (
                        <>
                          {' '}
                          <span className="badge">
                            <Tooltip term="specSpecific">spec-specific</Tooltip>
                          </span>
                          <div className="note-line" style={{ marginTop: 2 }}>
                            counts only for {specName}
                          </div>
                        </>
                      )}
                    </td>
                    <td className="num" data-label="Slot">
                      {row.slot ?? '—'}
                    </td>
                    <td className="num" data-label="Sim gain">
                      {entry ? (entry.isDud ? `${entry.pct.toFixed(2)}% (dud)` : `${entry.pct.toFixed(2)}%`) : 'not simmed'}
                    </td>
                    <td className="num" data-label="Rolls to target">
                      {entry && !entry.knockedOut && entry.rollsToTargetExpected != null && entry.rollsToTargetWorst != null
                        ? `~${entry.rollsToTargetExpected.toFixed(1)}, up to ${entry.rollsToTargetWorst}`
                        : '—'}
                    </td>
                    <td data-label="State">
                      <StateControl
                        current={current}
                        label={row.name}
                        onChange={(state) =>
                          onSetItemState({ itemId: row.itemId, name: row.name, encounterId: boss.encounterId, encounterName: boss.encounterName, state })
                        }
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function BossList(props: {
  report: NormalizedReport | null
  bossEvals: BossEval[]
  lootTable: LootTable | null
  lootTableStatus: 'idle' | 'loading' | 'error'
  expectedKillIds: Set<number>
  onToggleExpectedKill: (encounterId: number) => void
  onSetItemState: (change: ItemStateChange) => void
  onSetRollsSpent: (encounterId: number, count: number) => void
}) {
  const { report, bossEvals, lootTable, lootTableStatus, expectedKillIds, onToggleExpectedKill, onSetItemState, onSetRollsSpent } = props
  const [openId, setOpenId] = useState<number | null>(null)

  if (!report) return <div className="checklist checklist--empty">Bosses appear after you fetch a report</div>
  if (bossEvals.length === 0) return <div className="checklist checklist--empty">No bosses in this report yet</div>

  const lootByEncounter = new Map((lootTable?.encounters ?? []).map((e) => [e.encounterId, e.items]))
  const specName = lootTable ? getSpecById(lootTable.lootSpecId)?.specName ?? null : null

  return (
    <div className="boss-list">
      {lootTableStatus === 'loading' && <div className="field-hint" style={{ marginBottom: 8 }}>{'Loading loot tables…'}</div>}
      {bossEvals.map((boss, i) => (
        <BossRow
          key={boss.encounterId}
          boss={boss}
          index={i}
          report={report}
          lootItems={lootByEncounter.get(boss.encounterId) ?? null}
          specName={specName}
          expanded={openId === boss.encounterId}
          onToggleExpand={() => setOpenId((prev) => (prev === boss.encounterId ? null : boss.encounterId))}
          expectedKill={expectedKillIds.has(boss.encounterId)}
          onToggleExpectedKill={() => onToggleExpectedKill(boss.encounterId)}
          onSetItemState={onSetItemState}
          onSetRollsSpent={onSetRollsSpent}
        />
      ))}
    </div>
  )
}
