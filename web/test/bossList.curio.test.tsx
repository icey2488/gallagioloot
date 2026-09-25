import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'
import { buildBossPools } from '@engine/core/pool'
import type { KnockoutState } from '@engine/core/types'
import type { LootTable, LootTableItem, NormalizedItem, NormalizedReport } from '@engine/types'
import { BossList, type BossSection } from '../src/components/BossList'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const lootRow = (itemId: number, name: string, extra: Partial<LootTableItem> = {}): LootTableItem => ({
  itemId, name, specSpecific: false, uniqueEquipped: false, onUseTrinket: false, isTier: false, viaCurio: false, ...extra,
})
const simmed = (itemId: number, name: string, encounterId: number, encounterName: string, delta: number): NormalizedItem => ({
  itemId, name, encounterId, encounterName, instanceId: 1320, ilvl: 334, delta, pct: delta / 1000,
})

const REPORT: NormalizedReport = {
  source: 'raidbots', reportId: 'r', character: 'Icemagus', realm: 'hyjal', region: 'us', spec: 'arcane', role: 'dps', metric: 'dps',
  contentType: 'raid', difficulty: 'raid-vault-mythic', baseline: 100000, instanceId: 1320, instanceName: 'The Venomous Abyss', warnings: [], lootSpecId: 62, targetKind: 'raid',
  items: [
    simmed(268265, 'Aqirbane Reliquary', 2895, "Ula'tek", 1770),
    simmed(271874, "Venomkeeper's Horrific Cowl", 2895, "Ula'tek", 1470),
    simmed(271564, 'Crown of the Primal Leywarden', 2895, "Ula'tek", 1316),
    simmed(268250, "Sentinel's Vitriolic Chain", 2874, 'Entombed Sentinels', 670),
  ],
}

const LOOT_TABLE: LootTable = {
  instanceId: 1320, lootSpecId: 62, sourceHash: 'h',
  encounters: [
    { encounterId: 2895, encounterName: "Ula'tek", items: [lootRow(268265, 'Aqirbane Reliquary', { slot: 'neck' }), lootRow(271874, "Venomkeeper's Horrific Cowl", { slot: 'head' }), lootRow(271564, 'Crown of the Primal Leywarden', { slot: 'head', isTier: true, viaCurio: true, tierSlot: 'head' })] },
    { encounterId: 2874, encounterName: 'Entombed Sentinels', items: [lootRow(268250, "Sentinel's Vitriolic Chain", { slot: 'neck' })] },
  ],
}

const STATE: KnockoutState = { character: 'Icemagus', difficulty: 'raid-vault-mythic', entries: [], version: 2 }

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

function render() {
  const settings = { thresholdPct: 0.2, rollsAvailable: 1 as const, includeOffSpec: false, lootSpecId: 62 }
  const section: BossSection = {
    key: 'raid', title: 'The Venomous Abyss · Mythic', kind: 'raid', stateKey: 'k', lootTable: LOOT_TABLE,
    bossEvals: buildBossPools(REPORT, STATE, settings, LOOT_TABLE.encounters),
  }
  act(() => {
    root.render(createElement(BossList, { sections: [section], hasReports: true, lootTableStatus: 'idle', expectedTargetKeys: new Set<string>(), onToggleExpectedTarget: () => {}, onSetItemState: () => {}, onSetRollsSpent: () => {} }))
  })
}

const NOTE = "Slumbering Coil Curio drops from Ula'tek but can't be won with a bonus roll."
const open = (name: string) => {
  const row = [...container.querySelectorAll('.boss-row')].find((r) => r.querySelector('.boss-row__name')?.textContent === name)!
  act(() => Simulate.click(row.querySelector('.boss-row__summary')!))
  return row
}

describe("Ula'tek's loot table without the curio", () => {
  it('counts only the rollable items, lists no Curio row, and shows the muted note under the table', () => {
    render()
    const ulatek = open("Ula'tek")
    expect(ulatek.querySelector('.boss-row__remaining')?.textContent).toContain('2 / 2')
    const rows = [...ulatek.querySelectorAll('tbody tr')].map((r) => r.querySelector('td')?.textContent)
    expect(rows).toEqual(['Aqirbane Reliquary', "Venomkeeper's Horrific Cowl"])
    expect(ulatek.textContent).not.toContain('Curio (any missing tier slot)')
    expect(ulatek.textContent).not.toContain('Crown of the Primal Leywarden')
    const note = ulatek.querySelector('.note-line')
    expect(note?.textContent).toBe(NOTE)
  })

  it('shows no curio note under a boss that has no curio', () => {
    render()
    const sentinels = open('Entombed Sentinels')
    expect(sentinels.textContent).not.toContain('Slumbering Coil Curio')
  })
})
