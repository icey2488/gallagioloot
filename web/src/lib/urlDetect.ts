export type ReportSource = 'raidbots' | 'qelive'

const RAIDBOTS_HOST_RE = /(^|\.)raidbots\.com$/i
const QELIVE_HOST_RE = /(^|\.)questionablyepic\.com$/i

const RAIDBOTS_ID_RE = /(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{22}(?![A-Za-z0-9_-])/
const QELIVE_ID_RE = /(?<![a-z])[a-z]{12}(?![a-z])/

/** Detects the report source (Raidbots or QE Live) from a pasted URL's hostname. Null if unrecognized. */
export function detectSource(input: string): ReportSource | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  try {
    const { hostname } = new URL(trimmed)
    if (RAIDBOTS_HOST_RE.test(hostname)) return 'raidbots'
    if (QELIVE_HOST_RE.test(hostname)) return 'qelive'
    return null
  } catch {
    // Not a full URL -- fall back to bare-id shape, since the proxy accepts either.
    if (RAIDBOTS_ID_RE.test(trimmed) && trimmed.length === 22) return 'raidbots'
    if (QELIVE_ID_RE.test(trimmed) && trimmed.length === 12) return 'qelive'
    return null
  }
}

export const SOURCE_LABELS: Record<ReportSource, string> = {
  raidbots: 'Raidbots',
  qelive: 'QE Live',
}
