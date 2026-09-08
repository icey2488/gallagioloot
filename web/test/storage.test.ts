import { beforeEach, describe, expect, it } from 'vitest'
import { createState, storageKey } from '@engine/core/knockout'
import {
  LocalStorageAdapter,
  loadLastReportUrl,
  loadSettings,
  loadVoidcoreCount,
  saveLastReportUrl,
  saveSettings,
  saveVoidcoreCount,
  DEFAULT_STORED_SETTINGS,
} from '../src/lib/storage'

beforeEach(() => {
  localStorage.clear()
})

describe('LocalStorageAdapter', () => {
  it('returns null for a key that has never been saved', async () => {
    const adapter = new LocalStorageAdapter()
    expect(await adapter.load('us:hyjal:iceshaman:heroic')).toBeNull()
  })

  it('round-trips a KnockoutState through save/load', async () => {
    const adapter = new LocalStorageAdapter()
    const state = createState('Iceshaman', 'heroic', 'Hyjal', 'US')
    const key = storageKey(state)

    await adapter.save(key, state)
    const loaded = await adapter.load(key)

    expect(loaded).toEqual(state)
  })

  it('lists saved keys, sorted, without the internal namespace prefix', async () => {
    const adapter = new LocalStorageAdapter()
    const a = createState('Bravechar', 'mythic', 'Hyjal', 'US')
    const b = createState('Iceshaman', 'heroic', 'Hyjal', 'US')

    await adapter.save(storageKey(a), a)
    await adapter.save(storageKey(b), b)

    const keys = await adapter.list()
    expect(keys).toEqual([storageKey(a), storageKey(b)].sort())
    expect(keys.every((k) => !k.includes('gallagioloot'))).toBe(true)
  })

  it('does not leak knockout entries into unrelated localStorage keys', async () => {
    const adapter = new LocalStorageAdapter()
    const state = createState('Iceshaman', 'heroic', 'Hyjal', 'US')
    await adapter.save(storageKey(state), state)

    localStorage.setItem('someOtherApp:data', 'unrelated')

    const keys = await adapter.list()
    expect(keys).toEqual([storageKey(state)])
  })

  it('removes a saved state', async () => {
    const adapter = new LocalStorageAdapter()
    const state = createState('Iceshaman', 'heroic', 'Hyjal', 'US')
    const key = storageKey(state)
    await adapter.save(key, state)

    await adapter.remove(key)

    expect(await adapter.load(key)).toBeNull()
    expect(await adapter.list()).toEqual([])
  })

  it('is tolerant of a corrupted entry (returns null instead of throwing)', async () => {
    const adapter = new LocalStorageAdapter()
    localStorage.setItem('gallagioloot:knockout:broken', '{not json')
    expect(await adapter.load('broken')).toBeNull()
  })
})

describe('settings / last report URL / voidcore persistence', () => {
  const key = 'us:hyjal:iceshaman:heroic'

  it('falls back to default settings when nothing is stored', () => {
    expect(loadSettings(key)).toEqual(DEFAULT_STORED_SETTINGS)
  })

  it('round-trips settings', () => {
    saveSettings(key, { thresholdPct: 0.5, rollsAvailable: 2 })
    expect(loadSettings(key)).toEqual({ thresholdPct: 0.5, rollsAvailable: 2 })
  })

  it('round-trips the last report URL', () => {
    expect(loadLastReportUrl(key)).toBeNull()
    saveLastReportUrl(key, 'https://www.raidbots.com/reports/abc')
    expect(loadLastReportUrl(key)).toBe('https://www.raidbots.com/reports/abc')
  })

  it('round-trips the voidcore count, defaulting to 0', () => {
    expect(loadVoidcoreCount(key)).toBe(0)
    saveVoidcoreCount(key, 3)
    expect(loadVoidcoreCount(key)).toBe(3)
  })

  it('keeps settings/url/voidcore isolated per character key', () => {
    const otherKey = 'us:hyjal:bravechar:mythic'
    saveSettings(key, { thresholdPct: 0.5, rollsAvailable: 2 })
    expect(loadSettings(otherKey)).toEqual(DEFAULT_STORED_SETTINGS)
  })
})
