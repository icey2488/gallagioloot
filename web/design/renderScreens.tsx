// One-off script (run via `npx tsx design/renderScreens.tsx`): statically renders the
// four screens against the live Raidbots fixture -- an empty knockout state, threshold
// 0.2, rolls 1 -- wrapped in the real app shell (header/CharacterSwitcher/Footer) so
// screenshots and axe audits see exactly what a user sees, without needing a running
// wrangler dev proxy or live network access.
import { readFileSync, writeFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createState } from '../../src/core/knockout'
import { buildBossPools } from '../../src/core/pool'
import { recommend } from '../../src/core/rank'
import type { LootTable, NormalizedReport, NormalizedTopGear } from '../../src/types'
import type { Settings } from '../../src/core/types'
import { buildCardData } from '../src/lib/cardData'
import { RecommendationCard } from '../src/components/RecommendationCard'
import { DeployabilityScreen } from '../src/components/DeployabilityScreen'
import { ReconcileScreen } from '../src/components/ReconcileScreen'
import { LootTableScreen } from '../src/components/LootTableScreen'
import { PasteScreen } from '../src/components/PasteScreen'
import { CharacterSwitcher } from '../src/components/CharacterSwitcher'
import { Footer } from '../src/components/Footer'

const report = JSON.parse(
  readFileSync(new URL('./fixtures/raidbots-jk6WmLFEnBpEqWueDkyRqA.json', import.meta.url), 'utf-8')
) as NormalizedReport

const lootTable = JSON.parse(readFileSync(new URL('./fixtures/loot-table-1320-262.json', import.meta.url), 'utf-8')) as LootTable

// Top Gear field demo data (real values, verified live 2026-09-20 against report
// miriTcb27bfGDYmV6JjvD1 -- see README.md's "Top Gear shape notes"), so the Paste
// screenshot shows the feature populated rather than its empty state.
const topGear: NormalizedTopGear = {
  source: 'raidbots',
  reportId: 'miriTcb27bfGDYmV6JjvD1',
  character: 'Icemagus',
  spec: 'arcane',
  baseline: 554420.233784871,
  metric: 'dps',
  bestSet: {
    delta: 1825.0056939647766,
    pct: 0.32917371747166874,
    items: [{ itemId: 250214, name: 'Lightspire Core', slot: 'trinket2', ilvl: 334 }],
  },
  equippedItems: [],
  candidates: [
    { itemId: 250214, name: 'Lightspire Core', slot: 'trinket2', ilvl: 334, encounterId: 2771, encounterName: 'Lightwarden Ruia', instanceId: 1309 },
  ],
  allSets: [
    { delta: 1825.0056939647766, pct: 0.32917371747166874, items: [] },
    { delta: 506.25, pct: 0.0913, items: [] },
  ],
}

const settings: Settings = { thresholdPct: 0.2, rollsAvailable: 1, includeOffSpec: false, lootSpecId: lootTable.lootSpecId }
const knockout = createState(report.character, report.difficulty, report.realm, report.region)
const bossEvals = buildBossPools(report, knockout, settings, lootTable.encounters)
const recommendation = recommend(bossEvals, settings, report)
const card = buildCardData({ recommendation, bossEvals, vaultDecision: null })

const noop = () => {}

const theme = readFileSync(new URL('../src/theme.css', import.meta.url), 'utf-8')

const NAV_TABS = [
  { label: 'Paste', current: false },
  { label: 'Reconcile', current: false },
  { label: 'Loot table', current: false },
  { label: 'Recommendation', current: false },
]

