import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker, { type Env } from '../src/index'

/** Minimal in-memory stand-in for the Workers Cache API (`caches.default`). */
class MemoryCache {
  store = new Map<string, Response>()
  async match(req: Request | string): Promise<Response | undefined> {
    const hit = this.store.get(typeof req === 'string' ? req : req.url)
    return hit?.clone()
  }
  async put(req: Request | string, res: Response): Promise<void> {
    this.store.set(typeof req === 'string' ? req : req.url, res.clone())
  }
}

let cache: MemoryCache
let waits: Promise<unknown>[]
const ctx = () => ({ waitUntil: (p: Promise<unknown>) => waits.push(p), passThroughOnException: () => {} }) as unknown as ExecutionContext

async function call(path: string, env: Env = {}, headers: Record<string, string> = {}): Promise<Response> {
  const res = await worker.fetch(new Request(`https://proxy.test${path}`, { headers }), env, ctx())
  await Promise.all(waits)
  return res
}

const RB_ID = 'AAAAAAAAAAAAAAAAAAAAAA'

beforeEach(() => {
  cache = new MemoryCache()
  waits = []
  vi.stubGlobal('caches', { default: cache })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('negative caching of upstream failures', () => {
  it('caches an upstream 404 for ~60s: the second request does not hit upstream', async () => {
    const fetchSpy = vi.fn(async () => new Response('nope', { status: 404 }))
    vi.stubGlobal('fetch', fetchSpy)
    const first = await call(`/raidbots/${RB_ID}`)
    expect(first.status).toBe(502)
    expect(await first.json()).toEqual({ error: 'upstream_error', status: 404 })
    const second = await call(`/raidbots/${RB_ID}`)
    expect(second.status).toBe(502)
    expect(await second.json()).toEqual({ error: 'upstream_error', status: 404 })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const stored = [...cache.store.entries()].find(([k]) => k.includes('/report-failed/'))!
    expect(stored[1].headers.get('Cache-Control')).toBe('public, max-age=60')
  })

  it('caches a network failure (502 fetch_failed) for QE Live too', async () => {
    const fetchSpy = vi.fn(async () => {
      throw new Error('timeout')
    })
    vi.stubGlobal('fetch', fetchSpy)
    expect((await call('/qelive/abcdefghijkl')).status).toBe(502)
    expect((await call('/qelive/abcdefghijkl')).status).toBe(502)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('a different report id is not affected', async () => {
    const fetchSpy = vi.fn(async () => new Response('nope', { status: 503 }))
    vi.stubGlobal('fetch', fetchSpy)
    await call(`/topgear/${RB_ID}`)
    await call(`/topgear/BBBBBBBBBBBBBBBBBBBBBB`)
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })
})

describe('debug endpoints behind DEBUG_TOKEN', () => {
  it('404 when DEBUG_TOKEN is unset, even with a header', async () => {
    expect((await call('/tier-map/1320', {}, { 'X-Debug-Token': 'x' })).status).toBe(404)
    expect((await call('/encounter-items')).status).toBe(404)
  })

  it('404 with a missing or wrong token; 200 with the right one', async () => {
    const env: Env = { DEBUG_TOKEN: 's3cret' }
    expect((await call('/tier-map/1320', env)).status).toBe(404)
    expect((await call('/tier-map/1320', env, { 'X-Debug-Token': 's3cre' })).status).toBe(404)
    const ok = await call('/tier-map/1320', env, { 'X-Debug-Token': 's3cret' })
    expect(ok.status).toBe(200)
    expect(((await ok.json()) as { instanceId: number }).instanceId).toBe(1320)
  })
})
