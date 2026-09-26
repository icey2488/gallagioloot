// Live smoke check of the single-page flow against the deployed site + proxy (run after every
// deploy: `npm run check:live` from web/). Fresh browser contexts, real Raidbots reports: a raid
// droptimizer + a Mythic+ droptimizer + a Top Gear vault item, loot spec Arcane. Asserts (prints
// PASS/FAIL per check, exits 1 if any fail) at 1280px and 390px:
//   - both reports load as compact blocks (heading, drop line, items / bosses / baseline / sim date); the M+ section has 8 dungeons
//     and reads "Mythic+ (+10 Myth)", never "Weekly10"
//   - Reports panel: the Mythic raid drop line carries the 344 exception ("Drops Myth 6/6 (334) · The Coiled Altar, Ula'tek Myth 9/6 (344)"),
//     sim dates (Sep 22 / Sep 24, from the proxy's Last-Modified passthrough), the "N notes" toggle (closed), "Voidcores on hand"
//     mirrored with Run settings, and the "One more Voidcore" line (Icemagus, none on hand: ~0.92%, roll 1: Ula'tek)
//   - EV: Ula'tek ~0.92%, The Coiled Altar ~0.81%, Altar of Fangs ~0.43%
//   - Ula'tek's roll pool is the journal's 4 items (4 / 4 remaining): its expanded table lists exactly Aqirbane
//     Reliquary, Font of Venomous Rage, Jan'thrazet the Soul Fang and Venomkeeper's Horrific Cowl (no Curio row,
//     no Jaw of the Shackled Goddess / Zatha'tek) plus the note that the Slumbering Coil Curio can't be won with a roll
//   - none on hand: "Roll Ula'tek (Mythic) or The Coiled Altar (Mythic)" (toss-up on kill order), "One more Voidcore"
//     0.92% (roll 1) vs Vile Vial 0.74%, with the no-saved-rolls explanation
//   - v2.09 Voidcore supply, 3 on hand + re-price: the ordered roll list (Ula'tek, The Coiled Altar, Sszorak); earning 1 a
//     week the 3rd reads "spend now 0.65% vs hold ~0.81% next week, playing without ~0.65% for 1 week" and one more Voidcore is ~0.81%
//     held for The Coiled Altar (with its own "playing without ~0.61% for 1 week"); earning 2 a week the 3rd is "spend now" and
//     one more Voidcore is ~0.65% held for Sszorak
//   - 1 roll (vault comparison layout): the toss-up note and the next-best line agree ("the pick holds" never appears beside "Toss-up")
//   - v2.11 plan disclosure: at 3 on hand no dungeon is in the order, so the card says nothing about Mythic+; at 6 on hand
//     the order reaches Altar of Fangs at +10 and the card reads "Plan assumes you run Altar of Fangs at +10 once this week.";
//     the re-run reminder shows under the order (both cases), fits at 390 (layout asserts) and appears in the footer assumptions
//   - the footer's assumptions list carries the nine Voidcore supply assumptions, including "Holding delays the upgrade: ..."
//   - the spec-specific pill renders inline (a wide pill, not a circle) at 390px
//   - layout: no horizontal scroll, controls inside their cards, names wrap, nothing exceeds its panel
//   - v2.12 theme picker (fresh context at 1280 and 390): Midnight default, Felt green and Craps red each set the root data-theme,
//     the page background and the wordmark gold (computed styles), keep the header inside the viewport, persist across a reload;
//     an unknown stored value falls back to Midnight
//   - v2.13 report URL rows (fresh context per theme x width, all three themes at 1280 and 390): one row with no "-"; "+" adds rows to the
//     cap of 8 where "+" disables and "Max 8 reports" shows (inside the viewport, controls >= 44px); removing a row re-enables "+" and the
//     "-" controls disappear at one row; "+"/"-" have accessible labels, a 2px focus ring and use the theme tokens; a duplicate row
//     ("Duplicate of row 1") is blocked and never fetched, a bad URL fails on its own row while the good one loads, "Already loaded" blocks
//     a loaded report, removing rows keeps loaded reports; two real reports (the raid + Mythic+ droptimizers) fetch in parallel via "Fetch all"
//     and land as their own blocks with per-row status
//   - v2.14 footer stamp (fresh context per theme x width, all three themes at 1280 and 390): the footer reads "v2.14 · <sha> · Source" with the
//     sha equal to `git rev-parse --short HEAD` (the commit that was built and deployed; no -dirty), the sha link is the full-commit URL on
//     github.com/icey2488/gallagioloot, Source is the repo URL, both open in a new tab with rel="noopener noreferrer", accessible names, theme tokens,
//     Tab order + focus ring, target size, and the stamp fits the footer and the viewport
// Screenshots + a JSON dump land in design/live-single-page-* (gitignored).
import { chromium, type Browser, type Page } from 'playwright'
import { writeFileSync } from 'node:fs'
import { VOIDCORE_ASSUMPTIONS } from '../../src/core/supply'
import { runReportRowChecks } from './reportRowsChecks.mts'
import { currentCommit, runFooterStampChecks } from './footerStampChecks.mts'

