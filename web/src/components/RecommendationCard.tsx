import type { CardData } from '../lib/cardData'

export function RecommendationCard({ card, onPrimaryAction }: { card: CardData; onPrimaryAction?: () => void }) {
  const actionLabel = card.verdict === 'roll' ? 'Mark as rolled' : card.verdict === 'vault' ? 'Take vault item' : 'Take the tokens'

  return (
    <section className="rec-card" aria-label="Bonus roll recommendation">
      <div className="rec-card__eyebrow">GallagioLoot recommends</div>
      <h2 className="rec-card__headline">{card.headline}</h2>
      <div className="rec-card__pct num">{card.pct.toFixed(2)}%</div>

      {card.secondBest && card.verdict !== 'tokens' && (
        <div className="rec-card__second">
          Next best: {card.secondBest.name} (~{card.secondBest.pct.toFixed(2)}%)
        </div>
      )}

      {card.vaultCompare && (
        <div className="rec-card__compare">
          <div className="rec-card__compare-option">
            <div className="rec-card__compare-label">Voidcore path</div>
            <div className="rec-card__compare-value num">{card.vaultCompare.voidcorePct.toFixed(2)}%</div>
          </div>
          <div className="rec-card__compare-option">
            <div className="rec-card__compare-label">{card.vaultCompare.vaultItemName}</div>
            <div className="rec-card__compare-value num">{card.vaultCompare.vaultPct.toFixed(2)}%</div>
          </div>
        </div>
      )}

      {card.tossUp && card.tossUpNote && <div className="rec-card__note">{card.tossUpNote}</div>}

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
