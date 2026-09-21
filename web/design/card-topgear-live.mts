// One-off live verification (this task, 2026-09-20): pastes both a droptimizer URL and
// a Top Gear report URL into the live production site, confirms the recommendation card
// shows the vault comparison with the Top Gear item/pct, and screenshots it.
import { chromium } from 'playwright'

const APP_URL = 'https://gallagioloot.icehunter.net'
const DROPTIMIZER_URL = 'https://www.raidbots.com/reports/9bHYBHtAbBFw42YUvDBRYZ'
const TOPGEAR_URL = 'https://www.raidbots.com/reports/miriTcb27bfGDYmV6JjvD1'
const SITE_IP = '104.21.45.45'

async function main() {
  const browser = await chromium.launch({
    args: [`--host-resolver-rules=MAP gallagioloot.icehunter.net ${SITE_IP}`],
  })
  const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } })
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log('[browser console error]', msg.text())
  })
  page.on('pageerror', (err) => console.log('[browser page error]', err.message))

  await page.goto(APP_URL)
  await page.waitForSelector('#report-url', { timeout: 10000 })

  await page.fill('#report-url', DROPTIMIZER_URL)
  await page.waitForSelector('text=Detected:')
  await page.fill('#topgear-url', TOPGEAR_URL)

  await page.click('text=Fetch report')
  await page.waitForSelector('text=Price my roll', { timeout: 20000 })
  console.log('main report fetched OK')

  await page.waitForSelector('text=Vault item:', { timeout: 20000 })
  const vaultLine = await page.locator('#topgear-url').locator('xpath=../..').innerText()
  console.log('Top Gear field area text:', JSON.stringify(vaultLine))
  if (!vaultLine.includes('Lightspire Core') || !vaultLine.includes('%')) {
    throw new Error(`expected the Top Gear vault item summary, got ${JSON.stringify(vaultLine)}`)
  }

  await page.click('text=Price my roll')
  await page.waitForSelector('table')
  await page.click('text=Roll this boss')
  await page.waitForSelector('.rec-card')

  const cardText = await page.locator('.rec-card').innerText()
  console.log('rec-card text:', JSON.stringify(cardText))
  if (!/vault/i.test(cardText)) {
    throw new Error(`expected the card to show a vault comparison, got ${JSON.stringify(cardText)}`)
  }

  await page.screenshot({ path: 'design/card-topgear-live.png' })
  console.log('Wrote design/card-topgear-live.png')

  await browser.close()
  console.log('\nLive Top Gear card verification passed.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
