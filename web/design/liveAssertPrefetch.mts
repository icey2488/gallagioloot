// One-off verification script (run via `npx tsx design/liveAssertPrefetch.mts`): confirms
// the deployed site's Paste screen renders the v2 two-column layout from first paint (no
// report fetched yet) at 1200px, with the light-filled "Fetch report" button -- the
// concrete regression this redesign fixes. Same DNS workaround as live-check.mts.
import { chromium } from 'playwright'
import assert from 'node:assert/strict'

const APP_URL = 'https://gallagioloot.icehunter.net'
const SITE_IP = '104.21.45.45'

async function main() {
  const browser = await chromium.launch({
    args: [`--host-resolver-rules=MAP gallagioloot.icehunter.net ${SITE_IP}`],
  })
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
  await page.goto(APP_URL)
  await page.waitForSelector('#report-url', { timeout: 10000 })

  const reportUrlBox = await page.locator('#report-url').boundingBox()
  const runSettingsBox = await page.locator('.run-settings-panel').boundingBox()
  assert.ok(reportUrlBox && runSettingsBox, 'expected both the URL field and the Run settings panel to be visible')
  assert.ok(runSettingsBox!.x > reportUrlBox!.x + reportUrlBox!.width - 50, 'expected Run settings to sit in a right-hand column, not stacked below')

  // v4 gold-accent pass (2026-09-20): the Fetch report button is gold-filled (--gold,
  // rgb(212, 175, 55)) instead of the prior off-white.
  const fetchBtn = page.locator('button.btn-light', { hasText: 'Fetch report' })
  await fetchBtn.waitFor({ state: 'visible' })
  const bg = await fetchBtn.evaluate((el) => getComputedStyle(el).backgroundColor)
  assert.equal(bg, 'rgb(212, 175, 55)', `expected the gold accent fill, got ${bg}`)

  // v4a gold-accent pass (2026-09-20, full mockup parity): the wordmark and the active
  // nav tab's underline are gold too now (superseding the prior one-accent-per-screen
  // rule -- see CLAUDE.md's "Design (web/)" section for the replacement rule).
  const wordmarkColor = await page.locator('.app-header__brand').evaluate((el) => getComputedStyle(el).color)
  assert.equal(wordmarkColor, 'rgb(212, 175, 55)', `expected the gold wordmark, got ${wordmarkColor}`)

  const activeNavShadow = await page
    .locator('.app-nav__item[aria-current="page"]', { hasText: 'Paste' })
    .evaluate((el) => getComputedStyle(el).boxShadow)
  assert.ok(activeNavShadow.includes('212, 175, 55'), `expected the gold active-tab underline, got ${activeNavShadow}`)

  // v3 mockup ("3a" pre-report Paste) addition: a dashed-border empty-state card telling
  // the user what fills in once they paste a report, replacing the old single-sentence
  // placeholder. This is the most distinctive new element on the pre-fetch Paste screen.
  const emptyState = page.locator('.paste-empty-state')
  await emptyState.waitFor({ state: 'visible' })
  const emptyStateTitle = await emptyState.locator('.paste-empty-state__title').innerText()
  assert.equal(emptyStateTitle, 'Paste a report to begin', `expected the empty-state headline, got ${JSON.stringify(emptyStateTitle)}`)
  const borderStyle = await emptyState.evaluate((el) => getComputedStyle(el).borderStyle)
  assert.equal(borderStyle, 'dashed', `expected a dashed border on the empty state, got ${borderStyle}`)

  console.log(`Run settings panel: x=${runSettingsBox!.x.toFixed(0)} (right of report URL field, x=${reportUrlBox!.x.toFixed(0)})`)
  console.log(`Fetch report button background: ${bg}`)
  console.log(`Wordmark color: ${wordmarkColor}`)
  console.log(`Active nav-tab box-shadow: ${activeNavShadow}`)
  console.log(`Empty-state card: title=${JSON.stringify(emptyStateTitle)}, border-style=${borderStyle}`)
  console.log('PASS: pre-fetch Paste screen at 1200px shows two columns, the light "Fetch report" button, and the v3 dashed empty-state card.')

  await browser.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
