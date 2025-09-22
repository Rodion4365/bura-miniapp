import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { Card } from '../types'
import CardView from './CardView'

type Props = {
  cards: Card[]
  requiredCount?: number
  isMyTurn?: boolean
  onPlay: (cards: Card[]) => void
}

function cardKey(card: Card): string {
  return `${card.suit}-${card.rank}`
}

export default function Hand({ cards, requiredCount, isMyTurn, onPlay }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState<number[]>([])

  useEffect(()=>{
    const el = containerRef.current
    if (!el) return
    el.classList.remove('deal-anim')
    const id = setTimeout(()=> el.classList.add('deal-anim'), 0)
    return ()=> clearTimeout(id)
  }, [cards.map(cardKey).join(',')])

  useEffect(()=>{
    setSelected(prev => prev.filter(index => index < cards.length))
  }, [cards.length])

  const selectionSuit = useMemo(()=>{
    if (requiredCount) return null
    if (selected.length === 0) return null
    return cards[selected[0]]?.suit ?? null
  }, [selected, cards, requiredCount])

  const selectedCards = selected.map(idx => cards[idx]).filter(Boolean)
  const maxSelectable = requiredCount ?? 3

  const isSelectionValid = useMemo(()=>{
    if (!isMyTurn) return false
    if (requiredCount) return selectedCards.length === requiredCount
    if (selectedCards.length === 0 || selectedCards.length > 3) return false
    const suits = new Set(selectedCards.map(c => c.suit))
    return suits.size === 1
  }, [isMyTurn, requiredCount, selectedCards])

  function toggle(index: number){
    const already = selected.includes(index)
    if (already){
      setSelected(prev => prev.filter(i => i !== index))
      return
    }
    if (requiredCount){
      if (selected.length >= requiredCount) return
      setSelected(prev => [...prev, index])
      return
    }
    if (selected.length >= maxSelectable){
      setSelected([index])
      return
    }
    if (selectionSuit && cards[index]?.suit !== selectionSuit){
      setSelected([index])
      return
    }
    setSelected(prev => [...prev, index])
  }

  function handlePlay(){
    if (!isSelectionValid) return
    onPlay(selectedCards)
    setSelected([])
  }

  return (
    <div className="hand" ref={containerRef}>
      <div className="hand-hint">
        {requiredCount
          ? `Нужно выложить ${requiredCount} ${requiredCount === 1 ? 'карту' : 'карты'}`
          : 'Выберите до трёх карт одной масти для хода'}
      </div>
      <div className="hand-cards">
        {cards.map((card, index) => {
          const isSelected = selected.includes(index)
          return (
            <button
              key={`${card.suit}${card.rank}-${index}`}
              type="button"
              className={`hand-card ${isSelected ? 'selected' : ''}`}
              onClick={()=>toggle(index)}
              disabled={!isMyTurn && !isSelected}
            >
              <CardView card={card} />
            </button>
          )
        })}
      </div>
      <div className="hand-actions">
        <button className="chip" onClick={()=> setSelected([])}>Сбросить выбор</button>
        <button className="button primary" disabled={!isSelectionValid} onClick={handlePlay}>
          Сыграть выбранные карты
        </button>
      </div>
    </div>
  )
}
