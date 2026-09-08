import { describe, expect, it } from 'vitest'
import { buildEncounterItemsLookup, extractGameDataVersion, pickBestSource } from '../src/lookup/encounterItems'
import type { EncounterItemEntry, InstanceEntry } from '../src/types'

describe('extractGameDataVersion', () => {
  it('extracts the hash from an inline config script, not a /static/data/ URL', () => {
    const html = `<script>var config = {"btServerHost":"x","gameDataVersion":"539a6d6eaff3f906b65989b9c21c1f91","envState":{}};</script>`
    expect(extractGameDataVersion(html)).toBe('539a6d6eaff3f906b65989b9c21c1f91')
  })

  it('returns null when no hash is present', () => {
    expect(extractGameDataVersion('<html></html>')).toBeNull()
  })
})

const ITEMS: EncounterItemEntry[] = [
  { id: 270162, name: 'Soulcoiler Ritual Vessel', inventoryType: 12, sources: [{ instanceId: 1320, encounterId: 2888 }] },
  {
    id: 158366,
    name: 'Charged Sandstone Band',
    inventoryType: 11,
    sources: [
      { instanceId: 1030, encounterId: 2144 },
      { instanceId: -1, encounterId: 1030 },
    ],
  },
]

const INSTANCES: InstanceEntry[] = [
  {
    id: 1320,
    name: 'The Venomous Abyss',
    type: 'raid',
    encounters: [
      { id: 2888, name: "Nek'zali the Soulcoiler" },
      { id: -97, name: 'Trash Drop', trash: true },
    ],
  },
  {
    id: 1030,
    name: 'Temple of Sethraliss',
    type: 'dungeon',
    encounters: [{ id: 2144, name: 'Galvazzt' }],
  },
]

const ENCOUNTER_NAMES = { '2888': "Nek'zali the Soulcoiler", '2144': 'Galvazzt' }
const INSTANCE_NAMES = { '1320': 'The Venomous Abyss', '1030': 'Temple of Sethraliss' }

describe('buildEncounterItemsLookup', () => {
  const lookup = buildEncounterItemsLookup(ITEMS, INSTANCES, ENCOUNTER_NAMES, INSTANCE_NAMES)

  it('indexes item sources by item id', () => {
    expect(lookup.itemSources.get(270162)).toEqual([{ instanceId: 1320, encounterId: 2888 }])
  })

  it('indexes item metadata (name, inventoryType) by item id', () => {
    expect(lookup.itemMeta.get(270162)).toEqual({ name: 'Soulcoiler Ritual Vessel', inventoryType: 12 })
  })

  it('folds in trash/negative encounter names from instances.json even when absent from encounter-names.json', () => {
    expect(lookup.encounterNames.get(-97)).toBe('Trash Drop')
  })

  it('indexes instance types', () => {
    expect(lookup.instanceTypes.get(1320)).toBe('raid')
    expect(lookup.instanceTypes.get(1030)).toBe('dungeon')
  })
})

describe('pickBestSource', () => {
  const lookup = buildEncounterItemsLookup(ITEMS, INSTANCES, ENCOUNTER_NAMES, INSTANCE_NAMES)

  it('returns the single positive-instance source for an unambiguous raid item', () => {
    expect(pickBestSource(lookup, 270162, 'raid')).toEqual({ instanceId: 1320, encounterId: 2888 })
  })

  it('prefers the source whose instance type matches contentType over aggregate buckets', () => {
    // 158366 has a real dungeon source (1030/2144) and an aggregate one (-1/1030, filtered out as non-positive).
    expect(pickBestSource(lookup, 158366, 'dungeon')).toEqual({ instanceId: 1030, encounterId: 2144 })
  })

  it('returns null for an item with no known sources', () => {
    expect(pickBestSource(lookup, 999999, 'raid')).toBeNull()
  })
})
