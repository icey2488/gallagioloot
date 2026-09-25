// Live smoke check of the single-page flow against the deployed site + proxy (run after every
// deploy: `npm run check:live` from web/). Fresh browser contexts, real Raidbots reports: a raid
// droptimizer + a Mythic+ droptimizer + a Top Gear vault item, loot spec Arcane. Asserts (prints
// PASS/FAIL per check, exits 1 if any fail) at 1280px and 390px:
//   - both reports load with parse lines; the M+ section has 8 dungeons and reads "Mythic+ (+10 Myth)", never "Weekly10"
//   - EV: Ula'tek ~0.92%, The Coiled Altar ~0.81%, Altar of Fangs ~0.43%
//   - Ula'tek's roll pool is the journal's 4 items (4 / 4 remaining): its expanded table lists exactly Aqirbane
//     Reliquary, Font of Venomous Rage, Jan'thrazet the Soul Fang and Venomkeeper's Horrific Cowl (no Curio row,
//     no Jaw of the Shackled Goddess / Zatha'tek) plus the note that the Slumbering Coil Curio can't be won with a roll
//   - 1 roll: "Roll Ula'tek (Mythic) or The Coiled Altar (Mythic)" (toss-up on kill order), "Voidcore roll" 0.92% vs
//     Vile Vial 0.74%, with the no-saved-rolls explanation
//   - 2 rolls + re-price: Voidcore verdict whose headline names Ula'tek and The Coiled Altar
//   - the spec-specific pill renders inline (a wide pill, not a circle) at 390px
//   - layout: no horizontal scroll, controls inside their cards, names wrap, nothing exceeds its panel
// Screenshots + a JSON dump land in design/live-single-page-* (gitignored).
import { chromium, type Page } from 'playwright'
import { writeFileSync } from 'node:fs'

const APP_URL = 'https://gallagioloot.icehunter.net'
const RAID_URL = 'https://www.raidbots.com/simbot/report/6PTZ7TjgU8PdxJhZ97bMUa'
const MPLUS_URL = 'https://www.raidbots.com/simbot/report/a8URThoNZqEXDW3tBtavHq'
const TOPGEAR_URL = 'https://www.raidbots.com/simbot/report/k3vroAKe6QvF5gN4GeCVAq'
const LOOT_SPEC = 'Arcane'
const VAULT_ITEM = 'Vile Vial of Volatile Venom'

