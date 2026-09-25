// One-off script (not part of the test suite): captures the single-page flow's states
// with BOTH a raid droptimizer (6PTZ7, Mythic) and the Mythic+ droptimizer (a8URT, +10 Myth)
// loaded, plus the Top Gear vault item (k3vro): empty / loaded + one dungeon expanded /
// priced / stale at 1280px, plus 390px mobile (loaded and priced), against the LOCAL
// fixtures (no network; rebuild them with `npx tsx scripts/build-design-fixtures.mts`).
// Run from web/ with:
//   npx vite build && npx tsx design/single-page-shots.mts
// (the script spawns `vite preview` itself, so it screenshots the last build).
import { chromium, type Page, type Route } from 'playwright'
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const PREVIEW_PORT = 4180
const APP_URL = `http://localhost:${PREVIEW_PORT}/`
const RAID_URL = 'https://www.raidbots.com/simbot/report/6PTZ7TjgU8PdxJhZ97bMUa'
const MPLUS_URL = 'https://www.raidbots.com/simbot/report/a8URThoNZqEXDW3tBtavHq'
const TOPGEAR_URL = 'https://www.raidbots.com/simbot/report/k3vroAKe6QvF5gN4GeCVAq'
const EXPANDED_DUNGEON = 'Altar of Fangs'

const fixture = (name: string) => readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8')
const RAID = fixture('raidbots-6PTZ7TjgU8PdxJhZ97bMUa.json')
const MPLUS = fixture('raidbots-a8URThoNZqEXDW3tBtavHq.json')
const TOPGEAR = fixture('topgear-k3vroAKe6QvF5gN4GeCVAq.json')
const LOOT_TABLES: Record<string, string> = {
  '1320': fixture('loot-table-1320-62.json'),
  '-1': fixture('loot-table--1-62.json'),
}

async function fulfillFromFixtures(route: Route) {
  const path = new URL(route.request().url()).pathname
  const json = (body: string) => route.fulfill({ status: 200, contentType: 'application/json', body })
  if (path.includes('/raidbots/')) return json(path.includes('a8URT') ? MPLUS : RAID)
  if (path.includes('/loot-table/')) {
    const instanceId = decodeURIComponent(path.split('/loot-table/')[1] ?? '')
    const table = LOOT_TABLES[instanceId]
    return table ? json(table) : route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"no fixture"}' })
  }
  if (path.includes('/topgear/')) return json(TOPGEAR)
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

async function addReport(page: Page, url: string, expectedLines: number) {
  await page.fill('#report-url', url)
  await page.waitForSelector('text=Detected:')
  await page.locator('.fetch-button-group button').click()
  await page.waitForFunction((n) => document.querySelectorAll('.report-line').length === n, expectedLines, { timeout: 15000 })
}

async function loadReports(page: Page) {
  await addReport(page, RAID_URL, 1)
  await addReport(page, MPLUS_URL, 2)
  await page.fill('#topgear-url', TOPGEAR_URL)
  await page.waitForSelector('text=Vault item:', { timeout: 15000 })
  await page.waitForFunction(() => !document.body.textContent?.includes('Loading loot tables'), null, { timeout: 15000 })
  await page.waitForSelector('.boss-section >> nth=1')
}

async function expandDungeon(page: Page) {
  await page.locator('.boss-section').nth(1).locator('.boss-row__summary', { hasText: EXPANDED_DUNGEON }).click()
  await page.waitForSelector('.boss-row--open .loot-item-table tbody tr', { timeout: 10000 })
}

/**
 * Items equipped in the sim profile: expand Den of Nalorakk (Pilfered Precious Band, equipped as finger2) and
 * assert its row carries the muted "Equipped" label with Owned preselected, on-screen and unclipped.
 */
