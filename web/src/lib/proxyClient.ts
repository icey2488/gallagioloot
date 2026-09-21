import type { LootTable, NormalizedReport, NormalizedTopGear } from '@engine/types'
import type { ReportSource } from './urlDetect'

/** Falls back to a localhost `wrangler dev` default so the app works out of the box in local dev. */
export function getProxyBaseUrl(): string {
  const configured = import.meta.env.VITE_PROXY_BASE_URL as string | undefined
  return (configured || 'http://localhost:8787').replace(/\/$/, '')
}

export class ProxyRequestError extends Error {
  constructor(
    message: string,
    public status?: number
  ) {
    super(message)
    this.name = 'ProxyRequestError'
  }
}

export async function fetchReport(source: ReportSource, urlOrId: string, baseUrl = getProxyBaseUrl()): Promise<NormalizedReport> {
  const path = source === 'raidbots' ? 'raidbots' : 'qelive'
  const res = await fetch(`${baseUrl}/${path}/${encodeURIComponent(urlOrId)}`)

  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as { error?: string; detail?: string })
    throw new ProxyRequestError(body.detail || body.error || `Report fetch failed: HTTP ${res.status}`, res.status)
  }

  return (await res.json()) as NormalizedReport
}

export async function fetchTopGear(urlOrId: string, baseUrl = getProxyBaseUrl()): Promise<NormalizedTopGear> {
  const res = await fetch(`${baseUrl}/topgear/${encodeURIComponent(urlOrId)}`)

  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as { error?: string; detail?: string })
    throw new ProxyRequestError(body.detail || body.error || `Top Gear fetch failed: HTTP ${res.status}`, res.status)
  }

  return (await res.json()) as NormalizedTopGear
}

export async function fetchLootTable(instanceId: number, lootSpecId: number, baseUrl = getProxyBaseUrl()): Promise<LootTable> {
  const res = await fetch(`${baseUrl}/loot-table/${instanceId}?lootSpec=${lootSpecId}`)

  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as { error?: string; detail?: string })
    throw new ProxyRequestError(body.detail || body.error || `Loot table fetch failed: HTTP ${res.status}`, res.status)
  }

  return (await res.json()) as LootTable
}
