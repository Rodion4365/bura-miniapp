import React from 'react'
import type { Card } from '../types'

const suitToEmoji: Record<string, string> = {
  S: '♠️', H: '♥️', D: '♦️', C: '♣️',
  s: '♠️', h: '♥️', d: '♦️', c: '♣️'
}

export default function CardView({ card }: { card: Card }) {
  const suit = suitToEmoji[card.suit] ?? card.suit
  return (
    <div className="card">
      <div className="card-rank">{card.rank}</div>
      <div className="card-suit">{suit}</div>
    </div>
  )
}
