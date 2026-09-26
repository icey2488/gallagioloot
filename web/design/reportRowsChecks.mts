// v2.13 multiple report URL rows: the browser checks shared by the local screenshot harness (single-page-shots.mts, fixtures)
// and the live smoke check (live-single-page-check.mts, real proxy). The page must already be on a fresh app with the theme
// set; each call drives the rows (add to the cap, remove, focus ring, token colors), duplicate / bad-URL handling, and a
// parallel fetch of two reports, reporting every result through `check`.
import type { Page } from 'playwright'

export type Check = (label: string, ok: boolean, detail?: string) => void

export type RowChecksOptions = {
  label: string
  check: Check
  raidUrl: string
  mplusUrl: string
  /** A well-formed report URL the proxy cannot serve (it must fail on its own row). */
  bogusUrl: string
  /** Screenshot path prefix (".png" is appended); omitted = no screenshots. */
  shotPrefix?: string
}

const rowInputs = (page: Page) => page.locator('.report-row input')
const removeButtons = (page: Page) => page.locator('button[aria-label^="Remove report URL"]')
const addButton = (page: Page) => page.locator('button[aria-label="Add another report URL"]')
const statusTexts = (page: Page) => page.locator('.report-row__status').allInnerTexts().then((t) => t.map((s) => s.trim()))
const fetchButtonText = (page: Page) => page.locator('.fetch-button-group button').innerText().then((t) => t.trim())

const reportId = (url: string) => url.split('/').filter(Boolean).pop()!

/** Rendered color of a token, via a probe element (so the compare is against what the active theme really resolves). */
async function tokenColor(page: Page, token: string, property: 'color' | 'borderTopColor' = 'color') {
  return page.evaluate(
    ([t, prop]) => {
      const probe = document.createElement('div')
      probe.style.color = `var(${t})`
      probe.style.borderTop = `1px solid var(${t})`
      document.body.appendChild(probe)
      const value = getComputedStyle(probe)[prop as 'color']
      probe.remove()
      return value
    },
    [token, property] as const
  )
}

async function layoutProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const problems: string[] = []
    const vw = window.innerWidth
    if (document.documentElement.scrollWidth > vw) problems.push(`horizontal scroll: ${document.documentElement.scrollWidth} > ${vw}`)
    const panel = document.querySelector('.report-rows')?.closest('.panel')?.getBoundingClientRect()
    for (const el of document.querySelectorAll('.report-rows *')) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 && r.height === 0) continue
      if (r.right > vw + 0.5 || r.left < -0.5) problems.push(`outside viewport: <${el.tagName.toLowerCase()} class="${el.className}"> [${r.left.toFixed(1)},${r.right.toFixed(1)}]`)
      if (panel && (r.right > panel.right + 0.5 || r.left < panel.left - 0.5)) problems.push(`outside the Reports panel: <${el.tagName.toLowerCase()} class="${el.className}">`)
    }
    for (const b of document.querySelectorAll('.report-row__btn')) {
      const r = b.getBoundingClientRect()
      if (r.width < 44 - 0.5 || r.height < 44 - 0.5) problems.push(`+/- control under 44px: ${r.width.toFixed(0)}x${r.height.toFixed(0)}`)
    }
    return problems
  })
}

