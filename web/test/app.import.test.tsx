import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'
import type { NormalizedReport } from '@engine/types'
import { createState, serialize } from '@engine/core/knockout'

vi.mock('../src/lib/proxyClient', async (orig) => {
  const actual = await orig<typeof import('../src/lib/proxyClient')>()
  return { ...actual, fetchReport: vi.fn(), fetchTopGear: vi.fn(), fetchLootTable: vi.fn() }
})

import App from '../src/App'
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
})

async function loadAndImport(state: object) {
  await act(async () => {
    root.render(createElement(App))
  })
  await act(async () => {
    Simulate.change(container.querySelector('#report-url')!, { target: { value: RAID_URL } as unknown as EventTarget })
  })
  await act(async () => {
    Simulate.click([...container.querySelectorAll('button')].find((b) => /Fetch report/.test(b.textContent ?? ''))!)
  })
  await act(async () => {
    Simulate.change(container.querySelector('textarea[aria-label="Import knockout JSON"]')!, { target: { value: JSON.stringify(state) } as unknown as EventTarget })
  })
  await act(async () => {
    Simulate.click([...container.querySelectorAll('button')].find((b) => b.textContent === 'Import')!)
  })
}

const withRolled = (character: string, realm: string, region: string) => {
  const s = createState(character, 'raid-vault-mythic', realm, region)
  return JSON.parse(serialize({ ...s, entries: [{ itemId: 2, itemName: 'Item 2', encounterId: 2871, receivedAt: '', source: 'manual', state: 'rolled' }] }))
}
const importBox = () => container.querySelector('textarea[aria-label="Import knockout JSON"]') as HTMLTextAreaElement

describe('knockout import checks the character', () => {
  it('same character imports without asking', async () => {
    const confirm = vi.spyOn(window, 'confirm')
    await loadAndImport(withRolled('Icemagus', 'hyjal', 'us'))
    expect(confirm).not.toHaveBeenCalled()
    expect(importBox().value).toBe('')
  })

  it('legacy state with empty region/realm counts as the same character', async () => {
    const confirm = vi.spyOn(window, 'confirm')
    await loadAndImport(withRolled('icemagus', '', ''))
    expect(confirm).not.toHaveBeenCalled()
    expect(importBox().value).toBe('')
  })

  it('another character asks; declining refuses and keeps the text', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await loadAndImport(withRolled('Otherchar', 'hyjal', 'us'))
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(confirm.mock.calls[0][0]).toContain('Otherchar (hyjal-us)')
    expect(container.textContent).toContain('Not imported: the state is for Otherchar (hyjal-us), not Icemagus (hyjal-us).')
    expect(importBox().value).not.toBe('')
  })

  it('another character, confirmed, imports onto the loaded character', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await loadAndImport(withRolled('Icemagus', 'stormrage', 'us'))
    expect(importBox().value).toBe('')
    expect(container.textContent).not.toContain('Not imported')
  })
})
