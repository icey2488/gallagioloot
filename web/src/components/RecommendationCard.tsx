import type { CardData } from '../lib/cardData'
import { Tooltip } from './Tooltip'

export function RecommendationCard({ card, onPrimaryAction, stale }: { card: CardData; onPrimaryAction?: () => void; stale?: boolean }) {
  const actionLabel = card.verdict === 'vault' ? 'Take vault item' : card.verdict === 'tokens' ? 'Mark tokens taken' : 'Mark as rolled'
  const kicker = card.vaultCompare ? 'Great Vault vs Voidcore' : 'GallagioLoot recommends'
  const meta = `${card.rollsAvailable} Voidcore${card.rollsAvailable === 1 ? '' : 's'}`

  // The bold "verb + boss name" headline split only applies to the plain "Roll <boss>" /
  // "Roll <boss> or <boss>" headlines -- once a vault comparison is in play the headline is
  // rendered as complete text (see cardData.ts), since it's a full sentence, not a template.
  const tossUpPair = !card.vaultCompare && card.tossUp && card.tossUpBosses ? card.tossUpBosses : null
  const heroVerb = card.bossName ? 'Roll' : null

  return (
    <section className="rec-card" aria-label="Bonus roll recommendation">
      <div className="rec-card__top">
        <div className="rec-card__eyebrow">{kicker}</div>
        <div className="rec-card__top-right">
          {stale && <span className="rec-card__badge--stale">Out of date</span>}
          <span className="rec-card__meta num">{meta}</span>
        </div>
      </div>

      {tossUpPair ? (
        <h2 className="rec-card__headline">
          <span className="rec-card__verb">Roll</span>{' '}
          <span className="rec-card__boss">
            {tossUpPair[0].name} <span className="rec-card__or">or</span> {tossUpPair[1].name}
          </span>
        </h2>
      ) : heroVerb && card.bossName ? (
        <h2 className="rec-card__headline">
          <span className="rec-card__verb">{heroVerb}</span> <span className="rec-card__boss">{card.bossName}</span>
        </h2>
      ) : (
        <h2 className="rec-card__headline">{card.headline}</h2>
      )}

      {tossUpPair ? (
        <div className="rec-card__tossup-grid">
          <div className="rec-card__tossup-side">
            <div className="rec-card__tossup-pct num">{tossUpPair[0].pct.toFixed(2)}%</div>
            <div className="rec-card__tossup-name">{tossUpPair[0].name}</div>
          </div>
          <div className="rec-card__tossup-vs">vs</div>
          <div className="rec-card__tossup-side">
            <div className="rec-card__tossup-pct num">{tossUpPair[1].pct.toFixed(2)}%</div>
            <div className="rec-card__tossup-name">{tossUpPair[1].name}</div>
          </div>
        </div>
      ) : (
        <div className="rec-card__pct-row">
          {card.verdict === 'toss-up' && card.vaultCompare && <div className="rec-card__pct-label">Voidcore roll</div>}
          <div className="rec-card__pct num">{card.pct.toFixed(2)}%</div>
          {card.verdict === 'roll' && <div className="rec-card__pct-caption">expected gain from this Voidcore</div>}
        </div>
      )}

      {card.secondBest && !tossUpPair && card.verdict === 'roll' && (
        <div className="rec-card__second">
          Next best: {card.secondBest.name} (~{card.secondBest.pct.toFixed(2)}%). Clear of sim noise, so the pick holds.
        </div>
      )}

      {card.tossUp && card.tossUpNote && (
        <div className="rec-card__note rec-card__note--strong">
          <Tooltip term="tossUp">Toss-up</Tooltip>: {card.tossUpNote}
        </div>
      )}

      {card.vaultCompare && (
        <div className="rec-card__compare">
          <div className={`rec-card__compare-option${card.verdict === 'roll' ? ' rec-card__compare-option--win' : ''}`}>
            <div className="rec-card__compare-label">Voidcore roll</div>
            <div className="rec-card__compare-value num">{card.vaultCompare.voidcorePct.toFixed(2)}%</div>
          </div>
          <div className={`rec-card__compare-option${card.verdict === 'vault' ? ' rec-card__compare-option--win' : ''}`}>
            <div className="rec-card__compare-label">{card.vaultCompare.vaultItemName}</div>
            <div className="rec-card__compare-value num">{card.vaultCompare.vaultPct.toFixed(2)}%</div>
          </div>
        </div>
      )}

      {card.vaultCompare && card.bestRoll && (
        <div className="rec-card__note">
          Best roll target: {card.bestRoll.name} (~{card.bestRoll.pct.toFixed(2)}%
          {card.bestRoll.bestCaseItemName ? `, best case ${card.bestRoll.bestCaseItemName}` : ''}).
        </div>
      )}

      {card.message && <div className="rec-card__note">{card.message}</div>}

      {onPrimaryAction && (
        <div className="rec-card__action">
          <button type="button" className="btn btn-gold" onClick={onPrimaryAction}>
            {actionLabel}
          </button>
        </div>
      )}
    </section>
  )
}
