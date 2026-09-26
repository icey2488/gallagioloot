import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'
import type { NormalizedItem, NormalizedReport } from '@engine/types'

vi.mock('../src/lib/proxyClient', async (orig) => {
  const actual = await orig<typeof import('../src/lib/proxyClient')>()
  return { ...actual, fetchReport: vi.fn(), fetchTopGear: vi.fn(), fetchLootTable: vi.fn() }
})

import App from '../src/App'
import { fetchLootTable, fetchReport, ProxyRequestError } from '../src/lib/proxyClient'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const RAID_ID = '6PTZ7TjgU8PdxJhZ97bMUa'
const MPLUS_ID = 'a8URThoNZqEXDW3tBtavHq'
const MPLUS2_ID = 'bbbbbbbbbbbbbbbbbbbbbb'
const OTHER_ID = 'zzzzzzzzzzzzzzzzzzzzzz'
const url = (id: string) => `https://www.raidbots.com/simbot/report/${id}`

function item(encounterId: number, encounterName: string, itemId: number, delta: number, instanceId: number): NormalizedItem {
  return { itemId, name: `Item ${itemId}`, encounterId, encounterName, instanceId, ilvl: 334, delta, pct: delta / 1000 }
}

const BASE: Omit<NormalizedReport, 'reportId' | 'difficulty' | 'items' | 'contentType'> = {
  source: 'raidbots',
  character: 'Icemagus',
  realm: 'hyjal',
  region: 'us',
  spec: 'arcane',
  role: 'dps',
  metric: 'dps',
  baseline: 100000,
  warnings: [],
  lootSpecId: 62,
}

const RAID: NormalizedReport = {
  ...BASE,
  reportId: RAID_ID,
  contentType: 'raid',
  difficulty: 'raid-vault-mythic',
  instanceId: 1320,
  instanceName: 'The Venomous Abyss',
  targetKind: 'raid',
  track: { name: 'Myth', upgradeLevel: 6, upgradeMax: 6, upgradeFullName: 'Myth 6/6', atMaxUpgrade: true, simmedIlvl: 334 },
  items: [item(2883, 'The Coiled Altar', 1, 800, 1320), item(2871, 'Sszorak', 2, 600, 1320)],
}

