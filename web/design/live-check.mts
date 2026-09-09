// One-off script (not part of the test suite): smoke-tests the live production
// site at https://gallagioloot.icehunter.net against the live proxy. Run with
// `npx tsx design/live-check.mts`.
//
// --host-resolver-rules works around this machine's local router caching a
// stale NXDOMAIN for gallagioloot.icehunter.net from before the DNS record
// existed; the record itself resolves fine via 1.1.1.1 and other resolvers.
import { chromium } from 'playwright'

const APP_URL = 'https://gallagioloot.icehunter.net'
const REPORT_URL = 'https://www.raidbots.com/reports/jk6WmLFEnBpEqWueDkyRqA'
const SITE_IP = '104.21.45.45'

async function main() {
  const browser = await chromium.launch({
    args: [`--host-resolver-rules=MAP gallagioloot.icehunter.net ${SITE_IP}`],
  })
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } })
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log('[browser console error]', msg.text())
  })
  page.on('pageerror', (err) => console.log('[browser page error]', err.message))

  await page.goto(APP_URL)
  await page.waitForSelector('#report-url', { timeout: 10000 })
  await page.fill('#report-url', REPORT_URL)
  await page.waitForSelector('text=Detected:')

  await page.click('text=Fetch report')
  await page.waitForSelector('text=View recommendations', { timeout: 20000 })
  console.log('report fetched OK')

  await page.click('text=View recommendations')
  await page.waitForSelector('table')
  const rowCount = await page.locator('tbody tr').count()
  console.log('Rollable Bosses rows:', rowCount)
  if (rowCount !== 8) throw new Error(`expected 8 rows, got ${rowCount}`)
  await page.screenshot({ path: 'design/live-rollable-bosses.png', fullPage: true })

  await page.click('text=Roll this boss')
  await page.waitForSelector('.rec-card')
  const headline = await page.locator('.rec-card__headline').innerText()
  console.log('card headline:', JSON.stringify(headline))
  if (!headline.includes('Roll The Lost Explorers')) {
    throw new Error(`expected headline to contain "Roll The Lost Explorers", got ${JSON.stringify(headline)}`)
  }
  const killOrderLine = await page.locator('.rec-card__note--strong').innerText()
  console.log('kill-order line:', JSON.stringify(killOrderLine))
  if (!/kill order/i.test(killOrderLine)) {
    throw new Error(`expected a kill-order line, got ${JSON.stringify(killOrderLine)}`)
  }
  await page.screenshot({ path: 'design/live-card.png' })

  await page.click('text=View full table')
  await page.waitForSelector('table')
  const bossLink = page.locator('.deploy-table tbody tr td button.btn-link').first()
  const bossName = await bossLink.innerText()
  await bossLink.click()
  await page.waitForSelector('.loot-table-boss[open] table tbody tr')
  const lootRowCount = await page.locator('.loot-table-boss[open] table tbody tr').count()
  console.log(`Loot Table rows for ${bossName}:`, lootRowCount)
  if (lootRowCount < 1) throw new Error('expected loot table rows to render')
  await page.screenshot({ path: 'design/live-loot-table.png', fullPage: true })

  await browser.close()
  console.log('\nAll live smoke-test assertions passed.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