const APP_URL = 'https://gallagioloot.icehunter.net'
const RAID_URL = 'https://www.raidbots.com/simbot/report/6PTZ7TjgU8PdxJhZ97bMUa'
const MPLUS_URL = 'https://www.raidbots.com/simbot/report/a8URThoNZqEXDW3tBtavHq'
// v2.13: a well-formed report id the real proxy cannot serve (Raidbots has no such report), for the per-row error check.
const BOGUS_URL = 'https://www.raidbots.com/simbot/report/zzzzzzzzzzzzzzzzzzzzzz'
const TOPGEAR_URL = 'https://www.raidbots.com/simbot/report/k3vroAKe6QvF5gN4GeCVAq'
const LOOT_SPEC = 'Arcane'
const VAULT_ITEM = 'Vile Vial of Volatile Venom'
const RERUN_REMINDER = 'This order holds until your next roll result. After a win, especially a big one, re-run your droptimizer and GallagioLoot: a jackpot can drop a dungeon or boss off the worthwhile list.'
const MPLUS_ASSUMPTION = 'Plan assumes you run Altar of Fangs at +10 once this week.'
const HOLD_DELAY_LINE = 'Holding delays the upgrade: every week you wait, you play without it, and a roll never guarantees the item you are holding for.'

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

  check(`[${label}] two reports loaded as compact blocks`, loaded.reportLines.length === 2 && loaded.reportLines.every((l) => /items/.test(l) && /baseline/.test(l)) && !loaded.body.includes('items parsed'), JSON.stringify(loaded.reportLines))
  check(`[${label}] loot spec is ${LOOT_SPEC}`, loaded.lootSpec === LOOT_SPEC, String(loaded.lootSpec))
  const mplus = loaded.sections[1]
  check(`[${label}] M+ section has 8 dungeons`, mplus?.rows.length === 8, String(mplus?.rows.length))
  // The UI renders the track as "Mythic+ (+10 Myth)" (section title and report line); "+10 (Myth)" is only the engine's internal difficultyLabel.
  const mplusText = `${loaded.reportLines[1] ?? ''} ${mplus?.title ?? ''}`
  check(`[${label}] M+ section is titled "Mythic+ (+10 Myth)" and its report block "MYTHIC+ · +10 and above"`, /Mythic\+ \(\+10 Myth\)/.test(mplus?.title ?? '') && /^MYTHIC\+ · \+10 and above/.test(loaded.reportLines[1] ?? ''), mplusText)
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
  await assertReportsPanel(page, label, out)
}

/**
 * The compact Reports panel against the real proxy: the drop lines (the Mythic raid's last two bosses are the 344
 * exception, the M+ report is 334 across 8 dungeons), items / bosses / baseline / sim date, the collapsed "N notes"
 * toggle, Voidcores on hand (mirrored with Run settings), and the next Voidcore's value.
 */
