import { useEffect, useMemo, useState } from 'react'
import type { LootTable, LootTableItem, NormalizedReport, NormalizedTopGear } from '@engine/types'
import { addEntry, createState, markSpecSpecific, reconcile, removeEntry, storageKey } from '@engine/core/knockout'
import { buildBossPools } from '@engine/core/pool'
import { recommend } from '@engine/core/rank'
import { compareVault, vaultItemFromTopGear } from '@engine/core/vault'
import type { KnockoutState, Settings, VaultItemInput } from '@engine/core/types'
import { detectSource, friendlyReportMismatch, friendlyUnsupportedContent, type ReportSource } from './lib/urlDetect'
import { fetchLootTable, fetchReport, fetchTopGear, ProxyRequestError } from './lib/proxyClient'
import { buildCardData } from './lib/cardData'
import {
  LocalStorageAdapter,
  loadLastReportUrl,
  loadLastTopGearUrl,
  loadSettings,
  loadVoidcoreCount,
  saveLastReportUrl,
  saveLastTopGearUrl,
  saveSettings,
  saveVoidcoreCount,
} from './lib/storage'
import { useScreenHistory } from './state/useScreenHistory'
import type { Screen } from './state/screenHistory'
import { PasteScreen, type BossOption } from './components/PasteScreen'
import { DeployabilityScreen } from './components/DeployabilityScreen'
import { RollScreen } from './components/RollScreen'
import { ReconcileScreen } from './components/ReconcileScreen'
import { LootTableScreen } from './components/LootTableScreen'
import { CharacterSwitcher } from './components/CharacterSwitcher'
import { Footer } from './components/Footer'

const storageAdapter = new LocalStorageAdapter()

// Top nav tabs, matching the v2 design export's Paste/Reconcile/Loot table/Recommendation
// bar. The app has five internal screens (deployability + roll are two steps of the same
// "look at recommendations" flow); both map to the Recommendation tab, landing on the
// Rollable Bosses table -- the fifth "roll" screen is still reachable from there.
const NAV_TABS: Array<{ label: string; target: Screen; matches: Screen[] }> = [
  { label: 'Paste', target: 'paste', matches: ['paste'] },
  { label: 'Reconcile', target: 'reconcile', matches: ['reconcile'] },
  { label: 'Loot table', target: 'lootTable', matches: ['lootTable'] },
  { label: 'Recommendation', target: 'deployability', matches: ['deployability', 'roll'] },
]

const WIDE_SCREENS: Screen[] = ['paste', 'reconcile', 'lootTable']

