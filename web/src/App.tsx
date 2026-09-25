import { useEffect, useMemo, useRef, useState } from 'react'
import type { LootTable, NormalizedReport, NormalizedTopGear } from '@engine/types'
import { addEntry, characterKey, createStateFor, deserialize, removeEntry, serialize, setRollsSpent, storageKeyFor } from '@engine/core/knockout'
import { buildBossPools } from '@engine/core/pool'
import { recommend } from '@engine/core/rank'
import { compareVault, vaultItemFromTopGear } from '@engine/core/vault'
import { checkCandidate, checkReportSet, DEFAULT_DRIFT_LIMITS, type DriftLimits } from '@engine/core/reportSet'
import { difficultyLabel, keyLevelOf, knockoutDifficulty, targetKey, targetKindOf } from '@engine/core/targets'
import type { BossEval, KnockoutState, Settings, VaultItemInput } from '@engine/core/types'
import { detectSource, friendlyReportMismatch, friendlyUnsupportedContent, SOURCE_LABELS, type ReportSource } from './lib/urlDetect'
import { fetchLootTable, fetchReport, fetchTopGear, ProxyRequestError } from './lib/proxyClient'
import { buildCardData, type CardData } from './lib/cardData'
import { isRecognizedDifficulty } from './lib/format'
import {
  LocalStorageAdapter,
  loadLastReportUrl,
  loadLastTopGearUrl,
  loadReportSet,
  loadSettings,
  loadVoidcoreCount,
  migrateLegacyLocationKey,
  saveLastReportUrl,
  saveLastTopGearUrl,
  saveReportSet,
  saveSettings,
  saveVoidcoreCount,
} from './lib/storage'
import { CharacterSwitcher } from './components/CharacterSwitcher'
import { Footer } from './components/Footer'
import { Tooltip } from './components/Tooltip'
import { ChipStack } from './components/ChipStack'
import { LootSpecPicker } from './components/LootSpecPicker'
import { RecommendationCard } from './components/RecommendationCard'
import { BossList, type BossSection, type ItemStateChange } from './components/BossList'
import { PricedDetail } from './components/PricedDetail'

const storageAdapter = new LocalStorageAdapter()

type PricedSnapshot = {
  card: CardData
  bossEvals: BossEval[]
}

/** One loaded report: the URL it came from and the knockout storage key its targets use. */
type LoadedReport = {
  url: string
  source: ReportSource
  report: NormalizedReport
  stateKey: string
}

/** "The Venomous Abyss · Mythic" for a raid report; "Mythic+ (+10 Myth)" for the Mythic+ report. */
function reportTitle(report: NormalizedReport): string {
  if (targetKindOf(report) === 'mplus') {
    const level = keyLevelOf(report)
    const inner = [level !== undefined ? `+${level}` : undefined, report.track?.name].filter(Boolean).join(' ')
    return inner ? `Mythic+ (${inner})` : 'Mythic+'
  }
  return `${report.instanceName ?? 'Unknown instance'} · ${difficultyLabel(report)}`
}

/** Key level / track / ilvl line under a report's parse line, e.g. "+10 and above · Myth track · drops at 318, simmed at 334 (Myth 6/6)". */
function trackLine(report: NormalizedReport): string | null {
  const t = report.track
  if (!t) return null
  const parts: string[] = []
  if (targetKindOf(report) === 'mplus') {
    const level = keyLevelOf(report)
    if (level !== undefined) parts.push(`+${level} and above`)
    if (t.name) parts.push(`${t.name} track`)
    if (t.dropIlvl !== undefined && t.simmedIlvl !== undefined) parts.push(`drops at ${t.dropIlvl}, simmed at ${t.simmedIlvl}${t.upgradeFullName ? ` (${t.upgradeFullName})` : ''}`)
  } else {
    if (t.upgradeFullName) parts.push(t.upgradeFullName)
    if (t.simmedIlvl !== undefined) parts.push(`simmed at ${t.simmedIlvl}`)
  }
  return parts.length ? parts.join(' · ') : null
}

const lootTableKey = (instanceId: number, lootSpecId: number) => `${instanceId}:${lootSpecId}`

