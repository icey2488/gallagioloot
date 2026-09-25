import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'
import type { NormalizedItem, NormalizedReport } from '@engine/types'
import { VOIDCORE_ASSUMPTIONS } from '@engine/core/supply'

vi.mock('../src/lib/proxyClient', async (orig) => {
  const actual = await orig<typeof import('../src/lib/proxyClient')>()
  return { ...actual, fetchReport: vi.fn(), fetchTopGear: vi.fn(), fetchLootTable: vi.fn() }
})

import App from '../src/App'
import { fetchLootTable, fetchReport } from '../src/lib/proxyClient'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const RAID_URL = 'https://www.raidbots.com/simbot/report/6PTZ7TjgU8PdxJhZ97bMUa'
const SETTINGS_KEY = 'gallagioloot:settings:us:hyjal:icemagus:raid-vault-mythic'

function item(encounterId: number, encounterName: string, itemId: number, pct: number): NormalizedItem {
  const delta = (pct / 100) * 572816.6
  return { itemId, name: `Item ${itemId}`, encounterId, encounterName, instanceId: 1320, ilvl: 334, delta, pct: delta / 1000 }
}

// Ula'tek 0.90%, The Coiled Altar 0.80%, Sszorak 0.60%, Entombed Sentinels 0.30%: one item per boss.
const RAID: NormalizedReport = {
  source: 'raidbots',
  character: 'Icemagus',
  realm: 'hyjal',
  region: 'us',
  spec: 'arcane',
  role: 'dps',
  metric: 'dps',
  baseline: 572816.6,
  warnings: [],
  lootSpecId: 62,
  reportId: '6PTZ7TjgU8PdxJhZ97bMUa',
  contentType: 'raid',
  difficulty: 'raid-vault-mythic',
  instanceId: 1320,
  instanceName: 'The Venomous Abyss',
  targetKind: 'raid',
  items: [item(2895, "Ula'tek", 6, 0.9), item(2883, 'The Coiled Altar', 1, 0.8), item(2871, 'Sszorak', 2, 0.6), item(2874, 'Entombed Sentinels', 5, 0.3)],
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  localStorage.clear()
  vi.mocked(fetchReport).mockResolvedValue(RAID)
  vi.mocked(fetchLootTable).mockRejectedValue(new Error('offline'))
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

async function loadRaid() {
  await act(async () => {
    root.render(createElement(App))
  })
  await act(async () => {
    Simulate.change(container.querySelector('#report-url')!, { target: { value: RAID_URL } as unknown as EventTarget })
  })
  const button = [...container.querySelectorAll('button')].find((b) => /Fetch report/.test(b.textContent ?? ''))!
  await act(async () => {
    Simulate.click(button)
  })
}

const input = (selector: string) => container.querySelector(selector) as HTMLInputElement
async function set(selector: string, value: string) {
  await act(async () => {
    Simulate.change(input(selector), { target: { value } as unknown as EventTarget })
  })
}
async function price() {
  const button = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Price my roll')!
  await act(async () => {
    Simulate.click(button)
  })
}
const rows = () =>
  [...container.querySelectorAll('.rec-card .roll-list__row')].map((r) =>
    [r.querySelector('.roll-list__n'), r.querySelector('.roll-list__name'), r.querySelector('.roll-list__ev'), r.querySelector('.roll-list__advice')].map((e) => e?.textContent ?? '')
  )
const rollNotes = () => [...container.querySelectorAll('.rec-card .roll-list__note')].map((n) => n.textContent)

describe('Run settings: Voidcore supply inputs', () => {
  it('has no "Rolls available" setting', async () => {
    await loadRaid()
    expect(container.querySelector('#rolls-available')).toBeNull()
    expect(container.textContent).not.toContain('Rolls available')
  })

  it('Voidcores to spend defaults to on hand, follows it, can be lowered, and never exceeds it', async () => {
    await loadRaid()
    expect(input('#voidcores-to-spend').value).toBe('0')
    await set('#voidcores-on-hand', '3')
    expect(input('#voidcores-to-spend').value).toBe('3')
    await set('#voidcores-to-spend', '1')
    expect(input('#voidcores-to-spend').value).toBe('1')
    await set('#voidcores-on-hand', '5')
    expect(input('#voidcores-to-spend').value).toBe('1') // a lowered value stays lowered
    await set('#voidcores-to-spend', '9')
    expect(input('#voidcores-to-spend').value).toBe('5') // back to "all on hand"
    await set('#voidcores-on-hand', '2')
    expect(input('#voidcores-to-spend').value).toBe('2')
  })

  it('Voidcores earned per week defaults to 1, to 2 once next week is season week 8 (from week 7), and stays editable', async () => {
    await loadRaid()
    expect(input('#earned-per-week').value).toBe('1')
    await set('#season-week', '6')
    expect(input('#earned-per-week').value).toBe('1')
    await set('#season-week', '7')
    expect(input('#earned-per-week').value).toBe('2') // next week is week 8
    await set('#season-week', '8')
    expect(input('#earned-per-week').value).toBe('2')
    await set('#earned-per-week', '1') // skipping the vault one
    expect(input('#earned-per-week').value).toBe('1')
    await set('#season-week', '3')
    expect(input('#earned-per-week').value).toBe('1')
    await set('#weeks-left', '4')
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)!)).toEqual({ thresholdPct: 0.2, spendOverride: null, earnedPerWeek: 1, seasonWeek: 3, weeksLeft: 4 })
  })

  it('migrates a stored v2.08 "Rolls available: 2" to 2 earned per week, and saves the new shape', async () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ thresholdPct: 0.2, rollsAvailable: 2 }))
    await loadRaid()
    expect(input('#earned-per-week').value).toBe('2')
    expect(input('#voidcores-to-spend').value).toBe('0')
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY)!)
    expect(stored).toEqual({ thresholdPct: 0.2, spendOverride: null, earnedPerWeek: 2, seasonWeek: null, weeksLeft: null })
  })
})

