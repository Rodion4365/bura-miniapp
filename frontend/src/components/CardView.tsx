import React from 'react'
import type { Card, PublicCard } from '../types'

type Props = { card: PublicCard; muted?: boolean }

const RANK_LABEL: Record<number, string> = { 11: 'В', 12: 'Д', 13: 'К', 14: 'Т' }

function isVisibleCard(card: PublicCard): card is Card {
  return !('hidden' in card && card.hidden)
}

export default function CardView({ card, muted }: Props) {
  if (!isVisibleCard(card)) {
    return <div className={`playing-card back ${muted ? 'muted' : ''}`} aria-label="Скрытая карта" />
  }
  const rankLabel = RANK_LABEL[card.rank] ?? String(card.rank)
  const suit = card.suit
  const isRed = (card.color ?? (suit === '♥' || suit === '♦' ? 'red' : 'black')) === 'red'
  const label = `${rankLabel}${suit}`
  return (
    <div className={`playing-card face ${isRed ? 'red' : 'black'} ${muted ? 'muted' : ''}`} title={label} aria-label={label}>
      <div className="pc-corner pc-corner-top">
        <span className="pc-rank">{rankLabel}</span>
        <span className="pc-suit">{suit}</span>
      </div>
      <div className="pc-center">
        {card.image ? (
          <img src={card.image} alt={label} loading="lazy" />
        ) : (
          <span className="pc-symbol">{suit}</span>
        )}
      </div>
      <div className="pc-corner pc-corner-bottom">
        <span className="pc-rank">{rankLabel}</span>
        <span className="pc-suit">{suit}</span>
      </div>
    </div>
  )
}
