// One-off script (not part of the test suite): live consistency check of the single-page flow
// against the deployed site + proxy. Fresh browser context, real Raidbots reports.
// Run from web/: npx tsx design/live-single-page-check.mts
import { chromium, type Page } from 'playwright'
import { writeFileSync } from 'node:fs'

const APP_URL = 'https://gallagioloot.icehunter.net'
const DROPTIMIZER = 'https://www.raidbots.com/simbot/report/6PTZ7TjgU8PdxJhZ97bMUa'
const TOPGEAR = 'https://www.raidbots.com/simbot/report/k3vroAKe6QvF5gN4GeCVAq'

async function dump(page: Page) {
  return page.evaluate(() => {
    const txt = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
    const bossRows = [...document.querySelectorAll('.boss-row')].map((r) => ({
      name: txt(r.querySelector('.boss-row__name')),
      remaining: txt(r.querySelector('.boss-row__remaining')),
      ev: txt(r.querySelector('.boss-row__ev')),
      checked: (r.querySelector('.boss-row__kill input') as HTMLInputElement | null)?.checked,
    }))
    const ranked = [...document.querySelectorAll('.priced-section .deploy-table tbody tr')].map((tr) =>
      [...tr.querySelectorAll('td')].map((td) => txt(td))
    )
    const card = document.querySelector('.rec-card')
    return {
      switcherOptions: [...document.querySelectorAll('select[aria-label="Switch character"] option')].map((o) => txt(o)),
      switcherSelected: (document.querySelector('select[aria-label="Switch character"]') as HTMLSelectElement | null)?.value,
      noteLine: txt(document.querySelector('.note-line')),
      bossRows,
      ranked,
      card: card && {
        eyebrow: txt(card.querySelector('.rec-card__eyebrow')),
        headline: txt(card.querySelector('.rec-card__headline')),
        pct: txt(card.querySelector('.rec-card__pct')),
        badge: txt(card.querySelector('.rec-card__badge--stale')),
        compare: [...card.querySelectorAll('.rec-card__compare-option')].map((o) => txt(o)),
        notes: [...card.querySelectorAll('.rec-card__note, .rec-card__second')].map((n) => txt(n)),
        full: txt(card),
      },
      tabBar: document.querySelectorAll('[role="tablist"], .tab-bar, .tabs, nav button').length,
      banners: [...document.querySelectorAll('.warning-banner')].map((b) => txt(b)),
    }
  })
}

async function layoutCheck(page: Page) {
  return page.evaluate(() => {
    const vw = window.innerWidth
    const problems: string[] = []
    const btns = [...document.querySelectorAll('.state-seg__btn')]
    let visible = 0
    for (const b of btns) {
      const r = b.getBoundingClientRect()
      if (r.width === 0) continue
      visible++
      const card = b.closest('.panel')?.getBoundingClientRect()
      if (r.right > vw + 0.5 || r.left < -0.5) problems.push(`outside viewport ${r.left}-${r.right}`)
      if (card && (r.right > card.right + 0.5 || r.left < card.left - 0.5)) problems.push(`outside card ${r.left}-${r.right} vs ${card.left}-${card.right}`)
      if (r.width < 24 || r.height < 24) problems.push(`tiny target ${r.width}x${r.height}`)
    }
    return { buttonsTotal: btns.length, buttonsVisible: visible, problems, docWidth: document.documentElement.scrollWidth, winWidth: vw }
  })
}

async function setup(page: Page) {
  await page.addInitScript('window.__name = (f) => f')
  page.on('pageerror', (e) => console.log('[pageerror]', e.message))
  page.on('console', (m) => m.type() === 'error' && console.log('[console error]', m.text()))
  await page.goto(APP_URL)
  await page.waitForSelector('#report-url')
  await page.fill('#report-url', DROPTIMIZER)
  await page.fill('#topgear-url', TOPGEAR)
  await page.waitForSelector('text=Detected:')
  await page.click('text=Fetch report')
  await page.waitForSelector('.boss-row', { timeout: 60000 })
  await page.selectOption('select[aria-label="Loot spec"]', { label: 'Arcane' })
  // wait for loot table + top gear vault line
  await page.waitForFunction(() => !document.body.textContent?.includes('Loading loot tables'), null, { timeout: 60000 })
  await page.waitForSelector('text=Vault item:', { timeout: 60000 })
  await page.waitForTimeout(500)
  await page.click('text=Price my roll')
  await page.waitForSelector('.rec-card', { timeout: 20000 })
}

async function main() {
  const browser = await chromium.launch()
  const out: Record<string, unknown> = {}

  // ---- Desktop
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } })
  const page = await ctx.newPage()
  await setup(page)
  const desk = await dump(page)
  out.desktop = desk
  out.desktopLayout = await layoutCheck(page)
  // expand Ula'tek (or the first matching row) for the screenshot
  await page.screenshot({ path: 'design/live-single-page-desktop.png', fullPage: true })

  // ---- Stale: uncheck one boss
  await page.locator('.boss-row__kill input[type="checkbox"]').nth(1).click()
  await page.waitForSelector('.reprice-note', { timeout: 5000 })
  await page.waitForSelector('.rec-card__badge--stale', { timeout: 5000 })
  out.stale = await dump(page)
  await page.screenshot({ path: 'design/live-single-page-stale.png', fullPage: true })
  await ctx.close()

  // ---- Mobile 390, fresh context
  const mctx = await browser.newContext({ viewport: { width: 390, height: 900 }, isMobile: true, hasTouch: true })
  const mpage = await mctx.newPage()
  await setup(mpage)
  // Expand the Ula'tek boss row so its state buttons are visible; fall back to the first row.
  const ula = mpage.locator('.boss-row', { hasText: "Ula'tek" }).first()
  const target = (await ula.count()) ? ula : mpage.locator('.boss-row').first()
  await target.locator('.boss-row__summary').click()
  await mpage.waitForSelector('.boss-row--open .state-seg__btn', { timeout: 10000 })
  out.mobile = await dump(mpage)
  out.mobileLayout = await layoutCheck(mpage)
  // Tappability: click a state button (Owned then back to None) and verify pressed state toggles.
  const btn = mpage.locator('.boss-row--open .state-seg__btn', { hasText: 'Owned' }).first()
  await btn.scrollIntoViewIfNeeded()
  await btn.tap()
  out.mobileTap = {
    ownedPressedAfterTap: await btn.getAttribute('aria-pressed'),
  }
  await mpage.locator('.boss-row--open .state-seg__btn', { hasText: 'None' }).first().tap()
  out.mobileTap = { ...(out.mobileTap as object), ownedPressedAfterReset: await btn.getAttribute('aria-pressed') }
  // The switcher lists keys from localStorage; read it after the state taps (which re-save the knockout state).
  out.mobileSwitcherAfterTaps = await mpage.evaluate(() => ({
    options: [...document.querySelectorAll('select[aria-label="Switch character"] option')].map((o) => o.textContent),
    selected: (document.querySelector('select[aria-label="Switch character"]') as HTMLSelectElement | null)?.value,
    localStorageKeys: Object.keys(localStorage),
  }))
  await mpage.screenshot({ path: 'design/live-single-page-mobile-390.png', fullPage: true })
  await mctx.close()

  await browser.close()
  writeFileSync('design/live-single-page-check.json', JSON.stringify(out, null, 2))
  console.log(JSON.stringify(out, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
