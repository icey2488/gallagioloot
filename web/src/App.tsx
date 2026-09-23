import { useEffect, useMemo, useRef, useState } from 'react'
import type { LootTable, NormalizedReport, NormalizedTopGear } from '@engine/types'
import { addEntry, createState, deserialize, removeEntry, serialize, setRollsSpent, storageKey } from '@engine/core/knockout'
import { buildBossPools } from '@engine/core/pool'
import { recommend } from '@engine/core/rank'
import { compareVault, vaultItemFromTopGear } from '@engine/core/vault'
import type { BossEval, KnockoutState, Settings, VaultItemInput } from '@engine/core/types'
import { detectSource, friendlyReportMismatch, friendlyUnsupportedContent, SOURCE_LABELS, type ReportSource } from './lib/urlDetect'
import { fetchLootTable, fetchReport, fetchTopGear, ProxyRequestError } from './lib/proxyClient'
import { buildCardData, type CardData } from './lib/cardData'
import { formatDifficulty, isRecognizedDifficulty } from './lib/format'
import {
  LocalStorageAdapter,
  loadLastReportUrl,
  loadLastTopGearUrl,
  loadSettings,
  loadVoidcoreCount,
  migrateLegacyLocationKey,
  saveLastReportUrl,
  saveLastTopGearUrl,
  saveSettings,
  saveVoidcoreCount,
} from './lib/storage'
import { CharacterSwitcher } from './components/CharacterSwitcher'
import { Footer } from './components/Footer'
import { Tooltip } from './components/Tooltip'
import { ChipStack } from './components/ChipStack'
import { LootSpecPicker } from './components/LootSpecPicker'
import { RecommendationCard } from './components/RecommendationCard'
import { BossList, type ItemStateChange } from './components/BossList'
import { PricedDetail } from './components/PricedDetail'

const storageAdapter = new LocalStorageAdapter()

type PricedSnapshot = {
  card: CardData
  bossEvals: BossEval[]
}

