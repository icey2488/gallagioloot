// v2.14/v2.15 footer version stamp ("v2.15 · <short sha> · Source · License"): the browser checks shared by the local screenshot harness
// (single-page-shots.mts, against `vite preview` of the last build) and the live smoke check (live-single-page-check.mts, against
// the deployed site). The page must already be loaded with the theme set. Each call reads the stamp and asserts its text, that the
// sha is the commit under test (never hand-typed), the hrefs / new-tab / rel, accessible names, the theme tokens on the text,
// links and rule, the keyboard focus ring, target size, and that it fits inside the footer and the viewport.
import type { Page } from 'playwright'
import { execFileSync } from 'node:child_process'
import { APP_VERSION } from '../src/lib/buildInfo'

export type Check = (label: string, ok: boolean, detail?: string) => void

export const SOURCE_URL = 'https://github.com/icey2488/gallagioloot'
export const LICENSE_URL = `${SOURCE_URL}/blob/main/LICENSE`

/** The commit the working copy is on, straight from git (the deployed / built stamp must name this). */
export function currentCommit(): { sha: string; fullSha: string } {
  const git = (args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim()
  return { sha: git(['rev-parse', '--short', 'HEAD']), fullSha: git(['rev-parse', 'HEAD']) }
}

export type StampChecksOptions = {
  label: string
  check: Check
  expected: { sha: string; fullSha: string }
  /** Local screenshot runs build first and then rewrite tracked screenshots, so "-dirty" is tolerated there; a deployed site must never be dirty. */
  allowDirty: boolean
  /** Screenshot path of the footer element (".png" included); omitted = none. */
  shot?: string
}

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
    [token, property] as const,
  )
}

