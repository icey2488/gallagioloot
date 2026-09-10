// One-off script (not part of the test suite): drives the running dev app
// (`npx vite` on :5173, proxy `wrangler dev` on :8787) through the browser
// with Playwright, against the two live reports, to confirm the wiring works
// end to end. Run with `npx tsx design/e2e-check.mts`.
import { chromium } from 'playwright'

const APP_URL = 'http://localhost:5173'

const CASES = [
  { label: 'raidbots', url: 'https://www.raidbots.com/reports/jk6WmLFEnBpEqWueDkyRqA' },
  { label: 'qelive', url: 'https://questionablyepic.com/live/upgrade-report/wzfyzqxqjqej' },
]

async function main() {
  const browser = await chromium.launch()

  for (const { label, url } of CASES) {
    console.log(`\n=== ${label} ===`)
    const page = await browser.newPage({ viewport: { width: 420, height: 900 } })
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.log('[browser console error]', msg.text())
    })
    page.on('pageerror', (err) => console.log('[browser page error]', err.message))

    await page.goto(APP_URL)
    await page.waitForSelector('#report-url', { timeout: 10000 })
    await page.fill('#report-url', url)
    await page.waitForSelector('text=Detected:')
    const detected = await page.locator('.field-hint', { hasText: 'Detected:' }).innerText()
    console.log('detected source:', detected)

    await page.click('text=Fetch report')
    await page.waitForSelector('text=Price my roll', { timeout: 20000 })

    const character = await page.locator('.panel strong').first().innerText()
    console.log('character:', character)
    await page.screenshot({ path: `design/e2e-${label}-paste-screen.png`, fullPage: true })

    await page.click('text=Price my roll')
    await page.waitForSelector('table')
    const rowCount = await page.locator('tbody tr').count()
    console.log('deployability rows:', rowCount)
    await page.screenshot({ path: `design/e2e-${label}-deployability-screen.png`, fullPage: true })

    await page.click('text=Roll this boss')
    await page.waitForSelector('.rec-card')
    const headline = await page.locator('.rec-card__headline').innerText()
    const pct = await page.locator('.rec-card__pct').innerText()
    console.log('card:', headline, pct)
    await page.screenshot({ path: `design/e2e-${label}-roll-screen.png` })

    // Exercise browser back/forward across the screen state machine.
    await page.goBack()
    await page.waitForSelector('table')
    console.log('back -> deployability OK')
    await page.goForward()
    await page.waitForSelector('.rec-card')
    console.log('forward -> roll OK')

    // Mark as rolled -> Reconcile screen.
    await page.click('text=Mark as rolled')
    await page.waitForSelector('text=I rolled')
    console.log('reconcile screen reached')

    const itemOptions = await page.locator('#reconcile-item option').count()
    console.log('reconcile item options:', itemOptions)
    await page.screenshot({ path: `design/e2e-${label}-reconcile-screen.png`, fullPage: true })

    await page.close()
  }

  await browser.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
