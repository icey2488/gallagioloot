import { afterEach, describe, expect, it } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { RecommendationCard } from '../src/components/RecommendationCard'
import type { CardData } from '../src/lib/cardData'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement | null = null
let root: Root | null = null

function render(card: CardData) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root!.render(createElement(RecommendationCard, { card }))
  })
  return container
}

afterEach(() => {
  if (root && container) act(() => root!.unmount())
  container?.remove()
  container = null
  root = null
})

const base: CardData = {
  verdict: 'toss-up',
  headline: 'Toss-up',
  pct: 0.68,
  rollsAvailable: 1,
  tossUp: true,
  tossUpNote: 'close',
  vaultCompare: { voidcorePct: 0.68, vaultPct: 0.74, vaultItemName: 'Vile Vial of Volatile Venom' },
} as CardData

describe('RecommendationCard toss-up number label', () => {
  it('labels the big number "Voidcore roll" on a vault-vs-Voidcore toss-up', () => {
    const el = render(base)
    const row = el.querySelector('.rec-card__pct-row')!
    expect(row.querySelector('.rec-card__pct-label')?.textContent).toBe('Voidcore roll')
    expect(row.querySelector('.rec-card__pct')?.textContent).toBe('0.68%')
  })

  it('has no label on a plain roll verdict', () => {
    const el = render({ ...base, verdict: 'roll', headline: 'Roll X', vaultCompare: undefined, tossUp: false } as CardData)
    expect(el.querySelector('.rec-card__pct-label')).toBeNull()
  })
})