async function assertReportsPanel(page: Page, label: string, out: Record<string, unknown>) {
  const panel = await page.evaluate(() => {
    const txt = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
    const blocks = [...document.querySelectorAll('.report-line')].map((b) => ({
      heading: txt(b.querySelector('.report-line__title')),
      drops: txt(b.querySelector('.report-line__drops')),
      stats: txt(b.querySelector('.report-line__stats')),
      remove: txt(b.querySelector('.report-line__remove')),
      notes: b.querySelector('details.report-notes') ? { summary: txt(b.querySelector('details.report-notes summary')), open: (b.querySelector('details.report-notes') as HTMLDetailsElement).open } : null,
      oldBanner: !!b.querySelector('.warning-banner'),
    }))
    const voidcores = document.querySelector('#voidcores-on-hand') as HTMLInputElement | null
    return { blocks, summaries: document.querySelectorAll('.reports-summary').length, voidcores: voidcores?.value ?? null, next: txt(document.querySelector('.reports-summary__next')), summary: txt(document.querySelector('.reports-summary')) }
  })
  out[`${label}ReportsPanel`] = panel
  const [raid, mplus] = panel.blocks
  check(`[${label}] raid block: RAID · The Venomous Abyss · Mythic, Remove`, raid?.heading === 'RAID · The Venomous Abyss · Mythic' && raid?.remove === 'Remove', JSON.stringify(raid))
  check(`[${label}] raid drop line shows Myth 6/6 (334) with the 344 exception for The Coiled Altar and Ula'tek`, raid?.drops === "Drops Myth 6/6 (334) · The Coiled Altar, Ula'tek Myth 9/6 (344)", raid?.drops)
  check(`[${label}] raid stats line: 49 items · 8 bosses · baseline 572,817 · simmed Sep 22`, raid?.stats === '49 items · 8 bosses · baseline 572,817 · simmed Sep 22', raid?.stats)
  check(`[${label}] M+ block drop line: Myth 6/6 (334), 8 dungeons, no exception`, mplus?.drops === 'Drops Myth 6/6 (334) · 8 dungeons', mplus?.drops)
  check(`[${label}] M+ stats line: 101 items · baseline 572,918 · simmed Sep 24`, mplus?.stats === '101 items · baseline 572,918 · simmed Sep 24', mplus?.stats)
  check(
    `[${label}] each block's warnings sit under a closed "N notes" toggle (no inline Reconcile banner)`,
    panel.blocks.every((b) => !b.oldBanner && (b.notes === null || (/^\d+ notes?$/.test(b.notes.summary) && b.notes.open === false))) && panel.blocks.some((b) => b.notes !== null),
    JSON.stringify(panel.blocks.map((b) => b.notes))
  )
  check(`[${label}] one Voidcores-on-hand strip, above the blocks, at 0 for a fresh browser`, panel.summaries === 1 && panel.voidcores === '0' && panel.summary.startsWith('Voidcores on hand:'), JSON.stringify({ n: panel.summaries, v: panel.voidcores }))
  console.log(`[${label}] one more Voidcore: ${panel.next}`)
  check(`[${label}] One more Voidcore: ~0.92% (roll 1: Ula'tek (Mythic)) with none on hand`, panel.next === "One more Voidcore: ~0.92% (roll 1: Ula'tek (Mythic))", panel.next)
  // Mirror: the strip's input and Run settings' "Voidcores held" are one setting.
  await page.fill('#voidcores-on-hand', '3')
  const held = await page.inputValue('input[aria-label="Voidcores held"]')
  const pill = await page.inputValue('input[aria-label="Voidcore count"]')
  check(`[${label}] Voidcores on hand mirrors Run settings' Voidcores held and the header pill`, held === '3' && pill === '3', JSON.stringify({ held, pill }))
  await page.fill('#voidcores-on-hand', '0')
  await page.locator('.report-list').locator('xpath=ancestor::section[contains(@class,"panel")]').screenshot({ path: `design/live-single-page-reports-${label}.png` })
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
        where: txt(o.querySelector('.rec-card__compare-where')),
      })),
      rolls: [...(c?.querySelectorAll('.roll-list__row') ?? [])].map((r) => ({
        n: txt(r.querySelector('.roll-list__n')),
        name: txt(r.querySelector('.roll-list__name')),
        ev: txt(r.querySelector('.roll-list__ev')),
        advice: txt(r.querySelector('.roll-list__advice')),
      })),
      strip: txt(document.querySelector('.reports-summary__next')),
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
  // One toss-up determination: a "Toss-up" note beside a "the pick holds" claim would contradict itself.
  const tossUpNote = card.notes.some((n) => n.startsWith('Toss-up'))
  const claimsPickHolds = card.notes.some((n) => n.includes('the pick holds') || n.includes('Clear of sim noise'))
  check(`[${label}] 1 roll: the Toss-up note is present and the next-best line does not claim the pick holds`, tossUpNote && !claimsPickHolds, JSON.stringify(card.notes))
  const voidcore = card.compare.find((o) => o.label === 'One more Voidcore')
  const vial = card.compare.find((o) => o.label === VAULT_ITEM)
  check(`[${label}] 1 roll: One more Voidcore 0.92% (roll 1: Ula'tek) vs ${VAULT_ITEM} 0.74%`, voidcore?.value === '0.92%' && voidcore?.where === "roll 1: Ula'tek (Mythic)" && vial?.value === '0.74%', JSON.stringify(card.compare))
  check(
    `[${label}] 1 roll: no-saved-rolls explanation`,
    card.notes.some((n) => n.includes("Altar of Fangs isn't a target you'd roll this week") && n.includes('saves no rolls')),
    JSON.stringify(card.notes)
  )
}

