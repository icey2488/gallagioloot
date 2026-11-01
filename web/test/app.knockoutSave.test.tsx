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
import { fetchLootTable, fetchReport } from '../src/lib/proxyClient'
import { LocalStorageAdapter, resetMemoryStorage } from '../src/lib/storage'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const RAID_URL = 'https://www.raidbots.com/simbot/report/6PTZ7TjgU8PdxJhZ97bMUa'
const RAID: NormalizedReport = {
  source: 'raidbots', reportId: '6PTZ7TjgU8PdxJhZ97bMUa', character: 'Icemagus', realm: 'hyjal', region: 'us', spec: 'arcane', role: 'dps', metric: 'dps',
  baseline: 572816.6, warnings: [], lootSpecId: 62, contentType: 'raid', difficulty: 'raid-vault-mythic', instanceId: 1320, instanceName: 'The Venomous Abyss', targetKind: 'raid',
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
})

async function load() {
  await act(async () => {
    root.render(createElement(App))
  })
  await act(async () => {
    Simulate.change(container.querySelector('#report-url')!, { target: { value: RAID_URL } as unknown as EventTarget })
  })
  await act(async () => {
    Simulate.click([...container.querySelectorAll('button')].find((b) => /Fetch report/.test(b.textContent ?? ''))!)
  })
}

describe('knockout states are saved only when they change', () => {
  it('a new character is saved once; settings changes do not re-save it', async () => {
    const save = vi.spyOn(LocalStorageAdapter.prototype, 'save')
    await load()
    expect(save).toHaveBeenCalledTimes(1)
    await act(async () => {
      Simulate.change(container.querySelector('#threshold')!, { target: { value: '0.5' } as unknown as EventTarget })
    })
    await act(async () => {
      Simulate.change(container.querySelector('#voidcores-on-hand')!, { target: { value: '3' } as unknown as EventTarget })
    })
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('a stored state that is unchanged is not written back on load', async () => {
    await load()
    act(() => root.unmount())
    root = createRoot(container)
    const save = vi.spyOn(LocalStorageAdapter.prototype, 'save')
    await load()
    expect(save).not.toHaveBeenCalled()
  })
})