export async function runReportRowChecks(page: Page, o: RowChecksOptions) {
  const { label, check } = o
  const shot = async (name: string) => {
    if (o.shotPrefix) await page.screenshot({ path: `${o.shotPrefix}-${name}.png`, fullPage: true })
  }
  await page.waitForSelector('#report-url')

  // ---- Start state: one row, no "-", "+" enabled.
  check(`[${label}] starts with one report row, no "-" control, "+" enabled, button reads "Fetch report"`, (await rowInputs(page).count()) === 1 && (await removeButtons(page).count()) === 0 && (await addButton(page).isEnabled()) && (await fetchButtonText(page)) === 'Fetch report')

  // ---- Focus ring + token colors on the controls (theme tokens really reach the rendered controls).
  await addButton(page).click()
  check(`[${label}] two rows: every row gets a "-" control (accessible labels "Remove report URL 1/2")`, (await removeButtons(page).count()) === 2 && (await removeButtons(page).nth(0).getAttribute('aria-label')) === 'Remove report URL 1' && (await removeButtons(page).nth(1).getAttribute('aria-label')) === 'Remove report URL 2')
  await rowInputs(page).nth(1).focus()
  let focusedAdd = false
  for (let i = 0; i < 6 && !focusedAdd; i++) {
    await page.keyboard.press('Tab')
    focusedAdd = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Add another report URL')
  }
  const ring = await page.evaluate(() => {
    const cs = getComputedStyle(document.activeElement!)
    return { style: cs.outlineStyle, width: cs.outlineWidth, color: cs.outlineColor }
  })
  const strong = await tokenColor(page, '--border-strong')
  check(`[${label}] "+" is reachable by keyboard and shows a 2px --border-strong focus ring`, focusedAdd && ring.style === 'solid' && ring.width === '2px' && ring.color === strong, JSON.stringify({ focusedAdd, ring, strong }))
  const btn = await page.evaluate(() => {
    const cs = getComputedStyle(document.querySelector('.report-row__btn')!)
    return { color: cs.color, border: cs.borderTopColor }
  })
  check(`[${label}] +/- controls use the theme tokens (label --text, border --border-strong)`, btn.color === (await tokenColor(page, '--text')) && btn.border === strong, JSON.stringify({ btn, text: await tokenColor(page, '--text'), strong }))

  // ---- Grow to the cap of 8.
  for (let i = 2; i < 8; i++) await addButton(page).click()
  const atCap = {
    rows: await rowInputs(page).count(),
    addDisabled: await addButton(page).isDisabled(),
    hint: await page.getByText('Max 8 reports').count(),
    removes: await removeButtons(page).count(),
  }
  check(`[${label}] 8 rows: "+" disabled, "Max 8 reports" hint shown, every row has "-"`, atCap.rows === 8 && atCap.addDisabled && atCap.hint === 1 && atCap.removes === 8, JSON.stringify(atCap))
  const capLayout = await layoutProblems(page)
  check(`[${label}] 8 rows: inside the viewport and the Reports panel, no horizontal scroll, controls >= 44px`, capLayout.length === 0, capLayout.join('; '))
  await shot('8rows')

  // ---- Remove: a row leaves, "+" comes back, and down to one row the "-" controls go away.
  await removeButtons(page).nth(7).click()
  check(`[${label}] removing a row at the cap re-enables "+" and drops the hint`, (await rowInputs(page).count()) === 7 && (await addButton(page).isEnabled()) && (await page.getByText('Max 8 reports').count()) === 0)
  while ((await rowInputs(page).count()) > 1) await removeButtons(page).nth(0).click()
  check(`[${label}] one row left: no "-" control`, (await removeButtons(page).count()) === 0 && (await rowInputs(page).count()) === 1)

  // ---- Duplicate + bad URL + parallel of the remaining: rows raid / raid-again / bogus.
  await addButton(page).click()
  await addButton(page).click()
  const id = reportId(o.raidUrl)
  const raidRequests: string[] = []
  const bogusRequests: string[] = []
  page.on('request', (r) => {
    const u = r.url()
    if (u.includes(`/raidbots/`) && u.includes(encodeURIComponent(id))) raidRequests.push(u)
    if (u.includes('/raidbots/') && u.includes(reportId(o.bogusUrl))) bogusRequests.push(u)
  })
  await rowInputs(page).nth(0).fill(o.raidUrl)
  await rowInputs(page).nth(1).fill(`  HTTPS://WWW.RAIDBOTS.COM/simbot/report/${id}/?utm=1#frag `)
  await rowInputs(page).nth(2).fill(o.bogusUrl)
  await rowInputs(page).nth(1).blur()
  check(`[${label}] leaving a duplicate field shows "Duplicate of row 1" before any fetch (and nothing was fetched)`, (await statusTexts(page))[1] === 'Duplicate of row 1' && raidRequests.length === 0, JSON.stringify(await statusTexts(page)))
  check(`[${label}] three filled rows: the button reads "Fetch all"`, (await fetchButtonText(page)) === 'Fetch all')
  await page.locator('.fetch-button-group button').click()
  await page.waitForFunction(() => document.querySelectorAll('.report-line').length === 1 && ![...document.querySelectorAll('.report-row__status')].some((e) => /Fetching/.test(e.textContent ?? '')), null, { timeout: 60000 })
  const afterDup = await statusTexts(page)
  check(`[${label}] duplicate row is blocked (fetched once), the bad URL fails on its own row, the good row loads`, /^Loaded /.test(afterDup[0]) && afterDup[1] === 'Duplicate of row 1' && afterDup[2] !== '' && !/^Loaded|Fetching/.test(afterDup[2]) && raidRequests.length === 1 && bogusRequests.length === 1, JSON.stringify({ afterDup, raid: raidRequests.length, bogus: bogusRequests.length }))
  const errorColor = await page.evaluate(() => getComputedStyle(document.querySelectorAll('.report-row__status')[1]).color)
  check(`[${label}] a row error renders in the --warn-text token`, errorColor === (await tokenColor(page, '--warn-text')), errorColor)
  await shot('duplicate-and-error')

  // ---- Already loaded: the same report in a row is an error and is not fetched again.
  await rowInputs(page).nth(1).fill(o.raidUrl)
  await rowInputs(page).nth(1).blur()
  await page.locator('.fetch-button-group button').click()
  check(`[${label}] a report already in the panel errors with "Already loaded" and is not fetched again`, (await statusTexts(page))[1] === 'Already loaded' && raidRequests.length === 1 && (await page.locator('.report-line').count()) === 1, JSON.stringify({ s: await statusTexts(page), raid: raidRequests.length }))

  // ---- Removing rows never removes the loaded report.
  while ((await rowInputs(page).count()) > 1) await removeButtons(page).nth(0).click()
  check(`[${label}] removing every extra row leaves the loaded report in the panel`, (await page.locator('.report-line').count()) === 1)

  // ---- Parallel fetch of two real reports (fresh page: nothing loaded).
  await page.reload()
  await page.waitForSelector('#report-url')
  await addButton(page).click()
  const events: Array<{ kind: 'start' | 'end'; url: string; t: number }> = []
  page.on('request', (r) => r.url().includes('/raidbots/') && events.push({ kind: 'start', url: r.url(), t: Date.now() }))
  page.on('requestfinished', (r) => r.url().includes('/raidbots/') && events.push({ kind: 'end', url: r.url(), t: Date.now() }))
  page.on('requestfailed', (r) => r.url().includes('/raidbots/') && events.push({ kind: 'end', url: r.url(), t: Date.now() }))
  await rowInputs(page).nth(0).fill(o.raidUrl)
  await rowInputs(page).nth(1).fill(o.mplusUrl)
  check(`[${label}] two filled rows: the button reads "Fetch all"`, (await fetchButtonText(page)) === 'Fetch all')
  events.length = 0
  await page.locator('.fetch-button-group button').click()
  await page.waitForFunction(() => document.querySelectorAll('.report-line').length === 2, null, { timeout: 60000 })
  const starts = events.filter((e) => e.kind === 'start')
  const firstEnd = Math.min(...events.filter((e) => e.kind === 'end').map((e) => e.t))
  const parallelOk = starts.length === 2 && starts.every((s) => s.t <= firstEnd)
  check(`[${label}] both reports were requested before either finished (parallel fetch)`, parallelOk, JSON.stringify(events.map((e) => [e.kind, e.url.slice(-24), e.t % 100000])))
  const landed = await page.evaluate(() => ({
    titles: [...document.querySelectorAll('.report-line__title')].map((e) => (e.textContent ?? '').trim()),
    status: [...document.querySelectorAll('.report-row__status')].map((e) => (e.textContent ?? '').trim()),
    inputs: [...document.querySelectorAll<HTMLInputElement>('.report-row input')].map((i) => i.value),
  }))
  check(`[${label}] both reports land as their own blocks with per-row "Loaded" status; loaded rows clear their input`, landed.titles.length === 2 && landed.status.every((s) => /^Loaded /.test(s)) && landed.inputs.every((v) => v === ''), JSON.stringify(landed))
  const fetchedLayout = await layoutProblems(page)
  check(`[${label}] after the parallel fetch: rows still inside the viewport and Reports panel`, fetchedLayout.length === 0, fetchedLayout.join('; '))
  await shot('fetched')
}