const results: Array<{ ok: boolean; label: string; detail?: string }> = []
function check(label: string, ok: boolean, detail?: string) {
  results.push({ ok, label, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail ? `  -> ${detail}` : ''}`)
}

async function addReport(page: Page, url: string, expectedLines: number) {
  await page.fill('#report-url', url)
  await page.waitForSelector('text=Detected:')
  await page.locator('.fetch-button-group button').click()
  await page.waitForFunction((n) => document.querySelectorAll('.report-line').length === n, expectedLines, { timeout: 60000 })
}

async function load(page: Page, out: Record<string, unknown>, label: string) {
  await page.addInitScript('window.__name = (f) => f')
  page.on('pageerror', (e) => console.log('[pageerror]', e.message))
  page.on('console', (m) => m.type() === 'error' && console.log('[console error]', m.text()))
  await page.goto(APP_URL)
  await page.waitForSelector('#report-url')
  await addReport(page, RAID_URL, 1)
  await page.selectOption('select[aria-label="Loot spec"]', { label: LOOT_SPEC })
  await addReport(page, MPLUS_URL, 2)
  await page.fill('#topgear-url', TOPGEAR_URL)
  await page.waitForSelector('text=Vault item:', { timeout: 60000 })
  await page.waitForFunction(() => !document.body.textContent?.includes('Loading loot tables'), null, { timeout: 60000 })
  await page.waitForSelector('.boss-section >> nth=1', { timeout: 60000 })
  await page.waitForTimeout(500)

  const loaded = await page.evaluate(() => {
    const txt = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
    const sections = [...document.querySelectorAll('.boss-section')].map((s) => ({
      title: txt(s.querySelector('.boss-section__title')),
      rows: [...s.querySelectorAll('.boss-row')].map((r) => ({ name: txt(r.querySelector('.boss-row__name')), ev: txt(r.querySelector('.boss-row__ev')) })),
    }))
    return {
      reportLines: [...document.querySelectorAll('.report-line')].map((l) => txt(l)),
      sections,
      lootSpec: (document.querySelector('select[aria-label="Loot spec"]') as HTMLSelectElement | null)?.selectedOptions[0]?.textContent ?? null,
      body: txt(document.body),
    }
  })
  out[`${label}Loaded`] = { reportLines: loaded.reportLines, sections: loaded.sections, lootSpec: loaded.lootSpec }

  check(`[${label}] two reports loaded with parse lines`, loaded.reportLines.length === 2 && loaded.reportLines.every((l) => /items parsed/.test(l)), JSON.stringify(loaded.reportLines))
  check(`[${label}] loot spec is ${LOOT_SPEC}`, loaded.lootSpec === LOOT_SPEC, String(loaded.lootSpec))
  const mplus = loaded.sections[1]
  check(`[${label}] M+ section has 8 dungeons`, mplus?.rows.length === 8, String(mplus?.rows.length))
  // The UI renders the track as "Mythic+ (+10 Myth)" (section title and report line); "+10 (Myth)" is only the engine's internal difficultyLabel.
  const mplusText = `${loaded.reportLines[1] ?? ''} ${mplus?.title ?? ''}`
  check(`[${label}] M+ section is titled "Mythic+ (+10 Myth)" (+10 and above, Myth track)`, /Mythic\+ \(\+10 Myth\)/.test(mplus?.title ?? '') && /\+10 and above · Myth track/.test(mplusText), mplusText)
  check(`[${label}] "Weekly10" never renders`, !loaded.body.includes('Weekly10'))

  const ev = (name: string) => {
    const row = loaded.sections.flatMap((s) => s.rows).find((r) => r.name === name)
    return row ? parseFloat(row.ev) : NaN
  }
  const near = (name: string, expected: number) => {
    const v = ev(name)
    check(`[${label}] ${name} ~${expected.toFixed(2)}%`, Math.abs(v - expected) <= 0.01, `got ${v}`)
  }
  near("Ula'tek", 0.92)
  near('The Coiled Altar', 0.81)
  near('Altar of Fangs', 0.43)
  await assertUlatekTable(page, label)
}

const ULATEK_ITEMS = ['Aqirbane Reliquary', "Venomkeeper's Horrific Cowl", 'Font of Venomous Rage', "Jan'thrazet, the Soul Fang"]
const CURIO_NOTE = "Slumbering Coil Curio drops from Ula'tek but can't be won with a bonus roll."

/** Ula'tek is 4 / 4 remaining; its expanded table has the 4 journal items, no Curio row, and the curio note. */
async function assertUlatekTable(page: Page, label: string) {
  const summary = page.locator('.boss-row', { has: page.locator('.boss-row__name', { hasText: /^Ula'tek$/ }) }).locator('.boss-row__summary')
  await summary.click()
  await page.waitForSelector('.boss-row--open .loot-item-table tbody tr', { timeout: 10000 })
  const ulatek = await page.evaluate(() => {
    const txt = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
    const open = document.querySelector('.boss-row--open')
    return {
      remaining: txt(open?.querySelector('.boss-row__remaining')),
      // The item name is the cell's text once the annotations (spec-specific pill, catalyst credit, tier tag) are removed.
      items: [...(open?.querySelectorAll('.loot-item-table tbody tr') ?? [])].map((r) => {
        const cell = r.querySelector('td')?.cloneNode(true) as HTMLElement
        cell.querySelectorAll('.badge, .note-line, .catalyst-note, .item-tag').forEach((n) => n.remove())
        return (cell.textContent ?? '').replace(/\s+/g, ' ').trim()
      }),
      rowText: [...(open?.querySelectorAll('.loot-item-table tbody tr') ?? [])].map((r) => txt(r.querySelector('td'))),
      notes: [...(open?.querySelectorAll('.note-line') ?? [])].map((n) => txt(n)),
      text: txt(open),
    }
  })
  check(`[${label}] Ula'tek shows 4 / 4 remaining`, /^4 \/ 4/.test(ulatek.remaining), ulatek.remaining)
  check(
    `[${label}] Ula'tek's table lists exactly the 4 journal items (no Jaw of the Shackled Goddess / Zatha'tek)`,
    JSON.stringify([...ulatek.items].sort()) === JSON.stringify([...ULATEK_ITEMS].sort()),
    JSON.stringify(ulatek.items)
  )
  check(
    `[${label}] Ula'tek's table has no Curio row (4 rows, no Curio tag; the Cowl's catalyst credit is not a row)`,
    ulatek.rowText.length === 4 && !ulatek.rowText.some((t) => /Curio/.test(t)) && !/Curio \(any missing tier slot\)/.test(ulatek.text),
    JSON.stringify(ulatek.rowText)
  )
  check(`[${label}] Ula'tek's curio note is present`, ulatek.notes.includes(CURIO_NOTE), JSON.stringify(ulatek.notes))
  await page.screenshot({ path: `design/live-single-page-ulatek-${label}.png`, fullPage: true })
  await summary.click() // collapse again so later steps start from the same layout
}

async function priceTheRoll(page: Page) {
  await page.click('text=Price my roll')
  await page.waitForSelector('.rec-card', { timeout: 30000 })
  await page.waitForFunction(() => !document.querySelector('.rec-card__badge--stale'), null, { timeout: 10000 })
  await page.waitForSelector('.priced-section .deploy-table tbody tr')
}

async function readCard(page: Page) {
  return page.evaluate(() => {
    const txt = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
    const c = document.querySelector('.rec-card')
    return {
      eyebrow: txt(c?.querySelector('.rec-card__eyebrow')),
      headline: txt(c?.querySelector('.rec-card__headline')),
      pct: txt(c?.querySelector('.rec-card__pct')),
      pctLabel: txt(c?.querySelector('.rec-card__pct-label')),
      meta: txt(c?.querySelector('.rec-card__meta')),
      compare: [...(c?.querySelectorAll('.rec-card__compare-option') ?? [])].map((o) => ({
        label: txt(o.querySelector('.rec-card__compare-label')),
        value: txt(o.querySelector('.rec-card__compare-value')),
      })),
      notes: [...(c?.querySelectorAll('.rec-card__note, .rec-card__second') ?? [])].map((n) => txt(n)),
      full: txt(c),
      pricedSection: txt(document.querySelector('.priced-section')),
    }
  })
}

type Card = Awaited<ReturnType<typeof readCard>>

function assertOneRollCard(card: Card, label: string) {
  check(`[${label}] 1 roll: headline is the kill-order toss-up between Ula'tek and The Coiled Altar`, card.headline === "Roll Ula'tek (Mythic) or The Coiled Altar (Mythic)", card.headline)
  check(
    `[${label}] 1 roll: kill-order toss-up note (Next best: The Coiled Altar ~0.81%)`,
    card.notes.some((n) => n.includes('Next best: The Coiled Altar (Mythic), ~0.81%')) && card.notes.some((n) => n.includes('let kill order decide')),
    JSON.stringify(card.notes)
  )
  const voidcore = card.compare.find((o) => o.label === 'Voidcore roll')
  const vial = card.compare.find((o) => o.label === VAULT_ITEM)
  check(`[${label}] 1 roll: Voidcore 0.92% vs ${VAULT_ITEM} 0.74%`, voidcore?.value === '0.92%' && vial?.value === '0.74%', JSON.stringify(card.compare))
  check(
    `[${label}] 1 roll: no-saved-rolls explanation`,
    card.notes.some((n) => n.includes("Altar of Fangs isn't a target you'd roll this week") && n.includes('saves no rolls')),
    JSON.stringify(card.notes)
  )
}

function assertTwoRollCard(card: Card, label: string) {
  check(`[${label}] 2 rolls: Voidcore verdict`, /^Take the Voidcore/.test(card.headline), card.headline)
  check(`[${label}] 2 rolls: 2 Voidcores`, card.meta === '2 Voidcores', card.meta)
  const twoRollVoidcore = card.compare.find((o) => o.label === 'Voidcore roll')
  check(`[${label}] 2 rolls: Voidcore 1.73%`, twoRollVoidcore?.value === '1.73%', JSON.stringify(card.compare))
  check(
    `[${label}] 2 rolls: headline names both targets`,
    card.headline === "Take the Voidcores. Roll Ula'tek (Mythic) and The Coiled Altar (Mythic).",
    card.headline
  )
  const vial = card.compare.find((o) => o.label === VAULT_ITEM)
  check(`[${label}] 2 rolls: Vial still 0.74% (no saved-rolls credit)`, vial?.value === '0.74%', JSON.stringify(card.compare))
}

const JOURNAL_ORDER_1320 = [
  "Nek'zali the Soulcoiler",
  'Entombed Sentinels',
  'The Lost Explorers',
  'Vashnik the Malignant',
  'Sszorak',
  'The Twin Fangs',
  'The Coiled Altar',
  "Ula'tek",
]

/** The raid section lists bosses in Adventure Journal order, numbered 1..8 (M+ dungeons are alphabetical). */
async function assertBossOrder(page: Page, label: string) {
  const sections = await page.evaluate(() =>
    [...document.querySelectorAll('.boss-section')].map((sec) =>
      [...sec.querySelectorAll('.boss-row__summary')].map((r) => ({
        rank: (r.querySelector('.boss-row__rank')?.textContent ?? '').trim(),
        name: (r.querySelector('.boss-row__name')?.textContent ?? '').trim(),
      }))
    )
  )
  const raid = sections[0] ?? []
  check(`[${label}] raid section lists bosses in Adventure Journal order`, JSON.stringify(raid.map((r) => r.name)) === JSON.stringify(JOURNAL_ORDER_1320), raid.map((r) => r.name).join(' | '))
  check(`[${label}] raid section numbering follows journal order (1..8)`, raid.map((r) => r.rank).join(',') === '1,2,3,4,5,6,7,8', raid.map((r) => r.rank).join(','))
  const dungeons = (sections[1] ?? []).map((r) => r.name)
  check(`[${label}] M+ dungeons are alphabetical`, JSON.stringify(dungeons) === JSON.stringify([...dungeons].sort((a, b) => a.localeCompare(b))), dungeons.join(' | '))
}

/** The layout checks from single-page-shots.mts, adapted to the live page (2 parse lines, 2 sections, 8 dungeons). */
async function assertLayout(page: Page, label: string) {
  const result = await page.evaluate(() => {
    const problems: string[] = []
    const viewportW = window.innerWidth
    const EPS = 0.5
    document.querySelectorAll('.state-seg__btn').forEach((btn) => {
      const rect = btn.getBoundingClientRect()
      if (rect.right > viewportW + EPS || rect.left < -EPS) problems.push(`state button outside viewport: left=${rect.left.toFixed(1)} right=${rect.right.toFixed(1)} viewport=${viewportW}`)
      const card = btn.closest('.panel')
      if (card) {
        const cardRect = card.getBoundingClientRect()
        if (rect.right > cardRect.right + EPS || rect.left < cardRect.left - EPS) problems.push(`state button outside its card: btn=[${rect.left.toFixed(1)},${rect.right.toFixed(1)}] card=[${cardRect.left.toFixed(1)},${cardRect.right.toFixed(1)}]`)
      }
    })
    document.querySelectorAll('.boss-row__name').forEach((el) => {
      if (el.scrollWidth > el.clientWidth + EPS) problems.push(`boss name overflows instead of wrapping: "${el.textContent}"`)
    })
    const panels = [document.querySelector('.report-list')?.closest('.panel'), document.querySelector('.run-settings-row')?.closest('.panel')]
    for (const panel of panels) {
      if (!panel) continue
      const panelRect = panel.getBoundingClientRect()
      panel.querySelectorAll('*').forEach((el) => {
        const rect = el.getBoundingClientRect()
        if (rect.width === 0 && rect.height === 0) return
        if (rect.right > panelRect.right + EPS || rect.left < panelRect.left - EPS) problems.push(`panel element exceeds its card: <${el.tagName.toLowerCase()} class="${el.className}"> right=${rect.right.toFixed(1)} panelRight=${panelRect.right.toFixed(1)}`)
      })
    }
    const sections = [...document.querySelectorAll('.boss-section')]
    if (document.querySelectorAll('.report-line').length !== 2) problems.push('expected 2 report parse lines')
    if (sections.length !== 2) problems.push(`expected 2 boss-list sections, found ${sections.length}`)
    if ((sections[1]?.querySelectorAll('.boss-row').length ?? 0) !== 8) problems.push('expected 8 dungeon rows in the Mythic+ section')
    return { problems, docWidth: document.documentElement.scrollWidth, winWidth: window.innerWidth }
  })
  if (result.docWidth > result.winWidth) result.problems.push(`horizontal scroll: scrollWidth ${result.docWidth} > innerWidth ${result.winWidth}`)
  check(`[${label}] layout assertions`, result.problems.length === 0, result.problems.join('; '))
}

/** Opens each boss row in turn until one shows a spec-specific pill, then checks the pill is a wide inline pill, not a circle. */
async function assertSpecPillInline(page: Page, label: string, out: Record<string, unknown>) {
  const summaries = page.locator('.boss-section').first().locator('.boss-row__summary')
  const n = await summaries.count()
  let measured: { width: number; height: number; display: string; text: string; row: string } | null = null
  for (let i = 0; i < n && !measured; i++) {
    await summaries.nth(i).click()
    await page.waitForSelector('.boss-row--open .loot-item-table tbody tr', { timeout: 10000 })
    measured = await page.evaluate(() => {
      const badge = document.querySelector('.boss-row--open .loot-item-table .badge')
      if (!badge) return null
      const r = badge.getBoundingClientRect()
      return {
        width: r.width,
        height: r.height,
        display: getComputedStyle(badge).display,
        text: (badge.textContent ?? '').trim(),
        row: (document.querySelector('.boss-row--open .boss-row__name')?.textContent ?? '').trim(),
      }
    })
    if (!measured) await summaries.nth(i).click() // collapse and try the next boss
  }
  out[`${label}SpecPill`] = measured
  check(`[${label}] a spec-specific pill is on screen`, measured !== null && /spec-specific/.test(measured.text), JSON.stringify(measured))
  if (measured) {
    // A flex item's computed display is blockified ("block") even for an inline element, so judge the geometry: a wide single-line pill, not a squeezed circle.
    check(`[${label}] spec-specific pill renders inline (wide single-line pill), not a circle`, measured.width > measured.height * 2 && measured.height < 32, JSON.stringify(measured))
  }
}

/**
 * Items equipped in the sim profile are auto-marked Owned: Icemagus has Pilfered Precious Band on finger2, so in
 * Den of Nalorakk its row shows the muted "Equipped" label with Owned preselected (no None option), and the
 * auto default isn't written to localStorage. Gebbo's Bottomless Bag (trinket2 in the profile) is likewise Equipped
 * in The Lost Explorers.
 */
async function assertEquippedRows(page: Page, label: string) {
  const inspect = async (boss: string, item: string) => {
    const summary = page.locator('.boss-row', { has: page.locator('.boss-row__name', { hasText: new RegExp(`^${boss}$`) }) }).locator('.boss-row__summary')
    await summary.click()
    await page.waitForSelector('.boss-row--open .loot-item-table tbody tr', { timeout: 10000 })
    const row = page.locator('.boss-row--open .loot-item-table tbody tr', { hasText: item })
    const found = {
      rows: await row.count(),
      tag: (await row.locator('.item-tag--equipped').allTextContents()).map((t) => t.trim()),
      on: await row.locator('.state-seg__btn--on').allInnerTexts(),
      buttons: await row.locator('.state-seg__btn').allInnerTexts(),
      gain: ((await row.locator('td[data-label="Sim gain"]').allInnerTexts())[0] ?? '').trim(),
    }
    return { summary, found }
  }
  const den = await inspect('Den of Nalorakk', 'Pilfered Precious Band')
  check(`[${label}] Pilfered Precious Band shows Equipped in Den of Nalorakk`, den.found.rows === 1 && den.found.tag.join() === 'Equipped', JSON.stringify(den.found))
  check(`[${label}] Pilfered Precious Band is preselected Owned (Owned / Rolled offered, no None)`, den.found.on.join() === 'Owned' && den.found.buttons.join() === 'Owned,Rolled', JSON.stringify(den.found))
  await assertLayout(page, `${label}, Equipped label visible`)
  await page.screenshot({ path: `design/live-single-page-equipped-${label}.png`, fullPage: true })
  const stored = await page.evaluate(() =>
    Object.keys(localStorage)
      .filter((k) => k.startsWith('gallagioloot:knockout:'))
      .flatMap((k) => (JSON.parse(localStorage.getItem(k) ?? '{}') as { entries?: unknown[] }).entries ?? [])
  )
  check(`[${label}] the equipped default is not written to the stored knockout state`, stored.length === 0, JSON.stringify(stored))
  await den.summary.click()
  const bag = await inspect('The Lost Explorers', "Gebbo's Bottomless Bag")
  check(`[${label}] Gebbo's Bottomless Bag (equipped trinket2) shows Equipped / Owned`, bag.found.tag.join() === 'Equipped' && bag.found.on.join() === 'Owned', JSON.stringify(bag.found))
  await bag.summary.click()
  // The drop copy of Crest of the Primal Leywarden (Vashnik) simmed as an upgrade over the worn copy: not auto-Owned.
  const crest = await inspect('Vashnik the Malignant', 'Crest of the Primal Leywarden')
  check(
    `[${label}] Crest (Vashnik) shows "Equipped (lower ilvl)", state None, all three states offered, sim gain intact`,
    crest.found.tag.join() === 'Equipped (lower ilvl)' && crest.found.on.join() === 'None' && crest.found.buttons.join() === 'None,Owned,Rolled' && /^0\.9\d%$/.test(crest.found.gain),
    JSON.stringify(crest.found)
  )
  await crest.summary.click()
}

/** Per-target EV (2dp, shown in each boss row) is back to its pre-v2.06 value: equipped upgrades keep their value. */
async function assertTargetEvs(page: Page, label: string) {
  const evs = await page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll('.boss-row__summary')].map((r) => [(r.querySelector('.boss-row__name')?.textContent ?? '').trim(), parseFloat(r.querySelector('.boss-row__ev')?.textContent ?? 'NaN')])
    )
  )
  const EXPECTED: Record<string, number> = {
    "Ula'tek": 0.921, 'The Coiled Altar': 0.812, Sszorak: 0.648, 'The Lost Explorers': 0.614, 'The Twin Fangs': 0.458, "Nek'zali the Soulcoiler": 0.349, 'Entombed Sentinels': 0.348, 'Vashnik the Malignant': 0.245,
    'Den of Nalorakk': 0.348, 'Murder Row': 0.381, 'Temple of Sethraliss': 0.341,
  }
  const off = Object.entries(EXPECTED).filter(([name, v]) => !(Math.abs((evs[name] ?? NaN) - v) <= 0.006))
  check(`[${label}] per-target EVs match the pre-v2.06 values (Sszorak 0.65, Twin Fangs 0.46, Vashnik 0.25, Murder Row 0.38, Temple 0.34, ...)`, off.length === 0, JSON.stringify({ off, evs }))
}

