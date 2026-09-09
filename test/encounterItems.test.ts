import { describe, expect, it } from 'vitest'
import { buildEncounterItemsLookup, extractGameDataVersion, getEncounterItemsLookup, pickBestSource } from '../src/lookup/encounterItems'
import type { EncounterItemEntry, InstanceEntry } from '../src/types'
import type { KVNamespace } from '@cloudflare/workers-types'

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

/** Minimal in-memory KVNamespace stand-in -- just enough of the interface getEncounterItemsLookup uses. */
class FakeKV {
  private store = new Map<string, string>()
  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null
  }
  async put(key: string, value: string): Promise<void> {
    this.store.set(key, value)
  }
}

const STALE_HASH = 'a'.repeat(32)
const FRESH_HASH = 'b'.repeat(32)

const STATIC_FILES: Record<string, unknown> = {
  'encounter-items.json': [{ id: 1, name: 'Test Item', sources: [{ instanceId: 1320, encounterId: 2888 }] }],
  'instances.json': [{ id: 1320, name: 'The Venomous Abyss', type: 'raid', encounters: [{ id: 2888, name: "Nek'zali the Soulcoiler" }] }],
  'encounter-names.json': { '2888': "Nek'zali the Soulcoiler" },
  'instance-names.json': { '1320': 'The Venomous Abyss' },
  'weapon-specs.json': [],
}

function makeRediscoveryFetch(): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url === 'https://www.raidbots.com/') {
      return new Response(`<script>var config = {"gameDataVersion":"${FRESH_HASH}","envState":{}};</script>`)
    }
    if (url.startsWith(`https://www.raidbots.com/static/data/${STALE_HASH}/`)) {
      return new Response('Not Found', { status: 404 })
    }
    const freshPrefix = `https://www.raidbots.com/static/data/${FRESH_HASH}/`
    if (url.startsWith(freshPrefix)) {
      const file = url.slice(freshPrefix.length)
      return new Response(JSON.stringify(STATIC_FILES[file]))
    }
    throw new Error(`unexpected fetch in test: ${url}`)
  }) as typeof fetch
}

describe('getEncounterItemsLookup (hash rediscovery)', () => {
  it('re-discovers the hash and retries when the cached hash 404s (Raidbots rotated its static-data hash)', async () => {
    const kv = new FakeKV()
    await kv.put('game-data-version-info', JSON.stringify({ version: STALE_HASH, discoveredAt: 0 }))
    const env = { ENCOUNTER_ITEMS_KV: kv as unknown as KVNamespace }

    const lookup = await getEncounterItemsLookup(env, makeRediscoveryFetch())

    expect(lookup.itemSources.get(1)).toEqual([{ instanceId: 1320, encounterId: 2888 }])
    expect(lookup.instanceNames.get(1320)).toBe('The Venomous Abyss')

    // The version-info record should now reflect the freshly discovered hash, and the
    // lookup should be cached under it -- so a second call doesn't refetch anything.
    const infoRaw = await kv.get('game-data-version-info')
    expect(JSON.parse(infoRaw!).version).toBe(FRESH_HASH)
    expect(await kv.get(`lookup:${FRESH_HASH}`)).not.toBeNull()
  })
})
