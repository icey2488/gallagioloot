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
import { fetchLootTable, fetchReport } from '../src/lib/proxyClient'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const RAID_URL = 'https://www.raidbots.com/simbot/report/6PTZ7TjgU8PdxJhZ97bMUa'
const MPLUS_URL = 'https://www.raidbots.com/simbot/report/a8URThoNZqEXDW3tBtavHq'

function item(encounterId: number, encounterName: string, itemId: number, delta: number, instanceId: number, ilvl = 334): NormalizedItem {
  return { itemId, name: `Item ${itemId}`, encounterId, encounterName, instanceId, ilvl, delta, pct: delta / 1000 }
}

const BASE = {
  source: 'raidbots' as const,
  character: 'Icemagus',
  realm: 'hyjal',
  region: 'us',
  spec: 'arcane',
  role: 'dps' as const,
  metric: 'dps' as const,
  baseline: 572816.6,
  warnings: [] as string[],
  lootSpecId: 62,
}

const TRACK = { name: 'Myth', upgradeLevel: 6, upgradeMax: 6, upgradeFullName: 'Myth 6/6', atMaxUpgrade: true, simmedIlvl: 334, upgradeLabelsByIlvl: { '334': 'Myth 6/6', '344': 'Myth 9/6' } }

const RAID: NormalizedReport = {
  ...BASE,
  reportId: '6PTZ7TjgU8PdxJhZ97bMUa',
  contentType: 'raid',
  difficulty: 'raid-vault-mythic',
  instanceId: 1320,
  instanceName: 'The Venomous Abyss',
  targetKind: 'raid',
  simmedAt: '2026-09-22T12:00:00.000Z',
  track: TRACK,
  items: [
    item(2871, 'Sszorak', 2, 600 * 5.728, 1320),
    item(2874, 'Entombed Sentinels', 5, 500 * 5.728, 1320),
    item(2883, 'The Coiled Altar', 1, 800 * 5.728, 1320, 344),
    item(2895, "Ula'tek", 6, 900 * 5.728, 1320, 344),
  ],
}

const MPLUS: NormalizedReport = {
  ...BASE,
  baseline: 572918.2,
  reportId: 'a8URThoNZqEXDW3tBtavHq',
  contentType: 'dungeon',
  difficulty: 'dungeon-mythic-weekly10',
  instanceId: -1,
  instanceName: 'Mythic+ Dungeons',
  targetKind: 'mplus',
  simmedAt: '2026-09-24T12:00:00.000Z',
  track: { ...TRACK, keyLevelMin: 10, dropIlvl: 318, upgradeLabelsByIlvl: { '334': 'Myth 6/6' } },
  items: [item(1322, 'Altar of Fangs', 3, 700 * 5.728, -1), item(1311, 'Den of Nalorakk', 4, 300 * 5.728, -1)],
}

let container: HTMLDivElement
let root: Root
let reports: Record<string, NormalizedReport>