/**
 * v2.09 Voidcore supply on the live site: 3 Voidcores on hand, all spent. Earning 1 a week, next week's one takes
 * Ula'tek, so a held 3rd gets The Coiled Altar (0.81%) against Sszorak now (0.65%); earning 2 a week, next week's two
 * take Ula'tek and The Coiled Altar, so a held 3rd gets Sszorak: spend now. Screenshots the card with the comparison.
 */
async function assertVoidcoreSupply(page: Page, label: string, out: Record<string, unknown>) {
  await page.fill('#voidcores-on-hand', '3')
  await page.waitForSelector('.rec-card__badge--stale', { timeout: 5000 })
  await priceTheRoll(page)
  const one = await readCard(page)
  out[`${label}Supply1`] = one
  const rows = one.rolls.map((r) => `${r.n} ${r.name} ${r.ev}`)
  check(`[${label}] 3 on hand: meta "3 Voidcores" and the ordered list Ula'tek, The Coiled Altar, Sszorak`, one.meta === '3 Voidcores' && JSON.stringify(rows) === JSON.stringify(["1 Ula'tek (Mythic) 0.92%", '2 The Coiled Altar (Mythic) 0.81%', '3 Sszorak (Mythic) 0.65%']), JSON.stringify({ meta: one.meta, rows }))
  check(`[${label}] earned 1/week: rolls 1-2 "spend now"`, one.rolls[0]?.advice === 'spend now' && one.rolls[1]?.advice === 'spend now', JSON.stringify(one.rolls.map((r) => r.advice)))
  check(`[${label}] earned 1/week: roll 3 "spend now 0.65% vs hold ~0.81% next week, playing without ~0.65% for 1 week"`, !!one.rolls[2]?.advice.startsWith('spend now 0.65% vs hold ~0.81% next week, playing without ~0.65% for 1 week'), one.rolls[2]?.advice)
  check(`[${label}] earned 1/week: rolls 1-2 carry no hold clause`, !one.rolls[0]?.advice.includes('playing without') && !one.rolls[1]?.advice.includes('playing without'), JSON.stringify(one.rolls.map((r) => r.advice)))
  check(`[${label}] earned 1/week: strip "One more Voidcore: ~0.81% next week (hold for The Coiled Altar (Mythic)), playing without ~0.61% for 1 week"`, one.strip === 'One more Voidcore: ~0.81% next week (hold for The Coiled Altar (Mythic)), playing without ~0.61% for 1 week', one.strip)
  const voidcore = one.compare.find((o) => o.label === 'One more Voidcore')
  check(`[${label}] earned 1/week: vault compare One more Voidcore 0.81% (hold: The Coiled Altar next week) vs the Vial 0.74%`, voidcore?.value === '0.81%' && voidcore?.where === 'hold: The Coiled Altar (Mythic) next week, playing without ~0.61% for 1 week' && one.compare.some((o) => o.label === VAULT_ITEM && o.value === '0.74%'), JSON.stringify(one.compare))
  await assertLayout(page, `${label}, priced, 3 Voidcores`)
  await page.locator('.rec-card').screenshot({ path: `design/live-single-page-card-rolls-${label}.png` })

  await page.fill('#earned-per-week', '2')
  await priceTheRoll(page)
  const two = await readCard(page)
  out[`${label}Supply2`] = two
  check(`[${label}] earned 2/week: roll 3 is "spend now" (a held 3rd would get Sszorak anyway), no hold clause`, two.rolls.length === 3 && two.rolls.every((r) => r.advice.startsWith('spend now') && !r.advice.includes('playing without') && !r.advice.includes(' vs hold')), JSON.stringify(two.rolls.map((r) => r.advice)))
  check(`[${label}] earned 2/week: strip "One more Voidcore: ~0.65% next week (hold for Sszorak (Mythic)), playing without ~0.61% for 1 week"`, two.strip === 'One more Voidcore: ~0.65% next week (hold for Sszorak (Mythic)), playing without ~0.61% for 1 week', two.strip)
  await page.screenshot({ path: `design/live-single-page-supply-${label}.png`, fullPage: true })
}

