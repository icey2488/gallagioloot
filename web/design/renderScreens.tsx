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
import type { NormalizedReport } from '../../src/types'
import type { Settings } from '../../src/core/types'
import { buildCardData } from '../src/lib/cardData'
import { RecommendationCard } from '../src/components/RecommendationCard'
import { DeployabilityScreen } from '../src/components/DeployabilityScreen'
import { ReconcileScreen } from '../src/components/ReconcileScreen'
import { PasteScreen } from '../src/components/PasteScreen'
import { CharacterSwitcher } from '../src/components/CharacterSwitcher'
import { Footer } from '../src/components/Footer'

const report = JSON.parse(
  readFileSync(new URL('./fixtures/raidbots-jk6WmLFEnBpEqWueDkyRqA.json', import.meta.url), 'utf-8')
) as NormalizedReport

const settings: Settings = { thresholdPct: 0.2, rollsAvailable: 1, includeOffSpec: false }
const knockout = createState(report.character, report.difficulty, report.realm, report.region)
const bossEvals = buildBossPools(report, knockout, settings)
const recommendation = recommend(bossEvals, settings, report)
const card = buildCardData({ recommendation, bossEvals, vaultDecision: null })

const noop = () => {}

const theme = readFileSync(new URL('../src/theme.css', import.meta.url), 'utf-8')

function shellHtml(title: string, mainHtml: string, opts: { narrow?: boolean } = {}): string {
  const header = renderToStaticMarkup(
    createElement(
      'header',
      { className: 'app-header' },
      createElement('span', { className: 'app-header__brand' }, 'GallagioLoot'),
      createElement(CharacterSwitcher, { keys: [], currentKey: null, onSwitch: noop, voidcoreCount: 2, onVoidcoreChange: noop })
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
<main class="app-main">
${mainHtml}
</main>
${footer}
</div>
</body>
</html>
`
}

const pages: Array<{ name: string; html: string }> = [
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
          vaultItemGainPct: '',
          onVaultItemGainPctChange: noop,
          vaultBossId: null,
          onVaultBossIdChange: noop,
          thresholdPct: 0.2,
          onThresholdPctChange: noop,
          onContinue: noop,
        })
      )
    ),
  },
  {
    name: 'deployability',
    html: shellHtml(
      'Deployability',
      renderToStaticMarkup(createElement(DeployabilityScreen, { bossEvals, thresholdPct: settings.thresholdPct, onViewRecommendation: noop }))
    ),
  },
  {
    name: 'roll',
    html: shellHtml('Roll recommendation', renderToStaticMarkup(createElement(RecommendationCard, { card, onPrimaryAction: noop })), {
      narrow: true,
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
      )
    ),
  },
]

for (const page of pages) {
  const path = new URL(`./${page.name}-screen.html`, import.meta.url)
  writeFileSync(path, page.html)
  console.log(`Wrote design/${page.name}-screen.html`)
}
