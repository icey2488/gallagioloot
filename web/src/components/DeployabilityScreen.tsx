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
        <h3>Deployability</h3>
        <button type="button" className="btn" onClick={onViewRecommendation}>
          Roll this boss
        </button>
      </div>

      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Boss</th>
              <th>Remaining</th>
              <th>
                <Tooltip term="ev">EV %</Tooltip>
              </th>
              <th>Best case</th>
              <th>
                <Tooltip term="rollsToTarget">Rolls to target</Tooltip>
              </th>
              <th>
                <Tooltip term="deployable">Deployable</Tooltip>
              </th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {bossEvals.map((b) => {
              const reason = exclusionReason(b, thresholdPct)
              const notes = [...b.notes]
              if (reason) notes.push(reason)
              return (
                <tr key={b.encounterId} className={b.deployable ? undefined : 'excluded'}>
                  <td>
                    {onSelectBoss ? (
                      <button type="button" className="btn-link" style={{ fontSize: 14, textDecoration: 'none' }} onClick={() => onSelectBoss(b.encounterId)}>
                        {b.encounterName}
                      </button>
                    ) : (
                      b.encounterName
                    )}
                  </td>
                  <td className="num">
                    {b.remaining} / {b.pool.length}
                  </td>
                  <td className="num">{b.evPct.toFixed(2)}%</td>
                  <td>
                    {b.bestCase ? (
                      <>
                        {b.bestCase.name} <span className="num">({b.bestCase.pct.toFixed(2)}%)</span>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="num">
                    {b.bestCase?.rollsToTargetExpected != null && b.bestCase?.rollsToTargetWorst != null
                      ? `~${b.bestCase.rollsToTargetExpected.toFixed(1)}, up to ${b.bestCase.rollsToTargetWorst}`
                      : '—'}
                  </td>
                  <td>
                    <span className={b.deployable ? 'badge badge-yes' : 'badge badge-no'}>{b.deployable ? 'Yes' : 'No'}</span>
                  </td>
                  <td>{notes.join('; ')}</td>
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
