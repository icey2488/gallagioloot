import { describe, expect, it } from 'vitest'
import {
  getAllSeedInstanceIds,
  getCurioEncounterId,
  getSeedEncountersForSlot,
  getSeedTierMap,
  isKnownSeedInstance,
  TIER_SLOTS,
} from '../src/lookup/tierSeed'

describe('tierSeed', () => {
  it('maps each Venomous Abyss tier slot to its direct boss plus the curio encounter', () => {
    expect(getSeedEncountersForSlot(1320, 'hands').sort()).toEqual([2874, 2895])
    expect(getSeedEncountersForSlot(1320, 'shoulder').sort()).toEqual([2894, 2895])
    expect(getSeedEncountersForSlot(1320, 'chest').sort()).toEqual([2882, 2895])
    expect(getSeedEncountersForSlot(1320, 'legs').sort()).toEqual([2871, 2895])
    expect(getSeedEncountersForSlot(1320, 'head').sort()).toEqual([2887, 2895])
  })

  it("expands Ula'tek's curio to all five tier slots", () => {
    for (const slot of TIER_SLOTS) {
      expect(getSeedEncountersForSlot(1320, slot)).toContain(2895)
    }
    expect(getCurioEncounterId(1320)).toBe(2895)
  })

  it('returns no tier slots for non-token bosses', () => {
    expect(getSeedTierMap(1320)).not.toHaveProperty('none')
    // Nek'zali and The Coiled Altar contribute no slot, so they never appear as a value's owner --
    // this is implicitly covered by the exact slot->encounters assertions above.
  })

  it('returns an empty list for an unknown instance', () => {
    expect(getSeedEncountersForSlot(999999, 'head')).toEqual([])
    expect(isKnownSeedInstance(999999)).toBe(false)
  })

  it('registers the not-yet-open Tidebound Grotto Lair with no tier slots', () => {
    // NOTE: verified live 2026-09-08 that Tidebound Grotto is instanceId 1317 (not 1322,
    // which is a different, unrelated dungeon "Altar of Fangs") -- see comment in tierSeed.ts.
    expect(isKnownSeedInstance(1317)).toBe(true)
    expect(getSeedTierMap(1317)).toEqual({})
    expect(getCurioEncounterId(1317)).toBeUndefined()
  })

  it('lists all registered seed instance ids', () => {
    expect(getAllSeedInstanceIds().sort()).toEqual([1317, 1320])
  })

  it('builds the full slot->encounters map for a known instance', () => {
    const map = getSeedTierMap(1320)
    expect(Object.keys(map).sort()).toEqual(['chest', 'hands', 'head', 'legs', 'shoulder'])
    expect(map.head.sort()).toEqual([2887, 2895])
  })
})
