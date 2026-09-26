import { normalizeReportUrl } from './reportUrl'

/** The Reports panel accepts up to this many report URL rows. */
export const MAX_REPORT_ROWS = 8

export interface ReportRow {
  id: number
  url: string
}

/** Appends an empty row (id supplied by the caller); a no-op at the cap. */
export function addRow(rows: ReportRow[], id: number): ReportRow[] {
  return rows.length >= MAX_REPORT_ROWS ? rows : [...rows, { id, url: '' }]
}

/** Drops a row; a no-op for the last remaining row (there is always at least one input). */
export function removeRow(rows: ReportRow[], id: number): ReportRow[] {
  return rows.length <= 1 ? rows : rows.filter((r) => r.id !== id)
}

/**
 * Per-row blocking errors, keyed by row id. A row is only checked when its URL is filled in and identifies a
 * report: "Already loaded" when that report is in the panel, "Duplicate of row N" (1-based, the earlier row's
 * position) when an earlier row names the same report. `loadedKeys` are `<source>:<reportId>` keys.
 */
export function checkRows(rows: ReportRow[], loadedKeys: ReadonlySet<string>): Record<number, string> {
  const errors: Record<number, string> = {}
  const firstSeen = new Map<string, number>()
  rows.forEach((row, index) => {
    const key = normalizeReportUrl(row.url)
    if (!key) return
    if (loadedKeys.has(key)) errors[row.id] = 'Already loaded'
    else if (firstSeen.has(key)) errors[row.id] = `Duplicate of row ${firstSeen.get(key)}`
    if (!firstSeen.has(key)) firstSeen.set(key, index + 1)
  })
  return errors
}