/** v2.11: the roll order's Mythic+ assumption and re-run reminder. 3 Voidcores stay in the raid; 6 reach Altar of Fangs at +10. */
async function assertPlanDisclosure(page: Page, label: string, out: Record<string, unknown>) {
  const lines = async () => ({
    reminder: await page.locator('.rec-card .roll-list__reminder').allTextContents(),
    assumption: await page.locator('.rec-card .roll-list__assumption').allTextContents(),
    cardText: (await page.locator('.rec-card').textContent()) ?? '',
  })
  await page.fill('#earned-per-week', '1')
  await page.fill('#voidcores-on-hand', '3')
  await priceTheRoll(page)
  const three = await lines()
  check(`[${label}] 3 on hand: reminder shows, no Mythic+ assumption (no dungeon in the order)`, three.reminder.length === 1 && three.reminder[0] === RERUN_REMINDER && three.assumption.length === 0 && !three.cardText.includes('Plan assumes'), JSON.stringify(three))

  await page.fill('#voidcores-on-hand', '6')
  await priceTheRoll(page)
  const six = await lines()
  const rows = (await page.locator('.rec-card .roll-list__row .roll-list__name').allTextContents()).map((t) => t.trim())
  out[`${label}Plan6`] = { ...six, rows }
  check(`[${label}] 6 on hand: the 6th roll is Altar of Fangs at +10`, rows.length === 6 && rows[5] === 'Altar of Fangs at +10', JSON.stringify(rows))
  check(`[${label}] 6 on hand: "${MPLUS_ASSUMPTION}"`, six.assumption.length === 1 && six.assumption[0] === MPLUS_ASSUMPTION, JSON.stringify(six.assumption))
  check(`[${label}] 6 on hand: re-run reminder shows once, verbatim, no em dashes`, six.reminder.length === 1 && six.reminder[0] === RERUN_REMINDER && !six.cardText.includes('—'), JSON.stringify(six.reminder))
  await assertLayout(page, `${label}, priced, 6 Voidcores`)
  await page.locator('.rec-card').screenshot({ path: `design/live-single-page-card-plan-${label}.png` })
}

