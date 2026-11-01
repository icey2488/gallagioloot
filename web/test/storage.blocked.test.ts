import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createState, storageKey } from '@engine/core/knockout'
import {
  LocalStorageAdapter,
  loadLastReportUrl,
  loadReportSet,
  loadSettings,
  loadVoidcoreCount,
  migrateLegacyLocationKey,
  resetMemoryStorage,
  safeStorage,
  saveLastReportUrl,
  saveReportSet,
  saveSettings,
  saveVoidcoreCount,
  DEFAULT_STORED_SETTINGS,
} from '../src/lib/storage'

function quotaError(): Error {
  const e = new Error('The quota has been exceeded.')
  e.name = 'QuotaExceededError'
  return e
}

beforeEach(() => {
  localStorage.clear()
  resetMemoryStorage()
})

afterEach(() => {
  vi.restoreAllMocks()
  resetMemoryStorage()
})

describe('safeStorage: blocked localStorage (every call throws)', () => {
  beforeEach(() => {
    const proto = Object.getPrototypeOf(localStorage) as Storage
    for (const m of ['getItem', 'setItem', 'removeItem', 'key'] as const) {
      vi.spyOn(proto, m).mockImplementation(() => {
        throw new DOMException('denied', 'SecurityError')
      })
    }
  })

  it('never throws and keeps values in memory for the session', async () => {
    expect(() => saveSettings('k', { ...DEFAULT_STORED_SETTINGS, thresholdPct: 0.5 })).not.toThrow()
    expect(loadSettings('k').thresholdPct).toBe(0.5)
    saveVoidcoreCount('k', 3)
    expect(loadVoidcoreCount('k')).toBe(3)
    saveLastReportUrl('k', 'https://x')
    expect(loadLastReportUrl('k')).toBe('https://x')
    saveReportSet('c', ['a', 'b'])
    expect(loadReportSet('c')).toEqual(['a', 'b'])

    const adapter = new LocalStorageAdapter()
    const state = createState('Icemagus', 'heroic', 'hyjal', 'us')
    await adapter.save(storageKey(state), state)
    expect(await adapter.load(storageKey(state))).toEqual(state)
    expect(await adapter.list()).toEqual([storageKey(state)])
    await adapter.remove(storageKey(state))
    expect(await adapter.list()).toEqual([])
    expect(migrateLegacyLocationKey('us:hyjal:icemagus:heroic')).toBeNull()
  })

  it('reads default when nothing was written', () => {
    expect(loadSettings('none')).toEqual(DEFAULT_STORED_SETTINGS)
    expect(loadVoidcoreCount('none')).toBe(0)
    expect(safeStorage.keys()).toEqual([])
  })
})

describe('safeStorage: full localStorage (writes throw QuotaExceededError, reads work)', () => {
  it('a failed write shadows the older stored value instead of resurrecting it', () => {
    saveVoidcoreCount('k', 1)
    const proto = Object.getPrototypeOf(localStorage) as Storage
    vi.spyOn(proto, 'setItem').mockImplementation(() => {
      throw quotaError()
    })
    expect(() => saveVoidcoreCount('k', 4)).not.toThrow()
    expect(loadVoidcoreCount('k')).toBe(4)
    expect(localStorage.getItem('gallagioloot:voidcore:k')).toBe('1')
  })

  it('a later successful write clears the overlay', () => {
    const proto = Object.getPrototypeOf(localStorage) as Storage
    const spy = vi.spyOn(proto, 'setItem').mockImplementationOnce(() => {
      throw quotaError()
    })
    saveVoidcoreCount('k', 2)
    spy.mockRestore()
    saveVoidcoreCount('k', 5)
    expect(localStorage.getItem('gallagioloot:voidcore:k')).toBe('5')
    expect(loadVoidcoreCount('k')).toBe(5)
  })
})