describe('the recommendation card: this week\'s Voidcores, in order', () => {
  it('lists every Voidcore to spend with its target and EV; the 3rd, earning 1 a week, is worth more held', async () => {
    await loadRaid()
    await set('#voidcores-on-hand', '3')
    await price()
    expect(container.querySelector('.rec-card__meta')?.textContent).toBe('3 Voidcores')
    expect(container.querySelector('.rec-card__rolls-title')?.textContent).toBe("This week's Voidcores, in order")
    expect(rows()).toEqual([
      ['1', "Ula'tek (Mythic)", '0.90%', 'spend now'],
      ['2', 'The Coiled Altar (Mythic)', '0.80%', 'spend now'],
      ['3', 'Sszorak (Mythic)', '0.60%', 'spend now 0.60% vs hold ~0.80% next week, playing without ~0.60% for 1 week'],
    ])
    expect(container.querySelectorAll('.roll-list__advice--hold')).toHaveLength(1)
    // With a list, the headline is roll 1, not a toss-up between later rolls.
    expect(container.querySelector('.rec-card__headline')?.textContent).toBe("Roll Ula'tek (Mythic)")
  })

  it('earning 2 a week, the held 3rd would get Sszorak anyway: spend now', async () => {
    await loadRaid()
    await set('#voidcores-on-hand', '3')
    await set('#earned-per-week', '2')
    await price()
    expect(rows().map((r) => r[3])).toEqual(['spend now', 'spend now', 'spend now'])
  })

  it('a kill-order toss-up at the last roll sits on that row, not in the headline', async () => {
    vi.mocked(fetchReport).mockResolvedValue({ ...RAID, items: [...RAID.items.slice(0, 3), item(2874, 'Entombed Sentinels', 5, 0.55)] })
    await loadRaid()
    await set('#voidcores-on-hand', '3')
    await price()
    expect(rows()[2][3]).toBe('spend now 0.60% vs hold ~0.80% next week, playing without ~0.60% for 1 week; toss-up with Entombed Sentinels (Mythic) (0.55%), let kill order decide')
    expect(container.querySelector('.rec-card__headline')?.textContent).toBe("Roll Ula'tek (Mythic)")
  })

  it('flags a roll on a below-threshold target', async () => {
    await loadRaid()
    await set('#threshold', '0.55')
    await set('#voidcores-on-hand', '4')
    await price()
    expect(rows()[3]).toEqual(['4', 'Entombed Sentinels (Mythic)', '0.30%', 'below threshold: hold it or take the tokens; spend now 0.30% vs hold ~0.80% next week, playing without ~0.30% for 1 week'])
    expect(container.querySelectorAll('.roll-list__row--below')).toHaveLength(1)
  })

  it('says how many Voidcores have no target this week', async () => {
    await loadRaid()
    await set('#voidcores-on-hand', '6')
    await price()
    expect(rows()).toHaveLength(4)
    expect(rollNotes()).toEqual(['2 Voidcores have no target this week (every rollable boss already takes one); they carry to next week.'])
  })

  it('warns when the stockpile outruns the good targets before season end', async () => {
    await loadRaid()
    await set('#voidcores-on-hand', '6')
    await set('#earned-per-week', '2')
    await set('#weeks-left', '1')
    await price()
    // 6 + 2 x 1 = 8 Voidcores vs 4 bosses x 2 weeks = 8 good rolls: no warning yet.
    expect(rollNotes().some((n) => n?.startsWith('You have more Voidcores'))).toBe(false)
    await set('#voidcores-on-hand', '7')
    await price()
    expect(rollNotes()).toContain('You have more Voidcores than good targets before season end (9 Voidcores vs 8 rolls at or above 0.2%); spend down lower targets.')
  })

  it('with nothing to spend, says so and still names the best target', async () => {
    await loadRaid()
    await price()
    expect(rows()).toEqual([])
    expect(rollNotes()).toEqual(['No Voidcores to spend this week. Set Voidcores on hand in Run settings.'])
    expect(container.querySelector('.rec-card__headline')?.textContent).toContain("Ula'tek")
  })
})

describe('footer assumptions', () => {
  it('lists the Voidcore supply assumptions', async () => {
    await loadRaid()
    const items = [...container.querySelectorAll('.app-footer__assumptions li')].map((li) => li.textContent)
    for (const a of VOIDCORE_ASSUMPTIONS) expect(items).toContain(a)
    expect(items.join(' ')).toContain('Voidcores can be held until the end of the season')
    expect(items).toContain('Holding delays the upgrade: every week you wait, you play without it, and a roll never guarantees the item you are holding for.')
  })
})