export default function App() {
  const [reportUrl, setReportUrl] = useState('')
  const [loaded, setLoaded] = useState<LoadedReport[]>([])
  const [loadStatus, setLoadStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [driftLimits, setDriftLimits] = useState<DriftLimits>(DEFAULT_DRIFT_LIMITS)

  const [rollsAvailable, setRollsAvailable] = useState<1 | 2>(1)
  const [thresholdPct, setThresholdPct] = useState(0.2)
  const [expectedTargetKeys, setExpectedTargetKeys] = useState<Set<string>>(new Set())
  const [manualVaultGainPct, setManualVaultGainPct] = useState('')

  const [topGearUrl, setTopGearUrl] = useState('')
  const [topGearResult, setTopGearResult] = useState<NormalizedTopGear | null>(null)
  const [topGearStatus, setTopGearStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [topGearError, setTopGearError] = useState<string | null>(null)

  const [voidcoreCount, setVoidcoreCount] = useState(0)
  // One knockout state per storage key: a raid difficulty, or the Mythic+ track.
  const [knockoutStates, setKnockoutStates] = useState<Record<string, KnockoutState>>({})
  const [characterKeys, setCharacterKeys] = useState<string[]>([])

  const [lootSpecId, setLootSpecId] = useState<number | null>(null)
  const [lootTables, setLootTables] = useState<Record<string, LootTable>>({})
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

  const reports = useMemo(() => loaded.map((l) => l.report), [loaded])
  const primary = reports[0] ?? null
  // Settings, Voidcores and the Top Gear URL persist under the first loaded report's key,
  // exactly as they did when only one report could be loaded.
  const currentKey = loaded[0]?.stateKey ?? null

  const setCheck = useMemo(() => checkReportSet(reports, driftLimits), [reports, driftLimits])

  const settings: Settings = useMemo(
    () => ({
      thresholdPct,
      rollsAvailable,
      includeOffSpec: false,
      expectedTargets: loaded.length ? [...expectedTargetKeys] : undefined,
      lootSpecId: lootSpecId ?? undefined,
    }),
    [thresholdPct, rollsAvailable, expectedTargetKeys, loaded.length, lootSpecId]
  )

  const sectionsData = useMemo(
    () =>
      loaded.map((l) => {
        const lootTable = lootSpecId != null && l.report.instanceId !== undefined ? lootTables[lootTableKey(l.report.instanceId, lootSpecId)] ?? null : null
        const state = knockoutStates[l.stateKey] ?? createStateFor(l.report)
        return { loaded: l, lootTable, evals: buildBossPools(l.report, state, settings, lootTable?.encounters) }
      }),
    [loaded, lootTables, lootSpecId, knockoutStates, settings]
  )

  const bossEvals = useMemo(() => sectionsData.flatMap((s) => s.evals), [sectionsData])

  const recommendation = useMemo(
    () => (reports.length && bossEvals.length && setCheck.errors.length === 0 ? recommend(bossEvals, settings, reports) : null),
    [reports, bossEvals, settings, setCheck]
  )

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
    if (!primary || !recommendation || !vaultItemInput) return null
    return compareVault({ vaultItem: vaultItemInput, bossEvals, recommendation, settings, report: primary })
  }, [primary, recommendation, vaultItemInput, bossEvals, settings])

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

  // Mark the priced snapshot stale whenever the live pricing inputs change (after the first
  // price). The button press itself changes none of these deps, so it never trips this.
  useEffect(() => {
    if (hasPricedRef.current) setStale(true)
  }, [bossEvals, recommendation, vaultDecision])

  // One loot table per distinct instance among the loaded reports (the raid instance(s) and
  // the Mythic+ aggregate, -1, whose pseudo-encounters are the dungeons).
  const instanceIdsKey = [...new Set(reports.map((r) => r.instanceId).filter((id): id is number => id !== undefined))].join(',')
  useEffect(() => {
    if (lootSpecId == null || !instanceIdsKey) return
    const missing = instanceIdsKey
      .split(',')
      .map(Number)
      .filter((id) => !lootTables[lootTableKey(id, lootSpecId)])
    if (missing.length === 0) return
    let cancelled = false
    setLootTableStatus('loading')
    setLootTableError(null)
    Promise.all(missing.map((id) => fetchLootTable(id, lootSpecId).then((table) => [id, table] as const)))
      .then((results) => {
        if (cancelled) return
        setLootTables((prev) => {
          const next = { ...prev }
          for (const [id, table] of results) next[lootTableKey(id, lootSpecId)] = table
          return next
        })
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
    // lootTables is read, not a dependency: a fetched table must not re-trigger this effect.
  }, [instanceIdsKey, lootSpecId])

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
    if (!primary) return
    saveReportSet(characterKey(primary), loaded.map((l) => l.url))
  }, [primary, loaded])

  useEffect(() => {
    for (const [key, state] of Object.entries(knockoutStates)) void storageAdapter.save(key, state)
  }, [knockoutStates])

  // Must stay after the save effect above: list() reads what save() just wrote, so the
  // first-loaded character shows up in the switcher immediately.
  useEffect(() => {
    storageAdapter.list().then(setCharacterKeys)
  }, [currentKey, knockoutStates])

  function invalidatePriced() {
    hasPricedRef.current = false
    setPriced(null)
    setStale(false)
  }

  /**
   * Fetches a report and adds it to `existing` (replacing a report with the same id, so
   * re-adding a URL refreshes it). Refuses -- leaving the set unchanged -- when the report is
   * for another character or loot spec, duplicates a loaded target set, or drifts past the
   * baseline limit (see checkCandidate). Returns the new set, or null when nothing was added.
   */
  async function loadReport(url: string, source: ReportSource, existing: LoadedReport[], opts: { fromSwitch?: boolean } = {}): Promise<LoadedReport[] | null> {
    setLoadStatus('loading')
    setLoadError(null)
    try {
      const rpt = await fetchReport(source, url)
      const others = existing.filter((l) => l.report.reportId !== rpt.reportId)
      const check = checkCandidate(
        others.map((l) => l.report),
        rpt,
        driftLimits
      )
      if (check.errors.length > 0) {
        setLoadError(check.errors.join(' '))
        setLoadStatus('error')
        return null
      }

      const key = storageKeyFor(rpt)
      // Migrate any pre-region/realm knockout state saved under an empty-location key.
      migrateLegacyLocationKey(key)
      const stored = await storageAdapter.load(key)
      setKnockoutStates((prev) => (prev[key] ? prev : { ...prev, [key]: stored ?? createStateFor(rpt) }))

      // A changed report set invalidates any priced snapshot.
      invalidatePriced()

      const entry: LoadedReport = { url, source, report: rpt, stateKey: key }
      const replaceAt = existing.findIndex((l) => l.report.reportId === rpt.reportId)
      const next = replaceAt >= 0 ? existing.map((l, i) => (i === replaceAt ? entry : l)) : [...existing, entry]
      setLoaded(next)

      // Every target the report simmed starts checked (expected kill / "I will run this key").
      setExpectedTargetKeys((prev) => {
        const keys = new Set(prev)
        for (const item of rpt.items) if (item.encounterId >= 0) keys.add(targetKey(rpt, item.encounterId))
        return keys
      })

      if (next[0] === entry) {
        setLootSpecId(rpt.lootSpecId ?? null)
        const storedSettings = loadSettings(key)
        setThresholdPct(storedSettings.thresholdPct)
        setRollsAvailable(storedSettings.rollsAvailable)
        setVoidcoreCount(loadVoidcoreCount(key))
        setManualVaultGainPct('')
        if (opts.fromSwitch || !topGearUrl.trim()) {
          const storedTopGearUrl = loadLastTopGearUrl(key)
          setTopGearUrl(storedTopGearUrl ?? '')
          if (!storedTopGearUrl) {
            setTopGearResult(null)
            setTopGearStatus('idle')
            setTopGearError(null)
          }
        }
      }

      saveLastReportUrl(key, url)
      setReportUrl('')
      setLoadStatus('idle')
      return next
    } catch (e) {
      if (e instanceof ProxyRequestError && e.code === 'unsupported_content') {
        setLoadError(friendlyUnsupportedContent(e.contentType))
        setLoadStatus('error')
        return null
      }
      const message = e instanceof ProxyRequestError ? e.message : (e as Error).message
      setLoadError((e instanceof ProxyRequestError && friendlyReportMismatch(message, 'sim')) || message)
      setLoadStatus('error')
      return null
    }
  }

  function handleFetch() {
    if (!detectedSource) return
    void loadReport(reportUrl.trim(), detectedSource, loaded)
  }

  function removeReport(reportId: string) {
    const removed = loaded.find((l) => l.report.reportId === reportId)
    if (!removed) return
    const next = loaded.filter((l) => l.report.reportId !== reportId)
    setLoaded(next)
    invalidatePriced()
    const removedKeys = new Set(removed.report.items.map((i) => targetKey(removed.report, i.encounterId)))
    setExpectedTargetKeys((prev) => new Set([...prev].filter((k) => !removedKeys.has(k))))
    if (next.length === 0) saveReportSet(characterKey(removed.report), [])
  }

  function toggleExpectedTarget(key: string) {
    setExpectedTargetKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function switchCharacter(key: string) {
    const charKey = key.split(':').slice(0, 3).join(':')
    const lastUrl = loadLastReportUrl(key)
    const urls = loadReportSet(charKey)?.length ? loadReportSet(charKey)! : lastUrl ? [lastUrl] : []
    if (urls.length === 0) return
    setLoaded([])
    setExpectedTargetKeys(new Set())
    invalidatePriced()
    let set: LoadedReport[] = []
    for (const url of urls) {
      const source = detectSource(url)
      if (!source) continue
      const next = await loadReport(url, source, set, { fromSwitch: set.length === 0 })
      if (next) set = next
    }
  }

  function handleSetItemState(change: ItemStateChange) {
    setKnockoutStates((prev) => {
      const state = prev[change.stateKey]
      if (!state) return prev
      const next =
        change.state === 'none'
          ? removeEntry(state, change.itemId)
          : addEntry(state, {
              itemId: change.itemId,
              itemName: change.name,
              encounterId: change.encounterId,
              receivedAt: new Date().toISOString(),
              lootSpecId: lootSpecId ?? undefined,
              source: 'manual',
              state: change.state,
            })
      return { ...prev, [change.stateKey]: next }
    })
  }

  function handleSetRollsSpent(stateKey: string, encounterId: number, count: number) {
    setKnockoutStates((prev) => (prev[stateKey] ? { ...prev, [stateKey]: setRollsSpent(prev[stateKey], encounterId, count) } : prev))
  }

  function handlePrice() {
    if (!cardData) return
    setPriced({ card: cardData, bossEvals })
    hasPricedRef.current = true
    setStale(false)
  }

  /** One loaded state exports as a plain knockout state (as before); several export as `{ version: 2, states: [...] }`. */
  function handleExport() {
    if (!primary) return
    const states = [...new Set(loaded.map((l) => l.stateKey))].map((k) => knockoutStates[k]).filter((s): s is KnockoutState => !!s)
    if (states.length === 0) return
    const body = states.length === 1 ? serialize(states[0]) : JSON.stringify({ version: 2, states })
    const blob = new Blob([body], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = states.length === 1 ? `gallagioloot-knockout-${primary.character}-${states[0].difficulty}.json` : `gallagioloot-knockout-${primary.character}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleImport() {
    setImportError(null)
    if (!primary) return
    try {
      const parsed = JSON.parse(importText) as { states?: unknown[] } | null
      const states = Array.isArray(parsed?.states) ? parsed!.states.map((s) => deserialize(JSON.stringify(s))) : [deserialize(importText)]
      const updates: Record<string, KnockoutState> = {}
      const unmatched: string[] = []
      for (const state of states) {
        const target = loaded.find((l) => knockoutDifficulty(l.report) === state.difficulty)
        if (target) updates[target.stateKey] = state
        else unmatched.push(state.difficulty)
      }
      if (Object.keys(updates).length === 0) {
        setImportError(`Imported state is for difficulty "${unmatched.join('", "')}", which matches no loaded report; not applied.`)
        return
      }
      setKnockoutStates((prev) => ({ ...prev, ...updates }))
      if (unmatched.length) setImportError(`Skipped state for "${unmatched.join('", "')}": no loaded report matches.`)
      setImportText('')
    } catch (e) {
      setImportError((e as Error).message)
    }
  }

  const sections: BossSection[] = sectionsData.map((s) => {
    const kind = targetKindOf(s.loaded.report)
    return {
      key: s.loaded.report.reportId,
      title: reportTitle(s.loaded.report),
      hint: kind === 'mplus' ? 'Check the keys you will run. One roll per completed key; a dungeon can take more than one.' : undefined,
      kind,
      stateKey: s.loaded.stateKey,
      bossEvals: s.evals,
      lootTable: s.lootTable,
    }
  })

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
            <div className="screen-header__meta">Raid droptimizers and one Mythic+ droptimizer, same character</div>
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
              {detectedSource
                ? `Detected: ${SOURCE_LABELS[detectedSource]}`
                : reportUrl
                  ? 'Unrecognized report URL'
                  : loaded.length
                    ? 'Add another difficulty or your Mythic+ droptimizer'
                    : 'Paste a Raidbots or QE Live report URL'}
            </div>
          </div>

          <div className="fetch-button-group">
            <button type="button" className={loaded.length ? 'btn-light--outline' : 'btn-light'} disabled={!detectedSource || loadStatus === 'loading'} onClick={handleFetch}>
              {loadStatus === 'loading' ? 'Fetching…' : loaded.length ? 'Add report' : 'Fetch report'}
            </button>
            {!detectedSource && loadStatus !== 'loading' && <div className="btn-hint">Needs a report URL</div>}
          </div>

          {loadStatus === 'error' && loadError && <p className="warning-banner" style={{ marginTop: 12 }}>{loadError}</p>}

          {loaded.length > 0 && (
            <div className="report-list">
              {sectionsData.map(({ loaded: l, lootTable, evals }) => {
                const r = l.report
                const matched = r.items.filter((i) => i.encounterId >= 0).length
                const notInReport = lootTable ? evals.reduce((sum, b) => sum + b.pool.filter((p) => p.notInSimReport).length, 0) : null
                const title = reportTitle(r)
                const track = trackLine(r)
                const warnings = [
                  ...r.warnings,
                  ...(isRecognizedDifficulty(r.difficulty, r.contentType) ? [] : [`Unrecognized difficulty ("${r.difficulty}"), treating as Unknown`]),
                  ...(notInReport ? [`${notInReport} loot-table item${notInReport === 1 ? '' : 's'} not in the sim report (valued 0)`] : []),
                ]
                return (
                  <div className="report-line" key={r.reportId}>
                    <div className="report-line__head">
                      <span className="report-line__title">{title}</span>
                      <span className="report-line__source">{SOURCE_LABELS[l.source]}</span>
                      <button type="button" className="btn-link report-line__remove" aria-label={`Remove ${title} report`} onClick={() => removeReport(r.reportId)}>
                        Remove
                      </button>
                    </div>
                    <div className="stats-line">
                      <span>
                        <span className="num">{r.items.length}</span> items parsed
                      </span>
                      <span>
                        <span className="num">{matched}</span> matched
                      </span>
                      {notInReport != null && (
                        <span>
                          <span className="num">{notInReport}</span> not in report
                        </span>
                      )}
                    </div>
                    {track && <p className="note-line" style={{ marginTop: 4 }}>{track}</p>}
                    {/* Reconcile: inline warning under the parse line, only when something doesn't match. */}
                    {warnings.length > 0 && (
                      <div className="warning-banner">
                        <strong>Reconcile:</strong> {warnings.join(' · ')}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {setCheck.errors.length > 0 && (
            <p className="warning-banner" style={{ marginTop: 12, marginBottom: 0 }}>
              {setCheck.errors.join(' ')} Pricing is paused until this is fixed.
            </p>
          )}
          {setCheck.warnings.length > 0 && (
            <p className="warning-banner" style={{ marginTop: 12, marginBottom: 0 }}>
              {setCheck.warnings.join(' ')}
            </p>
          )}

          <div className="field" style={{ marginTop: 16 }}>
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

          {primary && (
            <p className="note-line" style={{ marginBottom: 0 }}>
              <strong style={{ color: 'var(--text)' }}>{primary.character}</strong>
              {primary.realm ? ` — ${primary.realm}` : ''}
              {primary.region ? ` (${primary.region})` : ''} · {primary.charClass ? `${primary.charClass} ` : ''}
              {primary.spec} ({primary.role})
            </p>
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
              {primary ? (
                <LootSpecPicker lootSpecId={lootSpecId} onChange={setLootSpecId} />
              ) : (
                <select disabled aria-label="Loot spec">
                  <option>From report</option>
                </select>
              )}
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
          </div>

          <div className="field" style={{ marginTop: 18, marginBottom: 0 }}>
            <span className="field-label-text">Bosses and keys</span>
            <div className="field-hint" style={{ marginTop: 0, marginBottom: 8 }}>
              Check the bosses you expect to kill and the keys you will run. Expand a row to mark items None / Owned / Rolled and set rolls spent.
            </div>
            <BossList
              sections={sections}
              hasReports={loaded.length > 0}
              lootTableStatus={lootTableStatus}
              expectedTargetKeys={expectedTargetKeys}
              onToggleExpectedTarget={toggleExpectedTarget}
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
            <div className="run-settings-row">
              <div className="field">
                <label htmlFor="drift-warn">Baseline drift: warn above %</label>
                <input
                  id="drift-warn"
                  type="number"
                  step="0.1"
                  min={0}
                  value={driftLimits.warnPct}
                  onChange={(e) => setDriftLimits((d) => ({ ...d, warnPct: Number(e.target.value) || 0 }))}
                />
              </div>
              <div className="field">
                <label htmlFor="drift-refuse">Baseline drift: refuse above %</label>
                <input
                  id="drift-refuse"
                  type="number"
                  step="0.1"
                  min={0}
                  value={driftLimits.refusePct}
                  onChange={(e) => setDriftLimits((d) => ({ ...d, refusePct: Number(e.target.value) || 0 }))}
                />
              </div>
            </div>
            {primary && (
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
