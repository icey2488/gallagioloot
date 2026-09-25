import type { BossEval } from '@engine/core/types'
import { evalKey } from '@engine/core/targets'
import { catalystText, targetDisplayName } from '../lib/cardData'
import { Tooltip } from './Tooltip'

function exclusionReason(b: BossEval, thresholdPct: number): string | null {
  if (b.deployable) return null
  if (b.notes.some((n) => n.includes('not in expected kills'))) return b.kind === 'mplus' ? 'Not running this key' : 'Not in expected kills'
  if (b.remaining === 0) return 'Pool exhausted'
  if (b.evPct < thresholdPct) return 'Below threshold'
  return 'Excluded'
}

/** The detail shown below the recommendation card once priced: every target across the
 *  loaded reports (raid bosses per difficulty + Mythic+ dungeons) on one EV scale
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
              Ranked targets
            </h3>
            <span className="screen-header__meta">Raid bosses and Mythic+ dungeons, ranked by EV per roll · threshold {thresholdPct.toFixed(2)}%</span>
          </div>
        </div>
        <table className="deploy-table fold-table">
          <thead>
            <tr>
              <th className="deploy-table__rank">#</th>
              <th>Target</th>
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
                <tr key={evalKey(b)} className={b.deployable ? undefined : 'excluded'}>
                  <td className="deploy-table__rank" data-label="#">
                    {i + 1}
                  </td>
                  <td data-label="Target">{targetDisplayName(b)}</td>
                  <td className="num" data-label="Remaining">
                    {b.remaining} / {b.pool.length}
                  </td>
                  <td className="num deploy-table__ev" data-label="EV %">
                    {b.evPct.toFixed(2)}%
                  </td>
                  <td data-label="Best case">
                    {b.bestCase ? (
                      // One wrapper so the folded (mobile) cell keeps name, pct and catalyst note together.
                      <span>
                        {b.bestCase.name}{' '}
                        <span className="num" style={{ fontWeight: 600 }}>
                          ({b.bestCase.pct.toFixed(2)}%)
                        </span>
                        {b.bestCase.catalyst && <span className="catalyst-note">{catalystText(b.bestCase)}</span>}
                      </span>
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
