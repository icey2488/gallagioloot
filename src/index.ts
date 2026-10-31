import { getEncounterItemsLookup, getGameDataVersionWithAge, type LookupEnv } from './lookup/encounterItems'
import { extractLearnedTierData, getAllLearnedTierData, getLearnedTierData, instanceEncounterIds, mergeLearnedTierData, saveLearnedTierData } from './lookup/tierLearned'
import { getAllSeedInstanceIds, getCurioEncounterId, getSeedTierMap, isKnownSeedInstance } from './lookup/tierSeed'
import { buildLootTable } from './lookup/lootTable'
import { LOOT_ELIGIBILITY_VERSION } from './lookup/specs'
import { normalizeRaidbotsReport, UnsupportedReportError, type RaidbotsRawReport } from './normalize/raidbots'
import { normalizeQELiveReport, parseQELiveResponseBody } from './normalize/qelive'
import { normalizeTopGearReport, UnsupportedTopGearReportError, type RaidbotsTopGearRawReport } from './normalize/topgear'
import { UnsupportedContentError, unsupportedContentResponseBody } from './normalize/contentType'
import type { EncounterItemsLookup, LootTable, NormalizedReport, NormalizedTopGear } from './types'

const VERSION = '0.1.0'

const PROD_ALLOWED_ORIGIN_DEFAULT = 'https://gallagioloot.icehunter.net'
const LOCALHOST_ORIGIN_RE = /^https?:\/\/localhost(:\d+)?$/

const RAIDBOTS_ID_RE = /(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{22}(?![A-Za-z0-9_-])/
const QE_ID_RE = /(?<![a-z])[a-z]{12}(?![a-z])/

const REPORT_CACHE_TTL_SECONDS = 10 * 60
const LOOT_TABLE_CACHE_TTL_SECONDS = 24 * 60 * 60
const FETCH_TIMEOUT_MS = 15000
/** Upstream failures (404, 5xx, network/timeout) are cached this long, so a dead or mistyped report id can't be hammered through to Raidbots / QE Live. */
const NEGATIVE_CACHE_TTL_SECONDS = 60

export interface Env extends LookupEnv {
  ALLOWED_ORIGIN?: string
  /**
   * Secret (`wrangler secret put DEBUG_TOKEN`) enabling the debug endpoints (`/encounter-items`,
   * `/tier-map/:instanceId`): requests must send it as `X-Debug-Token`. Unset = those endpoints 404.
   */
  DEBUG_TOKEN?: string
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const origin = request.headers.get('origin')
    const allowedOrigin = resolveAllowedOrigin(origin, env)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(allowedOrigin) })
    }

    if (request.method !== 'GET') {
      return jsonResponse({ error: 'Method not allowed' }, 405, allowedOrigin)
    }

    const url = new URL(request.url)
    const path = url.pathname

    try {
      if (path === '/' || path === '/health') {
        const versionInfo = await getGameDataVersionWithAge(env)
        return jsonResponse(
          {
            service: 'gallagioloot-proxy',
            version: VERSION,
            status: 'ok',
            endpoints: ['/raidbots/:id', '/qelive/:id', '/topgear/:id', '/loot-table/:instanceId'],
            dataHash: versionInfo.version,
            dataHashDiscoveredAt: new Date(versionInfo.discoveredAt).toISOString(),
            dataHashAgeSeconds: Math.max(0, Math.floor((Date.now() - versionInfo.discoveredAt) / 1000)),
          },
          200,
          allowedOrigin
        )
      }

      if (path.startsWith('/raidbots/')) {
        return await handleRaidbots(path.slice('/raidbots/'.length), url.searchParams, env, ctx, allowedOrigin)
      }

      if (path.startsWith('/qelive/')) {
        return await handleQELive(path.slice('/qelive/'.length), url.searchParams, env, ctx, allowedOrigin)
      }

      if (path.startsWith('/topgear/')) {
        return await handleTopGear(path.slice('/topgear/'.length), url.searchParams, env, ctx, allowedOrigin)
      }

      if (path === '/encounter-items' || path.startsWith('/tier-map/')) {
        if (!debugAllowed(request, env)) return jsonResponse({ error: 'Not found' }, 404, allowedOrigin)
      }

      if (path === '/encounter-items') {
        const lookup = await getEncounterItemsLookup(env)
        return jsonResponse(serializeLookupForDebug(lookup), 200, allowedOrigin)
      }

      if (path.startsWith('/tier-map/')) {
        return await handleTierMap(path.slice('/tier-map/'.length), env, allowedOrigin)
      }

      if (path.startsWith('/loot-table/')) {
        return await handleLootTable(path.slice('/loot-table/'.length), url.searchParams, env, ctx, allowedOrigin)
      }

      return jsonResponse({ error: 'Not found' }, 404, allowedOrigin)
    } catch (err) {
      console.error('Worker error:', err)
      // The message stays in the logs; clients get no internals.
      return jsonResponse({ error: 'Internal server error' }, 500, allowedOrigin)
    }
  },
}

