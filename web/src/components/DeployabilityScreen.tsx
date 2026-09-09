import type { BossEval } from '@engine/core/types'
import { Tooltip } from './Tooltip'

function exclusionReason(b: BossEval, thresholdPct: number): string | null {
  if (b.deployable) return null
  if (b.notes.some((n) => n.includes('not in expected kills'))) return 'Not in expected kills'
  if (b.remaining === 0) return 'Pool exhausted'
  if (b.evPct < thresholdPct) return 'Below threshold'
  return 'Excluded'
}

export function DeployabilityScreen(props: {
  bossEvals: BossEval[]
  thresholdPct: number
  onViewRecommendation: () => void
  onSelectBoss?: (encounterId: number) => void
}) {
  const { bossEvals, thresholdPct, onViewRecommendation, onSelectBoss } = props

  return (
    <div>
      <div className="panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>Rollable Bosses</h3>
        <button type="button" className="btn" onClick={onViewRecommendation}>
          Roll this boss
        </button>
      </div>

      <div className="panel">
        <table className="deploy-table">
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
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {bossEvals.map((b, i) => {
              const reason = exclusionReason(b, thresholdPct)
              return (
                <tr key={b.encounterId} className={b.deployable ? undefined : 'excluded'}>
                  <td className="deploy-table__rank" data-label="#">
                    {i + 1}
                  </td>
                  <td data-label="Boss">
                    {onSelectBoss ? (
                      <button type="button" className="btn-link" style={{ fontSize: 14, textDecoration: 'none' }} onClick={() => onSelectBoss(b.encounterId)}>
                        {b.encounterName}
                      </button>
                    ) : (
                      b.encounterName
                    )}
                  </td>
                  <td className="num" data-label="Remaining">
                    {b.remaining} / {b.pool.length}
                  </td>
                  <td className="num deploy-table__ev" data-label="EV %">
                    {b.evPct.toFixed(2)}%
                  </td>
                  <td data-label="Best case">
                    {b.bestCase ? (
                      <>
                        {b.bestCase.name} <span className="num" style={{ fontWeight: 600 }}>
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
                      {b.deployable ? 'Yes' : (
                        <>
                          No{reason ? <span className="deploy-indicator__reason"> — {reason}</span> : null}
                        </>
                      )}
                    </span>
                  </td>
                  <td data-label="Notes">{b.notes.join('; ')}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="note-line">Delves and Prey Hunts are bonus roll targets but are not simmed; only worth a roll if that is the only content you run.</p>
      </div>
    </div>
  )
}
