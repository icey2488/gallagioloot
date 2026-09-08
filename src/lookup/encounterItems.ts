import type { EncounterItemEntry, EncounterItemsLookup, InstanceEntry } from '../types'

const GAME_DATA_VERSION_RE = /"gameDataVersion"\s*:\s*"([0-9a-f]{32})"/

/**
 * Extracts the current Raidbots static-data hash from the HTML of raidbots.com.
 * The hash lives in an inline `config = {...}` script block as `gameDataVersion`,
 * not in a `/static/data/{hash}/` URL anywhere in the markup (verified 2026-09-08).
 */
export function extractGameDataVersion(html: string): string | null {
  const match = html.match(GAME_DATA_VERSION_RE)
  return match ? match[1] : null
}

/**
 * Builds the itemId/encounterId/instanceId lookup maps from the four raw
 * Raidbots static-data files. Pure — no network or cache access.
 *
 * encounter-names.json and instance-names.json are flat `{ [id: string]: string }`
 * objects, not arrays (the spec assumed arrays; verified 2026-09-08).
 */
export function buildEncounterItemsLookup(
  encounterItems: EncounterItemEntry[],
  instances: InstanceEntry[],
  encounterNames: Record<string, string>,
  instanceNames: Record<string, string>
): EncounterItemsLookup {
  const itemSources = new Map<number, Array<{ instanceId: number; encounterId: number }>>()
  const itemMeta = new Map<number, { name: string; inventoryType?: number }>()
  for (const item of encounterItems) {
    itemSources.set(
      item.id,
      (item.sources || []).map((s) => ({ instanceId: s.instanceId, encounterId: s.encounterId }))
    )
    itemMeta.set(item.id, { name: item.name, inventoryType: item.inventoryType })
  }

  const encounterNameMap = new Map<number, string>()
  for (const [id, name] of Object.entries(encounterNames)) {
    encounterNameMap.set(Number(id), name)
  }
  // instances.json also carries per-encounter names (including trash entries like -97);
  // fold those in too so trash/negative encounter ids resolve without needing encounter-names.json.
  for (const instance of instances) {
    for (const encounter of instance.encounters || []) {
      if (!encounterNameMap.has(encounter.id)) {
        encounterNameMap.set(encounter.id, encounter.name)
      }
    }
  }

  const instanceNameMap = new Map<number, string>()
  const instanceTypeMap = new Map<number, string>()
  for (const [id, name] of Object.entries(instanceNames)) {
    instanceNameMap.set(Number(id), name)
  }
  for (const instance of instances) {
    if (!instanceNameMap.has(instance.id)) instanceNameMap.set(instance.id, instance.name)
    if (instance.type) instanceTypeMap.set(instance.id, instance.type)
  }

  return {
    itemSources,
    itemMeta,
    encounterNames: encounterNameMap,
    instanceNames: instanceNameMap,
    instanceTypes: instanceTypeMap,
  }
}

/**
 * Picks the best (instanceId, encounterId) source for an item when the caller
 * doesn't already know the instance (e.g. QE Live results, which have no
 * encounter info at all). Prefers a "real" positive instance id whose type
 * matches contentType over aggregate/catalog buckets like -1 (Mythic+ Dungeons)
 * or -87 (Catalyst Season 1).
 */
export function pickBestSource(
  lookup: EncounterItemsLookup,
  itemId: number,
  contentType: 'raid' | 'dungeon' | 'other'
): { instanceId: number; encounterId: number } | null {
  const sources = lookup.itemSources.get(itemId)
  if (!sources || sources.length === 0) return null

  const positive = sources.filter((s) => s.instanceId > 0)
  if (positive.length === 0) return null

  if (contentType !== 'other') {
    const typeMatch = positive.find((s) => lookup.instanceTypes.get(s.instanceId) === contentType)
    if (typeMatch) return typeMatch
  }

  return positive[0]
}

const GAME_DATA_VERSION_CACHE_KEY = 'https://cache.gallagioloot.local/game-data-version'
const GAME_DATA_VERSION_TTL_SECONDS = 24 * 60 * 60
const LOOKUP_CACHE_TTL_SECONDS = 24 * 60 * 60

export type LookupEnv = {
  ENCOUNTER_ITEMS_KV?: KVNamespace
}

async function discoverGameDataVersion(fetchFn: typeof fetch): Promise<string> {
  const res = await fetchFn('https://www.raidbots.com/')
  if (!res.ok) throw new Error(`Failed to fetch raidbots.com homepage: ${res.status}`)
  const html = await res.text()
  const version = extractGameDataVersion(html)
  if (!version) throw new Error('Could not find gameDataVersion in raidbots.com homepage')
  return version
}

