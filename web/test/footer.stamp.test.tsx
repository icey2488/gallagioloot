import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'

vi.mock('../src/lib/proxyClient', async (orig) => {
  const actual = await orig<typeof import('../src/lib/proxyClient')>()
  return { ...actual, fetchReport: vi.fn(), fetchTopGear: vi.fn(), fetchLootTable: vi.fn() }
})

import App from '../src/App'
import { Footer } from '../src/components/Footer'
import { APP_VERSION, buildFooterStamp } from '../src/lib/buildInfo'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const SOURCE = 'https://github.com/icey2488/gallagioloot'
const LICENSE_URL = `${SOURCE}/blob/main/LICENSE`
const SHORT = 'abc1234'
const FULL = 'abc1234def5678abc1234def5678abc1234def5'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  localStorage.clear()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('buildFooterStamp', () => {
  it('builds the version text, sha text and both URLs from the full sha', () => {
    expect(buildFooterStamp('v2.15', SHORT, FULL, false)).toEqual({
      versionText: 'v2.15',
      shaText: SHORT,
      commitUrl: `${SOURCE}/commit/${FULL}`,
      sourceUrl: SOURCE,
      licenseUrl: LICENSE_URL,
    })
  })

  it('appends -dirty to the shown sha only; the commit URL still names the commit', () => {
    const stamp = buildFooterStamp('v2.15', SHORT, FULL, true)
    expect(stamp.shaText).toBe(`${SHORT}-dirty`)
    expect(stamp.commitUrl).toBe(`${SOURCE}/commit/${FULL}`)
    expect(stamp.commitUrl).not.toContain('dirty')
  })

  it('has no sha or commit link when the build had no git checkout (dirty or not)', () => {
    for (const dirty of [false, true]) {
      expect(buildFooterStamp('v2.15', '', '', dirty)).toEqual({ versionText: 'v2.15', shaText: null, commitUrl: null, sourceUrl: SOURCE, licenseUrl: LICENSE_URL })
    }
    expect(buildFooterStamp('v2.15', '   ', FULL, false).shaText).toBeNull()
  })

  it('trims whitespace around the shas and falls back to the short sha when the full one is missing', () => {
    expect(buildFooterStamp('v2.15', ` ${SHORT}\n`, ` ${FULL}\n`, false)).toMatchObject({ shaText: SHORT, commitUrl: `${SOURCE}/commit/${FULL}` })
    expect(buildFooterStamp('v2.15', SHORT, '', false).commitUrl).toBe(`${SOURCE}/commit/${SHORT}`)
  })
})

describe('build stamp cleanliness', () => {
  it("ignores Vite's temporary config file, which exists (untracked) while a build reads `git status` and would ship every build as -dirty", () => {
    const gitignore = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../.gitignore'), 'utf8')
    expect(gitignore.split(/\r?\n/)).toContain('*.timestamp-*.mjs')
  })
})

describe('LICENSE file', () => {
  const licensePath = resolve(dirname(fileURLToPath(import.meta.url)), '../../LICENSE')

  it('exists at the repo root and opens with the all-rights-reserved line', () => {
    expect(existsSync(licensePath)).toBe(true)
    expect(readFileSync(licensePath, 'utf8').startsWith('GallagioLoot. Copyright (c) 2026 icey2488. All rights reserved.')).toBe(true)
  })

  it('both package.json files point at it and stay private, so nothing implies an open-source grant', () => {
    for (const rel of ['../../package.json', '../package.json']) {
      const pkg = JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), rel), 'utf8'))
      expect(pkg.license).toBe('SEE LICENSE IN LICENSE')
      expect(pkg.private).toBe(true)
    }
  })
})

describe('Footer version stamp', () => {
  const stampOf = () => container.querySelector('.app-footer__stamp') as HTMLElement
  const links = () => [...stampOf().querySelectorAll('a')]

  it('renders "<version> · <sha> · Source" from the injected version and build info', () => {
    act(() => root.render(createElement(Footer, { version: 'v9.99', build: { sha: SHORT, fullSha: FULL, dirty: false } })))
    expect(stampOf().textContent).toBe(`v9.99 · ${SHORT} · Source · License`)
    const [commit, source, license] = links()
    expect(commit.textContent).toBe(SHORT)
    expect(commit.getAttribute('href')).toBe(`${SOURCE}/commit/${FULL}`)
    expect(source.textContent).toBe('Source')
    expect(source.getAttribute('href')).toBe(SOURCE)
    expect(license.textContent).toBe('License')
    expect(license.getAttribute('href')).toBe(LICENSE_URL)
  })

  it('opens all three links in a new tab with rel="noopener noreferrer" and gives them accessible names that contain the visible text', () => {
    act(() => root.render(createElement(Footer, { version: 'v2.15', build: { sha: SHORT, fullSha: FULL, dirty: false } })))
    expect(links()).toHaveLength(3)
    for (const a of links()) {
      expect(a.getAttribute('target')).toBe('_blank')
      expect(a.getAttribute('rel')).toBe('noopener noreferrer')
      expect(a.getAttribute('aria-label')).toContain(a.textContent)
    }
  })

  it('gives the License link its own accessible name and points it at LICENSE on main', () => {
    act(() => root.render(createElement(Footer, { version: 'v2.15', build: { sha: SHORT, fullSha: FULL, dirty: false } })))
    const license = links()[2]
    expect(license.getAttribute('href')).toBe('https://github.com/icey2488/gallagioloot/blob/main/LICENSE')
    expect(license.getAttribute('target')).toBe('_blank')
    expect(license.getAttribute('rel')).toBe('noopener noreferrer')
    expect(license.getAttribute('aria-label')).toBe('License on GitHub (opens in a new tab)')
  })

  it('shows -dirty after the sha and keeps the link on the clean commit', () => {
    act(() => root.render(createElement(Footer, { version: 'v2.15', build: { sha: SHORT, fullSha: FULL, dirty: true } })))
    expect(stampOf().textContent).toBe(`v2.15 · ${SHORT}-dirty · Source · License`)
    expect(links()[0].getAttribute('href')).toBe(`${SOURCE}/commit/${FULL}`)
  })

  it('without a sha shows "<version> · Source" and only the Source link', () => {
    act(() => root.render(createElement(Footer, { version: 'v2.15', build: { sha: '', fullSha: '', dirty: false } })))
    expect(stampOf().textContent).toBe('v2.15 · Source · License')
    expect(links().map((a) => a.getAttribute('href'))).toEqual([SOURCE, LICENSE_URL])
  })

  it('the app footer carries the spec version constant (v2.15) and always the Source and License links', () => {
    act(() => root.render(createElement(App)))
    expect(APP_VERSION).toBe('v2.15')
    const stamp = container.querySelector('.app-footer__stamp') as HTMLElement
    expect(stamp.textContent?.startsWith('v2.15')).toBe(true)
    expect(stamp.textContent?.endsWith('Source · License')).toBe(true)
    // Not inside a vite build, so no globals were injected: no sha link, and no hand-typed sha anywhere.
    expect([...stamp.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual([SOURCE, LICENSE_URL])
  })
})