async function assertEquippedRow(page: Page, label: string, shot: string) {
  await page.locator('.boss-section').nth(1).locator('.boss-row__summary', { hasText: 'Den of Nalorakk' }).click()
  await page.waitForSelector('.boss-row--open .loot-item-table tbody tr', { timeout: 10000 })
  const row = page.locator('.boss-row--open .loot-item-table tbody tr', { hasText: 'Pilfered Precious Band' })
  const tag = row.locator('.item-tag--equipped')
  const problems: string[] = []
  if ((await tag.count()) !== 1 || (await tag.innerText()).trim().toLowerCase() !== 'equipped') problems.push('no "Equipped" label on Pilfered Precious Band')
  const on = await row.locator('.state-seg__btn--on').allInnerTexts()
  if (on.join() !== 'Owned') problems.push(`state control shows ${JSON.stringify(on)}, expected Owned`)
  const box = await tag.boundingBox()
  const vp = page.viewportSize()!
  if (!box || box.x < 0 || box.x + box.width > vp.width) problems.push(`Equipped label outside the viewport: ${JSON.stringify(box)}`)
  if (problems.length > 0) throw new Error(`equipped-row assertions failed (${label}): ${problems.join('; ')}`)
  console.log(`equipped-row assertions passed (${label}) ✓`)
  await assertLayout(page, `${label}, Equipped label visible`)
  await page.screenshot({ path: shot, fullPage: true })
  console.log(`captured: ${shot}`)
  // Back to the state the next steps expect (Altar of Fangs open).
  await expandDungeon(page)
}

/**
 * Real layout assertions (replacing a bare "no horizontal scroll" check): every state
 * button's bounding box sits inside both the viewport and its own card, boss-name
 * elements never overflow their own box (they should wrap, not clip/truncate), and no
 * element inside the Reports or Run settings panels exceeds that panel's edges. Also
 * checks the multi-report structure is really on screen (two parse lines, two boss-list
 * sections, 8 dungeon rows). Throws with every violation listed when any check fails.
 */
async function assertLayout(page: Page, label: string) {
  const result = await page.evaluate(() => {
    const problems: string[] = []
    const viewportW = window.innerWidth
    const EPS = 0.5

    document.querySelectorAll('.state-seg__btn').forEach((btn) => {
      const rect = btn.getBoundingClientRect()
      if (rect.right > viewportW + EPS || rect.left < -EPS) {
        problems.push(`state button outside viewport: left=${rect.left.toFixed(1)} right=${rect.right.toFixed(1)} viewport=${viewportW}`)
      }
      const card = btn.closest('.panel')
      if (card) {
        const cardRect = card.getBoundingClientRect()
        if (rect.right > cardRect.right + EPS || rect.left < cardRect.left - EPS) {
          problems.push(`state button outside its card: btn=[${rect.left.toFixed(1)},${rect.right.toFixed(1)}] card=[${cardRect.left.toFixed(1)},${cardRect.right.toFixed(1)}]`)
        }
      }
    })

    document.querySelectorAll('.boss-row__name').forEach((el) => {
      if (el.scrollWidth > el.clientWidth + EPS) {
        problems.push(`boss name overflows instead of wrapping: "${el.textContent}" scrollWidth=${el.scrollWidth} clientWidth=${el.clientWidth}`)
      }
    })

    const panels = [document.querySelector('.report-list')?.closest('.panel'), document.querySelector('.run-settings-row')?.closest('.panel')]
    for (const panel of panels) {
      if (!panel) continue
      const panelRect = panel.getBoundingClientRect()
      panel.querySelectorAll('*').forEach((el) => {
        const rect = el.getBoundingClientRect()
        if (rect.width === 0 && rect.height === 0) return
        if (rect.right > panelRect.right + EPS || rect.left < panelRect.left - EPS) {
          problems.push(`panel element exceeds its card: <${el.tagName.toLowerCase()} class="${el.className}"> right=${rect.right.toFixed(1)} panelRight=${panelRect.right.toFixed(1)}`)
        }
      })
    }

    const reportLines = document.querySelectorAll('.report-line').length
    if (reportLines !== 2) problems.push(`expected 2 report parse lines, found ${reportLines}`)
    const sections = [...document.querySelectorAll('.boss-section')]
    if (sections.length !== 2) problems.push(`expected 2 boss-list sections, found ${sections.length}`)
    const dungeonRows = sections[1]?.querySelectorAll('.boss-row').length ?? 0
    if (dungeonRows !== 8) problems.push(`expected 8 dungeon rows in the Mythic+ section, found ${dungeonRows}`)
    if (document.body.textContent?.includes('Weekly10')) problems.push('"Weekly10" rendered somewhere')

    return { problems, docWidth: document.documentElement.scrollWidth, winWidth: window.innerWidth }
  })

  if (result.docWidth > result.winWidth) {
    result.problems.push(`horizontal scroll: scrollWidth ${result.docWidth} > innerWidth ${result.winWidth}`)
  }
  if (result.problems.length > 0) {
    throw new Error(`layout assertions failed (${label}):\n${result.problems.join('\n')}`)
  }
  console.log(`layout assertions passed (${label}) ✓`)
}