function shellHtml(title: string, mainHtml: string, opts: { narrow?: boolean; wide?: boolean; activeNav?: string } = {}): string {
  const header = renderToStaticMarkup(
    createElement(
      'header',
      { className: 'app-header' },
      createElement('span', { className: 'app-header__brand' }, 'GallagioLoot'),
      createElement(
        'nav',
        { className: 'app-nav', 'aria-label': 'Screens' },
        NAV_TABS.map((tab) =>
          createElement(
            'button',
            { key: tab.label, type: 'button', className: 'app-nav__item', 'aria-current': tab.label === opts.activeNav ? 'page' : undefined },
            tab.label
          )
        )
      ),
      createElement(
        'div',
        { className: 'app-header__controls' },
        createElement(CharacterSwitcher, { keys: [], currentKey: null, onSwitch: noop, voidcoreCount: 2, onVoidcoreChange: noop })
      )
    )
  )
  const footer = renderToStaticMarkup(createElement(Footer))

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>GallagioLoot -- ${title}</title>
<style>
${theme}
${opts.narrow ? '.app-main { max-width: 380px; }' : ''}
</style>
</head>
<body>
<div class="app-shell">
${header}
<main class="app-main${opts.wide ? ' app-main--wide' : ''}">
${mainHtml}
${footer}
</main>
</div>
</body>
</html>
`
}

const pages: Array<{ name: string; html: string }> = [
  {
    // No report loaded yet -- the actual first-visit state of the Paste screen, and
    // what the in-flow-footer-visible-without-scrolling check verifies against (the
    // fixture-loaded 'paste' page below is naturally taller than one viewport once a
    // report's boss/vault fields render, which isn't the regression this redesign fixes).
    name: 'paste-empty',
    html: shellHtml(
      'Paste screen (empty)',
      renderToStaticMarkup(
        createElement(PasteScreen, {
          reportUrl: '',
          onReportUrlChange: noop,
          detectedSource: null,
          loadStatus: 'idle',
          loadError: null,
          onFetch: noop,
          report: null,
          mismatchWarning: null,
          rollsAvailable: 1,
          onRollsAvailableChange: noop,
          bossList: [],
          expectedKillIds: new Set(),
          onToggleExpectedKill: noop,
          vaultItemName: '',
          onVaultItemNameChange: noop,
          vaultBossId: null,
          onVaultBossIdChange: noop,
          topGearUrl: '',
          onTopGearUrlChange: noop,
          topGearStatus: 'idle',
          topGearError: null,
          topGearResult: null,
          manualVaultGainPct: '',
          onManualVaultGainPctChange: noop,
          thresholdPct: 0.2,
          onThresholdPctChange: noop,
          lootSpecId: null,
          onLootSpecIdChange: noop,
          voidcoreCount: 2,
          onVoidcoreCountChange: noop,
          notInReportCount: null,
          onContinue: noop,
        })
      ),
      { wide: true, activeNav: 'Paste' }
    ),
  },
  {
    name: 'paste',
    html: shellHtml(
      'Paste screen',
      renderToStaticMarkup(
        createElement(PasteScreen, {
          reportUrl: 'https://www.raidbots.com/reports/jk6WmLFEnBpEqWueDkyRqA',
          onReportUrlChange: noop,
          detectedSource: 'raidbots',
          loadStatus: 'idle',
          loadError: null,
          onFetch: noop,
          report,
          mismatchWarning: null,
          rollsAvailable: 1,
          onRollsAvailableChange: noop,
          bossList: [...new Set(report.items.filter((i) => i.encounterId >= 0).map((i) => i.encounterId))].map((encounterId) => ({
            encounterId,
            encounterName: report.items.find((i) => i.encounterId === encounterId)!.encounterName,
          })),
          expectedKillIds: new Set(report.items.filter((i) => i.encounterId >= 0).map((i) => i.encounterId)),
          onToggleExpectedKill: noop,
          vaultItemName: '',
          onVaultItemNameChange: noop,
          vaultBossId: null,
          onVaultBossIdChange: noop,
          topGearUrl: 'https://www.raidbots.com/reports/miriTcb27bfGDYmV6JjvD1',
          onTopGearUrlChange: noop,
          topGearStatus: 'idle',
          topGearError: null,
          topGearResult: topGear,
          manualVaultGainPct: '',
          onManualVaultGainPctChange: noop,
          thresholdPct: 0.2,
          onThresholdPctChange: noop,
          lootSpecId: lootTable.lootSpecId,
          onLootSpecIdChange: noop,
          voidcoreCount: 2,
          onVoidcoreCountChange: noop,
          notInReportCount: bossEvals.reduce((sum, b) => sum + b.pool.filter((p) => p.notInSimReport).length, 0),
          onContinue: noop,
        })
      ),
      { wide: true, activeNav: 'Paste' }
    ),
  },
  {
    name: 'deployability',
    html: shellHtml(
      'Rollable Bosses',
      renderToStaticMarkup(createElement(DeployabilityScreen, { bossEvals, thresholdPct: settings.thresholdPct, onViewRecommendation: noop })),
      { activeNav: 'Recommendation' }
    ),
  },
  {
    name: 'roll',
    html: shellHtml('Roll recommendation', renderToStaticMarkup(createElement(RecommendationCard, { card, onPrimaryAction: noop })), {
      narrow: true,
      activeNav: 'Recommendation',
    }),
  },
  {
    name: 'reconcile',
    html: shellHtml(
      'Reconcile',
      renderToStaticMarkup(
        createElement(ReconcileScreen, {
          report,
          bossEvals,
          knockoutState: knockout,
          defaultEncounterId: recommendation.allocations[0]?.encounterId,
          onReconcile: noop,
          onRemoveEntry: noop,
          onImportState: noop,
        })
      ),
      { wide: true, activeNav: 'Reconcile' }
    ),
  },
  {
    name: 'loot-table',
    html: shellHtml(
      'Loot table',
      renderToStaticMarkup(
        createElement(LootTableScreen, {
          lootTable,
          lootTableStatus: 'idle',
          lootTableError: null,
          report,
          bossEvals,
          focusBossId: null,
          onToggleKnockout: noop,
        })
      ),
      { wide: true, activeNav: 'Loot table' }
    ),
  },
]

for (const page of pages) {
  const path = new URL(`./${page.name}-screen.html`, import.meta.url)
  writeFileSync(path, page.html)
  console.log(`Wrote design/${page.name}-screen.html`)
}
