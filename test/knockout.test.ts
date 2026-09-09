import { describe, expect, it } from 'vitest'
import {
  InMemoryStorageAdapter,
  addEntry,
  createState,
  deserialize,
  markSpecSpecific,
  reconcile,
  removeEntry,
  serialize,
  storageKey,
} from '../src/core/knockout'
import type { KnockoutEntry } from '../src/core/types'
import type { NormalizedItem, NormalizedReport } from '../src/types'

const BASELINE = 100000

function item(overrides: Partial<NormalizedItem> = {}): NormalizedItem {
  return {
    itemId: 1,
    name: 'Test Item',
    encounterId: 2888,
    encounterName: "Nek'zali the Soulcoiler",
    instanceId: 1320,
    ilvl: 333,
    delta: 1000,
    pct: 1,
    ...overrides,
  }
}

function makeReport(items: NormalizedItem[]): NormalizedReport {
  return {
    source: 'raidbots',
    reportId: 'abc',
    character: 'Iceshaman',
    spec: 'elemental',
    role: 'dps',
    metric: 'dps',
    contentType: 'raid',
    difficulty: 'raid-vault-heroic',
    baseline: BASELINE,
    items,
    warnings: [],
  }
}

describe('createState', () => {
  it('creates an empty state with version 1', () => {
    const state = createState('Iceshaman', 'raid-vault-heroic', 'Area 52', 'us')
    expect(state).toEqual({ character: 'Iceshaman', realm: 'Area 52', region: 'us', difficulty: 'raid-vault-heroic', entries: [], version: 1 })
  })
})

describe('addEntry / removeEntry', () => {
  it('is idempotent on itemId -- adding the same itemId twice does not duplicate', () => {
    const state = createState('Iceshaman', 'raid-vault-heroic')
    const entry: KnockoutEntry = { itemId: 100, itemName: 'Ring', encounterId: 2888, receivedAt: '2026-09-01T00:00:00Z', source: 'roll' }
    const once = addEntry(state, entry)
    const twice = addEntry(once, { ...entry, itemName: 'Ring (updated)' })
    expect(twice.entries).toHaveLength(1)
    expect(twice.entries[0].itemName).toBe('Ring (updated)')
  })

  it('removeEntry drops only the matching itemId', () => {
    const state = createState('Iceshaman', 'raid-vault-heroic')
    const withTwo = addEntry(
      addEntry(state, { itemId: 100, itemName: 'Ring', encounterId: 2888, receivedAt: '2026-09-01T00:00:00Z', source: 'roll' }),
      { itemId: 200, itemName: 'Belt', encounterId: 2888, receivedAt: '2026-09-01T00:00:00Z', source: 'roll' }
    )
    const removed = removeEntry(withTwo, 100)
    expect(removed.entries.map((e) => e.itemId)).toEqual([200])
  })
})

describe('markSpecSpecific', () => {
  it('sets specSpecific and spec on the matching entry only', () => {
    const state = createState('Iceshaman', 'raid-vault-heroic')
    const withEntries = addEntry(
      addEntry(state, { itemId: 100, itemName: 'Ring', encounterId: 2888, receivedAt: '2026-09-01T00:00:00Z', source: 'roll' }),
      { itemId: 200, itemName: 'Belt', encounterId: 2888, receivedAt: '2026-09-01T00:00:00Z', source: 'roll' }
    )
    const marked = markSpecSpecific(withEntries, 100, 'restoration')
    expect(marked.entries.find((e) => e.itemId === 100)).toMatchObject({ specSpecific: true, spec: 'restoration' })
    expect(marked.entries.find((e) => e.itemId === 200)?.specSpecific).toBeUndefined()
  })
})