/**
 * The compact Reports panel: exactly one summary strip (Voidcores on hand + the next-Voidcore line) above the
 * blocks, and each block's three lines exactly as specified (heading + Remove, drop line with the 344 exception,
 * items / bosses / baseline / sim date). Every line must sit inside its block and viewport and wrap rather than
 * clip. Then screenshots the panel itself.
 */
async function assertReportsPanel(page: Page, label: string, shot: string) {
  const got = await page.evaluate(() => {
    const txt = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
    const EPS = 0.5
    const problems: string[] = []
    const vw = window.innerWidth
    const panel = document.querySelector('.report-list')!.closest('.panel')!
    const summaries = panel.querySelectorAll('.reports-summary')
    if (summaries.length !== 1) problems.push(`expected 1 reports-summary, found ${summaries.length}`)
    const summary = summaries[0]
    const list = panel.querySelector('.report-list')!
    if (summary && summary.getBoundingClientRect().bottom > list.getBoundingClientRect().top + EPS) problems.push('summary is not above the report blocks')
    const voidcores = panel.querySelector('#voidcores-on-hand') as HTMLInputElement | null
    const next = txt(panel.querySelector('.reports-summary__next'))
    const blocks = [...panel.querySelectorAll('.report-line')].map((b) => ({
      heading: txt(b.querySelector('.report-line__title')),
      drops: txt(b.querySelector('.report-line__drops')),
      stats: txt(b.querySelector('.report-line__stats')),
      remove: txt(b.querySelector('.report-line__remove')),
    }))
    panel.querySelectorAll('.report-line').forEach((b) => {
      const br = b.getBoundingClientRect()
      if (br.left < -EPS || br.right > vw + EPS) problems.push(`report block outside the viewport: [${br.left.toFixed(1)},${br.right.toFixed(1)}]`)
      b.querySelectorAll('.report-line__title, .report-line__drops, .report-line__stats, .report-line__remove').forEach((el) => {
        const r = el.getBoundingClientRect()
        if (r.left < br.left - EPS || r.right > br.right + EPS) problems.push(`.${el.className} outside its block: [${r.left.toFixed(1)},${r.right.toFixed(1)}] block=[${br.left.toFixed(1)},${br.right.toFixed(1)}]`)
        if (el.scrollWidth > el.clientWidth + EPS && getComputedStyle(el).display !== 'inline') problems.push(`.${el.className} clips: scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth}`)
      })
    })
    const nextEl = panel.querySelector('.reports-summary__next')
    if (nextEl && nextEl.scrollWidth > nextEl.clientWidth + EPS) problems.push('next-Voidcore line clips')
    return { problems, blocks, next, voidcores: voidcores?.value, summaryText: txt(summary) }
  })

  const expected = [
    {
      heading: 'RAID · The Venomous Abyss · Mythic',
      drops: "Drops Myth 6/6 (334) · The Coiled Altar, Ula'tek Myth 9/6 (344)",
      stats: '49 items · 8 bosses · baseline 572,817 · simmed Sep 22',
      remove: 'Remove',
    },
    { heading: 'MYTHIC+ · +10 and above', drops: 'Drops Myth 6/6 (334) · 8 dungeons', stats: '101 items · baseline 572,918 · simmed Sep 24', remove: 'Remove' },
  ]
  if (JSON.stringify(got.blocks) !== JSON.stringify(expected)) got.problems.push(`report blocks ${JSON.stringify(got.blocks)} != ${JSON.stringify(expected)}`)
  if (!got.summaryText.startsWith('Voidcores on hand:')) got.problems.push(`summary text: ${got.summaryText}`)
  if (!/^Next Voidcore worth ~\d+\.\d\d%/.test(got.next)) got.problems.push(`next-Voidcore line: ${got.next}`)
  if (got.problems.length > 0) throw new Error(`reports-panel assertions failed (${label}):\n${got.problems.join('\n')}`)
  console.log(`reports-panel assertions passed (${label}) ✓ ${got.summaryText}`)
  await page.locator('.report-list').locator('xpath=ancestor::section[contains(@class,"panel")]').screenshot({ path: shot })
  console.log(`captured: ${shot}`)
}

