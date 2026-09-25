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
import { loadReportSet, saveReportSet } from '../src/lib/storage'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const RAID_URL = 'https://www.raidbots.com/simbot/report/6PTZ7TjgU8PdxJhZ97bMUa'
const MPLUS_URL = 'https://www.raidbots.com/simbot/report/a8URThoNZqEXDW3tBtavHq'
const OTHER_URL = 'https://www.raidbots.com/simbot/report/zzzzzzzzzzzzzzzzzzzzzz'

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
  reportId: '6PTZ7TjgU8PdxJhZ97bMUa',
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
  reportId: 'a8URThoNZqEXDW3tBtavHq',
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
  vi.mocked(fetchReport).mockImplementation(async (_source, url) => {
    if (url.includes('6PTZ7')) return RAID
    if (url.includes('a8URT')) return MPLUS
    return { ...RAID, reportId: 'zzzzzzzzzzzzzzzzzzzzzz', character: 'Othermage', difficulty: 'raid-vault-heroic' }
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

const text = () => container.textContent ?? ''
// jsdom's selector engine mis-parses "+" inside quoted attribute values, so match labels directly.
const byLabel = (tag: string, label: string) => [...container.querySelectorAll(tag)].find((e) => e.getAttribute('aria-label') === label) ?? null

describe('multi-report flow', () => {
  it('loads a raid and a Mythic+ report side by side, each with its own parse line and boss-list section', async () => {
    await act(async () => {
      root.render(createElement(App))
    })
    await addReport(RAID_URL)
    await addReport(MPLUS_URL)

    const titles = [...container.querySelectorAll('.report-line__title')].map((e) => e.textContent)
    expect(titles).toEqual(['The Venomous Abyss · Mythic', 'Mythic+ (+10 Myth)'])
    expect(text()).toContain('+10 and above · Myth track · drops at 318, simmed at 334 (Myth 6/6)')
    expect(text()).not.toContain('Weekly10')

    const sections = [...container.querySelectorAll('.boss-section__title')].map((e) => e.firstChild?.textContent)
    expect(sections).toEqual(['The Venomous Abyss · Mythic', 'Mythic+ (+10 Myth)'])
    expect(byLabel('input', 'I will run Altar of Fangs at +10')).not.toBeNull()
    expect(container.querySelector('input[aria-label="Expect to kill The Coiled Altar"]')).not.toBeNull()

    // Persisted per character (region:realm:character), in load order.
    expect(loadReportSet('us:hyjal:icemagus')).toEqual([RAID_URL, MPLUS_URL])
    // Knockout state per (character, difficulty or track).
    expect(localStorage.getItem('gallagioloot:knockout:us:hyjal:icemagus:raid-vault-mythic')).not.toBeNull()
    expect(localStorage.getItem('gallagioloot:knockout:us:hyjal:icemagus:mplus-myth')).not.toBeNull()
  })

  it('refuses a report for a different character with a clear error, leaving the set unchanged', async () => {
    await act(async () => {
      root.render(createElement(App))
    })
    await addReport(RAID_URL)
    await addReport(OTHER_URL)
    expect(text()).toContain('This report is for Othermage-hyjal (us), but the loaded reports are for Icemagus-hyjal (us).')
    expect(container.querySelectorAll('.report-line')).toHaveLength(1)
  })

  it('removes a report with its remove control', async () => {
    await act(async () => {
      root.render(createElement(App))
    })
    await addReport(RAID_URL)
    await addReport(MPLUS_URL)
    const remove = byLabel('button', 'Remove Mythic+ (+10 Myth) report') as HTMLButtonElement
    await act(async () => {
      Simulate.click(remove)
    })
    expect([...container.querySelectorAll('.report-line__title')].map((e) => e.textContent)).toEqual(['The Venomous Abyss · Mythic'])
    expect(loadReportSet('us:hyjal:icemagus')).toEqual([RAID_URL])
  })

  it('prices across both reports and names the M+ target with its verb', async () => {
    await act(async () => {
      root.render(createElement(App))
    })
    await addReport(RAID_URL)
    await addReport(MPLUS_URL)
    const price = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Price my roll')!
    await act(async () => {
      Simulate.click(price)
    })
    expect(container.querySelector('.rec-card__headline')?.textContent).toBe('Run Altar of Fangs at +10 and roll')
    const rankedTargets = [...container.querySelectorAll('.deploy-table tbody td[data-label="Target"]')].map((e) => e.textContent)
    expect(rankedTargets).toEqual(['Altar of Fangs at +10', 'The Coiled Altar (Mythic)', 'Sszorak (Mythic)', 'Den of Nalorakk at +10'])
  })
})

describe('stored knockout state that references the curio', () => {
  it("loads without crashing, doesn't touch the boss that really drops the tier piece, and is dropped on the next save", async () => {
    const CROWN = 271564
    const raid: NormalizedReport = {
      ...RAID,
      items: [
        item(2887, 'The Twin Fangs', CROWN, 700, 1320),
        { ...item(2895, "Ula'tek", CROWN, 700, 1320), viaCurio: true },
        item(2895, "Ula'tek", 268265, 900, 1320),
      ],
    }
    vi.mocked(fetchReport).mockImplementation(async () => raid)
    const key = 'gallagioloot:knockout:us:hyjal:icemagus:raid-vault-mythic'
    const staleEntry = { itemId: CROWN, itemName: 'Crown', encounterId: 2895, receivedAt: '', source: 'manual', state: 'rolled' }
    const keptEntry = { itemId: 268265, itemName: 'Aqirbane Reliquary', encounterId: 2895, receivedAt: '', source: 'manual', state: 'owned' }
    localStorage.setItem(key, JSON.stringify({ character: 'Icemagus', realm: 'hyjal', region: 'us', difficulty: 'raid-vault-mythic', entries: [staleEntry, keptEntry], rollsSpent: {}, version: 2 }))

    await act(async () => {
      root.render(createElement(App))
    })
    await addReport(RAID_URL)

    // Twin Fangs still shows its Crown as a normal, unrolled pool member (1 / 1 remaining).
    const twinFangs = [...container.querySelectorAll('.boss-row')].find((r) => r.querySelector('.boss-row__name')?.textContent === 'The Twin Fangs')!
    expect(twinFangs.querySelector('.boss-row__remaining')?.textContent).toContain('1 / 1')
    const saved = JSON.parse(localStorage.getItem(key)!) as { entries: Array<{ itemId: number }> }
    expect(saved.entries.map((e) => e.itemId)).toEqual([268265])
  })
})

describe('report set storage', () => {
  it('round-trips and ignores junk', () => {
    expect(loadReportSet('us:hyjal:icemagus')).toBeNull()
    saveReportSet('us:hyjal:icemagus', [RAID_URL, MPLUS_URL])
    expect(loadReportSet('us:hyjal:icemagus')).toEqual([RAID_URL, MPLUS_URL])
    localStorage.setItem('gallagioloot:reportSet:bad', '{"not":"a list"}')
    expect(loadReportSet('bad')).toBeNull()
  })
})
