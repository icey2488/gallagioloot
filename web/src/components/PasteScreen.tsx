import type { NormalizedReport, NormalizedTopGear } from '@engine/types'
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
  topGearUrl: string
  onTopGearUrlChange: (url: string) => void
  topGearStatus: 'idle' | 'loading' | 'error'
  topGearError: string | null
  topGearResult: NormalizedTopGear | null
  manualVaultGainPct: string
  onManualVaultGainPctChange: (value: string) => void
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
    topGearUrl,
    onTopGearUrlChange,
    topGearStatus,
    topGearError,
    topGearResult,
    manualVaultGainPct,
    onManualVaultGainPctChange,
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
            Run this before picking your vault choice. If a vault item looks good, run a Top Gear with it and paste that report below; GallagioLoot prices it against the Voidcore.
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
            <label htmlFor="topgear-url">
              <Tooltip term="topGear">Top Gear report URL (optional)</Tooltip>
            </label>
            <input
              id="topgear-url"
              type="text"
              placeholder="https://www.raidbots.com/reports/… (Top Gear with the vault item)"
              value={topGearUrl}
              onChange={(e) => onTopGearUrlChange(e.target.value)}
            />
            {topGearStatus === 'loading' && (
              <div className="field-hint" style={{ marginBottom: 0 }}>
                Fetching Top Gear report…
              </div>
            )}
            {topGearStatus === 'error' && topGearError && <p className="warning-banner">{topGearError}</p>}
            {topGearStatus === 'idle' && topGearResult && topGearResult.candidates.length > 0 && (
              <div className="field-hint" style={{ marginBottom: 0 }}>
                Vault item: {topGearResult.candidates[0].name} · +{topGearResult.bestSet.pct.toFixed(2)}% ·{' '}
                {topGearResult.candidates[0].encounterName ?? 'not a raid/dungeon item'}
                {topGearResult.candidates.length > 1 && (
                  <div style={{ fontSize: 11, marginTop: 2 }}>
                    Also added: {topGearResult.candidates.slice(1).map((c) => c.name).join(', ')}
                  </div>
                )}
              </div>
            )}
            {topGearStatus === 'idle' && topGearResult && topGearResult.candidates.length === 0 && (
              <div className="field-hint" style={{ marginBottom: 0 }}>
                No vault item found in this Top Gear report's best set.
              </div>
            )}
            {topGearStatus === 'idle' && !topGearResult && (
              <div className="field-hint" style={{ marginBottom: 0 }}>
                Paste a Top Gear report that includes your Great Vault item. Leave blank if nothing in the vault is tempting.
              </div>
            )}
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
            <div className="paste-empty-state">
              <div className="paste-empty-state__title">Paste a report to begin</div>
              <div className="paste-empty-state__desc">
                Loot spec, difficulty and the boss list fill in from the report. The recommendation card and deployability table appear here.
              </div>
            </div>
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
          <summary style={{ cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 13 }}>Advanced</summary>
          <div className="field" style={{ marginTop: 10 }}>
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
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="manual-vault-gain">Manual vault gain % (overrides the report)</label>
            <input
              id="manual-vault-gain"
              type="number"
              step="0.01"
              value={manualVaultGainPct}
              onChange={(e) => onManualVaultGainPctChange(e.target.value)}
            />
          </div>
        </details>

        <div className="fetch-button-group">
          <button type="button" className={report ? 'btn-light' : 'btn-light--outline'} disabled={primaryDisabled} onClick={handlePrimary}>
            {primaryLabel}
          </button>
          {!report && !detectedSource && loadStatus !== 'loading' && <div className="btn-hint">Needs a report URL</div>}
        </div>
      </div>
    </div>
  )
}
