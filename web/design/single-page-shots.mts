// One-off script (not part of the test suite): captures the single-page flow's four
// states (empty / loaded+one-boss-expanded / priced / stale) plus a 390px mobile check,
// against the LOCAL fixtures (no network). Run from web/ with:
//   npx vite preview --port 4180 --strictPort   (in one shell), then
//   npx tsx design/single-page-shots.mts
// or just `npx tsx design/single-page-shots.mts` which spawns the preview itself.
import { chromium, type Page, type Route } from 'playwright'
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const PREVIEW_PORT = 4180
const APP_URL = `http://localhost:${PREVIEW_PORT}/`
const REPORT_URL = 'https://www.raidbots.com/reports/jk6WmLFEnBpEqWueDkyRqA'

const fixture = (name: string) => readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8')
const RAIDBOTS = fixture('raidbots-jk6WmLFEnBpEqWueDkyRqA.json')
const LOOT_TABLE = fixture('loot-table-1320-262.json')

async function fulfillFromFixtures(route: Route) {
  const path = new URL(route.request().url()).pathname
  const json = (body: string) => route.fulfill({ status: 200, contentType: 'application/json', body })
  if (path.includes('/raidbots/')) return json(RAIDBOTS)
  if (path.includes('/loot-table/')) return json(LOOT_TABLE)
  if (path.includes('/topgear/')) return route.fulfill({ status: 400, contentType: 'application/json', body: '{"error":"unsupported_report"}' })
  return route.continue()
}

async function waitForServer(url: string, tries = 40): Promise<void> {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`preview server never came up at ${url}`)
}

async function loadReport(page: Page) {
  await page.fill('#report-url', REPORT_URL)
  await page.waitForSelector('text=Detected:')
  await page.click('text=Fetch report')
  await page.waitForSelector('text=items parsed', { timeout: 15000 })
  await page.waitForSelector('.boss-row', { timeout: 15000 })
}

async function shootDesktop(page: Page) {
  await page.setViewportSize({ width: 1280, height: 1000 })
  await page.route((url) => url.href.includes('/raidbots/') || url.href.includes('/loot-table/') || url.href.includes('/topgear/'), fulfillFromFixtures)

  await page.goto(APP_URL)
  await page.waitForSelector('#report-url')
  await page.screenshot({ path: 'design/single-page-empty.png', fullPage: true })
  console.log('captured: single-page-empty.png')

  await loadReport(page)
  // Expand the first boss row so its inline loot table + state controls show.
  await page.locator('.boss-row__summary').first().click()
  await page.waitForSelector('.boss-row--open .loot-item-table tbody tr', { timeout: 10000 })
  await page.screenshot({ path: 'design/single-page-loaded.png', fullPage: true })
  console.log('captured: single-page-loaded.png')

  // Give the vault comparison something to price against via a manual vault gain.
  await page.click('summary:has-text("Advanced")')
  await page.fill('#manual-vault-gain', '2.4')

  await page.click('text=Price my roll')
  await page.waitForSelector('.rec-card', { timeout: 10000 })
  await page.waitForSelector('.priced-section .deploy-table tbody tr')
  await page.screenshot({ path: 'design/single-page-priced.png', fullPage: true })
  console.log('captured: single-page-priced.png')

  // Now make it stale: toggle an expected-kill checkbox. The snapshot dims + a re-price note appears.
  await page.locator('.boss-row__kill input[type="checkbox"]').nth(1).click()
  await page.waitForSelector('.reprice-note', { timeout: 5000 })
  await page.waitForSelector('.priced-section--stale')
  await page.screenshot({ path: 'design/single-page-stale.png', fullPage: true })
  console.log('captured: single-page-stale.png')
}

async function shootMobile(page: Page) {
  await page.setViewportSize({ width: 390, height: 900 })
  await page.route((url) => url.href.includes('/raidbots/') || url.href.includes('/loot-table/') || url.href.includes('/topgear/'), fulfillFromFixtures)
  await page.goto(APP_URL)
  await page.waitForSelector('#report-url')
  await loadReport(page)
  await page.locator('.boss-row__summary').first().click()
  await page.waitForSelector('.boss-row--open')
  await page.screenshot({ path: 'design/single-page-mobile-390.png', fullPage: true })

  const overflow = await page.evaluate(() => ({
    docWidth: document.documentElement.scrollWidth,
    winWidth: window.innerWidth,
  }))
  console.log('captured: single-page-mobile-390.png', overflow)
  if (overflow.docWidth > overflow.winWidth) {
    throw new Error(`horizontal scroll at 390px: scrollWidth ${overflow.docWidth} > innerWidth ${overflow.winWidth}`)
  }
  console.log('mobile 390px: no horizontal scroll ✓')
}

async function main() {
  const preview = spawn('npx', ['vite', 'preview', '--port', String(PREVIEW_PORT), '--strictPort'], {
    stdio: 'ignore',
    shell: process.platform === 'win32',
  })
  try {
    await waitForServer(APP_URL)
    const browser = await chromium.launch()
    const desktop = await browser.newPage()
    await shootDesktop(desktop)
    const mobile = await browser.newPage()
    await shootMobile(mobile)
    await browser.close()
    console.log('\nAll single-page screenshots captured.')
  } finally {
    preview.kill()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
