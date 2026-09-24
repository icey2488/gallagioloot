import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'
import type { NormalizedReport } from '@engine/types'

vi.mock('../src/lib/proxyClient', async (orig) => {
  const actual = await orig<typeof import('../src/lib/proxyClient')>()
  return { ...actual, fetchReport: vi.fn(), fetchTopGear: vi.fn(), fetchLootTable: vi.fn() }
})

import App from '../src/App'
import { fetchReport } from '../src/lib/proxyClient'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const REPORT: NormalizedReport = {
  source: 'raidbots',
  reportId: 'abc',
  character: 'Icemagus',
  realm: 'hyjal',
  region: 'us',
  spec: 'arcane',
  role: 'dps',
  metric: 'dps',
  contentType: 'raid',
  difficulty: 'raid-vault-mythic',
  baseline: 1000,
  items: [],
  warnings: [],
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  localStorage.clear()
  vi.mocked(fetchReport).mockResolvedValue(REPORT)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('character switcher on first visit', () => {
  it('lists the current character right after the first report loads, with no further interaction', async () => {
    await act(async () => {
      root.render(createElement(App))
    })
    const input = container.querySelector('#report-url') as HTMLInputElement
    await act(async () => {
      Simulate.change(input, { target: { value: 'https://www.raidbots.com/simbot/report/6PTZ7TjgU8PdxJhZ97bMUa' } as unknown as EventTarget })
    })
    const fetchBtn = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Fetch report'))!
    await act(async () => {
      Simulate.click(fetchBtn)
    })
    const select = container.querySelector('select[aria-label="Switch character"]') as HTMLSelectElement | null
    expect(select).not.toBeNull()
    expect([...select!.options].map((o) => o.value)).toContain('us:hyjal:icemagus:raid-vault-mythic')
  })
})
