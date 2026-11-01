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
import { ErrorBoundary } from '../src/components/ErrorBoundary'
import { fetchLootTable, fetchReport } from '../src/lib/proxyClient'
import { resetMemoryStorage } from '../src/lib/storage'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const RAID_URL = 'https://www.raidbots.com/simbot/report/6PTZ7TjgU8PdxJhZ97bMUa'
const RAID: NormalizedReport = {
  source: 'raidbots',
  reportId: '6PTZ7TjgU8PdxJhZ97bMUa',
  character: 'Icemagus',
  realm: 'hyjal',
  region: 'us',
  spec: 'arcane',
  role: 'dps',
  metric: 'dps',
  baseline: 572816.6,
  warnings: [],
  lootSpecId: 62,
  contentType: 'raid',
  difficulty: 'raid-vault-mythic',
  instanceId: 1320,
  instanceName: 'The Venomous Abyss',
  targetKind: 'raid',
  items: [{ itemId: 2, name: 'Item 2', encounterId: 2871, encounterName: 'Sszorak', instanceId: 1320, ilvl: 334, delta: 3000, pct: 3 }],
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  localStorage.clear()
  resetMemoryStorage()
  vi.mocked(fetchReport).mockResolvedValue(RAID)
  vi.mocked(fetchLootTable).mockRejectedValue(new Error('offline'))
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.restoreAllMocks()
  resetMemoryStorage()
})

describe('App with blocked localStorage', () => {
  it('still loads a report (storage errors never block the load)', async () => {
    const proto = Object.getPrototypeOf(localStorage) as Storage
    for (const m of ['getItem', 'setItem', 'removeItem', 'key'] as const) {
      vi.spyOn(proto, m).mockImplementation(() => {
        throw new DOMException('denied', 'SecurityError')
      })
    }
    await act(async () => {
      root.render(createElement(App))
    })
    const input = container.querySelector('#report-url') as HTMLInputElement
    await act(async () => {
      Simulate.change(input, { target: { value: RAID_URL } as unknown as EventTarget })
    })
    const button = [...container.querySelectorAll('button')].find((b) => /Fetch report/.test(b.textContent ?? ''))!
    await act(async () => {
      Simulate.click(button)
    })
    expect(container.querySelectorAll('.report-line')).toHaveLength(1)
    expect(container.textContent).toContain('Loaded The Venomous Abyss')
  })
})

describe('ErrorBoundary', () => {
  it('shows a fallback instead of a blank page when a child throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    function Boom(): never {
      throw new Error('boom')
    }
    await act(async () => {
      root.render(createElement(ErrorBoundary, null, createElement(Boom)))
    })
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Something went wrong')
    expect(container.querySelector('button')?.textContent).toBe('Reload')
  })
})
