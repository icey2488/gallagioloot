import { describe, expect, it } from 'vitest'
import { extractLearnedTierData, getLearnedTierData, mergeLearnedTierData, saveLearnedTierData } from '../src/lookup/tierLearned'
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
  it('persists and merges across saves for the same instance id, keyed independently per instance', async () => {
    const env = {}
    const instanceId = 424242 // unique per test run to avoid cross-test interference in the module-level store

    expect(await getLearnedTierData(env, instanceId)).toEqual({ byItem: {}, bySlot: {} })

    await saveLearnedTierData(env, instanceId, { byItem: { 1: [10] }, bySlot: { head: [10] } })
    const afterFirst = await getLearnedTierData(env, instanceId)
    expect(afterFirst.byItem[1]).toEqual([10])

    await saveLearnedTierData(env, instanceId, { byItem: { 1: [20] }, bySlot: { head: [20] } })
    const afterSecond = await getLearnedTierData(env, instanceId)
    expect(afterSecond.byItem[1].sort()).toEqual([10, 20])
    expect(afterSecond.bySlot.head.sort()).toEqual([10, 20])

    expect(await getLearnedTierData(env, 424243)).toEqual({ byItem: {}, bySlot: {} })
  })
})
