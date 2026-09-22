import { useState } from 'react'
import type { BossEval } from '@engine/core/types'
import type { LootTable, LootTableItem, NormalizedReport } from '@engine/types'
import { getSpecById } from '@engine/lookup/specs'
import { formatDifficulty } from '../lib/format'
import { Tooltip } from './Tooltip'

function findPoolEntry(bossEvals: BossEval[], encounterId: number, itemId: number) {
  const boss = bossEvals.find((b) => b.encounterId === encounterId)
  return boss?.pool.find((p) => p.itemIds.includes(itemId))
}

const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th']

export function LootTableScreen(props: {
  lootTable: LootTable | null
  lootTableStatus: 'idle' | 'loading' | 'error'
  lootTableError: string | null
  report: NormalizedReport | null
  bossEvals: BossEval[]
  focusBossId?: number | null
  onToggleKnockout: (item: LootTableItem, encounterId: number, encounterName: string, checked: boolean) => void
}) {
  const { lootTable, lootTableStatus, lootTableError, report, bossEvals, focusBossId, onToggleKnockout } = props

  // Kill order comes from bossEvals (same array DeployabilityScreen ranks by); falls
  // back to the loot table's own encounter order if a boss isn't in bossEvals yet
  // (e.g. loot spec just switched and pools haven't rebuilt).
  const killOrder = new Map(bossEvals.map((b, i) => [b.encounterId, i]))
  const encounters = lootTable
    ? [...lootTable.encounters].sort((a, b) => (killOrder.get(a.encounterId) ?? 999) - (killOrder.get(b.encounterId) ?? 999))
    : []

  const [selectedId, setSelectedId] = useState<number | null>(null)
  const activeId = focusBossId ?? selectedId ?? encounters[0]?.encounterId ?? null

  if (lootTableStatus === 'loading') {
    return (
      <div className="panel">
        <p>Loading loot table…</p>
      </div>
    )
  }

  if (lootTableStatus === 'error') {
    return <div className="panel warning-banner">{lootTableError ?? 'Could not load the loot table.'}</div>
  }

  if (!lootTable || encounters.length === 0) {
    return (
      <div className="panel">
        <p>No loot table available yet -- pick a loot spec and load a report first.</p>
      </div>
    )
  }

  const specName = getSpecById(lootTable.lootSpecId)?.specName ?? `spec ${lootTable.lootSpecId}`
  const activeEnc = encounters.find((e) => e.encounterId === activeId) ?? encounters[0]
  const activeRank = killOrder.get(activeEnc.encounterId)
  const activeBossEval = bossEvals.find((b) => b.encounterId === activeEnc.encounterId)
  const simmedCount = activeEnc.items.filter((item) => findPoolEntry(bossEvals, activeEnc.encounterId, item.itemId)).length

  return (
    <div>
      <div className="panel">
        <div className="screen-header">
          <div className="screen-header__title-group">
            <h3>Loot table -- {lootTable.instanceName ?? `Instance ${lootTable.instanceId}`}</h3>
            <span className="screen-header__meta">{specName} loot spec</span>
          </div>
          <span className="note-line" style={{ marginTop: 0 }}>
            data hash {lootTable.sourceHash.slice(0, 8)}…
          </span>
        </div>
      </div>

      <div className="panel loot-table-layout">
        <div>
          <div className="loot-boss-select field">
            <label htmlFor="loot-boss-select">Boss · kill order</label>
            <select id="loot-boss-select" value={activeEnc.encounterId} onChange={(e) => setSelectedId(Number(e.target.value))}>
              {encounters.map((enc) => {
                const rank = killOrder.get(enc.encounterId)
                return (
                  <option key={enc.encounterId} value={enc.encounterId}>
                    {rank != null ? `${rank + 1} · ` : ''}
                    {enc.encounterName}
                  </option>
                )
              })}
            </select>
          </div>
          <nav className="loot-boss-list-wrap" aria-label="Bosses, kill order">
            <div className="field-hint" style={{ marginBottom: 8 }}>
              Bosses · kill order
            </div>
            <div className="loot-boss-list">
              {encounters.map((enc) => {
                const rank = killOrder.get(enc.encounterId)
                const current = enc.encounterId === activeEnc.encounterId
                return (
                  <button
                    key={enc.encounterId}
                    type="button"
                    className="loot-boss-list__item"
                    aria-current={current ? 'true' : undefined}
                    onClick={() => setSelectedId(enc.encounterId)}
                  >
                    <span className="loot-boss-list__rank">{rank != null ? rank + 1 : '—'}</span>
                    {enc.encounterName}
                  </button>
                )
              })}
            </div>
          </nav>
        </div>

        <div>
          <div className="screen-header" style={{ marginBottom: 14 }}>
            <div className="screen-header__title-group" style={{ display: 'block' }}>
              <h3 style={{ marginBottom: 4 }}>{activeEnc.encounterName}</h3>
              <span className="screen-header__meta">
                {activeRank != null ? `${ORDINALS[activeRank] ?? `${activeRank + 1}th`} kill · ` : ''}
                {report ? `${formatDifficulty(report.difficulty, report.contentType)} · ` : ''}
                {specName} loot spec
              </span>
            </div>
            {activeBossEval && (
              <div className="stat-trio">
                <div className="stat-trio__item">
                  <span className="stat-trio__value num">
                    {activeBossEval.remaining} / {activeBossEval.pool.length}
                  </span>
                  <span className="stat-trio__label">remaining</span>
                </div>
                <div className="stat-trio__item">
                  <span className="stat-trio__value num">{activeBossEval.evPct.toFixed(2)}%</span>
                  <span className="stat-trio__label">EV per roll</span>
                </div>
                <div className="stat-trio__item">
                  <span className="stat-trio__value num">
                    {simmedCount} / {activeEnc.items.length}
                  </span>
                  <span className="stat-trio__label">simmed</span>
                </div>
              </div>
            )}
          </div>

          <table className="loot-item-table fold-table">
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
                <th>Knockout</th>
              </tr>
            </thead>
            <tbody>
              {activeEnc.items.map((item) => {
                const entry = findPoolEntry(bossEvals, activeEnc.encounterId, item.itemId)
                const checked = entry?.knockedOut ?? false
                return (
                  <tr key={item.itemId}>
                    <td data-label="Item">
                      {item.name}
                      {item.isTier && !item.viaCurio && <span className="item-tag">Tier</span>}
                      {item.viaCurio && <span className="item-tag">Curio</span>}
                      {item.specSpecific && (
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
                      {item.slot ?? '—'}
                    </td>
                    <td className="num" data-label="Sim gain">
                      {entry ? `${entry.pct.toFixed(2)}%` : 'not simmed'}
                    </td>
                    <td className="num" data-label="Rolls to target">
                      {entry?.rollsToTargetExpected != null && entry?.rollsToTargetWorst != null
                        ? `~${entry.rollsToTargetExpected.toFixed(1)}, up to ${entry.rollsToTargetWorst}`
                        : '—'}
                    </td>
                    <td data-label="Knockout">
                      <input
                        type="checkbox"
                        aria-label={`Knock out ${item.name}`}
                        checked={checked}
                        onChange={(e) => onToggleKnockout(item, activeEnc.encounterId, activeEnc.encounterName, e.target.checked)}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
