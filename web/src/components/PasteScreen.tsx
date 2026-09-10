import type { NormalizedReport } from '@engine/types'
import type { ReportSource } from '../lib/urlDetect'
import { SOURCE_LABELS } from '../lib/urlDetect'
import { formatDifficulty } from '../lib/format'
import { Tooltip } from './Tooltip'
import { ChipStack } from './ChipStack'
import { LootSpecPicker } from './LootSpecPicker'

export type BossOption = { encounterId: number; encounterName: string }

export function PasteScreen(props: {
  reportUrl: string
  onReportUrlChange: (url: string) => void
  detectedSource: ReportSource | null
  loadStatus: 'idle' | 'loading' | 'error'
  loadError: string | null
  onFetch: () => void
  report: NormalizedReport | null
  mismatchWarning: string | null
  rollsAvailable: 1 | 2
  onRollsAvailableChange: (n: 1 | 2) => void
  bossList: BossOption[]
  expectedKillIds: Set<number>
  onToggleExpectedKill: (encounterId: number) => void
  vaultItemName: string
  onVaultItemNameChange: (name: string) => void
  vaultItemGainPct: string
  onVaultItemGainPctChange: (value: string) => void
  vaultBossId: number | null
  onVaultBossIdChange: (id: number | null) => void
  thresholdPct: number
  onThresholdPctChange: (pct: number) => void
  lootSpecId: number | null
  onLootSpecIdChange: (specId: number) => void
  voidcoreCount: number
  onVoidcoreCountChange: (count: number) => void
  notInReportCount: number | null
  onContinue: () => void
}) {
  const {
    reportUrl,
    onReportUrlChange,
    detectedSource,
    loadStatus,
    loadError,
    onFetch,
    report,
    mismatchWarning,
    rollsAvailable,
    onRollsAvailableChange,
    bossList,
    expectedKillIds,
    onToggleExpectedKill,
    vaultItemName,
    onVaultItemNameChange,
    vaultItemGainPct,
    onVaultItemGainPctChange,
    vaultBossId,
    onVaultBossIdChange,
    thresholdPct,
    onThresholdPctChange,
    lootSpecId,
    onLootSpecIdChange,
    voidcoreCount,
    onVoidcoreCountChange,
    notInReportCount,
    onContinue,
  } = props

  const itemsParsed = report?.items.length ?? 0
  const matchedCount = report?.items.filter((i) => i.encounterId >= 0).length ?? 0

  const primaryLabel = loadStatus === 'loading' ? 'Fetching…' : report ? 'Price my roll' : 'Fetch report'
  const primaryDisabled = report ? false : !detectedSource || loadStatus === 'loading'

  function handlePrimary() {
    if (report) onContinue()
    else onFetch()
  }

  return (
    <div className="paste-grid">
      <div>
        <div className="panel">
          <p className="field-hint" style={{ marginTop: 0 }}>
            Run this before you open the vault. If a vault item looks good, sim it and enter its gain below; GallagioLoot prices it against the Voidcore.
          </p>
          <div className="screen-header" style={{ marginBottom: 6 }}>
            <div className="screen-header__title-group">
              <h3>Sim report</h3>
            </div>
            <div className="screen-header__meta">Raidbots or QE Live report URL</div>
          </div>
          <div className="field">
            <label htmlFor="report-url" className="sr-only">
              Report URL
            </label>
            <input
              id="report-url"
              type="text"
              placeholder="https://www.raidbots.com/reports/... or https://questionablyepic.com/..."
              value={reportUrl}
              onChange={(e) => onReportUrlChange(e.target.value)}
            />
            <div className="field-hint" style={{ marginBottom: 0 }}>
              {detectedSource ? `Detected: ${SOURCE_LABELS[detectedSource]}` : reportUrl ? 'Unrecognized report URL' : 'Paste a Raidbots or QE Live report URL'}
            </div>
          </div>
          <div className="field">
            <label htmlFor="vault-item-gain">Best vault item gain % (optional)</label>
            <input id="vault-item-gain" type="number" step="0.01" value={vaultItemGainPct} onChange={(e) => onVaultItemGainPctChange(e.target.value)} />
            <div className="field-hint" style={{ marginBottom: 0 }}>
              From a Top Gear sim of the vault item. Leave blank if nothing in the vault is tempting.
            </div>
          </div>

          {report ? (
            <div className="stats-line">
              <span className="num">{itemsParsed}</span> items parsed · <span className="num">{matchedCount}</span> matched to loot tables
              {notInReportCount != null && (
                <>
                  {' '}
                  · <span className="num">{notInReportCount}</span> not in report
                </>
              )}
            </div>
          ) : (
            <div className="stats-line stats-line--empty">Paste a report to begin.</div>
          )}

          {loadStatus === 'error' && loadError && <p className="warning-banner">{loadError}</p>}
        </div>

        {report && mismatchWarning && <div className="warning-banner">{mismatchWarning}</div>}

        {report && (
          <div className="panel">
            <h3 style={{ marginBottom: 10 }}>Report</h3>
            <p style={{ margin: '4px 0' }}>
              <strong>{report.character}</strong>
              {report.realm ? ` — ${report.realm}` : ''}
              {report.region ? ` (${report.region})` : ''}
            </p>
            <p style={{ margin: '4px 0', color: 'var(--text-secondary)' }}>
              {report.charClass ? `${report.charClass} — ` : ''}
              {report.spec} ({report.role})
            </p>
            <p style={{ margin: '4px 0', color: 'var(--text-secondary)' }}>
              {report.instanceName ?? 'Unknown instance'} — {report.difficulty}
            </p>
          </div>
        )}
      </div>

      <div className="run-settings-panel">
        <div style={{ fontSize: 'var(--text-section-title)', fontWeight: 700 }}>Run settings</div>

        <div className="run-settings-row">
          <div className="field" style={{ marginBottom: 0 }}>
            <span className="field-label-text">Loot spec</span>
            {report ? (
              <LootSpecPicker lootSpecId={lootSpecId} onChange={onLootSpecIdChange} />
            ) : (
              <select disabled aria-label="Loot spec">
                <option>From report</option>
              </select>
            )}
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <span className="field-label-text">Difficulty</span>
            {report ? (
              <div className="select-readonly" role="textbox" aria-readonly="true" aria-label="Difficulty">
                {formatDifficulty(report.difficulty)}
              </div>
            ) : (
              <select disabled aria-label="Difficulty">
                <option>From report</option>
              </select>
            )}
          </div>
        </div>

        {/* Rolls available: app-specific setting not present in the v2 mockup -- kept
            alongside the mockup's Loot spec/Difficulty row, same documented-adaptation
            precedent as the header's character switcher (see App.tsx). */}
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="rolls-available">Rolls available</label>
          <select id="rolls-available" value={rollsAvailable} onChange={(e) => onRollsAvailableChange(Number(e.target.value) === 2 ? 2 : 1)}>
            <option value={1}>1</option>
            <option value={2}>2</option>
          </select>
        </div>

        <div className="field" style={{ marginBottom: 0 }}>
          <span className="field-label-text">Voidcores held</span>
          <div className="voidcore-field">
            <ChipStack count={voidcoreCount} />
            <input
              type="number"
              min={0}
              value={voidcoreCount}
              onChange={(e) => onVoidcoreCountChange(Number(e.target.value) || 0)}
              className="voidcore-field__input num"
              aria-label="Voidcores held"
            />
          </div>
        </div>

        <div className="field" style={{ marginBottom: 0 }}>
          <span className="field-label-text">Expected kills this week</span>
          {report ? (
            <div className="checklist">
              {bossList.map((b, i) => (
                <label key={b.encounterId} className="checklist__item">
                  <input type="checkbox" checked={expectedKillIds.has(b.encounterId)} onChange={() => onToggleExpectedKill(b.encounterId)} />
                  <span className="checklist__rank">{i + 1}</span>
                  {b.encounterName}
                </label>
              ))}
            </div>
          ) : (
            <div className="checklist checklist--empty">Bosses appear after you fetch a report</div>
          )}
        </div>

        <details>
          <summary style={{ cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 13 }}>Great Vault item (optional)</summary>
          <div className="field" style={{ marginTop: 10 }}>
            <label htmlFor="vault-item-name">Vault item name</label>
            <input id="vault-item-name" type="text" value={vaultItemName} onChange={(e) => onVaultItemNameChange(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="vault-boss">Boss (optional)</label>
            <select id="vault-boss" value={vaultBossId ?? ''} onChange={(e) => onVaultBossIdChange(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Not specified</option>
              {bossList.map((b) => (
                <option key={b.encounterId} value={b.encounterId}>
                  {b.encounterName}
                </option>
              ))}
            </select>
          </div>
        </details>

        <details>
          <summary style={{ cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 13 }}>Advanced</summary>
          <div className="field" style={{ marginTop: 10, marginBottom: 0 }}>
            <label htmlFor="threshold">
              <Tooltip term="threshold">Threshold %</Tooltip>
            </label>
            <input
              id="threshold"
              type="number"
              step="0.01"
              value={thresholdPct}
              onChange={(e) => onThresholdPctChange(Number(e.target.value) || 0)}
            />
          </div>
        </details>

        <button type="button" className="btn-light" disabled={primaryDisabled} onClick={handlePrimary}>
          {primaryLabel}
        </button>
      </div>
    </div>
  )
}