export async function runFooterStampChecks(page: Page, opts: StampChecksOptions) {
  const { label, check, expected, allowDirty } = opts
  const stampLoc = page.locator('.app-footer__stamp')
  await stampLoc.waitFor({ state: 'attached', timeout: 30000 })
  await stampLoc.scrollIntoViewIfNeeded()

  const stamp = await page.evaluate(() => {
    const el = document.querySelector('.app-footer__stamp') as HTMLElement
    const footer = document.querySelector('.app-footer') as HTMLElement
    const sr = el.getBoundingClientRect()
    const fr = footer.getBoundingClientRect()
    const links = [...el.querySelectorAll('a')].map((a) => {
      const r = a.getBoundingClientRect()
      const cs = getComputedStyle(a)
      return { text: (a.textContent ?? '').trim(), href: a.getAttribute('href'), target: a.getAttribute('target'), rel: a.getAttribute('rel'), aria: a.getAttribute('aria-label'), color: cs.color, height: r.height, width: r.width, left: r.left, right: r.right, top: r.top }
    })
    const cs = getComputedStyle(el)
    return {
      text: (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
      links,
      color: cs.color,
      ruleColor: cs.borderTopColor,
      ruleStyle: cs.borderTopStyle,
      tabular: cs.fontVariantNumeric,
      insideFooter: sr.left >= fr.left - 0.5 && sr.right <= fr.right + 0.5,
      insideViewport: sr.left >= -0.5 && sr.right <= innerWidth + 0.5,
      docFits: document.documentElement.scrollWidth <= innerWidth,
      vw: innerWidth,
      inFooter: !!el.closest('footer.app-footer'),
    }
  })

  const [commitLink, sourceLink, licenseLink] = stamp.links
  const shaShown = commitLink?.text ?? ''
  const shaOnly = shaShown.replace(/-dirty$/, '')
  const dirtyShown = shaShown.endsWith('-dirty')

  check(`[${label}] footer stamp is inside the existing footer and reads "${APP_VERSION} · <sha> · Source · License"`, stamp.inFooter && stamp.links.length === 3 && stamp.text === `${APP_VERSION} · ${shaShown} · Source · License`, stamp.text)
  check(`[${label}] footer stamp version is ${APP_VERSION}`, stamp.text.startsWith(`${APP_VERSION} · `), stamp.text)
  check(`[${label}] footer stamp sha ${shaOnly} equals the commit under test ${expected.sha}`, shaOnly === expected.sha, `shown ${shaShown}, git ${expected.sha}`)
  check(`[${label}] footer stamp is ${allowDirty ? 'clean or -dirty' : 'clean (no -dirty)'}`, allowDirty || !dirtyShown, shaShown)
  check(`[${label}] sha links to the full commit ${SOURCE_URL}/commit/${expected.fullSha.slice(0, 7)}...`, commitLink?.href === `${SOURCE_URL}/commit/${expected.fullSha}`, String(commitLink?.href))
  check(`[${label}] "Source" links to ${SOURCE_URL}`, sourceLink?.text === 'Source' && sourceLink.href === SOURCE_URL, JSON.stringify(sourceLink))
  check(`[${label}] "License" links to ${LICENSE_URL}`, licenseLink?.text === 'License' && licenseLink.href === LICENSE_URL, JSON.stringify(licenseLink))
  check(`[${label}] all three links open in a new tab with rel="noopener noreferrer"`, stamp.links.every((l) => l.target === '_blank' && l.rel === 'noopener noreferrer'), JSON.stringify(stamp.links.map((l) => [l.target, l.rel])))
  check(`[${label}] all three links have accessible names that contain their visible text (License: "License on GitHub (opens in a new tab)")`, stamp.links.every((l) => !!l.aria && l.aria.includes(l.text)) && licenseLink?.aria === 'License on GitHub (opens in a new tab)' && (await page.getByRole('link', { name: /^Commit .* on GitHub/ }).count()) === 1 && (await page.getByRole('link', { name: /^Source code on GitHub/ }).count()) === 1 && (await page.getByRole('link', { name: 'License on GitHub (opens in a new tab)' }).count()) === 1, JSON.stringify(stamp.links.map((l) => l.aria)))

  const [muted, secondary, border, strong] = [await tokenColor(page, '--text-muted'), await tokenColor(page, '--text-secondary'), await tokenColor(page, '--border', 'borderTopColor'), await tokenColor(page, '--border-strong')]
  check(`[${label}] stamp uses theme tokens (text --text-muted, links --text-secondary, rule --border)`, stamp.color === muted && stamp.links.every((l) => l.color === secondary) && stamp.ruleColor === border && stamp.ruleStyle === 'solid', JSON.stringify({ stamp: stamp.color, muted, links: stamp.links.map((l) => l.color), secondary, rule: stamp.ruleColor, border }))
  check(`[${label}] stamp fits: inside the footer and the viewport, no horizontal scroll`, stamp.insideFooter && stamp.insideViewport && stamp.docFits && stamp.links.every((l) => l.left >= -0.5 && l.right <= stamp.vw + 0.5), JSON.stringify(stamp))
  check(`[${label}] stamp links (incl. License) are at least 24px tall and wide (WCAG 2.2 target size), and do not overlap`, stamp.links.every((l) => l.height >= 24 && l.width >= 24) && (stamp.links.length < 2 || stamp.links.every((l, i) => i === 0 || l.left >= stamp.links[i - 1].right - 0.5 || l.top !== stamp.links[i - 1].top)), JSON.stringify(stamp.links.map((l) => l.height)))
  check(`[${label}] stamp keeps tabular figures`, stamp.tabular.includes('tabular-nums'), stamp.tabular)

  if (opts.shot) await page.locator('.app-footer').screenshot({ path: opts.shot })

  // Keyboard: Tab reaches the links in order (sha, Source, then License) and each shows the 2px --border-strong focus ring.
  await page.locator('.app-footer__assumptions summary').focus()
  const ring: Array<{ name: string | null; style: string; width: string; color: string }> = []
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Tab')
    ring.push(
      await page.evaluate(() => {
        const a = document.activeElement as HTMLElement
        const cs = getComputedStyle(a)
        return { name: a.getAttribute('aria-label'), style: cs.outlineStyle, width: cs.outlineWidth, color: cs.outlineColor }
      }),
    )
  }
  check(
    `[${label}] Tab reaches the sha link, then Source, then License, each with a 2px --border-strong focus ring`,
    !!ring[0].name?.startsWith('Commit ') && !!ring[1].name?.startsWith('Source code') && ring[2].name === 'License on GitHub (opens in a new tab)' && ring.every((r) => r.style === 'solid' && r.width === '2px' && r.color === strong),
    JSON.stringify({ ring, strong }),
  )
}