// ============================================================
// ROUTE HANDLERS
// ============================================================

async function handleRaidbots(
  rawIdOrUrl: string,
  params: URLSearchParams,
  env: Env,
  ctx: ExecutionContext,
  allowedOrigin: string | null
): Promise<Response> {
  const decoded = safeDecode(rawIdOrUrl)
  if (decoded === null) return jsonResponse({ error: 'invalid_id', detail: 'Malformed percent-encoding in the report id or URL' }, 400, allowedOrigin)
  const candidate = decoded || params.get('url') || params.get('id') || ''
  const id = extractId(candidate, RAIDBOTS_ID_RE)
  if (!id) {
    return jsonResponse({ error: 'invalid_id', detail: 'Expected a 22-character Raidbots report id or URL' }, 400, allowedOrigin)
  }

  const cacheKey = reportCacheKey('raidbots', id)
  const cached = await caches.default.match(cacheKey)
  if (cached) return withCors(cached, allowedOrigin)
  const negative = await matchNegative(cacheKey, allowedOrigin)
  if (negative) return negative

  let upstream: Response
  try {
    upstream = await fetchWithTimeout(`https://www.raidbots.com/reports/${id}/data.json`)
  } catch (e) {
    return failAndCache({ error: 'fetch_failed', detail: (e as Error).message }, 502, cacheKey, ctx, allowedOrigin)
  }
  if (!upstream.ok) {
    return failAndCache({ error: 'upstream_error', status: upstream.status }, 502, cacheKey, ctx, allowedOrigin)
  }

  let raw: RaidbotsRawReport
  try {
    raw = (await upstream.json()) as RaidbotsRawReport
  } catch (e) {
    return jsonResponse({ error: 'parse_failed', detail: (e as Error).message }, 502, allowedOrigin)
  }

  let normalized: NormalizedReport
  const lookup = await getEncounterItemsLookup(env)
  try {
    normalized = normalizeRaidbotsReport(id, raw, lookup, { lastModified: upstream.headers.get('last-modified') })
  } catch (e) {
    if (e instanceof UnsupportedContentError) {
      return jsonResponse(unsupportedContentResponseBody(e), 422, allowedOrigin)
    }
    if (e instanceof UnsupportedReportError) {
      return jsonResponse({ error: 'unsupported_report', detail: e.message }, 400, allowedOrigin)
    }
    throw e
  }

  const instanceId = raw.simbot.meta.rawFormData.droptimizer.instance
  // Only encounters the static data lists for this instance; a mapping is trusted once 2+
  // distinct reports show it (see tierLearned.ts), and an unchanged store isn't rewritten.
  const allowed = instanceEncounterIds(lookup, instanceId)
  const learnedUpdate = allowed.size > 0 ? extractLearnedTierData(raw, instanceId, allowed) : { byItem: {}, bySlot: {} }
  if (Object.keys(learnedUpdate.byItem).length > 0) {
    ctx.waitUntil(saveLearnedTierData(env, instanceId, learnedUpdate, id).then(() => undefined))
  }

  return respondAndCache(normalized, cacheKey, ctx, allowedOrigin)
}

