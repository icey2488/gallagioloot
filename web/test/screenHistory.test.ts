import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ScreenHistory } from '../src/state/screenHistory'

let controller: ScreenHistory | null = null

beforeEach(() => {
  window.history.replaceState(null, '')
})

afterEach(() => {
  controller?.dispose()
  controller = null
})

describe('ScreenHistory', () => {
  it('starts on the paste screen by default and seeds history state', () => {
    controller = new ScreenHistory(window)
    expect(controller.screen).toBe('paste')
    expect(window.history.state).toEqual({ screen: 'paste' })
  })

  it('adopts an existing valid screen already in history.state', () => {
    window.history.replaceState({ screen: 'deployability' }, '')
    controller = new ScreenHistory(window)
    expect(controller.screen).toBe('deployability')
  })

  it('go() pushes a new history entry and notifies subscribers', () => {
    controller = new ScreenHistory(window)
    const listener = vi.fn()
    controller.subscribe(listener)

    controller.go('deployability')

    expect(controller.screen).toBe('deployability')
    expect(window.history.state).toEqual({ screen: 'deployability' })
    expect(listener).toHaveBeenCalledWith('deployability')
  })

  it('replace() swaps the screen without notifying via a duplicate push', () => {
    controller = new ScreenHistory(window)
    controller.replace('roll')
    expect(controller.screen).toBe('roll')
    expect(window.history.state).toEqual({ screen: 'roll' })
  })

  it('moves through paste -> deployability -> roll -> reconcile and back via popstate (browser back/forward)', () => {
    controller = new ScreenHistory(window)
    const seen: string[] = []
    controller.subscribe((s) => seen.push(s))

    controller.go('deployability')
    controller.go('roll')
    controller.go('reconcile')
    expect(controller.screen).toBe('reconcile')

    // Simulate the browser back button: history.state moves back a step and a
    // popstate event fires with that entry's state.
    window.dispatchEvent(new PopStateEvent('popstate', { state: { screen: 'roll' } }))
    expect(controller.screen).toBe('roll')

    window.dispatchEvent(new PopStateEvent('popstate', { state: { screen: 'deployability' } }))
    expect(controller.screen).toBe('deployability')

    // Simulate forward again.
    window.dispatchEvent(new PopStateEvent('popstate', { state: { screen: 'roll' } }))
    expect(controller.screen).toBe('roll')

    expect(seen).toEqual(['deployability', 'roll', 'reconcile', 'roll', 'deployability', 'roll'])
  })

  it('falls back to the paste screen on a popstate with unrecognized state', () => {
    controller = new ScreenHistory(window)
    controller.go('roll')

    window.dispatchEvent(new PopStateEvent('popstate', { state: null }))

    expect(controller.screen).toBe('paste')
  })

  it('unsubscribe stops further notifications', () => {
    controller = new ScreenHistory(window)
    const listener = vi.fn()
    const unsubscribe = controller.subscribe(listener)

    unsubscribe()
    controller.go('roll')

    expect(listener).not.toHaveBeenCalled()
  })
})
