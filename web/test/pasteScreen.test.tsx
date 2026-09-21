import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Simulate, type SyntheticEventData } from 'react-dom/test-utils'
import { PasteScreen } from '../src/components/PasteScreen'
import type { NormalizedTopGear } from '@engine/types'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement | null = null
let root: Root | null = null

function baseProps(overrides: Partial<Parameters<typeof PasteScreen>[0]> = {}): Parameters<typeof PasteScreen>[0] {
  return {
    reportUrl: '',
    onReportUrlChange: () => {},
    detectedSource: null,
    loadStatus: 'idle',
    loadError: null,
    onFetch: () => {},
    report: null,
    mismatchWarning: null,
    rollsAvailable: 1,
    onRollsAvailableChange: () => {},
    bossList: [],
    expectedKillIds: new Set(),
    onToggleExpectedKill: () => {},
    vaultItemName: '',
    onVaultItemNameChange: () => {},
    vaultBossId: null,
    onVaultBossIdChange: () => {},
    topGearUrl: '',
    onTopGearUrlChange: () => {},
    topGearStatus: 'idle',
    topGearError: null,
    topGearResult: null,
    manualVaultGainPct: '',
    onManualVaultGainPctChange: () => {},
    thresholdPct: 0.2,
    onThresholdPctChange: () => {},
    lootSpecId: null,
    onLootSpecIdChange: () => {},
    voidcoreCount: 0,
    onVoidcoreCountChange: () => {},
    notInReportCount: null,
    onContinue: () => {},
    ...overrides,
  }
}

function render(props: ReturnType<typeof baseProps>) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root!.render(createElement(PasteScreen, props))
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

const TOPGEAR_RESULT: NormalizedTopGear = {
  source: 'raidbots',
  reportId: 'miriTcb27bfGDYmV6JjvD1',
  character: 'Icemagus',
  spec: 'arcane',
  baseline: 554420.23,
  metric: 'dps',
  bestSet: {
    delta: 1825.0,
    pct: 0.33,
    items: [{ itemId: 250214, name: 'Lightspire Core', slot: 'trinket2', ilvl: 334 }],
  },
  equippedItems: [],
  candidates: [
    { itemId: 250214, name: 'Lightspire Core', slot: 'trinket2', ilvl: 334, encounterId: 2771, encounterName: 'Lightwarden Ruia', instanceId: 1309 },
  ],
  allSets: [],
}

describe('PasteScreen -- Top Gear field', () => {
  it('renders the "Top Gear report URL" field with its placeholder, replacing the old manual gain % input at that position', () => {
    const el = render(baseProps())
    const input = el.querySelector('#topgear-url') as HTMLInputElement
    expect(input).not.toBeNull()
    expect(input.placeholder).toContain('Top Gear')
    expect(el.querySelector('#vault-item-gain')).toBeNull()
  })

  it('calls onTopGearUrlChange as the user types', () => {
    const onTopGearUrlChange = vi.fn()
    const el = render(baseProps({ onTopGearUrlChange }))
    const input = el.querySelector('#topgear-url') as HTMLInputElement
    act(() => Simulate.change(input, { target: { value: 'https://www.raidbots.com/reports/abc' } } as unknown as SyntheticEventData))
    expect(onTopGearUrlChange).toHaveBeenCalledWith('https://www.raidbots.com/reports/abc')
  })

  it('shows the vault item summary line (name, pct, boss) once a Top Gear result with a resolved candidate arrives', () => {
    const el = render(baseProps({ topGearUrl: 'https://www.raidbots.com/reports/miriTcb27bfGDYmV6JjvD1', topGearResult: TOPGEAR_RESULT }))
    expect(el.textContent).toContain('Lightspire Core')
    expect(el.textContent).toContain('+0.33%')
    expect(el.textContent).toContain('Lightwarden Ruia')
  })

  it('shows "not a raid/dungeon item" when the primary candidate has no resolved boss', () => {
    const unresolved: NormalizedTopGear = {
      ...TOPGEAR_RESULT,
      candidates: [{ itemId: 250214, name: 'Lightspire Core', slot: 'trinket2', ilvl: 334 }],
    }
    const el = render(baseProps({ topGearResult: unresolved }))
    expect(el.textContent).toContain('not a raid/dungeon item')
  })

  it('lists extra candidates as small text when the winning combo swapped in more than one item', () => {
    const multi: NormalizedTopGear = {
      ...TOPGEAR_RESULT,
      candidates: [
        ...TOPGEAR_RESULT.candidates,
        { itemId: 271483, name: 'Serpent Crown of the Ophidian Oracle', slot: 'head', ilvl: 334, encounterId: 2887, encounterName: 'The Twin Fangs', instanceId: 1320 },
      ],
    }
    const el = render(baseProps({ topGearResult: multi }))
    expect(el.textContent).toContain('Also added:')
    expect(el.textContent).toContain('Serpent Crown of the Ophidian Oracle')
  })

  it('shows a loading hint while the Top Gear report is being fetched', () => {
    const el = render(baseProps({ topGearStatus: 'loading' }))
    expect(el.textContent).toContain('Fetching Top Gear report')
  })

  it('shows the error message when the Top Gear fetch fails', () => {
    const el = render(baseProps({ topGearStatus: 'error', topGearError: "That's a droptimizer; paste a Top Gear report." }))
    expect(el.querySelector('.warning-banner')?.textContent).toContain("That's a droptimizer")
  })
})

describe('PasteScreen -- Advanced manual override', () => {
  it('renders the manual vault gain % input inside the Advanced details, labeled as an override', () => {
    const el = render(baseProps())
    const summary = [...el.querySelectorAll('summary')].find((s) => s.textContent === 'Advanced')!
    const details = summary.closest('details')!
    const input = details.querySelector('#manual-vault-gain') as HTMLInputElement
    expect(input).not.toBeNull()
    const label = details.querySelector('label[for="manual-vault-gain"]')
    expect(label?.textContent).toContain('overrides the report')
  })

  it('calls onManualVaultGainPctChange as the user types', () => {
    const onManualVaultGainPctChange = vi.fn()
    const el = render(baseProps({ onManualVaultGainPctChange }))
    const input = el.querySelector('#manual-vault-gain') as HTMLInputElement
    act(() => Simulate.change(input, { target: { value: '4.5' } } as unknown as SyntheticEventData))
    expect(onManualVaultGainPctChange).toHaveBeenCalledWith('4.5')
  })
})