describe('serialize / deserialize', () => {
  it('round-trips a state', () => {
    const state = addEntry(createState('Iceshaman', 'raid-vault-heroic', 'Area 52', 'us'), {
      itemId: 100,
      itemName: 'Ring',
      encounterId: 2888,
      receivedAt: '2026-09-01T00:00:00Z',
      source: 'roll',
      specSpecific: true,
      spec: 'elemental',
    })
    const roundTripped = deserialize(serialize(state))
    expect(roundTripped).toEqual(state)
  })

  it('is tolerant of unknown/missing fields', () => {
    const state = deserialize(JSON.stringify({ character: 'Iceshaman', difficulty: 'raid-vault-heroic', futureField: 'x', entries: [{ itemId: 5, extra: true }] }))
    expect(state.version).toBe(1)
    expect(state.entries).toEqual([
      { itemId: 5, itemName: 'Item 5', encounterId: -1, receivedAt: '', spec: undefined, specSpecific: undefined, lootSpecId: undefined, source: 'roll' },
    ])
  })

  it('round-trips a manual entry with specSpecific override and lootSpecId', () => {
    const state = addEntry(createState('Iceshaman', 'raid-vault-heroic'), {
      itemId: 300,
      itemName: 'Manually Tracked Ring',
      encounterId: 2874,
      receivedAt: '2026-09-08T00:00:00Z',
      specSpecific: true,
      spec: 'elemental',
      lootSpecId: 262,
      source: 'manual',
    })
    const roundTripped = deserialize(serialize(state))
    expect(roundTripped).toEqual(state)
    expect(roundTripped.entries[0]).toMatchObject({ source: 'manual', specSpecific: true, lootSpecId: 262 })
  })
})

describe('storageKey / InMemoryStorageAdapter', () => {
  it('builds a lowercased region:realm:character:difficulty key', () => {
    const key = storageKey({ character: 'Iceshaman', realm: 'Area 52', region: 'US', difficulty: 'Raid-Vault-Heroic' })
    expect(key).toBe('us:area 52:iceshaman:raid-vault-heroic')
  })

  it('saves and loads state through the in-memory adapter', async () => {
    const adapter = new InMemoryStorageAdapter()
    const state = createState('Iceshaman', 'raid-vault-heroic')
    const key = storageKey(state)
    expect(await adapter.load(key)).toBeNull()
    await adapter.save(key, state)
    expect(await adapter.load(key)).toEqual(state)
    expect(await adapter.list()).toEqual([key])
  })
})

describe('reconcile', () => {
  it('knocks out the whole curio entry when the received item is one of its constituents', () => {
    const report = makeReport([
      item({ itemId: 300, name: 'Tier Head Token', encounterId: 2895, encounterName: "Ula'tek", delta: 1100, viaCurio: true, tierSlot: 'head' }),
      item({ itemId: 301, name: 'Tier Shoulder Token', encounterId: 2895, encounterName: "Ula'tek", delta: 900, viaCurio: true, tierSlot: 'shoulder' }),
    ])
    const state = createState('Iceshaman', 'raid-vault-heroic')
    const settings = { thresholdPct: 0.2, rollsAvailable: 1, includeOffSpec: false }

    const result = reconcile(state, report, { encounterId: 2895, receivedItemId: 300, receivedAt: '2026-09-08T00:00:00Z' }, settings)

    expect(result.state.entries).toHaveLength(1)
    const curioBoss = result.bossEvals.find((b) => b.encounterId === 2895)
    expect(curioBoss?.pool).toHaveLength(1)
    expect(curioBoss?.pool[0].kind).toBe('curio')
    expect(curioBoss?.pool[0].knockedOut).toBe(true)
    expect(curioBoss?.remaining).toBe(0)
    expect(curioBoss?.deployable).toBe(false)
  })

  it('re-evaluates the recommendation after knocking out the only deployable boss', () => {
    const report = makeReport([item({ itemId: 100, delta: 1000 })])
    const state = createState('Iceshaman', 'raid-vault-heroic')
    const settings = { thresholdPct: 0.2, rollsAvailable: 1, includeOffSpec: false }

    const result = reconcile(state, report, { encounterId: 2888, receivedItemId: 100, receivedAt: '2026-09-08T00:00:00Z' }, settings)

    expect(result.recommendation.allocations).toEqual([])
    expect(result.recommendation.fallback?.reason).toBe('no-pool')
  })

  it('records the currently active lootSpecId (from settings) on every new knockout entry', () => {
    const report = makeReport([item({ itemId: 100, delta: 1000 })])
    const state = createState('Iceshaman', 'raid-vault-heroic')
    const settings = { thresholdPct: 0.2, rollsAvailable: 1, includeOffSpec: false, lootSpecId: 262 }

    const result = reconcile(state, report, { encounterId: 2888, receivedItemId: 100, receivedAt: '2026-09-08T00:00:00Z' }, settings)

    expect(result.state.entries[0]).toMatchObject({ itemId: 100, lootSpecId: 262 })
  })
})
