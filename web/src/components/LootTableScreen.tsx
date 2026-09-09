import type { BossEval } from '@engine/core/types'
import type { LootTable, LootTableItem } from '@engine/types'
import { getSpecById } from '@engine/lookup/specs'
import { Tooltip } from './Tooltip'

function findPoolEntry(bossEvals: BossEval[], encounterId: number, itemId: number) {
  const boss = bossEvals.find((b) => b.encounterId === encounterId)
  return boss?.pool.find((p) => p.itemIds.includes(itemId))
}

export function LootTableScreen(props: {
  lootTable: LootTable | null
  lootTableStatus: 'idle' | 'loading' | 'error'
  lootTableError: string | null
  bossEvals: BossEval[]
  focusBossId?: number | null
  onToggleKnockout: (item: LootTableItem, encounterId: number, encounterName: string, checked: boolean) => void
}) {
  const { lootTable, lootTableStatus, lootTableError, bossEvals, focusBossId, onToggleKnockout } = props

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

  if (!lootTable || lootTable.encounters.length === 0) {
    return (
      <div className="panel">
        <p>No loot table available yet -- pick a loot spec and load a report first.</p>
      </div>
    )
  }

  const specName = getSpecById(lootTable.lootSpecId)?.specName ?? `spec ${lootTable.lootSpecId}`

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

      {lootTable.encounters.map((enc) => {
        const poolEntry = (itemId: number) => findPoolEntry(bossEvals, enc.encounterId, itemId)
        const isOpen = focusBossId ? focusBossId === enc.encounterId : true

        return (
          <details key={enc.encounterId} className="panel loot-table-boss" open={isOpen}>
            <summary>{enc.encounterName}</summary>
            <table className="loot-item-table fold-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Slot</th>
                  <th>
                    <Tooltip term="ev">Sim gain</Tooltip>
                  </th>
                  <th>
                    <Tooltip term="rollsToTarget">Rolls to target</Tooltip>
                  </th>
                  <th>Knockout</th>
                </tr>
              </thead>
              <tbody>
                {enc.items.map((item) => {
                  const entry = poolEntry(item.itemId)
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
                          onChange={(e) => onToggleKnockout(item, enc.encounterId, enc.encounterName, e.target.checked)}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </details>
        )
      })}
    </div>
  )
}