async function handleQELive(
  rawIdOrUrl: string,
  params: URLSearchParams,
  env: Env,
  ctx: ExecutionContext,
  allowedOrigin: string | null
): Promise<Response> {
  const decoded = safeDecode(rawIdOrUrl)
  if (decoded === null) return jsonResponse({ error: 'invalid_id', detail: 'Malformed percent-encoding in the report id or URL' }, 400, allowedOrigin)
  const candidate = decoded || params.get('url') || params.get('id') || ''
  const id = extractId(candidate, QE_ID_RE)
  if (!id) {
    return jsonResponse({ error: 'invalid_id', detail: 'Expected a 12-letter QE Live report id or URL' }, 400, allowedOrigin)
  }

  const cacheKey = reportCacheKey('qelive', id)
  const cached = await caches.default.match(cacheKey)
  if (cached) return withCors(cached, allowedOrigin)
  const negative = await matchNegative(cacheKey, allowedOrigin)
  if (negative) return negative

  let upstream: Response
  try {
    upstream = await fetchWithTimeout(`https://questionablyepic.com/api/getUpgradeReport.php?reportID=${id}`)
  } catch (e) {
    return failAndCache({ error: 'fetch_failed', detail: (e as Error).message }, 502, cacheKey, ctx, allowedOrigin)
  }
  if (!upstream.ok) {
    return failAndCache({ error: 'upstream_error', status: upstream.status }, 502, cacheKey, ctx, allowedOrigin)
  }

  const bodyText = await upstream.text()
  let raw
  try {
    raw = parseQELiveResponseBody(bodyText)
  } catch (e) {
    return jsonResponse({ error: 'parse_failed', detail: (e as Error).message }, 502, allowedOrigin)
  }

  const lookup = await getEncounterItemsLookup(env)
  const learnedByInstance = await getAllLearnedTierData(env, getAllSeedInstanceIds())

  let normalized: NormalizedReport
  try {
    normalized = normalizeQELiveReport(id, raw, lookup, learnedByInstance)
  } catch (e) {
    if (e instanceof UnsupportedContentError) {
      return jsonResponse(unsupportedContentResponseBody(e), 422, allowedOrigin)
    }
    throw e
  }

  return respondAndCache(normalized, cacheKey, ctx, allowedOrigin)
}

/**
 * A Raidbots "Top Gear" report -- fetched from the same `data.json` endpoint as
 * `/raidbots/:id`, since Raidbots serves every sim type from one URL shape. Its
 * `simbot.simType` is `"optimize"`, not `"topgear"` -- see README.md's Top Gear shape
 * notes for how this was verified against a live report.
 */
async function handleTopGear(
  rawIdOrUrl: string,
  params: URLSearchParams,
  env: Env,
  ctx: ExecutionContext,
  allowedOrigin: string | null
): Promise<Response> {
  const decoded = safeDecode(rawIdOrUrl)
  if (decoded === null) return jsonResponse({ error: 'invalid_id', detail: 'Malformed percent-encoding in the report id or URL' }, 400, allowedOrigin)
  const candidate = decoded || params.get('url') || params.get('id') || ''
  const id = extractId(candidate, RAIDBOTS_ID_RE)
  if (!id) {
    return jsonResponse({ error: 'invalid_id', detail: 'Expected a 22-character Raidbots report id or URL' }, 400, allowedOrigin)
  }

  const cacheKey = reportCacheKey('topgear', id)
  const cached = await caches.default.match(cacheKey)
  if (cached) return withCors(cached, allowedOrigin)
  const negative = await matchNegative(cacheKey, allowedOrigin)
  if (negative) return negative

  let upstream: Response
  try {
    upstream = await fetchWithTimeout(`https://www.raidbots.com/reports/${id}/data.json`)
  } catch (e) {
    return failAndCache({ error: 'fetch_failed', detail: (e as Error).message }, 502, cacheKey, ctx, allowedOrigin)
  }
  if (!upstream.ok) {
    return failAndCache({ error: 'upstream_error', status: upstream.status }, 502, cacheKey, ctx, allowedOrigin)
  }

  let raw: RaidbotsTopGearRawReport
  try {
    raw = (await upstream.json()) as RaidbotsTopGearRawReport
  } catch (e) {
    return jsonResponse({ error: 'parse_failed', detail: (e as Error).message }, 502, allowedOrigin)
  }

  let normalized: NormalizedTopGear
  try {
    const lookup = await getEncounterItemsLookup(env)
    const learnedByInstance = await getAllLearnedTierData(env, getAllSeedInstanceIds())
    normalized = normalizeTopGearReport(id, raw, lookup, learnedByInstance)
  } catch (e) {
    if (e instanceof UnsupportedTopGearReportError) {
      return jsonResponse({ error: 'unsupported_report', detail: e.message }, 400, allowedOrigin)
    }
    throw e
  }

  return respondAndCache(normalized, cacheKey, ctx, allowedOrigin)
}

