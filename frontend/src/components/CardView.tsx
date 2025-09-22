import React from 'react'
import type { Card } from '../types'

const suitToEmoji: Record<string, string> = {
  S: '♠️', H: '♥️', D: '♦️', C: '♣️',
  s: '♠️', h: '♥️', d: '♦️', c: '♣️'
}

export default function CardView({ card }: { card: Card }) {
  const suit = suitToEmoji[card.suit] ?? card.suit
  const rankMap: Record<number, string> = { 11: 'В', 12: 'Д', 13: 'К', 14: 'Т' }
  const rank = rankMap[card.rank] ?? card.rank
  const isRed = card.suit === '♥' || card.suit === '♦'
  const label = `${rank}${suit}`
  return (
    <div className={`card ${isRed ? 'red' : ''}`} title={label} aria-label={label}>
      <div className="card-rank">{rank}</div>
      <div className="card-suit">{suit}</div>
    </div>
  )
}
