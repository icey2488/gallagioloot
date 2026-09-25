// One-off script (run via `npx tsx web/design/renderCard.tsx`): renders the
// RecommendationCard component to static HTML using the live Raidbots fixture,
// an empty knockout state, threshold 0.2, rolls 1 -- so it can be screenshotted.
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

const report = JSON.parse(
  readFileSync(new URL('./fixtures/raidbots-jk6WmLFEnBpEqWueDkyRqA.json', import.meta.url), 'utf-8')
) as NormalizedReport

const settings: Settings = { thresholdPct: 0.2, voidcoresToSpend: 1, includeOffSpec: false }
const knockout = createState(report.character, report.difficulty, report.realm, report.region)
const bossEvals = buildBossPools(report, knockout, settings)
const recommendation = recommend(bossEvals, settings, report)
const card = buildCardData({ recommendation, bossEvals, vaultDecision: null })

const cardHtml = renderToStaticMarkup(createElement(RecommendationCard, { card }))
const theme = readFileSync(new URL('../src/theme.css', import.meta.url), 'utf-8')

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>GallagioLoot -- Recommendation Card Preview</title>
<style>
${theme}
body { display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 24px; }
.rec-card { max-width: 380px; width: 100%; }
</style>
</head>
<body>
${cardHtml}
</body>
</html>
`

writeFileSync(new URL('./recommendation-card.html', import.meta.url), html)
console.log('Card:', card.verdict, '--', card.headline, '--', card.pct.toFixed(2) + '%')
console.log('Wrote web/design/recommendation-card.html')
