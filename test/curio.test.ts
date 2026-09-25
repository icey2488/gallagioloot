import { describe, expect, it } from 'vitest'
import { curioEntryKeys, dropCurioEntries } from '../src/core/curio'
import type { KnockoutEntry, KnockoutState } from '../src/core/types'
import type { LootTableEncounter, NormalizedItem } from '../src/types'

function entry(itemId: number, encounterId: number): KnockoutEntry {
  return { itemId, itemName: `Item ${itemId}`, encounterId, receivedAt: '', source: 'manual', state: 'rolled' }
}

function state(entries: KnockoutEntry[]): KnockoutState {
  return { character: 'Icemagus', difficulty: 'raid-vault-mythic', entries, rollsSpent: { 2895: 1 }, version: 2 }
}

describe('dropCurioEntries', () => {
  it('drops entries whose encounter:item key is a curio key, keeping every other entry and field', () => {
    const s = state([entry(271564, 2895), entry(271874, 2895), entry(271564, 2887)])
    const result = dropCurioEntries(s, new Set(['2895:271564']))
    expect(result.entries.map((e) => `${e.encounterId}:${e.itemId}`)).toEqual(['2895:271874', '2887:271564'])
    expect(result.rollsSpent).toEqual({ 2895: 1 })
    expect(result.character).toBe('Icemagus')
    expect(s.entries).toHaveLength(3) // not mutated
  })

  it('returns the same state object when nothing matches', () => {
    const s = state([entry(271874, 2895)])
    expect(dropCurioEntries(s, new Set(['2895:271564']))).toBe(s)
    expect(dropCurioEntries(s, new Set())).toBe(s)
  })
})

describe('curioEntryKeys', () => {
  const row = (itemId: number, encounterId: number, viaCurio?: boolean): NormalizedItem => ({
    itemId, name: 'x', encounterId, encounterName: 'x', instanceId: 1320, ilvl: 1, delta: 1, pct: 1, viaCurio,
  })
  const lootRow = (itemId: number, viaCurio: boolean) => ({ itemId, name: 'x', specSpecific: false, uniqueEquipped: false, onUseTrinket: false, isTier: viaCurio, viaCurio })

  it('collects viaCurio report rows and viaCurio loot-table rows, keyed by encounter and item', () => {
    const table: LootTableEncounter[] = [
      { encounterId: 2895, encounterName: "Ula'tek", items: [lootRow(271874, false), lootRow(271567, true)] },
      { encounterId: 2887, encounterName: 'The Twin Fangs', items: [lootRow(271564, false)] },
    ]
    const keys = curioEntryKeys({ items: [row(271565, 2895, true), row(271564, 2887, false), row(271563, 2895)] }, table)
    expect([...keys].sort()).toEqual(['2895:271565', '2895:271567'])
    expect(curioEntryKeys({ items: [] }).size).toBe(0)
  })
})
