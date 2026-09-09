export type Screen = 'paste' | 'deployability' | 'roll' | 'reconcile' | 'lootTable'

const SCREENS: readonly Screen[] = ['paste', 'deployability', 'roll', 'reconcile', 'lootTable']

export function isScreen(value: unknown): value is Screen {
  return typeof value === 'string' && (SCREENS as readonly string[]).includes(value)
}

type HistoryState = { screen: Screen } | null

/**
 * Drives the four-screen SPA over browser back/forward, keeping the underlying
 * app object (report/settings/knockout state) untouched -- only which screen
 * renders it changes. `go()` pushes a new history entry; popstate (back/forward)
 * updates `screen` and notifies subscribers without pushing again.
 */
export class ScreenHistory {
  screen: Screen
  private listeners = new Set<(screen: Screen) => void>()
  private win: Window

  constructor(win: Window = window, initial: Screen = 'paste') {
    this.win = win
    const existing = win.history.state as HistoryState
    this.screen = isScreen(existing?.screen) ? existing.screen : initial
    if (!isScreen(existing?.screen)) {
      win.history.replaceState({ screen: this.screen } satisfies HistoryState, '')
    }
    this.win.addEventListener('popstate', this.handlePopState)
  }

  private handlePopState = (event: PopStateEvent): void => {
    const state = event.state as HistoryState
    const next = isScreen(state?.screen) ? state.screen : 'paste'
    this.screen = next
    this.notify(next)
  }

  /** Navigate forward to a new screen, pushing a browser history entry. */
  go(next: Screen): void {
    this.screen = next
    this.win.history.pushState({ screen: next } satisfies HistoryState, '')
    this.notify(next)
  }

  /** Swap the current screen without adding a history entry (e.g. paste -> deployability on first load). */
  replace(next: Screen): void {
    this.screen = next
    this.win.history.replaceState({ screen: next } satisfies HistoryState, '')
    this.notify(next)
  }

  subscribe(listener: (screen: Screen) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notify(screen: Screen): void {
    for (const listener of this.listeners) listener(screen)
  }

  dispose(): void {
    this.win.removeEventListener('popstate', this.handlePopState)
    this.listeners.clear()
  }
}