const MPLUS: NormalizedReport = {
  ...BASE,
  reportId: MPLUS_ID,
  contentType: 'dungeon',
  difficulty: 'dungeon-mythic-weekly10',
  instanceId: -1,
  instanceName: 'Mythic+ Dungeons',
  targetKind: 'mplus',
  track: { name: 'Myth', keyLevelMin: 10, dropIlvl: 318, simmedIlvl: 334, upgradeLevel: 6, upgradeMax: 6, upgradeFullName: 'Myth 6/6', atMaxUpgrade: true },
  items: [item(1322, 'Altar of Fangs', 3, 1200, -1), item(1311, 'Den of Nalorakk', 4, 500, -1)],
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  localStorage.clear()
  vi.mocked(fetchReport).mockReset()
  vi.mocked(fetchReport).mockImplementation(async (_source, u) => {
    if (u.includes(RAID_ID)) return RAID
    if (u.includes(MPLUS_ID)) return MPLUS
    return { ...RAID, reportId: OTHER_ID, character: 'Othermage', difficulty: 'raid-vault-heroic' }
  })
  vi.mocked(fetchLootTable).mockRejectedValue(new Error('offline'))
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const inputs = () => [...container.querySelectorAll<HTMLInputElement>('.report-row input')]
const statusLines = () => [...container.querySelectorAll('.report-row__status')].map((e) => e.textContent)
// jsdom's selector engine mis-parses "+" inside quoted attribute values, so match labels directly.
const byLabel = (label: string) => ([...container.querySelectorAll('button')].find((e) => e.getAttribute('aria-label') === label) ?? null) as HTMLButtonElement | null
const addBtn = () => byLabel('Add another report URL')!
const removeBtns = () => [...container.querySelectorAll<HTMLButtonElement>('button')].filter((b) => (b.getAttribute('aria-label') ?? '').startsWith('Remove report URL'))
const fetchBtn = () => [...container.querySelectorAll('button')].find((b) => /Fetch report|Add report|Fetch all|Fetching/.test(b.textContent ?? ''))!
const loadedTitles = () => [...container.querySelectorAll('.report-line__title')].map((e) => e.textContent)

async function render() {
  await act(async () => {
    root.render(createElement(App))
  })
}
async function click(el: Element) {
  await act(async () => {
    Simulate.click(el)
  })
}
async function type(index: number, value: string) {
  await act(async () => {
    Simulate.change(inputs()[index], { target: { value } as unknown as EventTarget })
  })
}
async function blur(index: number) {
  await act(async () => {
    Simulate.blur(inputs()[index])
  })
}
async function addRows(n: number) {
  for (let i = 0; i < n; i++) await click(addBtn())
}

describe('report URL rows: add, remove and cap', () => {
  it('starts with one row, no remove control, an enabled +, and the single-report button', async () => {
    await render()
    expect(inputs()).toHaveLength(1)
    expect(inputs()[0].id).toBe('report-url')
    expect(removeBtns()).toHaveLength(0)
    expect(addBtn().disabled).toBe(false)
    expect(fetchBtn().textContent).toBe('Fetch report')
    expect(container.textContent).toContain('Needs a report URL')
  })

  it('adds rows up to 8, then disables + and shows the hint', async () => {
    await render()
    await addRows(7)
    expect(inputs()).toHaveLength(8)
    expect(addBtn().disabled).toBe(true)
    expect(container.textContent).toContain('Max 8 reports')
    await click(addBtn())
    expect(inputs()).toHaveLength(8)
  })

  it('gives every row a - control once there are 2+, and none when back to one', async () => {
    await render()
    await addRows(2)
    expect(removeBtns().map((b) => b.getAttribute('aria-label'))).toEqual(['Remove report URL 1', 'Remove report URL 2', 'Remove report URL 3'])
    await click(removeBtns()[1])
    expect(inputs()).toHaveLength(2)
    await click(removeBtns()[0])
    expect(inputs()).toHaveLength(1)
    expect(removeBtns()).toHaveLength(0)
  })

  it('re-enables + after dropping below the cap, and removing keeps the other rows text', async () => {
    await render()
    await addRows(7)
    await type(1, url(RAID_ID))
    await type(2, url(MPLUS_ID))
    await click(removeBtns()[1])
    expect(addBtn().disabled).toBe(false)
    expect(container.textContent).not.toContain('Max 8 reports')
    expect(inputs()[1].value).toBe(url(MPLUS_ID))
  })

  it('removing a row never removes an already-loaded report', async () => {
    await render()
    await type(0, url(RAID_ID))
    await click(fetchBtn())
    expect(loadedTitles()).toEqual(['RAID · The Venomous Abyss · Mythic'])
    await addRows(1)
    await click(removeBtns()[0])
    expect(inputs()).toHaveLength(1)
    expect(loadedTitles()).toEqual(['RAID · The Venomous Abyss · Mythic'])
  })
})

describe('report URL rows: fetch all', () => {
  it('reads "Fetch all" once two rows have URLs and ignores empty rows', async () => {
    await render()
    await addRows(2)
    await type(0, url(RAID_ID))
    expect(fetchBtn().textContent).toBe('Fetch report')
    await type(2, url(MPLUS_ID))
    expect(fetchBtn().textContent).toBe('Fetch all')
    await click(fetchBtn())
    expect(vi.mocked(fetchReport)).toHaveBeenCalledTimes(2)
  })

  it('starts every fetch before any finishes (parallel), then lands both reports, one block each, with per-row status', async () => {
    const resolvers: Array<() => void> = []
    vi.mocked(fetchReport).mockImplementation(
      (_source, u) =>
        new Promise((resolve) => {
          resolvers.push(() => resolve(u.includes(RAID_ID) ? RAID : MPLUS))
        })
    )
    await render()
    await addRows(1)
    await type(0, url(RAID_ID))
    await type(1, url(MPLUS_ID))
    await click(fetchBtn())
    expect(vi.mocked(fetchReport)).toHaveBeenCalledTimes(2)
    expect(statusLines()).toEqual(['Fetching…', 'Fetching…'])
    await act(async () => {
      resolvers.reverse().forEach((r) => r())
    })
    expect(loadedTitles()).toEqual(['RAID · The Venomous Abyss · Mythic', 'MYTHIC+ · +10 and above'])
    expect(statusLines()).toEqual(['Loaded The Venomous Abyss · Mythic', 'Loaded Mythic+ (+10 Myth)'])
    // Loaded rows clear their input so the next Fetch does not flag them as already loaded.
    expect(inputs().map((i) => i.value)).toEqual(['', ''])
  })

  it('one bad URL fails on its own row and does not block the other', async () => {
    vi.mocked(fetchReport).mockImplementation(async (_source, u) => {
      if (u.includes(OTHER_ID)) throw new ProxyRequestError('Report not found', 404, 'not_found')
      return RAID
    })
    await render()
    await addRows(1)
    await type(0, url(OTHER_ID))
    await type(1, url(RAID_ID))
    await click(fetchBtn())
    expect(statusLines()).toEqual(['Report not found', 'Loaded The Venomous Abyss · Mythic'])
    expect(loadedTitles()).toEqual(['RAID · The Venomous Abyss · Mythic'])
    expect(inputs()[0].value).toBe(url(OTHER_ID))
  })

  it('a report refused by the set checks shows the refusal on its row and is not added', async () => {
    await render()
    await addRows(1)
    await type(0, url(RAID_ID))
    await type(1, url(OTHER_ID))
    await click(fetchBtn())
    expect(statusLines()[0]).toBe('Loaded The Venomous Abyss · Mythic')
    expect(statusLines()[1]).toContain('This report is for Othermage-hyjal (us), but the loaded reports are for Icemagus-hyjal (us).')
    expect(loadedTitles()).toHaveLength(1)
  })

  it('applies the one-Mythic+-droptimizer rule across rows fetched together', async () => {
    const MPLUS2: NormalizedReport = { ...MPLUS, reportId: MPLUS2_ID }
    vi.mocked(fetchReport).mockImplementation(async (_source, u) => (u.includes(RAID_ID) ? RAID : u.includes(MPLUS_ID) ? MPLUS : MPLUS2))
    await render()
    await addRows(2)
    await type(0, url(MPLUS_ID))
    await type(1, url(MPLUS2_ID))
    await type(2, url(RAID_ID))
    await click(fetchBtn())
    expect(statusLines()[0]).toBe('Loaded Mythic+ (+10 Myth)')
    expect(statusLines()[1]).not.toContain('Loaded')
    expect(statusLines()[2]).toBe('Loaded The Venomous Abyss · Mythic')
    expect(loadedTitles()).toHaveLength(2)
  })

  it('an unrecognized URL errors on its row and is not fetched', async () => {
    await render()
    await addRows(1)
    await type(0, 'not a report')
    await type(1, url(RAID_ID))
    await click(fetchBtn())
    expect(vi.mocked(fetchReport)).toHaveBeenCalledTimes(1)
    expect(statusLines()).toEqual(['Unrecognized report URL', 'Loaded The Venomous Abyss · Mythic'])
  })
})

describe('report URL rows: duplicates block fetching', () => {
  it('flags the later of two rows with the same report, however spelled, and fetches it once', async () => {
    await render()
    await addRows(1)
    await type(0, url(RAID_ID))
    await type(1, `  HTTPS://WWW.RAIDBOTS.COM/reports/${RAID_ID}/?utm=1#x `)
    await click(fetchBtn())
    expect(vi.mocked(fetchReport)).toHaveBeenCalledTimes(1)
    expect(statusLines()[1]).toBe('Duplicate of row 1')
    expect(loadedTitles()).toHaveLength(1)
    expect(inputs()[1].getAttribute('aria-invalid')).toBe('true')
  })

  it('shows the duplicate error when the user leaves the field, before any fetch', async () => {
    await render()
    await addRows(1)
    await type(0, url(RAID_ID))
    await type(1, url(RAID_ID))
    expect(statusLines()[1]).not.toContain('Duplicate')
    await blur(1)
    expect(statusLines()[1]).toBe('Duplicate of row 1')
    expect(vi.mocked(fetchReport)).not.toHaveBeenCalled()
  })

  it('a row whose report is already loaded errors with "Already loaded" and is not fetched', async () => {
    await render()
    await type(0, url(RAID_ID))
    await click(fetchBtn())
    expect(vi.mocked(fetchReport)).toHaveBeenCalledTimes(1)
    await type(0, url(RAID_ID))
    await click(fetchBtn())
    expect(statusLines()[0]).toBe('Already loaded')
    expect(vi.mocked(fetchReport)).toHaveBeenCalledTimes(1)
    expect(loadedTitles()).toHaveLength(1)
  })

  it('editing a flagged row clears its error, and a blocked row does not stop the others', async () => {
    await render()
    await addRows(1)
    await type(0, url(RAID_ID))
    await type(1, url(RAID_ID))
    await blur(1)
    await type(1, url(MPLUS_ID))
    expect(statusLines()[1]).not.toContain('Duplicate')
    await type(1, url(RAID_ID))
    await click(fetchBtn())
    expect(statusLines()).toEqual(['Loaded The Venomous Abyss · Mythic', 'Duplicate of row 1'])
  })
})
