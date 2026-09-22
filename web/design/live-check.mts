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
// A live droptimizer run against "Epic Profession Items" (crafted gear) -- bonus rolls
// don't apply there, so this must show the inline unsupported_content error instead of
// advancing to the Report panel. See README.md's "Content-type classification".
const CRAFTED_REPORT_URL = 'https://www.raidbots.com/reports/9QDMaj22bvRDSvbCzjsHfQ'
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

  // v4b darker-base pass (2026-09-20): --bg-base is now #06101f (mockup page background),
  // rendered on <body>.
  const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  console.log('Body background-color:', bodyBg)
  if (bodyBg !== 'rgb(6, 16, 31)') throw new Error(`expected the darker --bg-base fill (rgb(6, 16, 31)), got ${bodyBg}`)

  // Crafted-gear droptimizer: proxy returns 422 unsupported_content -- assert the inline
  // error under the URL field and that the Report panel never appears.
  await page.fill('#report-url', CRAFTED_REPORT_URL)
  await page.waitForSelector('text=Detected:')
  await page.click('text=Fetch report')
  await page.waitForSelector('.warning-banner', { timeout: 20000 })
  const craftedError = await page.locator('.warning-banner').first().innerText()
  console.log('crafted-report inline error:', JSON.stringify(craftedError))
  if (!craftedError.includes('This droptimizer is for crafted gear')) {
    throw new Error(`expected the crafted-content inline error, got ${JSON.stringify(craftedError)}`)
  }
  const reportPanelHeading = await page.locator('h3:text-is("Report")').count()
  if (reportPanelHeading !== 0) throw new Error('expected the Report panel not to render for an unsupported-content report')
  const fieldValue = await page.inputValue('#report-url')
  if (fieldValue !== CRAFTED_REPORT_URL) throw new Error(`expected the URL field to keep its value, got ${JSON.stringify(fieldValue)}`)

  await page.fill('#report-url', REPORT_URL)
  await page.waitForSelector('text=Detected:')

  await page.click('text=Fetch report')
  await page.waitForSelector('text=Price my roll', { timeout: 20000 })
  console.log('report fetched OK')

  // v4a gold-accent pass (2026-09-20, full mockup parity): a checked checkbox picks up
  // the gold accent-color; an unchecked one stays neutral (native browser default -- not
  // asserted here since it's not a CSS color we set). Still on the Paste screen, so the
  // expected-kills checklist is what's on the page.
  const checklistCheckbox = page.locator('.checklist__item input[type="checkbox"]').first()
  const isChecked = await checklistCheckbox.isChecked()
  if (!isChecked) await checklistCheckbox.check()
  const checkedAccent = await checklistCheckbox.evaluate((el) => getComputedStyle(el).accentColor)
  console.log('Checked expected-kills checkbox accent-color:', checkedAccent)
  if (checkedAccent !== 'rgb(212, 175, 55)') throw new Error(`expected the gold checked-checkbox accent-color, got ${checkedAccent}`)

  await page.click('text=Price my roll')
  await page.waitForSelector('table')
  const rowCount = await page.locator('tbody tr').count()
  console.log('Rollable Bosses rows:', rowCount)
  if (rowCount !== 8) throw new Error(`expected 8 rows, got ${rowCount}`)
  await page.screenshot({ path: 'design/live-rollable-bosses.png', fullPage: true })

  // v4 gold-accent pass (2026-09-20): a small vertical bar before the "Rollable Bosses" heading.
  const goldBarBg = await page.locator('.heading-gold-bar').first().evaluate((el) => getComputedStyle(el).backgroundColor)
  console.log('Rollable Bosses heading gold-bar background:', goldBarBg)
  if (goldBarBg !== 'rgb(212, 175, 55)') throw new Error(`expected the gold heading bar, got ${goldBarBg}`)

  // v4a gold-accent pass (2026-09-20, full mockup parity): the "Roll this boss" button and
  // the deployable "Yes" status dot are gold now too (superseding the prior
  // one-accent-per-screen rule).
  const rollBtnBg = await page.locator('button.btn-gold', { hasText: 'Roll this boss' }).evaluate((el) => getComputedStyle(el).backgroundColor)
  console.log('"Roll this boss" button background:', rollBtnBg)
  if (rollBtnBg !== 'rgb(212, 175, 55)') throw new Error(`expected the gold "Roll this boss" button, got ${rollBtnBg}`)

  const yesDotBg = await page.locator('.deploy-dot--yes').first().evaluate((el) => getComputedStyle(el).backgroundColor)
  console.log('Deployable "Yes" status dot background:', yesDotBg)
  if (yesDotBg !== 'rgb(212, 175, 55)') throw new Error(`expected the gold deployable status dot, got ${yesDotBg}`)

  // Wordmark and header Voidcores pill count are gold app-wide now.
  const wordmarkColor = await page.locator('.app-header__brand').evaluate((el) => getComputedStyle(el).color)
  console.log('Wordmark color:', wordmarkColor)
  if (wordmarkColor !== 'rgb(212, 175, 55)') throw new Error(`expected the gold wordmark, got ${wordmarkColor}`)

  const voidcorePillCount = await page.locator('.voidcore-pill__input').first().evaluate((el) => getComputedStyle(el).color)
  console.log('Header Voidcores pill count color:', voidcorePillCount)
  if (voidcorePillCount !== 'rgb(212, 175, 55)') throw new Error(`expected the gold Voidcores pill count, got ${voidcorePillCount}`)

  // Voidcore chip glyph (mockup parity, 2026-09-20): stacked ellipses, stroke-only --
  // no filled paths, so it takes the pill's gold `color` via stroke="currentColor".
  const chipFills = await page.locator('.voidcore-pill svg ellipse').evaluateAll((els) => els.map((el) => el.getAttribute('fill')))
  console.log('Voidcore chip ellipse fills:', chipFills)
  if (chipFills.length === 0 || chipFills.some((f) => f !== 'none')) {
    throw new Error(`expected all Voidcore chip ellipses to have fill="none", got ${JSON.stringify(chipFills)}`)
  }
  await page.locator('.voidcore-pill').first().screenshot({ path: 'design/chip-after.png' })

  // v4 gold-accent pass: the Reconcile screen's single card-level gold touch is its
  // Confirm button, now gold-filled -- nothing else on this screen goes gold.
  await page.click('.app-nav__item:has-text("Reconcile")')
  const confirmBg = await page.locator('button.btn-gold', { hasText: 'Confirm' }).evaluate((el) => getComputedStyle(el).backgroundColor)
  console.log('Reconcile Confirm button background:', confirmBg)
  if (confirmBg !== 'rgb(212, 175, 55)') throw new Error(`expected the gold Confirm button, got ${confirmBg}`)
  await page.click('.app-nav__item:has-text("Recommendation")')
  await page.waitForSelector('table')

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
  await page.waitForSelector('.loot-table-layout .loot-item-table tbody tr')
  const lootRowCount = await page.locator('.loot-table-layout .loot-item-table tbody tr').count()
  console.log(`Loot Table rows for ${bossName}:`, lootRowCount)
  if (lootRowCount < 1) throw new Error('expected loot table rows to render')
  await page.screenshot({ path: 'design/live-loot-table.png', fullPage: true })

  // v4 gold-accent pass (2026-09-20): the Loot table screen's single card-level gold
  // touch -- a flat inset left stripe on the selected boss row. Only rendered at desktop
  // widths (the boss list collapses to a <select> under 700px), so check with a wider page.
  const widePage = await browser.newPage({ viewport: { width: 1200, height: 900 } })
  await widePage.goto(APP_URL)
  await widePage.fill('#report-url', REPORT_URL)
  await widePage.waitForSelector('text=Detected:')
  await widePage.click('text=Fetch report')
  await widePage.waitForSelector('text=Price my roll', { timeout: 20000 })
  await widePage.click('text=Price my roll')
  await widePage.click('.app-nav__item:has-text("Loot table")')
  await widePage.waitForSelector('.loot-boss-list__item[aria-current="true"]')
  const stripeShadow = await widePage
    .locator('.loot-boss-list__item[aria-current="true"]')
    .evaluate((el) => getComputedStyle(el).boxShadow)
  console.log('Loot table selected-row box-shadow:', stripeShadow)
  if (!stripeShadow.includes('212, 175, 55')) throw new Error(`expected the gold inset stripe, got ${stripeShadow}`)
  await widePage.close()

  await browser.close()
  console.log('\nAll live smoke-test assertions passed.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
