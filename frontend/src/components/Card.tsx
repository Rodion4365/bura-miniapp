import { Card } from '../types'
export default function CardView({ card, onClick }: { card: Card; onClick?: () => void }) {
  const v = card.rank === 11 ? 'J' : card.rank === 12 ? 'Q' : card.rank === 13 ? 'K' : card.rank === 14 ? 'A' : String(card.rank)
  const label = `${v}${card.suit}`
  return <div className="card" onClick={onClick} title={label}>{label}</div>
}
