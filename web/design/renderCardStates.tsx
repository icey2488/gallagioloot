// One-off script (run via `npx tsx design/renderCardStates.tsx`): renders the
// RecommendationCard's four states -- single boss, toss-up, vault comparison,
// fallback/tokens -- to one static HTML file for screenshotting. The toss-up state
// uses the real live Raidbots fixture end to end (same one recommendation-card.png
// is built from); the other three are built the same way test/cardData.test.ts
// builds synthetic BossEval/Recommendation objects, since no single live fixture
// naturally produces all four card states.
import { readFileSync, writeFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createState } from '../../src/core/knockout'
import { buildBossPools } from '../../src/core/pool'
import { recommend } from '../../src/core/rank'
import { compareVault } from '../../src/core/vault'
import type { NormalizedReport } from '../../src/types'
import type { BossEval, Recommendation, Settings, VaultDecision } from '../../src/core/types'
import { buildCardData, type CardData } from '../src/lib/cardData'
import { RecommendationCard } from '../src/components/RecommendationCard'

const report = JSON.parse(
  readFileSync(new URL('./fixtures/raidbots-jk6WmLFEnBpEqWueDkyRqA.json', import.meta.url), 'utf-8')
) as NormalizedReport

// --- toss-up: the real live fixture, unmodified (Elemental: Lost Explorers 2.30% vs Ula'tek 2.27%) ---
const settings: Settings = { thresholdPct: 0.2, voidcoresToSpend: 1, includeOffSpec: false }
const knockout = createState(report.character, report.difficulty, report.realm, report.region)
const tossUpBossEvals = buildBossPools(report, knockout, settings)
const tossUpRecommendation = recommend(tossUpBossEvals, settings, report)
const tossUpCard = buildCardData({ recommendation: tossUpRecommendation, bossEvals: tossUpBossEvals, vaultDecision: null })

// --- single boss: a clear winner, well outside sim noise ---
function makeBoss(encounterId: number, encounterName: string, evPct: number): BossEval {
  return { encounterId, encounterName, instanceId: 1320, pool: [], remaining: 1, ev: evPct * 1000, evPct, bestCase: null, deployable: true, notes: [] }
}
const singleBossEvals = [makeBoss(2894, 'The Lost Explorers', 2.3), makeBoss(2882, 'Vashnik the Malignant', 2.18)]
const singleRecommendation: Recommendation = {
  allocations: [{ encounterId: 2894, encounterName: 'The Lost Explorers', rolls: 1, expectedGain: 2300, expectedGainPct: 2.3 }],
  totalExpectedGainPct: 2.3,
  fallback: null,
  assumptions: [],
  warnings: [],
  tossUp: null,
}
const singleCard = buildCardData({ recommendation: singleRecommendation, bossEvals: singleBossEvals, vaultDecision: null })

// --- vault comparison: Voidcore roll beats the vault item ---
const vaultBossEvals = [makeBoss(2894, 'The Lost Explorers', 2.3)]
const vaultRecommendation: Recommendation = {
  allocations: [{ encounterId: 2894, encounterName: 'The Lost Explorers', rolls: 1, expectedGain: 2300, expectedGainPct: 2.3 }],
  totalExpectedGainPct: 2.3,
  fallback: null,
  assumptions: [],
  warnings: [],
  tossUp: null,
}
const vaultDecision: VaultDecision = {
  voidcoreGainPct: 2.3,
  vaultItemGainPct: 1.12,
  savedRolls: 0,
  verdict: 'voidcore',
  explanation: 'Roll The Lost Explorers. It beats the vault item by 1.18%.',
  notes: [],
}
const vaultCard = buildCardData({
  recommendation: vaultRecommendation,
  bossEvals: vaultBossEvals,
  vaultDecision,
  vaultItemName: 'Hexing Spiritrender',
})

// --- fallback: nothing clears threshold, take the tokens ---
const fallbackRecommendation: Recommendation = {
  allocations: [],
  totalExpectedGainPct: 0,
  fallback: { reason: 'below-threshold', message: "No boss left in your expected kills clears the 0.75% threshold — tokens are the sure value." },
  assumptions: [],
  warnings: [],
  tossUp: null,
}
const fallbackCard = buildCardData({ recommendation: fallbackRecommendation, bossEvals: [], vaultDecision: null })

const states: Array<{ name: string; card: CardData }> = [
  { name: 'single', card: singleCard },
  { name: 'tossup', card: tossUpCard },
  { name: 'vault', card: vaultCard },
  { name: 'fallback', card: fallbackCard },
]

const theme = readFileSync(new URL('../src/theme.css', import.meta.url), 'utf-8')

const cardsHtml = states
  .map(
    ({ name, card }) => `
<div class="state-block">
  <div class="state-label">${name}</div>
  ${renderToStaticMarkup(createElement(RecommendationCard, { card, onPrimaryAction: () => {} }))}
</div>`
  )
  .join('\n')

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>GallagioLoot -- Recommendation Card, all states</title>
<style>
${theme}
body { padding: 24px; display: flex; flex-direction: column; gap: 24px; }
.state-block { max-width: 380px; width: 100%; }
.state-label { color: var(--text-muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px; }
</style>
</head>
<body>
${cardsHtml}
</body>
</html>
`

writeFileSync(new URL('./recommendation-card-states.html', import.meta.url), html)
for (const { name, card } of states) {
  console.log(`${name}: ${card.verdict} -- ${card.headline} -- ${card.pct.toFixed(2)}%`)
}
console.log('Wrote design/recommendation-card-states.html')
