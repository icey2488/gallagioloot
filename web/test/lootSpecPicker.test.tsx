import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'
import { LootSpecPicker } from '../src/components/LootSpecPicker'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement | null = null
let root: Root | null = null

function render(lootSpecId: number | null, onChange: (specId: number) => void) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root!.render(createElement(LootSpecPicker, { lootSpecId, onChange }))
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

describe('LootSpecPicker', () => {
  it('lists all 40 specs grouped by class', () => {
    const el = render(null, () => {})
    const select = el.querySelector('select')!
    // 40 specs + the disabled placeholder option.
    expect(select.querySelectorAll('option')).toHaveLength(41)
    expect(select.querySelectorAll('optgroup')).toHaveLength(13)
  })

  it('reflects the current lootSpecId as the selected value', () => {
    const el = render(262, () => {})
    const select = el.querySelector('select') as HTMLSelectElement
    expect(select.value).toBe('262')
  })

  it('calls onChange with the numeric spec id when a new option is chosen', () => {
    const onChange = vi.fn()
    const el = render(262, onChange)
    const select = el.querySelector('select') as HTMLSelectElement

    act(() => {
      select.value = '264'
      Simulate.change(select)
    })

    expect(onChange).toHaveBeenCalledWith(264)
  })
})
