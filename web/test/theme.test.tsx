import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

vi.mock('../src/lib/proxyClient', async (orig) => {
  const actual = await orig<typeof import('../src/lib/proxyClient')>()
  return { ...actual, fetchReport: vi.fn(), fetchTopGear: vi.fn(), fetchLootTable: vi.fn() }
})

import App from '../src/App'
import { DEFAULT_THEME, THEME_OPTIONS, THEME_STORAGE_KEY, applyTheme, loadTheme, parseTheme, saveTheme } from '../src/lib/theme'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset.theme
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.restoreAllMocks()
})

async function renderApp() {
  await act(async () => {
    root.render(createElement(App))
  })
  return container.querySelector('select[aria-label="Theme"]') as HTMLSelectElement
}

describe('theme picker', () => {
  it('renders the three named options, Midnight selected by default, and applies data-theme', async () => {
    const select = await renderApp()
    expect(select).not.toBeNull()
    expect([...select.options].map((o) => o.textContent)).toEqual(['Midnight', 'Felt green', 'Craps red'])
    expect(select.value).toBe('midnight')
    expect(document.documentElement.dataset.theme).toBe('midnight')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull()
  })

  it('has a visible label and the accessible name "Theme"', async () => {
    await renderApp()
    const label = container.querySelector('label.theme-picker')!
    expect(label.textContent).toContain('Theme')
    expect(container.querySelector('select[aria-label="Theme"]')).not.toBeNull()
  })

  it('selecting a theme sets the root attribute and persists it', async () => {
    const select = await renderApp()
    await act(async () => {
      Simulate.change(select, { target: { value: 'green' } as unknown as EventTarget })
    })
    expect(document.documentElement.dataset.theme).toBe('green')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('green')
    await act(async () => {
      Simulate.change(select, { target: { value: 'red' } as unknown as EventTarget })
    })
    expect(document.documentElement.dataset.theme).toBe('red')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('red')
  })

  it('restores a stored choice on load', async () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'red')
    const select = await renderApp()
    expect(select.value).toBe('red')
    expect(document.documentElement.dataset.theme).toBe('red')
  })

  it('falls back to Midnight for an unknown stored value', async () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'chartreuse')
    const select = await renderApp()
    expect(select.value).toBe('midnight')
    expect(document.documentElement.dataset.theme).toBe('midnight')
  })
})

describe('theme helpers', () => {
  it('parseTheme accepts the three ids and falls back to Midnight for anything else', () => {
    expect(THEME_OPTIONS.map((o) => o.id).map(parseTheme)).toEqual(['midnight', 'green', 'red'])
    for (const bad of [null, undefined, '', 'Green', 'navy', 42, {}]) expect(parseTheme(bad)).toBe(DEFAULT_THEME)
  })

  it('loadTheme/saveTheme survive a throwing localStorage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(loadTheme()).toBe('midnight')
    expect(() => saveTheme('green')).not.toThrow()
  })

  it('applyTheme sets the data attribute for every theme', () => {
    for (const id of ['green', 'red', 'midnight'] as const) {
      applyTheme(id)
      expect(document.documentElement.dataset.theme).toBe(id)
    }
  })
})

// Token values transcribed from the Claude Design export's THEMES table (themes-source.js.txt, 2026-09-25) under the
// live token names: page->--bg-base, surface->--bg-panel, card->--bg-panel-alt, raised->--bg-hover, line->--border and
// --border-strong, ink->--text, muted->--text-secondary and --text-muted, gold, gold-hi->--gold-strong, on-gold->--gold-text-on.
const EXPORT_THEMES: Record<string, Record<string, string>> = {
  midnight: {
    '--bg-base': '#06101f',
    '--bg-panel': '#0b1426',
    '--bg-panel-alt': '#0f1a33',
    '--bg-hover': '#1a2748',
    '--border': '#6b7a9c',
    '--border-strong': '#6b7a9c',
    '--text': '#eef1f7',
    '--text-secondary': '#a3afca',
    '--text-muted': '#a3afca',
    '--gold': '#e3b94a',
    '--gold-strong': '#f0c75a',
    '--gold-text-on': '#0b1426',
  },
  green: {
    '--bg-base': '#03140c',
    '--bg-panel': '#082116',
    '--bg-panel-alt': '#0c2c1d',
    '--bg-hover': '#16402c',
    '--border': '#6a9682',
    '--border-strong': '#6a9682',
    '--text': '#f1f5ec',
    '--text-secondary': '#a9c6b4',
    '--text-muted': '#a9c6b4',
    '--gold': '#e3b94a',
    '--gold-strong': '#f0c75a',
    '--gold-text-on': '#082116',
  },
  red: {
    '--bg-base': '#2a0508',
    '--bg-panel': '#3d0810',
    '--bg-panel-alt': '#520b16',
    '--bg-hover': '#6e1220',
    '--border': '#c07880',
    '--border-strong': '#c07880',
    '--text': '#fff3f0',
    '--text-secondary': '#f0c4c4',
    '--text-muted': '#f0c4c4',
    '--gold': '#f0c75a',
    '--gold-strong': '#f8d470',
    '--gold-text-on': '#3d0810',
  },
}

describe('theme.css', () => {
  const css = read('../src/theme.css')
  const block = (selector: string) => {
    const start = css.indexOf(selector + ' {')
    expect(start, selector).toBeGreaterThan(-1)
    const body = css.slice(start, css.indexOf('\n}', start)).replace(/\/\*[\s\S]*?\*\//g, '')
    return Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1], m[2].toLowerCase()]))
  }

  it.each([
    ['midnight', ':root'],
    ['green', ":root[data-theme='green']"],
    ['red', ":root[data-theme='red']"],
  ])('the %s token set equals the export', (id, selector) => {
    const colorTokens = Object.fromEntries(Object.entries(block(selector)).filter(([k]) => k in EXPORT_THEMES[id]))
    expect(colorTokens).toEqual(EXPORT_THEMES[id])
  })

  it('themes override color tokens only', () => {
    for (const id of ['green', 'red']) {
      const start = css.indexOf(":root[data-theme='" + id + "'] {")
      const body = css.slice(start, css.indexOf('\n}', start))
      const names = [...body.matchAll(/(--[\w-]+):/g)].map((m) => m[1])
      expect(names.length).toBe(12)
      for (const n of names) expect(n).toMatch(/^--(bg-|border|text(-secondary|-muted)?$|gold)/)
    }
  })

  it('has no hardcoded colors outside the :root/theme token blocks (charts, badges, banners follow the theme)', () => {
    const rest = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/:root(\[[^\]]*\])? \{[\s\S]*?\n\}/g, '')
    expect(rest.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/g)).toBeNull()
  })

  it('index.html applies the saved theme before first paint with the same key and ids', () => {
    const html = read('../index.html')
    expect(html).toContain(THEME_STORAGE_KEY)
    for (const id of ['green', 'red', 'midnight']) expect(html).toContain("'" + id + "'")
    expect(html.indexOf('<script>')).toBeLessThan(html.indexOf('type="module"'))
  })
})
