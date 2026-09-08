import { describe, expect, it } from 'vitest'
import { resolveTierEncounters } from '../src/lookup/tierResolve'
import type { LearnedTierData } from '../src/lookup/tierLearned'

describe('resolveTierEncounters', () => {
  it('prefers the learned per-item mapping over the seed when both are available', () => {
    const learned: LearnedTierData = { byItem: { 271483: [9001] }, bySlot: {} }
    const result = resolveTierEncounters(1320, 271483, 'head', learned)
    expect(result).toEqual([{ encounterId: 9001, viaCurio: false }])
  })

  it('falls back to the seed by slot when the item has no learned entry', () => {
    const result = resolveTierEncounters(1320, 271483, 'head', undefined)
    expect(result.sort((a, b) => a.encounterId - b.encounterId)).toEqual([
      { encounterId: 2887, viaCurio: false },
      { encounterId: 2895, viaCurio: true },
    ])
  })

  it('flags the curio encounter with viaCurio: true from the learned path too', () => {
    const learned: LearnedTierData = { byItem: { 271483: [2887, 2895] }, bySlot: {} }
    const result = resolveTierEncounters(1320, 271483, 'head', learned)
    expect(result.find((r) => r.encounterId === 2895)?.viaCurio).toBe(true)
    expect(result.find((r) => r.encounterId === 2887)?.viaCurio).toBe(false)
  })

  it('returns an empty array when neither learned nor seed knows the item/slot', () => {
    expect(resolveTierEncounters(1320, 555555, undefined, undefined)).toEqual([])
    expect(resolveTierEncounters(999999, 555555, 'head', undefined)).toEqual([])
  })
})
