import { describe, expect, it } from 'vitest'
import { buildLootTable } from '../src/lookup/lootTable'
import { loadLookup } from './fixtures/load'

const ARCANE = 62

// In-game Adventure Journal order for The Venomous Abyss (Erick's screenshots). Raidbots
// instances.json lists the encounters in this order (its `order` field is 1..8), and
// buildLootTable preserves it, so the web boss list can use the loot table order directly.
const JOURNAL_ORDER_1320 = [
  "Nek'zali the Soulcoiler",
  'Entombed Sentinels',
  'The Lost Explorers',
  'Vashnik the Malignant',
  'Sszorak',
  'The Twin Fangs',
  'The Coiled Altar',
  "Ula'tek",
]

describe('loot table encounter order', () => {
  it('The Venomous Abyss (1320) is in Adventure Journal order', () => {
    expect(buildLootTable(1320, ARCANE, loadLookup()).map((e) => e.encounterName)).toEqual(JOURNAL_ORDER_1320)
  })
})
