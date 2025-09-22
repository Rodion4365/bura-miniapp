import React from 'react'
import type { Card, PublicCard } from '../types'

const suitToEmoji: Record<string, string> = {
  S: '♠️', H: '♥️', D: '♦️', C: '♣️',
  s: '♠️', h: '♥️', d: '♦️', c: '♣️'
}

type Props = { card: PublicCard; muted?: boolean }

export default function CardView({ card, muted }: Props) {
  if ('hidden' in card && card.hidden) {
    return (
      <div className={`card hidden ${muted ? 'muted' : ''}`} aria-label="Не видно">
        <div className="card-rank">XX</div>
      </div>
    )
  }
  const suit = suitToEmoji[card.suit] ?? card.suit
  const rankMap: Record<number, string> = { 11: 'В', 12: 'Д', 13: 'К', 14: 'Т' }
  const rank = rankMap[card.rank] ?? card.rank
  const isRed = card.suit === '♥' || card.suit === '♦'
  const label = `${rank}${suit}`
  return (
    <div className={`card ${isRed ? 'red' : ''} ${muted ? 'muted' : ''}`} title={label} aria-label={label}>
      <div className="card-rank">{rank}</div>
      <div className="card-suit">{suit}</div>
    </div>
  )
}
