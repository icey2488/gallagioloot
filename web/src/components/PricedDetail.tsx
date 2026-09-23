import type { BossEval } from '@engine/core/types'
import { Tooltip } from './Tooltip'

function exclusionReason(b: BossEval, thresholdPct: number): string | null {
  if (b.deployable) return null
  if (b.notes.some((n) => n.includes('not in expected kills'))) return 'Not in expected kills'
  if (b.remaining === 0) return 'Pool exhausted'
  if (b.evPct < thresholdPct) return 'Below threshold'
  return 'Excluded'
}

/** The detail shown below the recommendation card once priced: the full ranked boss list
 *  (EV, rolls to target, best-case item). The vault-vs-Voidcore comparison itself lives
 *  only in the card above -- see cardData.ts, the single source of truth for that verdict. */
export function PricedDetail(props: { bossEvals: BossEval[]; thresholdPct: number }) {
  const { bossEvals, thresholdPct } = props

  // Deployable bosses first, then by EV descending; keeps the ranked order the card used.
  const ranked = [...bossEvals].sort((a, b) => {
    if (a.deployable !== b.deployable) return a.deployable ? -1 : 1
    return b.evPct - a.evPct
  })

  return (
    <div>
      <div className="panel">
        <div className="screen-header" style={{ marginBottom: 12 }}>
          <div className="screen-header__title-group">
            <h3>
              <span className="heading-gold-bar" aria-hidden="true" />
              Ranked bosses
            </h3>
            <span className="screen-header__meta">Kill-order pool, ranked by EV · threshold {thresholdPct.toFixed(2)}%</span>
          </div>
        </div>
        <table className="deploy-table fold-table">
          <thead>
            <tr>
              <th className="deploy-table__rank">#</th>
              <th>Boss</th>
              <th className="num">Remaining</th>
              <th className="num">
                <Tooltip term="ev">EV %</Tooltip>
              </th>
              <th>Best case</th>
              <th className="num">
                <Tooltip term="rollsToTarget">Rolls to target</Tooltip>
              </th>
              <th>
                <Tooltip term="deployable">Rollable</Tooltip>
              </th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((b, i) => {
              const reason = exclusionReason(b, thresholdPct)
              return (
                <tr key={b.encounterId} className={b.deployable ? undefined : 'excluded'}>
                  <td className="deploy-table__rank" data-label="#">
                    {i + 1}
                  </td>
                  <td data-label="Boss">{b.encounterName}</td>
                  <td className="num" data-label="Remaining">
                    {b.remaining} / {b.pool.length}
                  </td>
                  <td className="num deploy-table__ev" data-label="EV %">
                    {b.evPct.toFixed(2)}%
                  </td>
                  <td data-label="Best case">
                    {b.bestCase ? (
                      <>
                        {b.bestCase.name}{' '}
                        <span className="num" style={{ fontWeight: 600 }}>
                          ({b.bestCase.pct.toFixed(2)}%)
                        </span>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="num" data-label="Rolls to target">
                    {b.bestCase?.rollsToTargetExpected != null && b.bestCase?.rollsToTargetWorst != null
                      ? `~${b.bestCase.rollsToTargetExpected.toFixed(1)}, up to ${b.bestCase.rollsToTargetWorst}`
                      : '—'}
                  </td>
                  <td data-label="Rollable">
                    <span className="deploy-indicator">
                      <span className={b.deployable ? 'deploy-dot deploy-dot--yes' : 'deploy-dot deploy-dot--no'} aria-hidden="true" />
                      {b.deployable ? 'Yes' : <>No{reason ? <span className="deploy-indicator__reason"> — {reason}</span> : null}</>}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
