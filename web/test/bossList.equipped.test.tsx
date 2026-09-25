import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'
import { buildBossPools } from '@engine/core/pool'
import { knockoutDifficulty } from '@engine/core/targets'
import type { KnockoutEntry, KnockoutState } from '@engine/core/types'
import type { NormalizedItem, NormalizedReport } from '@engine/types'
import { BossList, type BossSection, type ItemStateChange } from '../src/components/BossList'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const RING = 251148
const simmed = (itemId: number, name: string, delta: number): NormalizedItem => ({
  itemId, name, encounterId: 1311, encounterName: 'Den of Nalorakk', instanceId: -1, ilvl: 334, delta, pct: delta / 1000,
})
const REPORT: NormalizedReport = {
  source: 'raidbots', reportId: 'r', character: 'Icemagus', realm: 'hyjal', region: 'us', spec: 'arcane', role: 'dps', metric: 'dps',
  contentType: 'dungeon', difficulty: 'dungeon-mythic-weekly10', baseline: 100000, instanceId: -1, warnings: [], lootSpecId: 62, targetKind: 'mplus',
  items: [simmed(1, 'Some Cloak', 1200), simmed(RING, 'Pilfered Precious Band', 0)],
  equippedItemIds: [RING],
}

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function render(entries: KnockoutEntry[], changes: ItemStateChange[]) {
  const state: KnockoutState = { character: 'Icemagus', difficulty: knockoutDifficulty(REPORT), entries, version: 2 }
  const settings = { thresholdPct: 0.2, rollsAvailable: 1 as const, includeOffSpec: false, lootSpecId: 62 }
  const section: BossSection = { key: 'm', title: 'Mythic+', kind: 'mplus', stateKey: 'k', lootTable: null, bossEvals: buildBossPools(REPORT, state, settings) }
  act(() => {
    root.render(createElement(BossList, { sections: [section], hasReports: true, lootTableStatus: 'idle', expectedTargetKeys: new Set<string>(), onToggleExpectedTarget: () => {}, onSetItemState: (c) => changes.push(c), onSetRollsSpent: () => {} }))
  })
  const row = container.querySelector('.boss-row')!
  act(() => Simulate.click(row.querySelector('.boss-row__summary')!))
}

const ringRow = () => [...container.querySelectorAll('tbody tr')].find((r) => r.textContent?.includes('Pilfered Precious Band'))!
const cloakRow = () => [...container.querySelectorAll('tbody tr')].find((r) => r.textContent?.includes('Some Cloak'))!
const button = (row: Element, label: string) => [...row.querySelectorAll('.state-seg__btn')].find((b) => b.textContent === label)!

describe('equipped items in the loot table', () => {
  it('labels an equipped item "Equipped" with Owned preselected, and only that item', () => {
    render([], [])
    expect(ringRow().querySelector('.item-tag--equipped')?.textContent).toBe('Equipped')
    expect(ringRow().querySelector('.state-seg__btn--on')?.textContent).toBe('Owned')
    expect(cloakRow().querySelector('.item-tag--equipped')).toBeNull()
    expect(cloakRow().querySelector('.state-seg__btn--on')?.textContent).toBe('None')
  })

  it('does not offer None for an equipped item, and clicking the already-selected Owned stores nothing', () => {
    const changes: ItemStateChange[] = []
    render([], changes)
    expect([...ringRow().querySelectorAll('.state-seg__btn')].map((b) => b.textContent)).toEqual(['Owned', 'Rolled'])
    act(() => Simulate.click(button(ringRow(), 'Owned')))
    expect(changes).toEqual([])
  })

  it('lets the user switch to Rolled; that state (user-set) wins and keeps the Equipped label', () => {
    const changes: ItemStateChange[] = []
    render([], changes)
    act(() => Simulate.click(button(ringRow(), 'Rolled')))
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({ itemId: RING, state: 'rolled' })

    root.unmount()
    root = createRoot(container)
    const rolled: KnockoutEntry = { itemId: RING, itemName: 'Pilfered Precious Band', encounterId: 1311, receivedAt: '', source: 'manual', state: 'rolled' }
    render([rolled], changes)
    expect(ringRow().querySelector('.item-tag--equipped')?.textContent).toBe('Equipped')
    expect(ringRow().querySelector('.state-seg__btn--on')?.textContent).toBe('Rolled')
  })

  it('going back from Rolled to Owned drops the stored entry rather than persisting the default', () => {
    const changes: ItemStateChange[] = []
    render([{ itemId: RING, itemName: 'Pilfered Precious Band', encounterId: 1311, receivedAt: '', source: 'manual', state: 'rolled' }], changes)
    act(() => Simulate.click(button(ringRow(), 'Owned')))
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({ itemId: RING, state: 'none' })
  })
})