export default function App() {
  const { screen, go, replace } = useScreenHistory()

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
  const [focusBossId, setFocusBossId] = useState<number | null>(null)

  const detectedSource: ReportSource | null = useMemo(() => detectSource(reportUrl), [reportUrl])

  const bossList: BossOption[] = useMemo(() => {
    if (!report) return []
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
    return buildCardData({ recommendation, bossEvals, vaultDecision, vaultItemName: vaultItemInput?.name })
  }, [recommendation, bossEvals, vaultDecision, vaultItemInput])

  useEffect(() => {
    storageAdapter.list().then(setCharacterKeys)
  }, [knockoutState])

  // Refetches the full per-boss loot table whenever the instance or the active loot
  // spec changes. `cancelled` guards against a stale response landing after a newer
  // request started (e.g. the user flips the loot spec picker twice quickly).
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

  // Fetches the Top Gear report whenever a recognizable Raidbots URL/id is pasted into
  // the field -- same reactive-fetch shape as the loot table effect above, rather than
  // being tied to the main report's Fetch/Price button (which the user may have already
  // clicked before pasting this second URL).
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

  // A reload (or a history entry restored from a previous session) can put us on
  // deployability/roll/reconcile with no report in memory -- the report itself
  // isn't persisted, only per-character knockout state/settings/last URL are.
  // Bounce back to Paste rather than rendering a blank screen.
  useEffect(() => {
    if (screen !== 'paste' && !report) replace('paste')
  }, [screen, report, replace])

  // Persist settings/voidcore for the current character+difficulty whenever they change.
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
      const stored = await storageAdapter.load(key)

      const mismatch = knockoutState && knockoutState.difficulty && knockoutState.difficulty !== rpt.difficulty
      setMismatchWarning(
        mismatch
          ? `Stored knockout state was for difficulty "${knockoutState!.difficulty}"; this report is "${rpt.difficulty}". Starting fresh for this difficulty.`
          : null
      )

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

      // Only restore the character's saved Top Gear URL when the field is currently
      // empty -- the user may have already typed one in this same Paste flow (its
      // character key isn't known until this fetch resolves), and that shouldn't be
      // clobbered by a per-character restore.
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
    const ok = await loadReport(url, source)
    if (ok) go('deployability')
  }

  function handleReconcileOutcome(encounterId: number, receivedItemId: number | null, specSpecific: boolean) {
    if (!report || !knockoutState) return
    if (receivedItemId == null) {
      go('deployability')
      return
    }
    const { state } = reconcile(knockoutState, report, { encounterId, receivedItemId, receivedAt: new Date().toISOString() }, settings, lootTable?.encounters)
    const finalState = specSpecific ? markSpecSpecific(state, receivedItemId, report.spec, lootSpecId ?? undefined) : state
    setKnockoutState(finalState)
    go('deployability')
  }

  function handleRemoveEntry(itemId: number) {
    if (!knockoutState) return
    setKnockoutState(removeEntry(knockoutState, itemId))
  }

  function handleImportState(state: KnockoutState) {
    setKnockoutState(state)
  }

  function handleToggleKnockout(item: LootTableItem, encounterId: number, _encounterName: string, checked: boolean) {
    if (!knockoutState) return
    if (checked) {
      setKnockoutState(
        addEntry(knockoutState, {
          itemId: item.itemId,
          itemName: item.name,
          encounterId,
          receivedAt: new Date().toISOString(),
          lootSpecId: lootSpecId ?? undefined,
          source: 'manual',
        })
      )
    } else {
      setKnockoutState(removeEntry(knockoutState, item.itemId))
    }
  }

  function handleSelectBoss(encounterId: number) {
    setFocusBossId(encounterId)
    go('lootTable')
  }

  const notInReportCount = useMemo(() => {
    if (!report || !lootTable) return null
    return bossEvals.reduce((sum, b) => sum + b.pool.filter((p) => p.notInSimReport).length, 0)
  }, [report, lootTable, bossEvals])

  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="app-header__brand">GallagioLoot</span>
        <nav className="app-nav" aria-label="Screens">
          {NAV_TABS.map((tab) => (
            <button
              key={tab.target}
              type="button"
              className="app-nav__item"
              aria-current={tab.matches.includes(screen) ? 'page' : undefined}
              onClick={() => {
                if (tab.target === 'lootTable') setFocusBossId(null)
                go(tab.target)
              }}
            >
              {tab.label}
            </button>
          ))}
        </nav>
        {/* Character switcher: app-specific control not present in the v2 mockup (which
            only shows wordmark/nav/Voidcores pill) -- kept here as a documented layout
            adaptation, same precedent as the nav tab bar comment above used to carry. */}
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

      <main className={`app-main${WIDE_SCREENS.includes(screen) ? ' app-main--wide' : ''}`}>
        {screen === 'paste' && (
          <PasteScreen
            reportUrl={reportUrl}
            onReportUrlChange={setReportUrl}
            detectedSource={detectedSource}
            loadStatus={loadStatus}
            loadError={loadError}
            onFetch={handleFetch}
            report={report}
            mismatchWarning={mismatchWarning}
            rollsAvailable={rollsAvailable}
            onRollsAvailableChange={setRollsAvailable}
            bossList={bossList}
            expectedKillIds={expectedKillIds}
            onToggleExpectedKill={toggleExpectedKill}
            topGearUrl={topGearUrl}
            onTopGearUrlChange={setTopGearUrl}
            topGearStatus={topGearStatus}
            topGearError={topGearError}
            topGearResult={topGearResult}
            manualVaultGainPct={manualVaultGainPct}
            onManualVaultGainPctChange={setManualVaultGainPct}
            thresholdPct={thresholdPct}
            onThresholdPctChange={setThresholdPct}
            lootSpecId={lootSpecId}
            onLootSpecIdChange={setLootSpecId}
            voidcoreCount={voidcoreCount}
            onVoidcoreCountChange={setVoidcoreCount}
            notInReportCount={notInReportCount}
            onContinue={() => go('deployability')}
          />
        )}

        {screen === 'deployability' && (
          <DeployabilityScreen bossEvals={bossEvals} thresholdPct={thresholdPct} onViewRecommendation={() => go('roll')} onSelectBoss={handleSelectBoss} />
        )}

        {screen === 'roll' && <RollScreen card={cardData} onMarkRolled={() => go('reconcile')} onBackToTable={() => go('deployability')} />}

        {screen === 'reconcile' && report && knockoutState && (
          <ReconcileScreen
            report={report}
            bossEvals={bossEvals}
            knockoutState={knockoutState}
            defaultEncounterId={recommendation?.allocations[0]?.encounterId}
            onReconcile={handleReconcileOutcome}
            onRemoveEntry={handleRemoveEntry}
            onImportState={handleImportState}
          />
        )}

        {screen === 'lootTable' && (
          <LootTableScreen
            lootTable={lootTable}
            lootTableStatus={lootTableStatus}
            lootTableError={lootTableError}
            report={report}
            bossEvals={bossEvals}
            focusBossId={focusBossId}
            onToggleKnockout={handleToggleKnockout}
          />
        )}

        <Footer />
      </main>
    </div>
  )
}
