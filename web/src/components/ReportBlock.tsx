import { Fragment } from 'react'
import type { NormalizedReport } from '@engine/types'
import { formatDropLine, summarizeDrops } from '@engine/core/drops'
import { difficultyLabel, keyLevelOf, targetKindOf } from '@engine/core/targets'
import { formatBaseline, formatSimDate } from '../lib/format'

/** One warning / reconcile line under a report; `error` ones open the notes toggle automatically. */
export type ReportNote = { text: string; error?: boolean }

/** "RAID · The Venomous Abyss · Mythic"; "MYTHIC+ · +10 and above". */
export function reportHeading(report: NormalizedReport): string {
  if (targetKindOf(report) === 'mplus') {
    const level = keyLevelOf(report)
    return level !== undefined ? `MYTHIC+ · +${level} and above` : 'MYTHIC+'
  }
  return `RAID · ${report.instanceName ?? 'Unknown instance'} · ${difficultyLabel(report)}`
}

/** A report as one compact block: heading + Remove, the drop line, then items / bosses / baseline / sim date, with notes collapsed. */
export function ReportBlock(props: { report: NormalizedReport; title: string; notes: ReportNote[]; onRemove: () => void }) {
  const { report, title, notes, onRemove } = props
  const mplus = targetKindOf(report) === 'mplus'
  const drops = summarizeDrops(report)
  const simmed = formatSimDate(report.simmedAt)
  const hasError = notes.some((n) => n.error)

  const stats: Array<{ before?: string; value: string; after?: string }> = [
    { value: String(report.items.length), after: ' items' },
    ...(mplus ? [] : [{ value: String(drops.targetCount), after: drops.targetCount === 1 ? ' boss' : ' bosses' }]),
    { before: 'baseline ', value: formatBaseline(report.baseline) },
    ...(simmed ? [{ before: 'simmed ', value: simmed }] : []),
  ]

  return (
    <div className="report-line" data-report-kind={mplus ? 'mplus' : 'raid'}>
      <div className="report-line__head">
        <span className="report-line__title">{reportHeading(report)}</span>
        <button type="button" className="btn-link report-line__remove" aria-label={`Remove ${title} report`} onClick={onRemove}>
          Remove
        </button>
      </div>
      <p className="report-line__drops">{formatDropLine({ ...drops, dungeons: mplus ? drops.targetCount : undefined })}</p>
      <p className="report-line__stats">
        {stats.map((stat, i) => (
          <Fragment key={i}>
            {i > 0 && ' · '}
            <span className="report-line__stat">
              {stat.before}
              <span className="num">{stat.value}</span>
              {stat.after}
            </span>
          </Fragment>
        ))}
      </p>
      {notes.length > 0 && (
        <details className="report-notes" open={hasError}>
          <summary>
            {notes.length} {notes.length === 1 ? 'note' : 'notes'}
          </summary>
          <ul>
            {notes.map((n, i) => (
              <li key={i} className={n.error ? 'report-notes__error' : undefined}>
                {n.text}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
