/**
 * Normalizes an upstream date (an HTTP `Last-Modified` header, QE Live's `timeCreated`: both RFC 7231
 * "Tue, 22 Sep 2026 20:14:38 GMT") to ISO 8601. Undefined when absent or unparseable. Pure -- the caller
 * supplies the string, this never reads the clock.
 */
export function toIsoDate(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? undefined : new Date(ms).toISOString()
}