export default function App() {
  const [reportUrl, setReportUrl] = useState('')
  const [report, setReport] = useState<NormalizedReport | null>(null)
  const [loadStatus, setLoadStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [mismatchWarning, setMismatchWarning] = useState<string | null>(null)

  const [rollsAvailable, setRollsAvailable] = useState<1 | 2>(1)
  const [thresholdPct, setThresholdPct] = useState(0.2)
  const [expectedKillIds, setExpectedKillIds] = useState<Set<number>>(new Set())
  const [manualVaultGainPct, setManualVaultGainPct] = useState('')

  const [topGearUrl, setTopGearUrl] = useState('')
  const [topGearResult, setTopGearResult] = useState<NormalizedTopGear | null>(null)
  const [topGearStatus, setTopGearStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [topGearError, setTopGearError] = useState<string | null>(null)

  const [voidcoreCount, setVoidcoreCount] = useState(0)
  const [knockoutState, setKnockoutState] = useState<KnockoutState | null>(null)
  const [characterKeys, setCharacterKeys] = useState<string[]>([])

  const [lootSpecId, setLootSpecId] = useState<number | null>(null)
  const [lootTable, setLootTable] = useState<LootTable | null>(null)
  const [lootTableStatus, setLootTableStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [lootTableError, setLootTableError] = useState<string | null>(null)

  // Priced results are a snapshot taken when "Price my roll" is pressed -- no live
  // re-pricing. Any later change to settings/knockouts/owned state/rolls dims the snapshot
  // (`stale`) and shows a re-price prompt, until the button is pressed again.
  const [priced, setPriced] = useState<PricedSnapshot | null>(null)
  const [stale, setStale] = useState(false)
  const hasPricedRef = useRef(false)

  const [importText, setImportText] = useState('')
  const [importError, setImportError] = useState<string | null>(null)

  const detectedSource: ReportSource | null = useMemo(() => detectSource(reportUrl), [reportUrl])

  const bossList = useMemo(() => {
    if (!report) return [] as Array<{ encounterId: number; encounterName: string }>
    const seen = new Map<number, string>()
    for (const item of report.items) {
      if (item.encounterId < 0) continue
      if (!seen.has(item.encounterId)) seen.set(item.encounterId, item.encounterName)
    }
    return [...seen.entries()].map(([encounterId, encounterName]) => ({ encounterId, encounterName }))
  }, [report])

  const currentKey = report
    ? storageKey({ character: report.character, realm: report.realm, region: report.region, difficulty: report.difficulty })
    : null

  const settings: Settings = useMemo(
    () => ({
      thresholdPct,
      rollsAvailable,
      includeOffSpec: false,
      expectedKills: bossList.length ? [...expectedKillIds] : undefined,
      lootSpecId: lootSpecId ?? undefined,
    }),
    [thresholdPct, rollsAvailable, expectedKillIds, bossList, lootSpecId]
  )

  const bossEvals = useMemo(
    () => (report && knockoutState ? buildBossPools(report, knockoutState, settings, lootTable?.encounters) : []),
    [report, knockoutState, settings, lootTable]
  )

  const recommendation = useMemo(() => (report && bossEvals.length ? recommend(bossEvals, settings, report) : null), [report, bossEvals, settings])

  const topGearVaultItem = useMemo(() => (topGearResult ? vaultItemFromTopGear(topGearResult) : null), [topGearResult])

  const vaultItemInput: VaultItemInput | null = useMemo(() => {
    const manualGain = manualVaultGainPct === '' ? null : Number(manualVaultGainPct)
    const hasManualGain = manualGain !== null && !Number.isNaN(manualGain)
    if (!hasManualGain && !topGearVaultItem) return null
    return {
      name: topGearVaultItem?.name ?? 'Manual vault gain',
      gainPct: hasManualGain ? manualGain! : topGearVaultItem!.gainPct,
      itemId: topGearVaultItem?.itemId,
      encounterId: topGearVaultItem?.encounterId,
    }
  }, [manualVaultGainPct, topGearVaultItem])

  const vaultDecision = useMemo(() => {
    if (!report || !recommendation || !vaultItemInput) return null
    return compareVault({ vaultItem: vaultItemInput, bossEvals, recommendation, settings, report })
  }, [report, recommendation, vaultItemInput, bossEvals, settings])

  const cardData = useMemo(() => {
    if (!recommendation) return null
    return buildCardData({
      recommendation,
      bossEvals,
      vaultDecision,
      vaultItemName: vaultItemInput?.name,
      isManualVaultGain: !!vaultItemInput && !topGearVaultItem,
    })
  }, [recommendation, bossEvals, vaultDecision, vaultItemInput, topGearVaultItem])

  const notInReportCount = useMemo(() => {
    if (!report || !lootTable) return null
    return bossEvals.reduce((sum, b) => sum + b.pool.filter((p) => p.notInSimReport).length, 0)
  }, [report, lootTable, bossEvals])

  useEffect(() => {
    storageAdapter.list().then(setCharacterKeys)
  }, [knockoutState])

  // Mark the priced snapshot stale whenever the live pricing inputs change (after the first
  // price). The button press itself changes none of these deps, so it never trips this.
  useEffect(() => {
    if (hasPricedRef.current) setStale(true)
  }, [bossEvals, recommendation, vaultDecision])

  useEffect(() => {
    if (!report?.instanceId || lootSpecId == null) {
      setLootTable(null)
      return
    }
    let cancelled = false
    setLootTableStatus('loading')
    setLootTableError(null)
    fetchLootTable(report.instanceId, lootSpecId)
      .then((table) => {
        if (cancelled) return
        setLootTable(table)
        setLootTableStatus('idle')
      })
      .catch((e) => {
        if (cancelled) return
        setLootTableError(e instanceof ProxyRequestError ? e.message : (e as Error).message)
        setLootTableStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [report?.instanceId, lootSpecId])

  useEffect(() => {
    const trimmed = topGearUrl.trim()
    if (!trimmed) {
      setTopGearResult(null)
      setTopGearStatus('idle')
      setTopGearError(null)
      return
    }
    if (detectSource(trimmed) !== 'raidbots') {
      setTopGearStatus('idle')
      setTopGearError(null)
      return
    }
    let cancelled = false
    setTopGearStatus('loading')
    setTopGearError(null)
    fetchTopGear(trimmed)
      .then((result) => {
        if (cancelled) return
        setTopGearResult(result)
        setTopGearStatus('idle')
      })
      .catch((e) => {
        if (cancelled) return
        const message = e instanceof ProxyRequestError ? e.message : (e as Error).message
        setTopGearError((e instanceof ProxyRequestError && friendlyReportMismatch(message, 'topgear')) || message)
        setTopGearResult(null)
        setTopGearStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [topGearUrl])

  useEffect(() => {
    if (!currentKey) return
    saveSettings(currentKey, { thresholdPct, rollsAvailable })
  }, [currentKey, thresholdPct, rollsAvailable])

  useEffect(() => {
    if (!currentKey) return
    saveVoidcoreCount(currentKey, voidcoreCount)
  }, [currentKey, voidcoreCount])

  useEffect(() => {
    if (!currentKey || !topGearUrl) return
    saveLastTopGearUrl(currentKey, topGearUrl)
  }, [currentKey, topGearUrl])

  useEffect(() => {
    if (!currentKey || !knockoutState) return
    storageAdapter.save(currentKey, knockoutState)
  }, [currentKey, knockoutState])

  async function loadReport(url: string, source: ReportSource) {
    setLoadStatus('loading')
    setLoadError(null)
    try {
      const rpt = await fetchReport(source, url)
      const key = storageKey({ character: rpt.character, realm: rpt.realm, region: rpt.region, difficulty: rpt.difficulty })
      // Migrate any pre-region/realm knockout state saved under an empty-location key.
      migrateLegacyLocationKey(key)
      const stored = await storageAdapter.load(key)

      const mismatch = knockoutState && knockoutState.difficulty && knockoutState.difficulty !== rpt.difficulty
      setMismatchWarning(
        mismatch
          ? `Stored knockout state was for difficulty "${knockoutState!.difficulty}"; this report is "${rpt.difficulty}". Starting fresh for this difficulty.`
          : null
      )

      // A new report invalidates any priced snapshot.
      hasPricedRef.current = false
      setPriced(null)
      setStale(false)

      setReport(rpt)
      setKnockoutState(stored ?? createState(rpt.character, rpt.difficulty, rpt.realm, rpt.region))
      setLootSpecId(rpt.lootSpecId ?? null)

      const storedSettings = loadSettings(key)
      setThresholdPct(storedSettings.thresholdPct)
      setRollsAvailable(storedSettings.rollsAvailable)
      setVoidcoreCount(loadVoidcoreCount(key))

      const seen = new Map<number, string>()
      for (const item of rpt.items) {
        if (item.encounterId < 0) continue
        if (!seen.has(item.encounterId)) seen.set(item.encounterId, item.encounterName)
      }
      setExpectedKillIds(new Set(seen.keys()))
      setManualVaultGainPct('')

      if (!topGearUrl.trim()) {
        const storedTopGearUrl = loadLastTopGearUrl(key)
        setTopGearUrl(storedTopGearUrl ?? '')
        if (!storedTopGearUrl) {
          setTopGearResult(null)
          setTopGearStatus('idle')
          setTopGearError(null)
        }
      }

      saveLastReportUrl(key, url)
      setLoadStatus('idle')
      return true
    } catch (e) {
      if (e instanceof ProxyRequestError && e.code === 'unsupported_content') {
        setLoadError(friendlyUnsupportedContent(e.contentType))
        setLoadStatus('error')
        return false
      }
      const message = e instanceof ProxyRequestError ? e.message : (e as Error).message
      setLoadError((e instanceof ProxyRequestError && friendlyReportMismatch(message, 'sim')) || message)
      setLoadStatus('error')
      return false
    }
  }

  function handleFetch() {
    if (!detectedSource) return
    void loadReport(reportUrl, detectedSource)
  }

  function toggleExpectedKill(encounterId: number) {
    setExpectedKillIds((prev) => {
      const next = new Set(prev)
      if (next.has(encounterId)) next.delete(encounterId)
      else next.add(encounterId)
      return next
    })
  }

  async function switchCharacter(key: string) {
    const url = loadLastReportUrl(key)
    if (!url) return
    const source = detectSource(url)
    if (!source) return
    setReportUrl(url)
    await loadReport(url, source)
  }

  function handleSetItemState(change: ItemStateChange) {
    if (!knockoutState) return
    if (change.state === 'none') {
      setKnockoutState(removeEntry(knockoutState, change.itemId))
    } else {
      setKnockoutState(
        addEntry(knockoutState, {
          itemId: change.itemId,
          itemName: change.name,
          encounterId: change.encounterId,
          receivedAt: new Date().toISOString(),
          lootSpecId: lootSpecId ?? undefined,
          source: 'manual',
          state: change.state,
        })
      )
    }
  }

  function handleSetRollsSpent(encounterId: number, count: number) {
    if (!knockoutState) return
    setKnockoutState(setRollsSpent(knockoutState, encounterId, count))
  }

  function handlePrice() {
    if (!cardData) return
    setPriced({ card: cardData, bossEvals })
    hasPricedRef.current = true
    setStale(false)
  }

  function handleExport() {
    if (!knockoutState || !report) return
    const blob = new Blob([serialize(knockoutState)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `gallagioloot-knockout-${report.character}-${report.difficulty}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleImport() {
    setImportError(null)
    if (!report) return
    try {
      const parsed = deserialize(importText)
      if (parsed.difficulty !== report.difficulty) {
        setImportError(`Imported state is for difficulty "${parsed.difficulty}" but this report is "${report.difficulty}"; not applied.`)
        return
      }
      setKnockoutState(parsed)
      setImportText('')
    } catch (e) {
      setImportError((e as Error).message)
    }
  }

  const itemsParsed = report?.items.length ?? 0
  const matchedCount = report?.items.filter((i) => i.encounterId >= 0).length ?? 0
  const reconcileWarnings = report
    ? [...report.warnings, ...(notInReportCount ? [`${notInReportCount} loot-table item${notInReportCount === 1 ? '' : 's'} not in the sim report (valued 0)`] : [])]
    : []

  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="app-header__brand">GallagioLoot</span>
        <div className="app-header__controls">
          <CharacterSwitcher
            keys={characterKeys}
            currentKey={currentKey}
            onSwitch={(key) => void switchCharacter(key)}
            voidcoreCount={voidcoreCount}
            onVoidcoreChange={setVoidcoreCount}
          />
        </div>
      </header>

      <main className="app-main app-main--page">
        {/* a. Reports */}
        <section className="panel">
          <div className="screen-header" style={{ marginBottom: 6 }}>
            <div className="screen-header__title-group">
              <h3>Reports</h3>
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
              onChange={(e) => setReportUrl(e.target.value)}
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
              onChange={(e) => setTopGearUrl(e.target.value)}
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
              </div>
            )}
          </div>

          <div className="fetch-button-group">
            <button type="button" className={report ? 'btn-light--outline' : 'btn-light'} disabled={!detectedSource || loadStatus === 'loading'} onClick={handleFetch}>
              {loadStatus === 'loading' ? 'Fetching…' : report ? 'Re-fetch report' : 'Fetch report'}
            </button>
            {!detectedSource && loadStatus !== 'loading' && <div className="btn-hint">Needs a report URL</div>}
          </div>

          {loadStatus === 'error' && loadError && <p className="warning-banner" style={{ marginTop: 12 }}>{loadError}</p>}

          {report && (
            <>
              <div className="stats-line" style={{ marginTop: 14 }}>
                <span>
                  <span className="num">{itemsParsed}</span> items parsed
                </span>
                <span>
                  <span className="num">{matchedCount}</span> matched
                </span>
                {notInReportCount != null && (
                  <span>
                    <span className="num">{notInReportCount}</span> not in report
                  </span>
                )}
              </div>
              {/* Reconcile: inline warning under the parse line, only when something doesn't match. */}
              {reconcileWarnings.length > 0 && (
                <div className="warning-banner" style={{ marginTop: 12, marginBottom: 0 }}>
                  <strong>Reconcile:</strong> {reconcileWarnings.join(' · ')}
                </div>
              )}
              {mismatchWarning && (
                <div className="warning-banner" style={{ marginTop: 12, marginBottom: 0 }}>
                  {mismatchWarning}
                </div>
              )}
              <p className="note-line">
                <strong style={{ color: 'var(--text)' }}>{report.character}</strong>
                {report.realm ? ` — ${report.realm}` : ''}
                {report.region ? ` (${report.region})` : ''} · {report.charClass ? `${report.charClass} ` : ''}
                {report.spec} ({report.role}) · {report.instanceName ?? 'Unknown instance'}
              </p>
            </>
          )}
        </section>

        {/* b. Run settings */}
        <section className="panel">
          <div className="screen-header" style={{ marginBottom: 12 }}>
            <div className="screen-header__title-group">
              <h3>Run settings</h3>
            </div>
          </div>

          <div className="run-settings-row">
            <div className="field" style={{ marginBottom: 0 }}>
              <span className="field-label-text">Loot spec</span>
              {report ? (
                <LootSpecPicker lootSpecId={lootSpecId} onChange={setLootSpecId} />
              ) : (
                <select disabled aria-label="Loot spec">
                  <option>From report</option>
                </select>
              )}
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <span className="field-label-text">Difficulty</span>
              {report ? (
                <select aria-label="Difficulty" value={report.difficulty} onChange={() => {}}>
                  <option value={report.difficulty}>{formatDifficulty(report.difficulty, report.contentType)}</option>
                </select>
              ) : (
                <select disabled aria-label="Difficulty">
                  <option>From report</option>
                </select>
              )}
            </div>
          </div>

          {report && !isRecognizedDifficulty(report.difficulty, report.contentType) && (
            <p className="warning-banner" style={{ marginTop: 12, marginBottom: 0 }}>
              Unrecognized difficulty ("{report.difficulty}") — treating as Unknown.
            </p>
          )}

          <div className="run-settings-row" style={{ marginTop: 14 }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <span className="field-label-text">Voidcores held</span>
              <div className="voidcore-field">
                <ChipStack count={voidcoreCount} />
                <input
                  type="number"
                  min={0}
                  value={voidcoreCount}
                  onChange={(e) => setVoidcoreCount(Number(e.target.value) || 0)}
                  className="voidcore-field__input num"
                  aria-label="Voidcores held"
                />
              </div>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="rolls-available" className="field-label-text" style={{ marginBottom: 4 }}>
                Rolls available
              </label>
              <select id="rolls-available" value={rollsAvailable} onChange={(e) => setRollsAvailable(Number(e.target.value) === 2 ? 2 : 1)}>
                <option value={1}>1</option>
                <option value={2}>2</option>
              </select>
            </div>
          </div>

          <div className="field" style={{ marginTop: 18, marginBottom: 0 }}>
            <span className="field-label-text">Bosses · kill order</span>
            <div className="field-hint" style={{ marginTop: 0, marginBottom: 8 }}>
              Check the bosses you expect to kill. Expand a boss to mark items None / Owned / Rolled and set rolls spent.
            </div>
            <BossList
              report={report}
              bossEvals={bossEvals}
              lootTable={lootTable}
              lootTableStatus={lootTableStatus}
              expectedKillIds={expectedKillIds}
              onToggleExpectedKill={toggleExpectedKill}
              onSetItemState={handleSetItemState}
              onSetRollsSpent={handleSetRollsSpent}
            />
            {lootTableStatus === 'error' && lootTableError && (
              <p className="warning-banner" style={{ marginTop: 12, marginBottom: 0 }}>
                {lootTableError}
              </p>
            )}
          </div>

          <details style={{ marginTop: 18 }}>
            <summary style={{ cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 13 }}>Advanced</summary>
            <div className="field" style={{ marginTop: 10 }}>
              <label htmlFor="threshold">
                <Tooltip term="threshold">Threshold %</Tooltip>
              </label>
              <input id="threshold" type="number" step="0.01" value={thresholdPct} onChange={(e) => setThresholdPct(Number(e.target.value) || 0)} />
            </div>
            <div className="field">
              <label htmlFor="manual-vault-gain">Manual vault gain % (overrides the Top Gear report)</label>
              <input id="manual-vault-gain" type="number" step="0.01" value={manualVaultGainPct} onChange={(e) => setManualVaultGainPct(e.target.value)} />
            </div>
            {report && (
              <div className="field" style={{ marginBottom: 0 }}>
                <span className="field-label-text">Knockout state</span>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-secondary" onClick={handleExport}>
                    Export JSON
                  </button>
                </div>
                <textarea
                  aria-label="Import knockout JSON"
                  rows={3}
                  placeholder="Paste exported knockout JSON to import…"
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  style={{ marginTop: 8 }}
                />
                <button type="button" className="btn btn-secondary" style={{ marginTop: 8 }} disabled={!importText.trim()} onClick={handleImport}>
                  Import
                </button>
                {importError && (
                  <div className="warning-banner" style={{ marginTop: 8, marginBottom: 0 }}>
                    {importError}
                  </div>
                )}
              </div>
            )}
          </details>
        </section>

        {/* c. Price my roll */}
        <section>
          <div className="price-action">
            <button type="button" className="btn btn-gold price-action__btn" disabled={!cardData} onClick={handlePrice}>
              Price my roll
            </button>
            {stale && <div className="warning-banner reprice-note">Settings changed. Press Price my roll to update.</div>}
          </div>

          {priced && (
            <div className={`priced-section${stale ? ' priced-section--stale' : ''}`} aria-live="polite">
              <RecommendationCard card={priced.card} stale={stale} />
              <div style={{ marginTop: 16 }}>
                <PricedDetail bossEvals={priced.bossEvals} thresholdPct={thresholdPct} />
              </div>
            </div>
          )}
        </section>

        <Footer />
      </main>
    </div>
  )
}