beforeEach(() => {
  localStorage.clear()
  reports = { '6PTZ7': RAID, a8URT: MPLUS }
  vi.mocked(fetchReport).mockImplementation(async (_source, url) => (url.includes('6PTZ7') ? reports['6PTZ7'] : reports.a8URT))
  vi.mocked(fetchLootTable).mockRejectedValue(new Error('offline'))
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

async function renderApp() {
  await act(async () => {
    root.render(createElement(App))
  })
}

async function addReport(url: string) {
  const input = container.querySelector('#report-url') as HTMLInputElement
  await act(async () => {
    Simulate.change(input, { target: { value: url } as unknown as EventTarget })
  })
  const button = [...container.querySelectorAll('button')].find((b) => /Fetch report|Add report/.test(b.textContent ?? ''))!
  await act(async () => {
    Simulate.click(button)
  })
}

const blocks = () => [...container.querySelectorAll('.report-line')]
const lines = (block: Element) => ({
  heading: block.querySelector('.report-line__title')?.textContent,
  drops: block.querySelector('.report-line__drops')?.textContent,
  stats: block.querySelector('.report-line__stats')?.textContent,
})
const summary = () => container.querySelector('.reports-summary')

describe('Reports panel: one compact block per report', () => {
  it('raid block: heading, the most common drop with the 344 exception by boss, then items / bosses / baseline / sim date', async () => {
    await renderApp()
    await addReport(RAID_URL)
    expect(lines(blocks()[0])).toEqual({
      heading: 'RAID · The Venomous Abyss · Mythic',
      drops: "Drops Myth 6/6 (334) · The Coiled Altar, Ula'tek Myth 9/6 (344)",
      stats: '4 items · 4 bosses · baseline 572,817 · simmed Sep 22',
    })
    expect(blocks()[0].querySelector('.report-line__remove')?.textContent).toBe('Remove')
    // The old parse lines are gone.
    expect(container.textContent).not.toContain('items parsed')
    expect(container.textContent).not.toContain('Reconcile:')
  })

  it('Mythic+ block: key level heading, dungeons on the drop line, no boss count, its own sim date', async () => {
    await renderApp()
    await addReport(RAID_URL)
    await addReport(MPLUS_URL)
    expect(blocks()).toHaveLength(2)
    expect(lines(blocks()[1])).toEqual({
      heading: 'MYTHIC+ · +10 and above',
      drops: 'Drops Myth 6/6 (334) · 2 dungeons',
      stats: '2 items · baseline 572,918 · simmed Sep 24',
    })
  })

  it('leaves the sim date off when the report has none', async () => {
    reports['6PTZ7'] = { ...RAID, simmedAt: undefined }
    await renderApp()
    await addReport(RAID_URL)
    expect(lines(blocks()[0]).stats).toBe('4 items · 4 bosses · baseline 572,817')
  })

  it('collapses warnings under an "N notes" toggle, closed by default', async () => {
    reports['6PTZ7'] = { ...RAID, warnings: ['Trash Drop entries removed (4)', 'Simmed at Myth 3/6, not Myth 6/6.'] }
    await renderApp()
    await addReport(RAID_URL)
    const details = blocks()[0].querySelector('details.report-notes') as HTMLDetailsElement
    expect(details.querySelector('summary')?.textContent).toBe('2 notes')
    expect(details.open).toBe(false)
    expect([...details.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['Trash Drop entries removed (4)', 'Simmed at Myth 3/6, not Myth 6/6.'])
    expect(blocks()[0].querySelector('.warning-banner')).toBeNull()
  })

  it('says "1 note" for a single note and shows no toggle when there are none', async () => {
    reports['6PTZ7'] = { ...RAID, warnings: ['one thing'] }
    await renderApp()
    await addReport(RAID_URL)
    expect(blocks()[0].querySelector('summary')?.textContent).toBe('1 note')
    reports['6PTZ7'] = { ...RAID, warnings: [] }
    await act(async () => {
      root.unmount()
    })
    root = createRoot(container)
    await renderApp()
    await addReport(RAID_URL)
    expect(blocks()[0].querySelector('details')).toBeNull()
  })

  it('opens the notes automatically only for an error (a report with no bosses matched)', async () => {
    reports['6PTZ7'] = { ...RAID, items: [], warnings: ['0 items'] }
    await renderApp()
    await addReport(RAID_URL)
    const details = blocks()[0].querySelector('details.report-notes') as HTMLDetailsElement
    expect(details.open).toBe(true)
    expect(details.querySelector('.report-notes__error')?.textContent).toContain('No items matched')
  })
})

describe('Reports panel: Voidcores on hand and the next Voidcore', () => {
  const voidcoresInput = () => container.querySelector('#voidcores-on-hand') as HTMLInputElement
  const nextText = () => container.querySelector('.reports-summary__next')?.textContent ?? ''

  it('is shown once above the blocks, only when a report is loaded', async () => {
    await renderApp()
    expect(summary()).toBeNull()
    await addReport(RAID_URL)
    await addReport(MPLUS_URL)
    expect(container.querySelectorAll('.reports-summary')).toHaveLength(1)
    expect(summary()!.compareDocumentPosition(container.querySelector('.report-list')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(summary()!.textContent).toContain('Voidcores on hand:')
  })

  it('Voidcores on hand mirrors the Voidcores held setting in both directions', async () => {
    await renderApp()
    await addReport(RAID_URL)
    const held = container.querySelector('input[aria-label="Voidcores held"]') as HTMLInputElement
    expect(voidcoresInput().value).toBe('0')
    await act(async () => {
      Simulate.change(voidcoresInput(), { target: { value: '3' } as unknown as EventTarget })
    })
    expect(held.value).toBe('3')
    await act(async () => {
      Simulate.change(held, { target: { value: '5' } as unknown as EventTarget })
    })
    expect(voidcoresInput().value).toBe('5')
    expect((container.querySelector('input[aria-label="Voidcore count"]') as HTMLInputElement).value).toBe('5')
  })

  it('raid only: the next Voidcore is the (N+1)th best distinct boss at its EV, and runs out when every boss has a roll', async () => {
    await renderApp()
    await addReport(RAID_URL)
    // Bosses: Ula'tek 0.90%, Coiled Altar 0.80%, Sszorak 0.60%, Entombed 0.50%; one roll available.
    expect(nextText()).toContain('Next Voidcore worth ~0.80%')
    expect(nextText()).toContain("roll 2 goes to The Coiled Altar (Mythic)")

    const rolls = container.querySelector('#rolls-available') as HTMLSelectElement
    await act(async () => {
      Simulate.change(rolls, { target: { value: '2' } as unknown as EventTarget })
    })
    expect(nextText()).toContain('Next Voidcore worth ~0.60%')
    expect(nextText()).toContain('roll 3 goes to Sszorak')
  })

  it('reports no target left when every rollable boss already holds a roll', async () => {
    reports['6PTZ7'] = { ...RAID, items: [item(2871, 'Sszorak', 2, 600 * 5.728, 1320)] }
    await renderApp()
    await addReport(RAID_URL)
    expect(nextText()).toBe('No target left for another roll this week')
  })

  it('Mythic+ repeats: with a dungeon that outranks the raid, the next Voidcore is another roll on it', async () => {
    reports.a8URT = { ...MPLUS, items: [item(1322, 'Altar of Fangs', 3, 2000 * 5.728, -1)] }
    await renderApp()
    await addReport(RAID_URL)
    await addReport(MPLUS_URL)
    expect(nextText()).toContain('Next Voidcore worth ~2.00%')
    expect(nextText()).toContain('Altar of Fangs (+10 (Myth))')
  })

  it('is hidden while the report set has an error (pricing is paused)', async () => {
    await renderApp()
    await addReport(RAID_URL)
    await addReport(MPLUS_URL)
    expect(nextText()).toContain('Next Voidcore worth')
    // The two baselines differ by ~0.02%; refusing any drift puts the loaded set in error.
    await act(async () => {
      Simulate.change(container.querySelector('#drift-refuse')!, { target: { value: '0' } as unknown as EventTarget })
    })
    expect(container.textContent).toContain('Pricing is paused')
    expect(container.querySelector('.reports-summary__next')).toBeNull()
    expect(voidcoresInput()).not.toBeNull()
  })
})
