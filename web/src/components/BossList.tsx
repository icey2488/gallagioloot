import { useState } from 'react'
import type { BossEval, ItemOwnership, PoolEntry } from '@engine/core/types'
import type { LootTable, LootTableItem, TargetKind } from '@engine/types'
import { getSpecById } from '@engine/lookup/specs'
import { evalKey } from '@engine/core/targets'
import { catalystText } from '../lib/cardData'
import { Tooltip } from './Tooltip'

/** `stateKey` is the knockout storage key of the report the item's target belongs to (raid difficulty or M+ track). */
export type ItemStateChange = { stateKey: string; itemId: number; name: string; encounterId: number; encounterName: string; state: ItemOwnership | 'none' }

/** One report's targets: a raid difficulty's bosses, or the Mythic+ report's dungeons. */
export type BossSection = {
  key: string
  title: string
  hint?: string
  kind: TargetKind
  /** Knockout storage key for this report's targets. */
  stateKey: string
  bossEvals: BossEval[]
  lootTable: LootTable | null
}

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

function StateControl(props: { current: ItemOwnership | 'none'; onChange: (state: ItemOwnership | 'none') => void; label: string; equipped?: boolean }) {
  // An auto-Owned equipped item has Owned as its default, so "None" isn't offered: it would only fall back to it.
  const options = props.equipped ? STATE_OPTIONS.filter((opt) => opt.value !== 'none') : STATE_OPTIONS
  return (
    <div className="state-seg" role="group" aria-label={`Ownership of ${props.label}`}>
      {options.map((opt) => (
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
  kind: TargetKind
  stateKey: string
  lootItems: LootTableItem[] | null
  specName: string | null
  expanded: boolean
  onToggleExpand: () => void
  expectedKill: boolean
  onToggleExpectedKill: () => void
  onSetItemState: (change: ItemStateChange) => void
  onSetRollsSpent: (stateKey: string, encounterId: number, count: number) => void
}) {
  const { boss, index, kind, stateKey, lootItems, specName, expanded, onToggleExpand, expectedKill, onToggleExpectedKill, onSetItemState, onSetRollsSpent } = props
  const rowId = evalKey(boss).replace(/[^A-Za-z0-9_-]/g, '-')
  const killLabel =
    kind === 'mplus' ? `I will run ${boss.encounterName}${boss.keyLevel !== undefined ? ` at +${boss.keyLevel}` : ''}` : `Expect to kill ${boss.encounterName}`
  const killTitle = kind === 'mplus' ? 'I will run this key this week' : 'Expected to kill this week'

  // Rows come from the full loot table when available (the true pool), else from what the
  // report simmed (the pool entries directly) so the control still works without a loot table.
  // Curio-routed rows (Ula'tek's Slumbering Coil Curio -> any tier slot) can't be won with a
  // bonus roll, so they're not listed -- the note below the table says why.
  type Row = { key: string; itemId: number; name: string; slot?: string; entry: PoolEntry | undefined; item?: LootTableItem }
  const rows: Row[] = []
  const hasCurio = !!lootItems?.some((l) => l.viaCurio)
  if (lootItems) {
    for (const lootItem of lootItems) {
      if (lootItem.viaCurio) continue
      const entry = findPoolEntry(boss, lootItem.itemId)
      rows.push({ key: entry?.key ?? `l:${lootItem.itemId}`, itemId: lootItem.itemId, name: lootItem.name, slot: lootItem.slot, entry, item: lootItem })
    }
  } else {
    for (const entry of boss.pool) rows.push({ key: entry.key, itemId: entry.itemIds[0], name: entry.name, slot: entry.tierSlot, entry })
  }

  return (
    <div className={`boss-row${expanded ? ' boss-row--open' : ''}${boss.deployable ? '' : ' boss-row--excluded'}`}>
      <div className="boss-row__head">
        <label className="boss-row__kill" title={killTitle}>
          <input type="checkbox" checked={expectedKill} onChange={onToggleExpectedKill} aria-label={killLabel} />
        </label>
        <button type="button" className="boss-row__summary" aria-expanded={expanded} onClick={onToggleExpand}>
          <span className="boss-row__rank num">{index + 1}</span>
          <span className="boss-row__name">{boss.encounterName}</span>
          {/* Grouped so mobile can drop it to its own full-width line below the name
              (see .boss-row__meta at max-width: 640px) instead of squeezing the name's
              grid column down to a sliver next to it. */}
          <span className="boss-row__meta">
            <span className="boss-row__remaining num">
              {boss.remaining} / {boss.pool.length} <span className="boss-row__remaining-label">remaining</span>
            </span>
            <span className="boss-row__ev num">{boss.evPct.toFixed(2)}%</span>
          </span>
          <span className="boss-row__chevron" aria-hidden="true">
            {expanded ? '−' : '+'}
          </span>
        </button>
      </div>

      {expanded && (
        <div className="boss-row__body">
          <div className="boss-row__rolls">
            <label htmlFor={`rolls-spent-${rowId}`}>
              <Tooltip term="knockout">Rolls spent</Tooltip>
            </label>
            <input
              id={`rolls-spent-${rowId}`}
              type="number"
              min={boss.rollsAttributed}
              value={boss.rollsSpent}
              className="boss-row__rolls-input num"
              onChange={(e) => onSetRollsSpent(stateKey, boss.encounterId, Number(e.target.value) || 0)}
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
                      {entry?.catalyst ? (
                        <span>
                          {row.name}
                          <span className="catalyst-note">{catalystText(entry)}</span>
                        </span>
                      ) : (
                        row.name
                      )}
                      {row.item?.isTier && <span className="item-tag">Tier</span>}
                      {entry?.equipped && (
                        <span className="item-tag item-tag--equipped">{entry.equippedUpgrade ? 'Equipped (lower ilvl)' : 'Equipped'}</span>
                      )}
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
                        equipped={entry?.equipped && !entry.equippedUpgrade}
                        onChange={(state) => {
                          if (entry?.equipped && !entry.equippedUpgrade && state === 'owned') {
                            // Owned is the automatic default for equipped gear: it isn't stored, so already showing
                            // it is a no-op, and coming back from Rolled drops the stored entry.
                            if (current === 'owned') return
                            state = 'none'
                          }
                          onSetItemState({ stateKey, itemId: row.itemId, name: row.name, encounterId: boss.encounterId, encounterName: boss.encounterName, state })
                        }}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {hasCurio && <div className="note-line">Slumbering Coil Curio drops from Ula'tek but can't be won with a bonus roll.</div>}
        </div>
      )}
    </div>
  )
}

export function BossList(props: {
  sections: BossSection[]
  hasReports: boolean
  lootTableStatus: 'idle' | 'loading' | 'error'
  expectedTargetKeys: Set<string>
  onToggleExpectedTarget: (targetKey: string) => void
  onSetItemState: (change: ItemStateChange) => void
  onSetRollsSpent: (stateKey: string, encounterId: number, count: number) => void
}) {
  const { sections, hasReports, lootTableStatus, expectedTargetKeys, onToggleExpectedTarget, onSetItemState, onSetRollsSpent } = props
  const [openKey, setOpenKey] = useState<string | null>(null)

  if (!hasReports) return <div className="checklist checklist--empty">Bosses appear after you add a report</div>
  if (sections.every((s) => s.bossEvals.length === 0)) return <div className="checklist checklist--empty">No bosses in these reports yet</div>

  return (
    <div>
      {lootTableStatus === 'loading' && <div className="field-hint" style={{ marginBottom: 8 }}>{'Loading loot tables…'}</div>}
      {sections.map((section) => {
        const lootByEncounter = new Map((section.lootTable?.encounters ?? []).map((e) => [e.encounterId, e.items]))
        const specName = section.lootTable ? getSpecById(section.lootTable.lootSpecId)?.specName ?? null : null
        return (
          <section className="boss-section" key={section.key} aria-label={section.title}>
            <h4 className="boss-section__title">
              {section.title}
              {section.hint && <span className="boss-section__hint">{section.hint}</span>}
            </h4>
            <div className="boss-list">
              {section.bossEvals.map((boss, i) => {
                const key = evalKey(boss)
                return (
                  <BossRow
                    key={key}
                    boss={boss}
                    index={i}
                    kind={section.kind}
                    stateKey={section.stateKey}
                    lootItems={lootByEncounter.get(boss.encounterId) ?? null}
                    specName={specName}
                    expanded={openKey === key}
                    onToggleExpand={() => setOpenKey((prev) => (prev === key ? null : key))}
                    expectedKill={expectedTargetKeys.has(key)}
                    onToggleExpectedKill={() => onToggleExpectedTarget(key)}
                    onSetItemState={onSetItemState}
                    onSetRollsSpent={onSetRollsSpent}
                  />
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
