import { afterEach, describe, expect, it } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'
import { Tooltip } from '../src/components/Tooltip'

// No React Testing Library in this repo -- react-dom/test-utils' Simulate dispatches
// straight through React's synthetic event system, which is what the app's actual
// onMouseEnter/onFocus/onKeyDown handlers are wired to (more reliable under jsdom
// than hand-rolled native Event/dispatchEvent, which has enter/leave edge cases).
// react-dom/test-utils' act() checks this flag rather than assuming an RTL-managed environment.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement | null = null
let root: Root | null = null

function render(term: Parameters<typeof Tooltip>[0]['term']) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root!.render(createElement(Tooltip, { term }, 'Threshold'))
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

describe('Tooltip', () => {
  it('shows the bubble on hover and hides it on mouse leave', () => {
    const el = render('threshold')
    const trigger = el.querySelector('.tooltip-trigger') as HTMLElement
    expect(el.querySelector('.tooltip-bubble')).toBeNull()

    act(() => Simulate.mouseEnter(trigger))
    expect(el.querySelector('.tooltip-bubble')?.textContent).toContain('Below it, take the tokens')

    act(() => Simulate.mouseLeave(trigger))
    expect(el.querySelector('.tooltip-bubble')).toBeNull()
  })

  it('shows the bubble on keyboard focus and hides it on blur', () => {
    const el = render('ev')
    const trigger = el.querySelector('.tooltip-trigger') as HTMLElement

    act(() => Simulate.focus(trigger))
    expect(el.querySelector('.tooltip-bubble')).not.toBeNull()

    act(() => Simulate.blur(trigger))
    expect(el.querySelector('.tooltip-bubble')).toBeNull()
  })

  it('is dismissible with Escape while open', () => {
    const el = render('knockout')
    const trigger = el.querySelector('.tooltip-trigger') as HTMLElement

    act(() => Simulate.focus(trigger))
    expect(el.querySelector('.tooltip-bubble')).not.toBeNull()

    act(() => Simulate.keyDown(trigger, { key: 'Escape' }))
    expect(el.querySelector('.tooltip-bubble')).toBeNull()
  })

  it('points aria-describedby at the bubble only while open, for screen readers', () => {
    const el = render('lootSpec')
    const trigger = el.querySelector('.tooltip-trigger') as HTMLElement
    expect(trigger.getAttribute('aria-describedby')).toBeNull()

    act(() => Simulate.mouseEnter(trigger))
    const describedBy = trigger.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    // getElementById, not a CSS selector -- React's useId() ids contain ":" which isn't
    // valid in an unescaped querySelector string.
    expect(document.getElementById(describedBy!)?.getAttribute('role')).toBe('tooltip')
  })
})