async function handleTierMap(instanceIdRaw: string, env: Env, allowedOrigin: string | null): Promise<Response> {
  const instanceId = Number(instanceIdRaw)
  if (!Number.isFinite(instanceId)) {
    return jsonResponse({ error: 'invalid_instance_id' }, 400, allowedOrigin)
  }

  const seedBySlot = getSeedTierMap(instanceId)
  const learned = await getLearnedTierData(env, instanceId)
  const bySlot = mergeLearnedTierData({ byItem: {}, bySlot: seedBySlot }, { byItem: {}, bySlot: learned.bySlot }).bySlot

  return jsonResponse(
    {
      instanceId,
      known: isKnownSeedInstance(instanceId),
      curioEncounterId: getCurioEncounterId(instanceId),
      bySlot,
      byItem: learned.byItem,
    },
    200,
    allowedOrigin
  )
}

async function handleLootTable(
  instanceIdRaw: string,
  params: URLSearchParams,
  env: Env,
  ctx: ExecutionContext,
  allowedOrigin: string | null
): Promise<Response> {
  const instanceId = Number(instanceIdRaw)
  if (!Number.isFinite(instanceId)) {
    return jsonResponse({ error: 'invalid_instance_id' }, 400, allowedOrigin)
  }

  const lootSpecRaw = params.get('lootSpec')
  const lootSpecId = Number(lootSpecRaw)
  if (!lootSpecRaw || !Number.isFinite(lootSpecId)) {
    return jsonResponse({ error: 'invalid_loot_spec', detail: 'lootSpec query param (a WoW spec id) is required' }, 400, allowedOrigin)
  }

  const versionInfo = await getGameDataVersionWithAge(env)
  const cacheKey = new Request(`https://cache.gallagioloot.local/loot-table/v${LOOT_ELIGIBILITY_VERSION}/${versionInfo.version}/${instanceId}/${lootSpecId}`)
  const cached = await caches.default.match(cacheKey)
  if (cached) return withCors(cached, allowedOrigin)

  const lookup = await getEncounterItemsLookup(env)
  const encounters = buildLootTable(instanceId, lootSpecId, lookup)

  const body: LootTable = {
    instanceId,
    instanceName: lookup.instanceNames.get(instanceId),
    lootSpecId,
    sourceHash: versionInfo.version,
    encounters,
  }

  const response = new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${LOOT_TABLE_CACHE_TTL_SECONDS}` },
  })
  ctx.waitUntil(caches.default.put(cacheKey, response.clone()))
  return withCors(response, allowedOrigin)
}

// ============================================================
// HELPERS
// ============================================================

/** decodeURIComponent that returns null instead of throwing a URIError on a malformed % escape. */
function safeDecode(raw: string): string | null {
  try {
    return decodeURIComponent(raw)
  } catch {
    return null
  }
}

function extractId(input: string, pattern: RegExp): string | null {
  const match = input.match(pattern)
  return match ? match[0] : null
}

/** Bump when the normalized report shape gains fields, so cached reports (10 min TTL) don't hide them after a deploy. v2: equippedItemIds. v3: simmedAt, track.upgradeLabelsByIlvl. */
const REPORT_CACHE_VERSION = 3

function reportCacheKey(source: string, id: string): Request {
  return new Request(`https://cache.gallagioloot.local/report/v${REPORT_CACHE_VERSION}/${source}/${id}`)
}

