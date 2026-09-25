import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createState, serialize, storageKey } from '@engine/core/knockout'
import {
  LocalStorageAdapter,
  loadLastReportUrl,
  loadLastTopGearUrl,
  loadSettings,
  loadVoidcoreCount,
  migrateLegacyLocationKey,
  saveLastReportUrl,
  saveLastTopGearUrl,
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

describe('migrateLegacyLocationKey (empty region/realm -> resolved key)', () => {
  const KNOCKOUT_PREFIX = 'gallagioloot:knockout:'

  it('migrates a single legacy (empty region/realm) key to the resolved key, filling in region/realm', () => {
    // Legacy key written before region/realm were resolved: "::icemagus:raid-vault-mythic".
    const legacy = createState('icemagus', 'raid-vault-mythic') // no realm/region -> "::icemagus:raid-vault-mythic"
    const legacyKey = storageKey(legacy)
    localStorage.setItem(KNOCKOUT_PREFIX + legacyKey, serialize(legacy))

    const resolvedKey = storageKey({ character: 'icemagus', realm: 'hyjal', region: 'us', difficulty: 'raid-vault-mythic' })
    const migrated = migrateLegacyLocationKey(resolvedKey)

    expect(migrated).not.toBeNull()
    expect(migrated!.region).toBe('us')
    expect(migrated!.realm).toBe('hyjal')
    // Legacy key removed, resolved key now holds the data.
    expect(localStorage.getItem(KNOCKOUT_PREFIX + legacyKey)).toBeNull()
    expect(localStorage.getItem(KNOCKOUT_PREFIX + resolvedKey)).not.toBeNull()
  })

  it('does not migrate (and logs) when more than one legacy key matches the same character+difficulty', () => {
    // Two differently-shaped legacy keys for the same character+difficulty: both empty, and
    // realm-only-missing. Ambiguous -- leave both, warn.
    const bothEmpty = storageKey({ character: 'icemagus', difficulty: 'raid-vault-mythic' })
    const realmMissing = storageKey({ character: 'icemagus', region: 'us', difficulty: 'raid-vault-mythic' })
    localStorage.setItem(KNOCKOUT_PREFIX + bothEmpty, serialize(createState('icemagus', 'raid-vault-mythic')))
    localStorage.setItem(KNOCKOUT_PREFIX + realmMissing, serialize(createState('icemagus', 'raid-vault-mythic', undefined, 'us')))

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const resolvedKey = storageKey({ character: 'icemagus', realm: 'hyjal', region: 'us', difficulty: 'raid-vault-mythic' })
    const migrated = migrateLegacyLocationKey(resolvedKey)

    expect(migrated).toBeNull()
    expect(warn).toHaveBeenCalled()
    expect(localStorage.getItem(KNOCKOUT_PREFIX + bothEmpty)).not.toBeNull()
    expect(localStorage.getItem(KNOCKOUT_PREFIX + realmMissing)).not.toBeNull()
    warn.mockRestore()
  })

  it('never clobbers an existing resolved key', () => {
    const resolvedKey = storageKey({ character: 'icemagus', realm: 'hyjal', region: 'us', difficulty: 'raid-vault-mythic' })
    localStorage.setItem(KNOCKOUT_PREFIX + resolvedKey, serialize(createState('icemagus', 'raid-vault-mythic', 'hyjal', 'us')))
    localStorage.setItem(KNOCKOUT_PREFIX + storageKey(createState('icemagus', 'raid-vault-mythic')), serialize(createState('icemagus', 'raid-vault-mythic')))

    expect(migrateLegacyLocationKey(resolvedKey)).toBeNull()
  })

  it('is a no-op when the resolved key is itself legacy-shaped (empty region/realm)', () => {
    localStorage.setItem(KNOCKOUT_PREFIX + '::icemagus:raid-vault-mythic', serialize(createState('icemagus', 'raid-vault-mythic')))
    expect(migrateLegacyLocationKey('::icemagus:raid-vault-mythic')).toBeNull()
  })

  it('leaves a legacy key for a different character untouched', () => {
    const other = storageKey({ character: 'bravechar', difficulty: 'raid-vault-mythic' })
    localStorage.setItem(KNOCKOUT_PREFIX + other, serialize(createState('bravechar', 'raid-vault-mythic')))
    const resolvedKey = storageKey({ character: 'icemagus', realm: 'hyjal', region: 'us', difficulty: 'raid-vault-mythic' })

    expect(migrateLegacyLocationKey(resolvedKey)).toBeNull()
    expect(localStorage.getItem(KNOCKOUT_PREFIX + other)).not.toBeNull()
  })
})

describe('settings / last report URL / voidcore persistence', () => {
  const key = 'us:hyjal:iceshaman:heroic'

  it('falls back to default settings when nothing is stored', () => {
    expect(loadSettings(key)).toEqual(DEFAULT_STORED_SETTINGS)
  })

  it('round-trips settings', () => {
    const stored = { thresholdPct: 0.5, spendOverride: 1, earnedPerWeek: 2, seasonWeek: 9, weeksLeft: 4 }
    saveSettings(key, stored)
    expect(loadSettings(key)).toEqual(stored)
  })

  it('migrates v2.08 "Rolls available": 2 (season week 8+) becomes 2 earned per week, 1 is dropped, no spend cap survives', () => {
    localStorage.setItem(`gallagioloot:settings:${key}`, JSON.stringify({ thresholdPct: 0.3, rollsAvailable: 2 }))
    expect(loadSettings(key)).toEqual({ thresholdPct: 0.3, spendOverride: null, earnedPerWeek: 2, seasonWeek: null, weeksLeft: null })
    localStorage.setItem(`gallagioloot:settings:${key}`, JSON.stringify({ thresholdPct: 0.3, rollsAvailable: 1 }))
    expect(loadSettings(key)).toEqual({ ...DEFAULT_STORED_SETTINGS, thresholdPct: 0.3 })
    // An earning rate already stored wins over the old value.
    localStorage.setItem(`gallagioloot:settings:${key}`, JSON.stringify({ thresholdPct: 0.3, rollsAvailable: 2, earnedPerWeek: 1 }))
    expect(loadSettings(key).earnedPerWeek).toBe(1)
    expect('rollsAvailable' in loadSettings(key)).toBe(false)
  })

  it('ignores garbage in stored settings', () => {
    localStorage.setItem(`gallagioloot:settings:${key}`, JSON.stringify({ thresholdPct: 'x', spendOverride: -2, earnedPerWeek: 'two', seasonWeek: 3.7, weeksLeft: null }))
    expect(loadSettings(key)).toEqual({ ...DEFAULT_STORED_SETTINGS, seasonWeek: 3 })
  })

  it('round-trips the last report URL', () => {
    expect(loadLastReportUrl(key)).toBeNull()
    saveLastReportUrl(key, 'https://www.raidbots.com/reports/abc')
    expect(loadLastReportUrl(key)).toBe('https://www.raidbots.com/reports/abc')
  })

  it('round-trips the last Top Gear report URL, independently of the last (sim) report URL', () => {
    expect(loadLastTopGearUrl(key)).toBeNull()
    saveLastReportUrl(key, 'https://www.raidbots.com/reports/abc')
    saveLastTopGearUrl(key, 'https://www.raidbots.com/reports/xyz')
    expect(loadLastTopGearUrl(key)).toBe('https://www.raidbots.com/reports/xyz')
    expect(loadLastReportUrl(key)).toBe('https://www.raidbots.com/reports/abc')
  })

  it('round-trips the voidcore count, defaulting to 0', () => {
    expect(loadVoidcoreCount(key)).toBe(0)
    saveVoidcoreCount(key, 3)
    expect(loadVoidcoreCount(key)).toBe(3)
  })

  it('keeps settings/url/voidcore isolated per character key', () => {
    const otherKey = 'us:hyjal:bravechar:mythic'
    saveSettings(key, { ...DEFAULT_STORED_SETTINGS, thresholdPct: 0.5, earnedPerWeek: 2 })
    expect(loadSettings(otherKey)).toEqual(DEFAULT_STORED_SETTINGS)
  })
})
