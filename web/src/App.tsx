import { useEffect, useMemo, useState } from 'react'
import type { NormalizedReport } from '@engine/types'
import { createState, markSpecSpecific, reconcile, removeEntry, storageKey } from '@engine/core/knockout'
import { buildBossPools } from '@engine/core/pool'
import { recommend } from '@engine/core/rank'
import { compareVault } from '@engine/core/vault'
import type { KnockoutState, Settings, VaultItemInput } from '@engine/core/types'
import { detectSource, type ReportSource } from './lib/urlDetect'
import { fetchReport, ProxyRequestError } from './lib/proxyClient'
import { buildCardData } from './lib/cardData'
import {
  LocalStorageAdapter,
  loadLastReportUrl,
  loadSettings,
  loadVoidcoreCount,
  saveLastReportUrl,
  saveSettings,
  saveVoidcoreCount,
} from './lib/storage'
import { useScreenHistory } from './state/useScreenHistory'
import { PasteScreen, type BossOption } from './components/PasteScreen'
import { DeployabilityScreen } from './components/DeployabilityScreen'
import { RollScreen } from './components/RollScreen'
import { ReconcileScreen } from './components/ReconcileScreen'
import { CharacterSwitcher } from './components/CharacterSwitcher'
import { Footer } from './components/Footer'

const storageAdapter = new LocalStorageAdapter()

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

  const [vaultItemName, setVaultItemName] = useState('')
  const [vaultItemGainPct, setVaultItemGainPct] = useState('')
  const [vaultBossId, setVaultBossId] = useState<number | null>(null)

  const [voidcoreCount, setVoidcoreCount] = useState(0)
  const [knockoutState, setKnockoutState] = useState<KnockoutState | null>(null)
  const [characterKeys, setCharacterKeys] = useState<string[]>([])

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
    }),
    [thresholdPct, rollsAvailable, expectedKillIds, bossList]
  )

  const bossEvals = useMemo(() => (report && knockoutState ? buildBossPools(report, knockoutState, settings) : []), [report, knockoutState, settings])

  const recommendation = useMemo(() => (report && bossEvals.length ? recommend(bossEvals, settings, report) : null), [report, bossEvals, settings])

  const vaultItemInput: VaultItemInput | null = useMemo(() => {
    const gain = Number(vaultItemGainPct)
    if (!vaultItemGainPct || Number.isNaN(gain)) return null
    return { name: vaultItemName || 'Vault item', gainPct: gain, encounterId: vaultBossId ?? undefined }
  }, [vaultItemName, vaultItemGainPct, vaultBossId])

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
      setVaultItemName('')
      setVaultItemGainPct('')
      setVaultBossId(null)

      saveLastReportUrl(key, url)
      setLoadStatus('idle')
      return true
    } catch (e) {
      setLoadError(e instanceof ProxyRequestError ? e.message : (e as Error).message)
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
    const { state } = reconcile(knockoutState, report, { encounterId, receivedItemId, receivedAt: new Date().toISOString() }, settings)
    const finalState = specSpecific ? markSpecSpecific(state, receivedItemId, report.spec) : state
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

  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="app-header__brand">GallagioLoot</span>
        <CharacterSwitcher
          keys={characterKeys}
          currentKey={currentKey}
          onSwitch={(key) => void switchCharacter(key)}
          voidcoreCount={voidcoreCount}
          onVoidcoreChange={setVoidcoreCount}
        />
      </header>

      <main className="app-main">
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
            vaultItemName={vaultItemName}
            onVaultItemNameChange={setVaultItemName}
            vaultItemGainPct={vaultItemGainPct}
            onVaultItemGainPctChange={setVaultItemGainPct}
            vaultBossId={vaultBossId}
            onVaultBossIdChange={setVaultBossId}
            thresholdPct={thresholdPct}
            onThresholdPctChange={setThresholdPct}
            onContinue={() => go('deployability')}
          />
        )}

        {screen === 'deployability' && <DeployabilityScreen bossEvals={bossEvals} thresholdPct={thresholdPct} onViewRecommendation={() => go('roll')} />}

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
      </main>

      <Footer />
    </div>
  )
}
