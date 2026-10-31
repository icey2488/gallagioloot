import { describe, expect, it, vi } from 'vitest'
import {
  addLearnedEvidence,
  extractLearnedTierData,
  getLearnedTierData,
  instanceEncounterIds,
  mergeLearnedTierData,
  MIN_LEARNED_REPORTS,
  saveLearnedTierData,
  trustedLearnedTierData,
} from '../src/lookup/tierLearned'
import type { RaidbotsRawReport } from '../src/normalize/raidbots'

function makeReport(): RaidbotsRawReport {
  return {
    sim: {
      players: [{ collected_data: { dps: { mean: 100000 } } }],
      profilesets: {
        metric: 'Damage per Second',
        results: [
          // Direct tier boss + curio (kept).
          { name: '1320/2887/raid-vault-heroic/271483/334/0/head////', mean: 110000 },
          { name: '1320/2895/raid-vault-heroic/271483/334/0/head////', mean: 111000 },
          // Catalyst conversion off a non-tier boss (trailing catalystSourceId set) -- excluded.
          { name: '1320/2888/raid-vault-heroic/271483/334/0/head////268230', mean: 109000 },
          // Trash catalyst conversion -- excluded.
          { name: '1320/-97/raid-vault-heroic/271483/334/0/head////271441', mean: 108000 },
          // A non-tier item -- excluded regardless of source.
          { name: '1320/2874/raid-vault-heroic/999999/334/0/waist////', mean: 105000 },
        ],
      },
    },
    simbot: {
      simType: 'droptimizer',
      player: 'Iceshaman',
      charClass: 'shaman',
      spec: 'elemental',
      meta: {
        rawFormData: { droptimizer: { instance: 1320, difficulty: 'raid-vault-heroic' } },
        itemLibrary: [
          { id: 271483, name: 'Serpent Crown of the Ophidian Oracle', itemSetId: 2065, inventoryType: 1 },
          { id: 999999, name: 'Some Waist Item', inventoryType: 6 },
        ],
        instanceLibrary: [],
      },
    },
  }
}

describe('extractLearnedTierData', () => {
  it('records only direct (non-catalyst, non-trash) sources for tier items', () => {
    const result = extractLearnedTierData(makeReport(), 1320)
    expect(result.byItem[271483].sort()).toEqual([2887, 2895])
    expect(result.bySlot.head.sort()).toEqual([2887, 2895])
  })

  it('ignores items with no itemSetId (not tier items)', () => {
    const result = extractLearnedTierData(makeReport(), 1320)
    expect(result.byItem[999999]).toBeUndefined()
  })
})

describe('mergeLearnedTierData', () => {
  it('unions encounter ids instead of replacing them', () => {
    const existing = { byItem: { 271483: [2887] }, bySlot: { head: [2887] } }
    const update = { byItem: { 271483: [2895] }, bySlot: { head: [2895] } }
    const merged = mergeLearnedTierData(existing, update)
    expect(merged.byItem[271483].sort()).toEqual([2887, 2895])
    expect(merged.bySlot.head.sort()).toEqual([2887, 2895])
  })

  it('de-duplicates when the same encounter id is learned twice', () => {
    const existing = { byItem: { 271483: [2887, 2895] }, bySlot: {} }
    const update = { byItem: { 271483: [2895] }, bySlot: {} }
    const merged = mergeLearnedTierData(existing, update)
    expect(merged.byItem[271483].sort()).toEqual([2887, 2895])
  })
})