/** The footer's "Show assumptions" list includes the nine Voidcore supply assumptions verbatim, among them the plain holding-delays-the-upgrade line. */
async function assertAssumptions(page: Page, label: string) {
  await page.locator('.app-footer__assumptions summary').click()
  const items = await page.locator('.app-footer__assumptions li').allTextContents()
  const missing = VOIDCORE_ASSUMPTIONS.filter((a) => !items.includes(a))
  check(`[${label}] footer assumptions include the 9 Voidcore supply assumptions`, missing.length === 0 && VOIDCORE_ASSUMPTIONS.length === 9, JSON.stringify(missing))
  check(`[${label}] footer has the roll-order line about re-running after a win`, items.filter((i) => i.includes('re-run your droptimizer and GallagioLoot')).length === 1, JSON.stringify(items.filter((i) => i.startsWith('The roll order'))))
  check(`[${label}] footer has the line "${HOLD_DELAY_LINE}"`, items.includes(HOLD_DELAY_LINE), JSON.stringify(items.filter((i) => i.startsWith('Holding'))))
  check(`[${label}] footer assumptions use no finance terms`, !/time value|npv|discount/i.test(items.join(' ')))
  check(`[${label}] no em dashes in the assumptions`, !items.join(' ').includes('\u2014'))
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
    if (document.querySelectorAll('.report-line').length !== 2) problems.push('expected 2 report blocks')
    document.querySelectorAll('.report-line').forEach((b) => {
      const br = b.getBoundingClientRect()
      b.querySelectorAll('.report-line__title, .report-line__drops, .report-line__stats, .report-line__remove').forEach((el) => {
        const r = el.getBoundingClientRect()
        if (r.left < br.left - EPS || r.right > br.right + EPS) problems.push(`report block line outside its block: .${el.className}`)
      })
    })
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

// v2.12 theme picker: fresh browser = Midnight; each theme sets the root attribute, the page background and the wordmark gold
// (computed styles, so the token sets really reach the rendered page), keeps the header inside the viewport, and survives a
// reload; an unknown stored value falls back to Midnight.
const THEME_CASES = [
  { id: 'midnight', label: 'Midnight', bg: 'rgb(6, 16, 31)', gold: 'rgb(227, 185, 74)' },
  { id: 'green', label: 'Felt green', bg: 'rgb(3, 20, 12)', gold: 'rgb(227, 185, 74)' },
  { id: 'red', label: 'Craps red', bg: 'rgb(42, 5, 8)', gold: 'rgb(240, 199, 90)' },
]
async function assertThemes(browser: Browser, width: number, label: string) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'America/Los_Angeles' })
  const page = await ctx.newPage()
  const read = () =>
    page.evaluate(() => {
      const wordmark = document.querySelector('.app-header__brand')!
      const picker = document.querySelector('select[aria-label="Theme"]') as HTMLSelectElement | null
      const pr = picker?.getBoundingClientRect()
      const overflow = [...document.querySelectorAll('.app-header *')].filter((el) => {
        const r = el.getBoundingClientRect()
        return (r.width > 0 || r.height > 0) && (r.right > innerWidth + 0.5 || r.left < -0.5)
      }).length
      return {
        attr: document.documentElement.dataset.theme,
        bg: getComputedStyle(document.body).backgroundColor,
        gold: getComputedStyle(wordmark).color,
        options: picker ? [...picker.options].map((o) => o.textContent) : null,
        value: picker?.value,
        stored: localStorage.getItem('gallagioloot:theme'),
        pickerInside: !!pr && pr.left >= -0.5 && pr.right <= innerWidth + 0.5,
        overflow,
        docFits: document.documentElement.scrollWidth <= innerWidth,
      }
    })
  await page.goto(APP_URL)
  await page.waitForSelector('select[aria-label="Theme"]')
  const first = await read()
  check(`[${label}] theme picker present with Midnight, Felt green, Craps red`, JSON.stringify(first.options) === JSON.stringify(['Midnight', 'Felt green', 'Craps red']), JSON.stringify(first.options))
  check(`[${label}] fresh browser defaults to Midnight (attribute, picker value, nothing stored)`, first.attr === 'midnight' && first.value === 'midnight' && first.stored === null, JSON.stringify(first))
  for (const t of THEME_CASES) {
    await page.selectOption('select[aria-label="Theme"]', t.id)
    const got = await read()
    check(`[${label}] ${t.label}: root data-theme=${t.id}, page background ${t.bg}, wordmark gold ${t.gold}, stored`, got.attr === t.id && got.bg === t.bg && got.gold === t.gold && got.stored === t.id, JSON.stringify(got))
    check(`[${label}] ${t.label}: picker and header inside the viewport, no horizontal scroll`, got.pickerInside && got.overflow === 0 && got.docFits, JSON.stringify(got))
    await page.reload()
    await page.waitForSelector('select[aria-label="Theme"]')
    const again = await read()
    check(`[${label}] ${t.label}: persists across reload (attribute, background, picker value)`, again.attr === t.id && again.bg === t.bg && again.value === t.id, JSON.stringify(again))
  }
  await page.evaluate(() => localStorage.setItem('gallagioloot:theme', 'chartreuse'))
  await page.reload()
  await page.waitForSelector('select[aria-label="Theme"]')
  const bad = await read()
  check(`[${label}] unknown stored value falls back to Midnight`, bad.attr === 'midnight' && bad.bg === THEME_CASES[0].bg && bad.value === 'midnight', JSON.stringify(bad))
  await ctx.close()
}

