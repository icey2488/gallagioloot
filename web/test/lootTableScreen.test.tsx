import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Simulate, type SyntheticEventData } from 'react-dom/test-utils'
import { LootTableScreen } from '../src/components/LootTableScreen'
import type { LootTable, NormalizedReport } from '@engine/types'
import type { BossEval } from '@engine/core/types'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement | null = null
let root: Root | null = null

const LOOT_TABLE: LootTable = {
  instanceId: 1320,
  instanceName: 'The Venomous Abyss',
  lootSpecId: 262,
  sourceHash: '0f25a4ee5218c7f618ca5efaad4da6f4',
  encounters: [
    {
      encounterId: 2888,
      encounterName: "Nek'zali the Soulcoiler",
      items: [
        { itemId: 100, name: 'Simmed Ring', slot: 'finger', specSpecific: false, uniqueEquipped: false, onUseTrinket: false, isTier: false, viaCurio: false },
        { itemId: 200, name: 'Unsimmed Trinket', slot: 'trinket', specSpecific: true, uniqueEquipped: false, onUseTrinket: true, isTier: false, viaCurio: false },
      ],
    },
  ],
}

const REPORT: NormalizedReport = {
  source: 'raidbots',
  reportId: 'test',
  character: 'Testchar',
  spec: 'Elemental',
  role: 'dps',
  metric: 'dps',
  contentType: 'raid',
  difficulty: 'raid-vault-heroic',
  baseline: 1000,
  items: [],
  warnings: [],
}

const BOSS_EVALS: BossEval[] = [
  {
    encounterId: 2888,
    encounterName: "Nek'zali the Soulcoiler",
    instanceId: 1320,
    pool: [
      {
        key: 'item:100',
        itemIds: [100],
        name: 'Simmed Ring',
        value: 1000,
        rawDelta: 1000,
        pct: 1.5,
        kind: 'item',
        specSpecific: false,
        knockedOut: false,
        rollsToTargetExpected: 1,
        rollsToTargetWorst: 1,
      },
    ],
    remaining: 1,
    ev: 1000,
    evPct: 1.5,
    bestCase: null,
    deployable: true,
    notes: [],
  },
]

function render(onToggleKnockout: (item: unknown, encounterId: number, encounterName: string, checked: boolean) => void) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root!.render(
      createElement(LootTableScreen, {
        lootTable: LOOT_TABLE,
        lootTableStatus: 'idle',
        lootTableError: null,
        report: REPORT,
        bossEvals: BOSS_EVALS,
        focusBossId: null,
        onToggleKnockout,
      })
    )
  })
  return container
}

afterEach(() => {
  if (root && container) {
    act(() => root!.unmount())
    container.remove()
  }
  container = null
  root = null
})

describe('LootTableScreen', () => {
  it('shows a sim gain % for a report-simmed item and "not simmed" for one the loot table has but the report never simmed', () => {
    const el = render(() => {})
    const rows = [...el.querySelectorAll('tbody tr')]
    expect(rows[0].textContent).toContain('1.50%')
    expect(rows[1].textContent).toContain('not simmed')
  })

  it('checking the knockout box calls onToggleKnockout with checked=true for that item', () => {
    const onToggleKnockout = vi.fn()
    const el = render(onToggleKnockout)
    const checkbox = el.querySelector('input[type="checkbox"]') as HTMLInputElement

    act(() => Simulate.change(checkbox, { target: { checked: true } } as unknown as SyntheticEventData))

    expect(onToggleKnockout).toHaveBeenCalledTimes(1)
    const [item, encounterId, encounterName, checked] = onToggleKnockout.mock.calls[0]
    expect(item.itemId).toBe(100)
    expect(encounterId).toBe(2888)
    expect(encounterName).toBe("Nek'zali the Soulcoiler")
    expect(checked).toBe(true)
  })

  it('unchecking an already-knocked-out item calls onToggleKnockout with checked=false', () => {
    const onToggleKnockout = vi.fn()
    const knockedOutEvals: BossEval[] = [{ ...BOSS_EVALS[0], pool: [{ ...BOSS_EVALS[0].pool[0], knockedOut: true }] }]
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => {
      root!.render(
        createElement(LootTableScreen, {
          lootTable: LOOT_TABLE,
          lootTableStatus: 'idle',
          lootTableError: null,
          report: REPORT,
          bossEvals: knockedOutEvals,
          focusBossId: null,
          onToggleKnockout,
        })
      )
    })
    const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement
    expect(checkbox.checked).toBe(true)

    act(() => Simulate.change(checkbox, { target: { checked: false } } as unknown as SyntheticEventData))
    expect(onToggleKnockout.mock.calls[0][3]).toBe(false)
  })

  it('marks a specSpecific row with a badge and shows the "counts only for" note', () => {
    const el = render(() => {})
    expect(el.textContent).toContain('spec-specific')
    expect(el.textContent).toContain('counts only for Elemental')
  })
})