describe('getLearnedTierData / saveLearnedTierData (in-memory fallback)', () => {
  it('trusts a mapping only after 2 distinct reports, keyed independently per instance', async () => {
    const env = {}
    const instanceId = 424242 // unique per test run to avoid cross-test interference in the module-level store

    expect(await getLearnedTierData(env, instanceId)).toEqual({ byItem: {}, bySlot: {} })

    await saveLearnedTierData(env, instanceId, { byItem: { 1: [10] }, bySlot: { head: [10] } }, 'reportA')
    expect(await getLearnedTierData(env, instanceId)).toEqual({ byItem: {}, bySlot: {} })
    // The same report again is not a second witness.
    await saveLearnedTierData(env, instanceId, { byItem: { 1: [10] }, bySlot: { head: [10] } }, 'reportA')
    expect(await getLearnedTierData(env, instanceId)).toEqual({ byItem: {}, bySlot: {} })

    await saveLearnedTierData(env, instanceId, { byItem: { 1: [10, 20] }, bySlot: { head: [10, 20] } }, 'reportB')
    const afterB = await getLearnedTierData(env, instanceId)
    expect(afterB.byItem[1]).toEqual([10])
    expect(afterB.bySlot.head).toEqual([10])

    await saveLearnedTierData(env, instanceId, { byItem: { 1: [20] }, bySlot: { head: [20] } }, 'reportC')
    const afterC = await getLearnedTierData(env, instanceId)
    expect(afterC.byItem[1]).toEqual([10, 20])
    expect(afterC.bySlot.head).toEqual([10, 20])

    expect(await getLearnedTierData(env, 424243)).toEqual({ byItem: {}, bySlot: {} })
  })
})

function fakeKV(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  const puts: string[] = []
  return {
    puts,
    data,
    kv: {
      get: vi.fn(async (k: string) => data.get(k) ?? null),
      put: vi.fn(async (k: string, v: string) => {
        puts.push(k)
        data.set(k, v)
      }),
    } as unknown as KVNamespace,
  }
}

describe('saveLearnedTierData with KV: skip unchanged puts', () => {
  it('writes the first two reports, then skips the put when the merged store is unchanged', async () => {
    const { kv, puts } = fakeKV()
    const env = { ENCOUNTER_ITEMS_KV: kv }
    const update = { byItem: { 1: [10] }, bySlot: { head: [10] } }
    await saveLearnedTierData(env, 7, update, 'a')
    await saveLearnedTierData(env, 7, update, 'a') // repeat fetch: unchanged
    await saveLearnedTierData(env, 7, update, 'b')
    await saveLearnedTierData(env, 7, update, 'c') // already trusted, ids capped: unchanged
    expect(puts).toHaveLength(2)
    expect(await getLearnedTierData(env, 7)).toEqual({ byItem: { 1: [10] }, bySlot: { head: [10] } })
  })

  it('reads a v1 (bare LearnedTierData) value as one legacy report: one more real report makes it trusted', async () => {
    const { kv } = fakeKV({ 'tier-learned:8': JSON.stringify({ byItem: { 5: [50] }, bySlot: { hands: [50] } }) })
    const env = { ENCOUNTER_ITEMS_KV: kv }
    expect(await getLearnedTierData(env, 8)).toEqual({ byItem: {}, bySlot: {} })
    await saveLearnedTierData(env, 8, { byItem: { 5: [50] }, bySlot: { hands: [50] } }, 'r1')
    expect(await getLearnedTierData(env, 8)).toEqual({ byItem: { 5: [50] }, bySlot: { hands: [50] } })
  })
})

describe('addLearnedEvidence / trustedLearnedTierData', () => {
  it('needs MIN_LEARNED_REPORTS distinct ids', () => {
    expect(MIN_LEARNED_REPORTS).toBe(2)
    let store = addLearnedEvidence({ version: 2, byItem: {}, bySlot: {} }, { byItem: { 1: [10] }, bySlot: {} }, 'x')
    expect(trustedLearnedTierData(store).byItem).toEqual({})
    store = addLearnedEvidence(store, { byItem: { 1: [10] }, bySlot: {} }, 'y')
    expect(trustedLearnedTierData(store).byItem).toEqual({ 1: [10] })
  })
})

describe('extractLearnedTierData: encounter allow-list', () => {
  it('drops rows whose encounter is not listed for the instance', () => {
    const allowed = instanceEncounterIds({ encountersByInstance: new Map([[1320, [{ id: 2887, name: 'A' }, { id: 2895, name: 'B', trash: true }]]]) }, 1320)
    expect([...allowed]).toEqual([2887])
    const result = extractLearnedTierData(makeReport(), 1320, allowed)
    expect(result.byItem[271483]).toEqual([2887])
    expect(result.bySlot.head).toEqual([2887])
  })

  it('an unknown instance has no allowed encounters', () => {
    expect(instanceEncounterIds({ encountersByInstance: new Map() }, 1).size).toBe(0)
  })
})
