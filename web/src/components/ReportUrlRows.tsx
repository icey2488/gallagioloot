import { MAX_REPORT_ROWS, type ReportRow } from '../lib/reportRows'
import { SOURCE_LABELS, detectSource } from '../lib/urlDetect'

/** Inline result shown under a row: fetching, loaded (with the report's title) or a refusal/failure message. */
export type RowStatus = { state: 'loading' } | { state: 'loaded'; message: string } | { state: 'error'; message: string }

type Props = {
  rows: ReportRow[]
  status: Record<number, RowStatus>
  /** Blocking duplicate / already-loaded errors, already filtered to the rows the user has left or fetched. */
  issues: Record<number, string>
  /** True once at least one report is in the panel (changes the empty first row's hint). */
  hasLoaded: boolean
  onChange: (id: number, url: string) => void
  onBlur: (id: number) => void
  onAdd: () => void
  onRemove: (id: number) => void
}

function emptyHint(index: number, hasLoaded: boolean): string {
  if (index > 0) return 'Paste another report URL'
  return hasLoaded ? 'Add another difficulty or your Mythic+ droptimizer' : 'Paste a Raidbots or QE Live report URL'
}

/** The report URL inputs (1-8) with per-row status. Removing a row only removes its input, never a loaded report. */
export function ReportUrlRows({ rows, status, issues, hasLoaded, onChange, onBlur, onAdd, onRemove }: Props) {
  const multi = rows.length > 1
  const atCap = rows.length >= MAX_REPORT_ROWS
  return (
    <div className="report-rows">
      {rows.map((row, index) => {
        const n = index + 1
        const source = detectSource(row.url)
        const st = status[row.id]
        const issue = issues[row.id]
        const inputId = index === 0 ? 'report-url' : `report-url-${n}`
        const message =
          st?.state === 'error' ? { kind: 'error', text: st.message } : st?.state === 'loaded' ? { kind: 'ok', text: st.message } : st?.state === 'loading' ? { kind: 'muted', text: 'Fetching…' } : issue ? { kind: 'error', text: issue } : null
        const hint = source ? `Detected: ${SOURCE_LABELS[source]}` : row.url.trim() ? 'Unrecognized report URL' : emptyHint(index, hasLoaded)
        return (
          <div className="field report-row" key={row.id}>
            <label htmlFor={inputId} className="sr-only">
              {multi ? `Report URL ${n}` : 'Report URL'}
            </label>
            <div className="report-row__line">
              <input
                id={inputId}
                type="text"
                placeholder="https://www.raidbots.com/reports/... or https://questionablyepic.com/..."
                value={row.url}
                aria-invalid={issue || st?.state === 'error' ? true : undefined}
                onChange={(e) => onChange(row.id, e.target.value)}
                onBlur={() => onBlur(row.id)}
              />
              {multi && (
                <button type="button" className="report-row__btn" aria-label={`Remove report URL ${n}`} onClick={() => onRemove(row.id)}>
                  -
                </button>
              )}
            </div>
            <div className={`field-hint report-row__status${message ? ` report-row__status--${message.kind}` : ''}`} role={message ? 'status' : undefined}>
              {message ? message.text : hint}
            </div>
          </div>
        )
      })}
      <div className="report-rows__add">
        <button type="button" className="report-row__btn" aria-label="Add another report URL" disabled={atCap} onClick={onAdd}>
          +
        </button>
        {atCap && <span className="field-hint report-rows__cap">Max {MAX_REPORT_ROWS} reports</span>}
      </div>
    </div>
  )
}