async function priceTheRoll(page: Page) {
  await page.click('text=Price my roll')
  await page.waitForSelector('.rec-card', { timeout: 10000 })
  await page.waitForSelector('.priced-section .deploy-table tbody tr')
}

async function logCard(page: Page, label: string) {
  const card = await page.evaluate(() => {
    const txt = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
    const c = document.querySelector('.rec-card')
    return {
      headline: txt(c?.querySelector('.rec-card__headline')),
      compare: [...(c?.querySelectorAll('.rec-card__compare-option') ?? [])].map((o) => txt(o)),
      notes: [...(c?.querySelectorAll('.rec-card__note, .rec-card__second') ?? [])].map((n) => txt(n)),
    }
  })
  console.log(`card (${label}):`, JSON.stringify(card))
}

async function shootDesktop(page: Page) {
  await page.setViewportSize({ width: 1280, height: 1000 })
  await page.route((url) => url.href.includes('/raidbots/') || url.href.includes('/loot-table/') || url.href.includes('/topgear/'), fulfillFromFixtures)

  await page.goto(APP_URL)
  await page.waitForSelector('#report-url')
  await page.screenshot({ path: 'design/single-page-empty.png', fullPage: true })
  console.log('captured: single-page-empty.png')

  await loadReports(page)
  await assertReportsPanel(page, '1280px', 'design/single-page-reports-panel-1280.png')
  await expandDungeon(page)
  await assertLayout(page, '1280px, loaded, dungeon expanded')
  await page.screenshot({ path: 'design/single-page-loaded.png', fullPage: true })
  console.log('captured: single-page-loaded.png')
  await assertEquippedRow(page, '1280px', 'design/single-page-equipped.png')

  await priceTheRoll(page)
  await assertLayout(page, '1280px, priced')
  await logCard(page, '1280px')
  await page.screenshot({ path: 'design/single-page-priced.png', fullPage: true })
  console.log('captured: single-page-priced.png')

  // Now make it stale: untick a dungeon's "I will run this key". The snapshot dims + a re-price note appears.
  await page.locator('.boss-section').nth(1).locator('.boss-row__kill input[type="checkbox"]').nth(1).click()
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
  await loadReports(page)
  await assertReportsPanel(page, '390px', 'design/single-page-reports-panel-390.png')
  await expandDungeon(page)
  await assertLayout(page, '390px, loaded, dungeon expanded')
  await page.screenshot({ path: 'design/single-page-mobile-390.png', fullPage: true })
  console.log('captured: single-page-mobile-390.png')
  await assertEquippedRow(page, '390px', 'design/single-page-equipped-mobile-390.png')

  await priceTheRoll(page)
  await assertLayout(page, '390px, priced')
  await page.screenshot({ path: 'design/single-page-priced-mobile-390.png', fullPage: true })
  console.log('captured: single-page-priced-mobile-390.png')
}

async function main() {
  const preview = spawn('npx', ['vite', 'preview', '--port', String(PREVIEW_PORT), '--strictPort'], {
    stdio: 'ignore',
    shell: process.platform === 'win32',
  })
  try {
    await waitForServer(APP_URL)
    const browser = await chromium.launch()
    // tsx/esbuild wraps named closures in __name(); page.evaluate bodies need it defined in the page.
    // Pin the timezone: the sim dates are shown in the viewer's local time (the M+ report was written 01:39 UTC on the 25th).
    const context = await browser.newContext({ timezoneId: 'America/Los_Angeles' })
    await context.addInitScript('window.__name = (f) => f')
    const desktop = await context.newPage()
    await shootDesktop(desktop)
    const mobile = await context.newPage()
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
