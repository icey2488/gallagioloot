import type { EncounterItemEntry, EncounterItemsLookup, InstanceEntry, WeaponSpecEntry } from '../types'

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
  instanceNames: Record<string, string>,
  weaponSpecItems: WeaponSpecEntry[] = []
): EncounterItemsLookup {
  const itemSources = new Map<number, Array<{ instanceId: number; encounterId: number }>>()
  const itemMeta = new Map<number, { name: string; inventoryType?: number }>()
  const rawItems = new Map<number, EncounterItemEntry>()
  for (const item of encounterItems) {
    itemSources.set(
      item.id,
      (item.sources || []).map((s) => ({ instanceId: s.instanceId, encounterId: s.encounterId }))
    )
    itemMeta.set(item.id, { name: item.name, inventoryType: item.inventoryType })
    rawItems.set(item.id, item)
  }

  const encountersByInstance = new Map<number, Array<{ id: number; name: string; trash?: boolean }>>()
  for (const instance of instances) {
    encountersByInstance.set(instance.id, instance.encounters || [])
  }

  const weaponSpecs = new Map<string, { specsCanDrop: number[]; specsCanUse: number[] }>()
  for (const entry of weaponSpecItems) {
    weaponSpecs.set(`${entry.itemClass}:${entry.itemSubClass}`, { specsCanDrop: entry.specsCanDrop, specsCanUse: entry.specsCanUse })
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
    rawItems,
    encountersByInstance,
    weaponSpecs,
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

/** Thrown by fetchStaticJson specifically on a 404, so callers can tell "hash rotated" apart from other failures. */
export class StaticDataNotFoundError extends Error {}

async function discoverGameDataVersion(fetchFn: typeof fetch): Promise<string> {
  const res = await fetchFn('https://www.raidbots.com/')
  if (!res.ok) throw new Error(`Failed to fetch raidbots.com homepage: ${res.status}`)
  const html = await res.text()
  const version = extractGameDataVersion(html)
  if (!version) throw new Error('Could not find gameDataVersion in raidbots.com homepage')
  return version
}

export type GameDataVersionInfo = { version: string; discoveredAt: number }

async function readVersionInfo(env: LookupEnv): Promise<GameDataVersionInfo | null> {
  if (env.ENCOUNTER_ITEMS_KV) {
    const cached = await env.ENCOUNTER_ITEMS_KV.get('game-data-version-info')
    return cached ? (JSON.parse(cached) as GameDataVersionInfo) : null
  }
  const cache = caches.default
  const cached = await cache.match(new Request(GAME_DATA_VERSION_CACHE_KEY))
  return cached ? (JSON.parse(await cached.text()) as GameDataVersionInfo) : null
}

async function writeVersionInfo(env: LookupEnv, info: GameDataVersionInfo): Promise<void> {
  if (env.ENCOUNTER_ITEMS_KV) {
    await env.ENCOUNTER_ITEMS_KV.put('game-data-version-info', JSON.stringify(info), {
      expirationTtl: GAME_DATA_VERSION_TTL_SECONDS,
    })
    return
  }
  const cache = caches.default
  await cache.put(
    new Request(GAME_DATA_VERSION_CACHE_KEY),
    new Response(JSON.stringify(info), {
      headers: { 'Cache-Control': `public, max-age=${GAME_DATA_VERSION_TTL_SECONDS}` },
    })
  )
}

/** Re-discovers and persists a fresh hash, bypassing whatever is currently cached. */
async function rediscoverGameDataVersion(env: LookupEnv, fetchFn: typeof fetch): Promise<GameDataVersionInfo> {
  const info: GameDataVersionInfo = { version: await discoverGameDataVersion(fetchFn), discoveredAt: Date.now() }
  await writeVersionInfo(env, info)
  return info
}

async function getGameDataVersionInfo(env: LookupEnv, fetchFn: typeof fetch): Promise<GameDataVersionInfo> {
  const cached = await readVersionInfo(env)
  if (cached) return cached
  return rediscoverGameDataVersion(env, fetchFn)
}

/** Exposed for the `/health` route (current hash + how long ago it was discovered). */
export async function getGameDataVersionWithAge(env: LookupEnv, fetchFn: typeof fetch = fetch): Promise<GameDataVersionInfo> {
  return getGameDataVersionInfo(env, fetchFn)
}

async function getGameDataVersion(env: LookupEnv, fetchFn: typeof fetch): Promise<string> {
  return (await getGameDataVersionInfo(env, fetchFn)).version
}

async function fetchStaticJson<T>(fetchFn: typeof fetch, hash: string, file: string): Promise<T> {
  const res = await fetchFn(`https://www.raidbots.com/static/data/${hash}/${file}`)
  if (res.status === 404) throw new StaticDataNotFoundError(`${file} not found for hash ${hash} (404) -- hash likely rotated`)
  if (!res.ok) throw new Error(`Failed to fetch ${file} (hash ${hash}): ${res.status}`)
  return (await res.json()) as T
}

async function fetchAndBuildLookup(fetchFn: typeof fetch, version: string): Promise<EncounterItemsLookup> {
  const [encounterItems, instances, encounterNames, instanceNames, weaponSpecs] = await Promise.all([
    fetchStaticJson<EncounterItemEntry[]>(fetchFn, version, 'encounter-items.json'),
    fetchStaticJson<InstanceEntry[]>(fetchFn, version, 'instances.json'),
    fetchStaticJson<Record<string, string>>(fetchFn, version, 'encounter-names.json'),
    fetchStaticJson<Record<string, string>>(fetchFn, version, 'instance-names.json'),
    fetchStaticJson<WeaponSpecEntry[]>(fetchFn, version, 'weapon-specs.json'),
  ])
  return buildEncounterItemsLookup(encounterItems, instances, encounterNames, instanceNames, weaponSpecs)
}

async function readCachedLookup(env: LookupEnv, version: string): Promise<EncounterItemsLookup | null> {
  if (env.ENCOUNTER_ITEMS_KV) {
    const cachedRaw = await env.ENCOUNTER_ITEMS_KV.get(`lookup:${version}`)
    return cachedRaw ? deserializeLookup(JSON.parse(cachedRaw)) : null
  }
  const cache = caches.default
  const cached = await cache.match(new Request(`https://cache.gallagioloot.local/lookup/${version}`))
  return cached ? deserializeLookup(await cached.json()) : null
}

async function writeCachedLookup(env: LookupEnv, version: string, lookup: EncounterItemsLookup): Promise<void> {
  const serialized = JSON.stringify(serializeLookup(lookup))
  if (env.ENCOUNTER_ITEMS_KV) {
    await env.ENCOUNTER_ITEMS_KV.put(`lookup:${version}`, serialized, { expirationTtl: LOOKUP_CACHE_TTL_SECONDS })
    return
  }
  const cache = caches.default
  await cache.put(
    new Request(`https://cache.gallagioloot.local/lookup/${version}`),
    new Response(serialized, { headers: { 'Cache-Control': `public, max-age=${LOOKUP_CACHE_TTL_SECONDS}` } })
  )
}

/**
 * Fetches (or reuses a cached copy of) the current Raidbots encounter-items lookup.
 * Uses Workers KV when configured, else falls back to the Cache API so this also
 * works under `wrangler dev` without KV bindings.
 *
 * If the cached hash's static files 404 (Raidbots rotated the hash since we last
 * cached it), re-discovers a fresh hash from the homepage once and retries -- so a
 * stale cached hash self-heals on the next request instead of failing forever until
 * its 24h TTL expires.
 */
export async function getEncounterItemsLookup(
  env: LookupEnv,
  fetchFn: typeof fetch = fetch
): Promise<EncounterItemsLookup> {
  let version = await getGameDataVersion(env, fetchFn)

  const cached = await readCachedLookup(env, version)
  if (cached) return cached

  try {
    const lookup = await fetchAndBuildLookup(fetchFn, version)
    await writeCachedLookup(env, version, lookup)
    return lookup
  } catch (e) {
    if (!(e instanceof StaticDataNotFoundError)) throw e

    // Cached hash is stale -- rediscover once and retry. If this also fails, let it throw.
    version = (await rediscoverGameDataVersion(env, fetchFn)).version
    const lookup = await fetchAndBuildLookup(fetchFn, version)
    await writeCachedLookup(env, version, lookup)
    return lookup
  }
}

type SerializedLookup = {
  itemSources: Array<[number, Array<{ instanceId: number; encounterId: number }>]>
  itemMeta: Array<[number, { name: string; inventoryType?: number }]>
  encounterNames: Array<[number, string]>
  instanceNames: Array<[number, string]>
  instanceTypes: Array<[number, string]>
  rawItems: Array<[number, EncounterItemEntry]>
  encountersByInstance: Array<[number, Array<{ id: number; name: string; trash?: boolean }>]>
  weaponSpecs: Array<[string, { specsCanDrop: number[]; specsCanUse: number[] }]>
}

function serializeLookup(lookup: EncounterItemsLookup): SerializedLookup {
  return {
    itemSources: [...lookup.itemSources.entries()],
    itemMeta: [...lookup.itemMeta.entries()],
    encounterNames: [...lookup.encounterNames.entries()],
    instanceNames: [...lookup.instanceNames.entries()],
    instanceTypes: [...lookup.instanceTypes.entries()],
    rawItems: [...lookup.rawItems.entries()],
    encountersByInstance: [...lookup.encountersByInstance.entries()],
    weaponSpecs: [...lookup.weaponSpecs.entries()],
  }
}

function deserializeLookup(serialized: SerializedLookup): EncounterItemsLookup {
  return {
    itemSources: new Map(serialized.itemSources),
    itemMeta: new Map(serialized.itemMeta),
    encounterNames: new Map(serialized.encounterNames),
    instanceNames: new Map(serialized.instanceNames),
    instanceTypes: new Map(serialized.instanceTypes),
    rawItems: new Map(serialized.rawItems ?? []),
    encountersByInstance: new Map(serialized.encountersByInstance ?? []),
    weaponSpecs: new Map(serialized.weaponSpecs ?? []),
  }
}
