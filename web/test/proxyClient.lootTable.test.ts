import { afterEach, describe, expect, it, vi } from 'vitest'
import { LOOT_ELIGIBILITY_VERSION } from '@engine/lookup/specs'
import { fetchLootTable } from '../src/lib/proxyClient'

afterEach(() => vi.unstubAllGlobals())

describe('fetchLootTable', () => {
  it('sends the loot-eligibility version so a browser-cached table from older rules is never reused', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ instanceId: 1320, lootSpecId: 62, sourceHash: 'h', encounters: [] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await fetchLootTable(1320, 62, 'https://proxy.example')
    expect(fetchMock).toHaveBeenCalledWith(`https://proxy.example/loot-table/1320?lootSpec=62&v=${LOOT_ELIGIBILITY_VERSION}`)
    expect(LOOT_ELIGIBILITY_VERSION).toBeGreaterThanOrEqual(2)
  })
})
