import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
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
    expect(buildFooterStamp('v2.14', SHORT, FULL, false)).toEqual({
      versionText: 'v2.14',
      shaText: SHORT,
      commitUrl: `${SOURCE}/commit/${FULL}`,
      sourceUrl: SOURCE,
    })
  })

  it('appends -dirty to the shown sha only; the commit URL still names the commit', () => {
    const stamp = buildFooterStamp('v2.14', SHORT, FULL, true)
    expect(stamp.shaText).toBe(`${SHORT}-dirty`)
    expect(stamp.commitUrl).toBe(`${SOURCE}/commit/${FULL}`)
    expect(stamp.commitUrl).not.toContain('dirty')
  })

  it('has no sha or commit link when the build had no git checkout (dirty or not)', () => {
    for (const dirty of [false, true]) {
      expect(buildFooterStamp('v2.14', '', '', dirty)).toEqual({ versionText: 'v2.14', shaText: null, commitUrl: null, sourceUrl: SOURCE })
    }
    expect(buildFooterStamp('v2.14', '   ', FULL, false).shaText).toBeNull()
  })

  it('trims whitespace around the shas and falls back to the short sha when the full one is missing', () => {
    expect(buildFooterStamp('v2.14', ` ${SHORT}\n`, ` ${FULL}\n`, false)).toMatchObject({ shaText: SHORT, commitUrl: `${SOURCE}/commit/${FULL}` })
    expect(buildFooterStamp('v2.14', SHORT, '', false).commitUrl).toBe(`${SOURCE}/commit/${SHORT}`)
  })
})

describe('build stamp cleanliness', () => {
  it("ignores Vite's temporary config file, which exists (untracked) while a build reads `git status` and would ship every build as -dirty", () => {
    const gitignore = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../.gitignore'), 'utf8')
    expect(gitignore.split(/\r?\n/)).toContain('*.timestamp-*.mjs')
  })
})

describe('Footer version stamp', () => {
  const stampOf = () => container.querySelector('.app-footer__stamp') as HTMLElement
  const links = () => [...stampOf().querySelectorAll('a')]

  it('renders "<version> · <sha> · Source" from the injected version and build info', () => {
    act(() => root.render(createElement(Footer, { version: 'v9.99', build: { sha: SHORT, fullSha: FULL, dirty: false } })))
    expect(stampOf().textContent).toBe(`v9.99 · ${SHORT} · Source`)
    const [commit, source] = links()
    expect(commit.textContent).toBe(SHORT)
    expect(commit.getAttribute('href')).toBe(`${SOURCE}/commit/${FULL}`)
    expect(source.textContent).toBe('Source')
    expect(source.getAttribute('href')).toBe(SOURCE)
  })

  it('opens both links in a new tab with rel="noopener noreferrer" and gives them accessible names that contain the visible text', () => {
    act(() => root.render(createElement(Footer, { version: 'v2.14', build: { sha: SHORT, fullSha: FULL, dirty: false } })))
    expect(links()).toHaveLength(2)
    for (const a of links()) {
      expect(a.getAttribute('target')).toBe('_blank')
      expect(a.getAttribute('rel')).toBe('noopener noreferrer')
      expect(a.getAttribute('aria-label')).toContain(a.textContent)
    }
  })

  it('shows -dirty after the sha and keeps the link on the clean commit', () => {
    act(() => root.render(createElement(Footer, { version: 'v2.14', build: { sha: SHORT, fullSha: FULL, dirty: true } })))
    expect(stampOf().textContent).toBe(`v2.14 · ${SHORT}-dirty · Source`)
    expect(links()[0].getAttribute('href')).toBe(`${SOURCE}/commit/${FULL}`)
  })

  it('without a sha shows "<version> · Source" and only the Source link', () => {
    act(() => root.render(createElement(Footer, { version: 'v2.14', build: { sha: '', fullSha: '', dirty: false } })))
    expect(stampOf().textContent).toBe('v2.14 · Source')
    expect(links().map((a) => a.getAttribute('href'))).toEqual([SOURCE])
  })

  it('the app footer carries the spec version constant (v2.14) and always a Source link', () => {
    act(() => root.render(createElement(App)))
    expect(APP_VERSION).toBe('v2.14')
    const stamp = container.querySelector('.app-footer__stamp') as HTMLElement
    expect(stamp.textContent?.startsWith('v2.14')).toBe(true)
    expect(stamp.textContent?.endsWith('Source')).toBe(true)
    // Not inside a vite build, so no globals were injected: no sha link, and no hand-typed sha anywhere.
    expect([...stamp.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual([SOURCE])
  })
})
