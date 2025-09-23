import React, { useMemo } from 'react'
import type { Card, CardColor, Suit } from '../types'

type Props = {
  cardId: string
  faceUp?: boolean
  asset?: Partial<Card> & { suit?: Suit; rank?: number; color?: CardColor }
  imageUrl?: string
  backImageUrl?: string
  muted?: boolean
}

const DEFAULT_BACK = 'https://deckofcardsapi.com/static/img/back.png'
const RANK_LABEL: Record<number, string> = { 11: 'В', 12: 'Д', 13: 'К', 14: 'Т' }

export default function CardView({ cardId, faceUp = true, asset, imageUrl, backImageUrl, muted }: Props) {
  const resolved = useMemo(() => asset, [asset])
  const resolvedImage = faceUp
    ? imageUrl ?? resolved?.imageUrl
    : backImageUrl ?? resolved?.backImageUrl ?? DEFAULT_BACK
  const rankLabel = resolved?.rank ? (RANK_LABEL[resolved.rank] ?? String(resolved.rank)) : undefined
  const suit = resolved?.suit
  const label = faceUp && rankLabel && suit ? `${rankLabel}${suit}` : 'Скрытая карта'
  return (
    <div className={`card-image ${faceUp ? 'face' : 'back'} ${muted ? 'muted' : ''}`.trim()} aria-label={label}>
      {resolvedImage ? (
        <img src={resolvedImage} alt={label} loading="lazy" />
      ) : (
        <div className="card-fallback" data-card={cardId}>
          {faceUp && rankLabel && suit ? `${rankLabel}${suit}` : ''}
        </div>
      )}
    </div>
  )
}
