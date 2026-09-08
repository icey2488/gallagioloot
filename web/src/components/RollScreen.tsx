import type { CardData } from '../lib/cardData'
import { RecommendationCard } from './RecommendationCard'

export function RollScreen(props: { card: CardData | null; onMarkRolled: () => void; onBackToTable: () => void }) {
  const { card, onMarkRolled, onBackToTable } = props

  if (!card) {
    return (
      <div className="panel">
        <p>Paste a report to get a recommendation.</p>
      </div>
    )
  }

  return (
    <div>
      <RecommendationCard card={card} onPrimaryAction={card.verdict === 'roll' ? onMarkRolled : undefined} />
      <div style={{ textAlign: 'center', marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button type="button" className="btn-link" onClick={onBackToTable}>
          View full table
        </button>
        {card.verdict !== 'roll' && (
          <button type="button" className="btn-link" onClick={onMarkRolled}>
            Record a roll outcome
          </button>
        )}
      </div>
    </div>
  )
}