async function main() {
  const browser = await chromium.launch()
  const out: Record<string, unknown> = {}

  // ---- Desktop 1280
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } })
  const page = await ctx.newPage()
  await load(page, out, '1280')
  await assertLayout(page, '1280, loaded')
  await assertBossOrder(page, '1280')
  await assertTargetEvs(page, '1280')
  await assertEquippedRows(page, '1280')
  await page.screenshot({ path: 'design/live-single-page-loaded.png', fullPage: true })

  await priceTheRoll(page)
  const oneRoll = await readCard(page)
  out.desktopOneRoll = oneRoll
  assertOneRollCard(oneRoll, '1280')
  await assertLayout(page, '1280, priced, 1 roll')
  await page.screenshot({ path: 'design/live-single-page-desktop.png', fullPage: true })

  // Switch to 2 rolls: the priced snapshot goes stale until re-priced.
  await page.selectOption('#rolls-available', '2')
  await page.waitForSelector('.rec-card__badge--stale', { timeout: 5000 })
  await page.screenshot({ path: 'design/live-single-page-stale.png', fullPage: true })
  await priceTheRoll(page)
  const twoRolls = await readCard(page)
  out.desktopTwoRolls = twoRolls
  assertTwoRollCard(twoRolls, '1280')
  await assertLayout(page, '1280, priced, 2 rolls')
  await page.screenshot({ path: 'design/live-single-page-desktop-2rolls.png', fullPage: true })
  await ctx.close()

  // ---- Mobile 390, fresh context
  const mctx = await browser.newContext({ viewport: { width: 390, height: 900 }, isMobile: true, hasTouch: true })
  const mpage = await mctx.newPage()
  await load(mpage, out, '390')
  await assertLayout(mpage, '390, loaded')
  await assertSpecPillInline(mpage, '390', out)
  await assertEquippedRows(mpage, '390')
  await assertLayout(mpage, '390, loaded, row expanded')
  await mpage.screenshot({ path: 'design/live-single-page-mobile-390.png', fullPage: true })

  await priceTheRoll(mpage)
  const mCard = await readCard(mpage)
  out.mobileOneRoll = mCard
  assertOneRollCard(mCard, '390')
  await assertLayout(mpage, '390, priced, 1 roll')
  await mpage.screenshot({ path: 'design/live-single-page-mobile-390-priced.png', fullPage: true })
  await mctx.close()

  await browser.close()
  writeFileSync('design/live-single-page-check.json', JSON.stringify(out, null, 2))

  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  if (failed.length > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
