import type { BossEval, VaultDecision } from '@engine/core/types'
import { Tooltip } from './Tooltip'

function exclusionReason(b: BossEval, thresholdPct: number): string | null {
  if (b.deployable) return null
  if (b.notes.some((n) => n.includes('not in expected kills'))) return 'Not in expected kills'
  if (b.remaining === 0) return 'Pool exhausted'
  if (b.evPct < thresholdPct) return 'Below threshold'
  return 'Excluded'
}

const VERDICT_LABEL: Record<VaultDecision['verdict'], string> = {
  voidcore: 'Spend the Voidcore',
  vault: 'Take the vault item',
  'toss-up': 'Toss-up',
  tokens: 'Take the tokens',
}

/** The detail shown below the recommendation card once priced: the vault-vs-Voidcore
 *  comparison, then the full ranked boss list (EV, rolls to target, best-case item). */
export function PricedDetail(props: { bossEvals: BossEval[]; thresholdPct: number; vaultDecision: VaultDecision | null; vaultItemName?: string }) {
  const { bossEvals, thresholdPct, vaultDecision, vaultItemName } = props

  // Deployable bosses first, then by EV descending; keeps the ranked order the card used.
  const ranked = [...bossEvals].sort((a, b) => {
    if (a.deployable !== b.deployable) return a.deployable ? -1 : 1
    return b.evPct - a.evPct
  })

  return (
    <div>
      {vaultDecision && (
        <div className="panel">
          <div className="screen-header" style={{ marginBottom: 12 }}>
            <div className="screen-header__title-group">
              <h3>Great Vault vs Voidcore</h3>
              <span className="screen-header__meta">{VERDICT_LABEL[vaultDecision.verdict]}</span>
            </div>
          </div>
          <div className="rec-card__compare">
            <div className={`rec-card__compare-option${vaultDecision.verdict !== 'vault' ? ' rec-card__compare-option--win' : ''}`}>
              <div className="rec-card__compare-label">Voidcore roll</div>
              <div className="rec-card__compare-value num">{vaultDecision.voidcoreGainPct.toFixed(2)}%</div>
            </div>
            <div className={`rec-card__compare-option${vaultDecision.verdict === 'vault' ? ' rec-card__compare-option--win' : ''}`}>
              <div className="rec-card__compare-label">{vaultItemName ?? 'Vault item'}</div>
              <div className="rec-card__compare-value num">{vaultDecision.vaultItemGainPct.toFixed(2)}%</div>
            </div>
          </div>
          <p className="rec-card__note--strong">{vaultDecision.explanation}</p>
          {vaultDecision.savedRolls > 0 && (
            <p className="note-line">Saved rolls credited to the next-best boss: {vaultDecision.savedRolls.toFixed(2)}</p>
          )}
          {vaultDecision.notes.map((n, i) => (
            <p key={i} className="note-line">
              {n}
            </p>
          ))}
        </div>
      )}

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
