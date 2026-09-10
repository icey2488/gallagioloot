import { useState } from 'react'
import { deserialize, serialize } from '@engine/core/knockout'
import type { BossEval, KnockoutState } from '@engine/core/types'
import type { NormalizedReport } from '@engine/types'
import { formatDifficulty } from '../lib/format'
import { Tooltip } from './Tooltip'

export function ReconcileScreen(props: {
  report: NormalizedReport
  bossEvals: BossEval[]
  knockoutState: KnockoutState
  defaultEncounterId?: number
  onReconcile: (encounterId: number, receivedItemId: number | null, specSpecific: boolean) => void
  onRemoveEntry: (itemId: number) => void
  onImportState: (state: KnockoutState) => void
}) {
  const { report, bossEvals, knockoutState, defaultEncounterId, onReconcile, onRemoveEntry, onImportState } = props

  const rollableBosses = bossEvals.filter((b) => b.pool.length > 0)
  const [bossId, setBossId] = useState<number | null>(defaultEncounterId ?? rollableBosses[0]?.encounterId ?? null)
  const [itemId, setItemId] = useState<string>('')
  const [specOnly, setSpecOnly] = useState(false)
  const [importText, setImportText] = useState('')
  const [importError, setImportError] = useState<string | null>(null)

  const selectedBoss = bossEvals.find((b) => b.encounterId === bossId) ?? null
  const bossName = selectedBoss?.encounterName ?? 'a boss'

  function submitReconcile() {
    if (bossId == null) return
    onReconcile(bossId, itemId ? Number(itemId) : null, specOnly)
    setItemId('')
    setSpecOnly(false)
  }

  function handleImport() {
    setImportError(null)
    try {
      const parsed = deserialize(importText)
      if (parsed.difficulty !== report.difficulty) {
        setImportError(
          `Imported state is for difficulty "${parsed.difficulty}" but the current report is "${report.difficulty}"; not applied.`
        )
        return
      }
      onImportState(parsed)
      setImportText('')
    } catch (e) {
      setImportError((e as Error).message)
    }
  }

  function handleExport() {
    const json = serialize(knockoutState)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `gallagioloot-knockout-${report.character}-${report.difficulty}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div className="panel">
        <div className="screen-header" style={{ marginBottom: 14 }}>
          <div className="screen-header__title-group">
            <h3>I rolled {bossName} and got:</h3>
          </div>
          <span className="screen-header__meta">
            {report.character} · {formatDifficulty(report.difficulty)}
          </span>
        </div>
        <div className="field">
          <label htmlFor="reconcile-boss">Boss</label>
          <select id="reconcile-boss" value={bossId ?? ''} onChange={(e) => setBossId(e.target.value ? Number(e.target.value) : null)}>
            {rollableBosses.map((b) => (
              <option key={b.encounterId} value={b.encounterId}>
                {b.encounterName}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="reconcile-item">Item received</label>
          <select id="reconcile-item" value={itemId} onChange={(e) => setItemId(e.target.value)}>
            <option value="">Nothing / didn't roll</option>
            {selectedBoss?.pool
              .filter((p) => !p.knockedOut)
              .map((p) => (
                <option key={p.key} value={p.itemIds[0]}>
                  {p.name}
                </option>
              ))}
          </select>
        </div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, marginBottom: 12 }}>
          <input type="checkbox" checked={specOnly} onChange={(e) => setSpecOnly(e.target.checked)} disabled={!itemId} />
          <Tooltip term="specSpecific">Spec-only drop</Tooltip>
        </label>
        <button type="button" className="btn" onClick={submitReconcile} disabled={bossId == null}>
          Confirm
        </button>
      </div>

      <div className="panel">
        <h3>
          <Tooltip term="knockout">Knockout list</Tooltip> — {report.character} ({report.difficulty})
        </h3>
        {knockoutState.entries.length === 0 && <p className="note-line">No items knocked out yet.</p>}
        {knockoutState.entries.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Boss</th>
                <th>Scope</th>
                <th>Received</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {knockoutState.entries.map((entry) => (
                <tr key={entry.itemId}>
                  <td>{entry.itemName}</td>
                  <td>{bossEvals.find((b) => b.encounterId === entry.encounterId)?.encounterName ?? entry.encounterId}</td>
                  <td>
                    <span className="deploy-indicator">
                      <span className={entry.specSpecific ? 'deploy-dot deploy-dot--no' : 'deploy-dot deploy-dot--yes'} aria-hidden="true" />
                      {entry.specSpecific ? 'Spec-only' : 'All specs'}
                    </span>
                  </td>
                  <td>{entry.receivedAt.slice(0, 10)}</td>
                  <td>
                    <button type="button" className="btn-link" onClick={() => onRemoveEntry(entry.itemId)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel">
        <h3>Export / import state</h3>
        <button type="button" className="btn btn-secondary" onClick={handleExport}>
          Export JSON
        </button>
        <div className="field" style={{ marginTop: 12 }}>
          <label htmlFor="import-json">Import JSON</label>
          <textarea id="import-json" rows={4} value={importText} onChange={(e) => setImportText(e.target.value)} />
        </div>
        <button type="button" className="btn btn-secondary" onClick={handleImport} disabled={!importText.trim()}>
          Import
        </button>
        {importError && <div className="warning-banner" style={{ marginTop: 12 }}>{importError}</div>}
      </div>
    </div>
  )
}