async function respondAndCache(
  normalized: NormalizedReport | NormalizedTopGear,
  cacheKey: Request,
  ctx: ExecutionContext,
  allowedOrigin: string | null
): Promise<Response> {
  const cacheable = new Response(JSON.stringify(normalized), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${REPORT_CACHE_TTL_SECONDS}` },
  })
  ctx.waitUntil(caches.default.put(cacheKey, cacheable.clone()))
  return withCors(cacheable, allowedOrigin)
}

function negativeCacheKey(cacheKey: Request): Request {
  return new Request(cacheKey.url.replace('/report/', '/report-failed/'))
}

/**
 * Stores an upstream failure for NEGATIVE_CACHE_TTL_SECONDS under its own key, as a 200 wrapper
 * ({ status, body }) so the Cache API stores it regardless of the error status, then responds.
 */
function failAndCache(body: unknown, status: number, cacheKey: Request, ctx: ExecutionContext, allowedOrigin: string | null): Response {
  const wrapper = new Response(JSON.stringify({ status, body }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${NEGATIVE_CACHE_TTL_SECONDS}` },
  })
  ctx.waitUntil(caches.default.put(negativeCacheKey(cacheKey), wrapper))
  return jsonResponse(body, status, allowedOrigin)
}

async function matchNegative(cacheKey: Request, allowedOrigin: string | null): Promise<Response | null> {
  const hit = await caches.default.match(negativeCacheKey(cacheKey))
  if (!hit) return null
  try {
    const { status, body } = (await hit.json()) as { status: number; body: unknown }
    return jsonResponse(body, status, allowedOrigin)
  } catch {
    return null
  }
}

/** Debug endpoints need DEBUG_TOKEN set and sent as X-Debug-Token (compared in constant time). */
function debugAllowed(request: Request, env: Env): boolean {
  const expected = env.DEBUG_TOKEN
  const given = request.headers.get('x-debug-token')
  if (!expected || given === null) return false
  const a = new TextEncoder().encode(expected)
  const b = new TextEncoder().encode(given)
  let diff = a.length ^ b.length
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0)
  return diff === 0
}

function withCors(response: Response, allowedOrigin: string | null): Response {
  const headers = new Headers(response.headers)
  for (const [key, value] of Object.entries(corsHeaders(allowedOrigin))) {
    headers.set(key, value)
  }
  return new Response(response.body, { status: response.status, headers })
}

function serializeLookupForDebug(lookup: EncounterItemsLookup) {
  return {
    itemCount: lookup.itemSources.size,
    encounterCount: lookup.encounterNames.size,
    instanceCount: lookup.instanceNames.size,
    itemSources: Object.fromEntries(lookup.itemSources),
    itemMeta: Object.fromEntries(lookup.itemMeta),
    encounterNames: Object.fromEntries(lookup.encounterNames),
    instanceNames: Object.fromEntries(lookup.instanceNames),
    instanceTypes: Object.fromEntries(lookup.instanceTypes),
  }
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

function resolveAllowedOrigin(origin: string | null, env: Env): string | null {
  const prodOrigin = env.ALLOWED_ORIGIN || PROD_ALLOWED_ORIGIN_DEFAULT
  if (!origin) return prodOrigin
  if (origin === prodOrigin) return origin
  if (LOCALHOST_ORIGIN_RE.test(origin)) return origin
  return null
}

function corsHeaders(allowedOrigin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  }
  if (allowedOrigin) headers['Access-Control-Allow-Origin'] = allowedOrigin
  return headers
}

function jsonResponse(data: unknown, status: number, allowedOrigin: string | null): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...corsHeaders(allowedOrigin),
    },
  })
}
