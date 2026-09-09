import type { CardData } from '../lib/cardData'
import { Tooltip } from './Tooltip'

export function RecommendationCard({ card, onPrimaryAction }: { card: CardData; onPrimaryAction?: () => void }) {
  const actionLabel = card.verdict === 'roll' ? 'Mark as rolled' : card.verdict === 'vault' ? 'Take vault item' : 'Mark tokens taken'
  const kicker = card.vaultCompare ? 'Great Vault vs Voidcore' : 'GallagioLoot recommends'
  const meta = `${card.rollsAvailable} Voidcore${card.rollsAvailable === 1 ? '' : 's'}`
  const tossUpPair = card.tossUp && card.tossUpBosses ? card.tossUpBosses : null

  // The card's dominant "name" element: boss name for a roll, the actual vault item's
  // name for a vault win (more specific than the generic card.headline string), nothing
  // for tokens -- card.headline ("Take the tokens") is used as-is in that case.
  const heroVerb = card.verdict === 'roll' ? 'Roll' : card.verdict === 'vault' ? 'Take' : null
  const heroName = card.verdict === 'vault' ? card.vaultCompare?.vaultItemName : card.bossName
  const vaultMarginPct = card.vaultCompare ? Math.abs(card.vaultCompare.voidcorePct - card.vaultCompare.vaultPct) : null

  return (
    <section className="rec-card" aria-label="Bonus roll recommendation">
      <div className="rec-card__top">
        <div className="rec-card__eyebrow">{kicker}</div>
        <div className="rec-card__meta num">{meta}</div>
      </div>

      {tossUpPair ? (
        <h2 className="rec-card__headline">
          <span className="rec-card__verb">Roll</span>{' '}
          <span className="rec-card__boss">
            {tossUpPair[0].name} <span className="rec-card__or">or</span> {tossUpPair[1].name}
          </span>
        </h2>
      ) : (
        <h2 className="rec-card__headline">
          {heroVerb && <span className="rec-card__verb">{heroVerb}</span>}
          {heroVerb ? ' ' : ''}
          <span className="rec-card__boss">{heroName ?? card.headline}</span>
        </h2>
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
          <div className="rec-card__pct num">{card.pct.toFixed(2)}%</div>
          {card.verdict === 'roll' && <div className="rec-card__pct-caption">expected gain from this Voidcore</div>}
        </div>
      )}

      {card.secondBest && !tossUpPair && card.verdict !== 'tokens' && (
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
          <div className={`rec-card__compare-option${card.verdict !== 'vault' ? ' rec-card__compare-option--win' : ''}`}>
            <div className="rec-card__compare-label">Voidcore roll</div>
            <div className="rec-card__compare-value num">{card.vaultCompare.voidcorePct.toFixed(2)}%</div>
          </div>
          <div className={`rec-card__compare-option${card.verdict === 'vault' ? ' rec-card__compare-option--win' : ''}`}>
            <div className="rec-card__compare-label">{card.vaultCompare.vaultItemName}</div>
            <div className="rec-card__compare-value num">{card.vaultCompare.vaultPct.toFixed(2)}%</div>
          </div>
        </div>
      )}

      {card.vaultCompare && vaultMarginPct != null && card.verdict !== 'tokens' && (
        <div className="rec-card__note--strong">
          {card.verdict === 'vault'
            ? `${card.vaultCompare.vaultItemName} beats the Voidcore roll by ${vaultMarginPct.toFixed(2)}%.`
            : `${heroName ?? 'This roll'} beats ${card.vaultCompare.vaultItemName} by ${vaultMarginPct.toFixed(2)}%.`}
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