async function getGameDataVersion(env: LookupEnv, fetchFn: typeof fetch): Promise<string> {
  if (env.ENCOUNTER_ITEMS_KV) {
    const cached = await env.ENCOUNTER_ITEMS_KV.get('game-data-version')
    if (cached) return cached
    const version = await discoverGameDataVersion(fetchFn)
    await env.ENCOUNTER_ITEMS_KV.put('game-data-version', version, {
      expirationTtl: GAME_DATA_VERSION_TTL_SECONDS,
    })
    return version
  }

  const cache = caches.default
  const cacheKey = new Request(GAME_DATA_VERSION_CACHE_KEY)
  const cached = await cache.match(cacheKey)
  if (cached) return await cached.text()

  const version = await discoverGameDataVersion(fetchFn)
  await cache.put(
    cacheKey,
    new Response(version, {
      headers: { 'Cache-Control': `public, max-age=${GAME_DATA_VERSION_TTL_SECONDS}` },
    })
  )
  return version
}

async function fetchStaticJson<T>(fetchFn: typeof fetch, hash: string, file: string): Promise<T> {
  const res = await fetchFn(`https://www.raidbots.com/static/data/${hash}/${file}`)
  if (!res.ok) throw new Error(`Failed to fetch ${file} (hash ${hash}): ${res.status}`)
  return (await res.json()) as T
}

/**
 * Fetches (or reuses a cached copy of) the current Raidbots encounter-items lookup.
 * Uses Workers KV when configured, else falls back to the Cache API so this also
 * works under `wrangler dev` without KV bindings.
 */
export async function getEncounterItemsLookup(
  env: LookupEnv,
  fetchFn: typeof fetch = fetch
): Promise<EncounterItemsLookup> {
  const version = await getGameDataVersion(env, fetchFn)

  if (env.ENCOUNTER_ITEMS_KV) {
    const cachedRaw = await env.ENCOUNTER_ITEMS_KV.get(`lookup:${version}`)
    if (cachedRaw) return deserializeLookup(JSON.parse(cachedRaw))
  } else {
    const cache = caches.default
    const cacheKey = new Request(`https://cache.gallagioloot.local/lookup/${version}`)
    const cached = await cache.match(cacheKey)
    if (cached) return deserializeLookup(await cached.json())
  }

  const [encounterItems, instances, encounterNames, instanceNames] = await Promise.all([
    fetchStaticJson<EncounterItemEntry[]>(fetchFn, version, 'encounter-items.json'),
    fetchStaticJson<InstanceEntry[]>(fetchFn, version, 'instances.json'),
    fetchStaticJson<Record<string, string>>(fetchFn, version, 'encounter-names.json'),
    fetchStaticJson<Record<string, string>>(fetchFn, version, 'instance-names.json'),
  ])

  const lookup = buildEncounterItemsLookup(encounterItems, instances, encounterNames, instanceNames)
  const serialized = serializeLookup(lookup)

  if (env.ENCOUNTER_ITEMS_KV) {
    await env.ENCOUNTER_ITEMS_KV.put(`lookup:${version}`, JSON.stringify(serialized), {
      expirationTtl: LOOKUP_CACHE_TTL_SECONDS,
    })
  } else {
    const cache = caches.default
    const cacheKey = new Request(`https://cache.gallagioloot.local/lookup/${version}`)
    await cache.put(
      cacheKey,
      new Response(JSON.stringify(serialized), {
        headers: { 'Cache-Control': `public, max-age=${LOOKUP_CACHE_TTL_SECONDS}` },
      })
    )
  }

  return lookup
}

type SerializedLookup = {
  itemSources: Array<[number, Array<{ instanceId: number; encounterId: number }>]>
  itemMeta: Array<[number, { name: string; inventoryType?: number }]>
  encounterNames: Array<[number, string]>
  instanceNames: Array<[number, string]>
  instanceTypes: Array<[number, string]>
}

function serializeLookup(lookup: EncounterItemsLookup): SerializedLookup {
  return {
    itemSources: [...lookup.itemSources.entries()],
    itemMeta: [...lookup.itemMeta.entries()],
    encounterNames: [...lookup.encounterNames.entries()],
    instanceNames: [...lookup.instanceNames.entries()],
    instanceTypes: [...lookup.instanceTypes.entries()],
  }
}

function deserializeLookup(serialized: SerializedLookup): EncounterItemsLookup {
  return {
    itemSources: new Map(serialized.itemSources),
    itemMeta: new Map(serialized.itemMeta),
    encounterNames: new Map(serialized.encounterNames),
    instanceNames: new Map(serialized.instanceNames),
    instanceTypes: new Map(serialized.instanceTypes),
  }
}
