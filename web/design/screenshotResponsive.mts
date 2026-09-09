// One-off script (run via `npx tsx design/screenshotResponsive.mts` after
// `npx tsx design/renderCard.tsx && npx tsx design/renderCardStates.tsx && npx tsx design/renderScreens.tsx`):
// screenshots the recommendation card and deployability screen at phone (390px) and
// desktop (1200px) widths, plus all four card states at 390px, per the design-parity
// verification pass. Overwrites recommendation-card.png/deployability.png (the
// pre-redesign versions were copied to *-before.png beforehand for comparison).
//
// The card shots load recommendation-card.html (built by renderCard.tsx: report-only
// pool, no loot table) rather than roll-screen.html (built by renderScreens.tsx, which
// passes the loot table and so pulls in a larger pool -- its toss-up runner-up is
// "Vashnik the Malignant", not "Ula'tek"). recommendation-card.html is the one that
// reproduces the live-fixture example from README.md / core/rank.ts's toss-up doc
// comment ("The Lost Explorers 2.30% vs Ula'tek 2.27%"), which is what this design
// pass's live-render verification checks against.
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'

const WIDTHS = { phone: 390, desktop: 1200 }

async function shotCard(browser: import('playwright').Browser, width: number, suffix: string) {
  const context = await browser.newContext({ viewport: { width, height: 900 } })
  const page = await context.newPage()
  await page.goto(`file://${fileURLToPath(new URL('./recommendation-card.html', import.meta.url))}`)
  await page.locator('.rec-card').screenshot({ path: `design/recommendation-card${suffix}.png` })
  await context.close()
  console.log(`Wrote design/recommendation-card${suffix}.png (${width}px)`)
}

async function shotDeployability(browser: import('playwright').Browser, width: number, suffix: string) {
  const context = await browser.newContext({ viewport: { width, height: 900 } })
  const page = await context.newPage()
  await page.goto(`file://${fileURLToPath(new URL('./deployability-screen.html', import.meta.url))}`)
  await page.screenshot({ path: `design/deployability${suffix}.png`, fullPage: true })
  await context.close()
  console.log(`Wrote design/deployability${suffix}.png (${width}px)`)
}

async function shotStates(browser: import('playwright').Browser) {
  const context = await browser.newContext({ viewport: { width: WIDTHS.phone, height: 1400 } })
  const page = await context.newPage()
  await page.goto(`file://${fileURLToPath(new URL('./recommendation-card-states.html', import.meta.url))}`)
  await page.screenshot({ path: 'design/recommendation-card-states.png', fullPage: true })
  await context.close()
  console.log('Wrote design/recommendation-card-states.png (390px, all 4 states)')
}

async function main() {
  const browser = await chromium.launch()
  // Default (no-suffix) recommendation-card.png / deployability.png stay at the
  // existing 420px-viewport convention screenshotAndAudit.mts uses; these add the
  // explicit phone/desktop pair the design-parity check asked for.
  // Overwrite the default recommendation-card.png too (screenshotAndAudit.mts's "roll"
  // page captures roll-screen.html instead -- see the note above for why that's the
  // wrong source for the live-fixture verification this pass checks against).
  await shotCard(browser, WIDTHS.phone, '')
  await shotCard(browser, WIDTHS.phone, '-phone')
  await shotCard(browser, WIDTHS.desktop, '-desktop')
  await shotDeployability(browser, WIDTHS.phone, '-phone')
  await shotDeployability(browser, WIDTHS.desktop, '-desktop')
  await shotStates(browser)
  await browser.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