// v2.13 report URL rows against the real proxy: fresh browser per theme x width (all three themes at 1280 and 390).
async function assertReportRows(browser: Browser, width: number, theme: (typeof THEME_CASES)[number]) {
  const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 900 : 1000 }, timezoneId: 'America/Los_Angeles' })
  await ctx.addInitScript('window.__name = (f) => f')
  await ctx.addInitScript(`localStorage.setItem('gallagioloot:theme', '${theme.id}')`)
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('[pageerror]', e.message))
  await page.goto(APP_URL)
  const shotPrefix = `design/live-single-page-rows-${width}-${theme.id}`
  await runReportRowChecks(page, { label: `${width} rows, ${theme.label}`, check, raidUrl: RAID_URL, mplusUrl: MPLUS_URL, bogusUrl: BOGUS_URL, shotPrefix })
  await ctx.close()
}

// v2.14 footer stamp on the DEPLOYED site: fresh browser per theme x width; the stamp must name the commit the working copy is on
// (`git rev-parse --short HEAD` now, i.e. the commit that was built and deployed), be clean, and link to that commit and the repo.
async function assertFooterStamp(browser: Browser, width: number, theme: (typeof THEME_CASES)[number]) {
  const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 900 : 1000 }, timezoneId: 'America/Los_Angeles' })
  await ctx.addInitScript('window.__name = (f) => f')
  await ctx.addInitScript(`localStorage.setItem('gallagioloot:theme', '${theme.id}')`)
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('[pageerror]', e.message))
  await page.goto(APP_URL)
  await page.waitForSelector('.app-footer')
  await runFooterStampChecks(page, { label: `${width} footer, ${theme.label}`, check, expected: currentCommit(), allowDirty: false, shot: `design/live-single-page-footer-${width}-${theme.id}.png` })
  await ctx.close()
}

async function main() {
  const browser = await chromium.launch()
  const out: Record<string, unknown> = {}

  // ---- Desktop 1280
  // The sim dates are shown in the viewer's local time; pin US Pacific (the M+ report was written 01:39 UTC on the 25th, i.e. Sep 24 locally).
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, timezoneId: 'America/Los_Angeles' })
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

  // v2.09 Voidcore supply: 3 on hand, earned 1 then 2 (the priced snapshot goes stale until re-priced).
  await assertVoidcoreSupply(page, '1280', out)
  await assertPlanDisclosure(page, '1280', out)
  await assertAssumptions(page, '1280')
  await ctx.close()

  // ---- Mobile 390, fresh context
  const mctx = await browser.newContext({ viewport: { width: 390, height: 900 }, isMobile: true, hasTouch: true, timezoneId: 'America/Los_Angeles' })
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
  await assertVoidcoreSupply(mpage, '390', out)
  await assertPlanDisclosure(mpage, '390', out)
  await assertAssumptions(mpage, '390')
  await mctx.close()

  await assertThemes(browser, 1280, '1280 themes')
  await assertThemes(browser, 390, '390 themes')

  for (const width of [1280, 390]) for (const theme of THEME_CASES) await assertReportRows(browser, width, theme)
  for (const width of [1280, 390]) for (const theme of THEME_CASES) await assertFooterStamp(browser, width, theme)

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
