import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { Card, PublicCard, TrickState, Suit } from '../types'
import CardView from './CardView'

type DragPreview = { cards: Card[]; valid: boolean }

type Props = {
  cards: Card[]
  trick?: TrickState
  trump?: Suit
  isMyTurn?: boolean
  playStamp?: number
  onPlay: (cards: Card[], meta?: { viaDrop?: boolean }) => void
  onDragPreview?: (preview: DragPreview | null) => void
  meId?: string
}

const RANK_ORDER = [6, 7, 8, 9, 10, 11, 12, 13, 14]

function rankStrength(rank: number): number {
  return RANK_ORDER.indexOf(rank)
}

function canBeatCard(card: Card, other: Card, trump?: Suit): boolean {
  if (card.suit === other.suit) {
    return rankStrength(card.rank) > rankStrength(other.rank)
  }
  if (card.suit === trump && other.suit !== trump) {
    return true
  }
  return false
}

function maxBeatCount(challenger: Card[], owner: Card[], trump?: Suit): number {
  const used = new Array(challenger.length).fill(false)

  function helper(ownerIndex: number): number {
    if (ownerIndex >= owner.length) return 0
    const skip = helper(ownerIndex + 1)
    let best = skip
    for (let i = 0; i < challenger.length; i += 1) {
      if (used[i]) continue
      if (!canBeatCard(challenger[i], owner[ownerIndex], trump)) continue
      used[i] = true
      best = Math.max(best, 1 + helper(ownerIndex + 1))
      used[i] = false
    }
    return best
  }

  return helper(0)
}

function combinations(total: number, size: number): number[][] {
  const result: number[][] = []
  const indexes = Array.from({ length: total }, (_, i) => i)

  function backtrack(start: number, combo: number[]) {
    if (combo.length === size) {
      result.push([...combo])
      return
    }
    for (let i = start; i < indexes.length; i += 1) {
      combo.push(indexes[i])
      backtrack(i + 1, combo)
      combo.pop()
    }
  }

  backtrack(0, [])
  return result
}

function scoreCombination(indexes: number[], cards: Card[], trump?: Suit): number {
  return indexes.reduce((sum, idx) => sum + (cards[idx].suit === trump ? 100 : 0) + rankStrength(cards[idx].rank), 0)
}

function suggestResponseIndexes(cards: Card[], owner: Card[], required: number, trump?: Suit): number[] | null {
  if (!required) return null
  const combos = combinations(cards.length, required)
  if (combos.length === 0) return null

  const winning: number[][] = []
  const fallback: number[][] = []

  combos.forEach(combo => {
    const sample = combo.map(idx => cards[idx])
    const beatCount = maxBeatCount(sample, owner, trump)
    if (beatCount === owner.length && owner.length === required) {
      winning.push(combo)
    } else {
      fallback.push(combo)
    }
  })

  if (winning.length > 0) {
    winning.sort((a, b) => scoreCombination(a, cards, trump) - scoreCombination(b, cards, trump))
    return winning[0]
  }

  fallback.sort((a, b) => {
    const trumpCountA = a.filter(idx => cards[idx].suit === trump).length
    const trumpCountB = b.filter(idx => cards[idx].suit === trump).length
    if (trumpCountA !== trumpCountB) return trumpCountA - trumpCountB
    return scoreCombination(a, cards, trump) - scoreCombination(b, cards, trump)
  })
  return fallback[0] ?? null
}

function suggestLeaderFromIndex(cards: Card[], index: number): number[] {
  const targetSuit = cards[index].suit
  const sameSuit = cards
    .map((card, idx) => ({ card, idx }))
    .filter(({ card }) => card.suit === targetSuit)
    .sort((a, b) => rankStrength(b.card.rank) - rankStrength(a.card.rank))
  const picks: number[] = [index]
  for (const entry of sameSuit) {
    if (picks.length >= 3) break
    if (entry.idx === index) continue
    picks.push(entry.idx)
  }
  return picks.sort((a, b) => a - b)
}

function suggestLeaderBest(cards: Card[]): number[] | null {
  const grouped = new Map<Suit, { idx: number; value: number }[]>()
  cards.forEach((card, idx) => {
    if (!grouped.has(card.suit)) grouped.set(card.suit, [])
    grouped.get(card.suit)!.push({ idx, value: rankStrength(card.rank) })
  })
  let best: number[] | null = null
  grouped.forEach(entries => {
    const ordered = entries.sort((a, b) => b.value - a.value)
    const picks = ordered.slice(0, Math.min(3, ordered.length)).map(entry => entry.idx)
    if (!best || picks.length > best.length || (picks.length === best.length && scoreCombination(picks, cards) < scoreCombination(best, cards))) {
      best = picks
    }
  })
  return best ? [...best].sort((a, b) => a - b) : null
}

function isValidFourCombo(cards: Card[]): boolean {
  if (cards.length !== 4) return false
  const suitSet = new Set(cards.map(card => card.suit))
  if (suitSet.size === 1) return true
  const counts = cards.reduce<Map<number, number>>((map, card) => {
    map.set(card.rank, (map.get(card.rank) ?? 0) + 1)
    return map
  }, new Map<number, number>())
  if (counts.size === 1) return true
  const tens = counts.get(10) ?? 0
  if (Array.from(counts.entries()).some(([rank, count]) => rank !== 10 && count === 3) && tens >= 1) {
    return true
  }
  if (Array.from(counts.entries()).some(([rank, count]) => rank !== 10 && count === 2) && tens >= 2) {
    return true
  }
  if ((counts.get(14) ?? 0) === 1 && tens === 3) {
    return true
  }
  return false
}

function isVisibleCard(card: PublicCard): card is PublicCard & { suit: Suit; rank: number } {
  return Boolean(card.faceUp && card.suit && card.rank)
}

export default function Hand({ cards, trick, trump, isMyTurn, playStamp, onPlay, onDragPreview, meId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonsRef = useRef<Array<HTMLButtonElement | null>>([])
  const pointerRef = useRef<{ index: number; y: number } | null>(null)
  const [selected, setSelected] = useState<number[]>([])
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [focusIndex, setFocusIndex] = useState(0)

  const leaderMode = !trick || trick.plays.length === 0
  const requiredCount = leaderMode ? undefined : trick?.required_count
  const ownerCards = useMemo(() => {
    if (!trick) return [] as Card[]
    const ownerPlay = trick.plays.find(play => play.owner)
    if (!ownerPlay) return [] as Card[]
    return ownerPlay.cards
      .filter(isVisibleCard)
      .map(card => ({
        id: card.cardId,
        suit: card.suit,
        rank: card.rank,
        color: card.color,
        imageUrl: card.imageUrl,
      }))
  }, [trick])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.classList.remove('deal-anim')
    const id = window.setTimeout(() => el.classList.add('deal-anim'), 0)
    return () => window.clearTimeout(id)
  }, [cards.map(card => `${card.suit}${card.rank}`).join(',')])

  useEffect(() => {
    setSelected(prev => prev.filter(idx => idx < cards.length))
  }, [cards.length])

  useEffect(() => {
    setSelected([])
    setDragging(false)
    setError(null)
  }, [playStamp])

  useEffect(() => {
    return () => {
      onDragPreview?.(null)
    }
  }, [onDragPreview])

  useEffect(() => {
    setError(null)
  }, [selected.join(','), isMyTurn, requiredCount])

  const selectedCards = selected.map(idx => cards[idx]).filter(Boolean)
  const ownerLabel = trick ? (trick.owner_id === meId ? 'Ты' : trick.owner_id?.slice(0, 4) ?? '—') : '—'

  function evaluateSelection(indices: number[]): { countValid: boolean; message: string } {
    const picks = indices.map(idx => cards[idx]).filter(Boolean)
    if (picks.length === 0) {
      return {
        countValid: false,
        message: leaderMode ? 'Выберите до четырёх карт (по правилам)' : `Нужно положить ровно ${requiredCount} карт`,
      }
    }
    if (picks.length > 4) {
      return { countValid: false, message: 'Нельзя выбрать больше четырёх карт' }
    }
    if (leaderMode) {
      if (picks.length === 4) {
        if (!isValidFourCombo(picks)) {
          return { countValid: false, message: 'Четыре карты должны образовывать допустимую комбинацию' }
        }
        return { countValid: true, message: 'Вы кладёте 4 карты' }
      }
      const suits = new Set(picks.map(card => card.suit))
      if (suits.size > 1) {
        return { countValid: false, message: 'Для лидера все карты должны быть одной масти' }
      }
      return { countValid: true, message: `Вы кладёте ${picks.length} карт` }
    }
    if (requiredCount && picks.length !== requiredCount) {
      return { countValid: false, message: `Нужно положить ровно ${requiredCount} карт` }
    }
    return { countValid: true, message: `Готово: ${picks.length} карта(ы)` }
  }

  const validation = useMemo(() => evaluateSelection(selected), [selected, leaderMode, requiredCount])
  const canSubmit = Boolean(isMyTurn && validation.countValid)
  const helperText = useMemo(() => {
    if (!isMyTurn) return 'Ждём хода соперника'
    if (error) return error
    return validation.message
  }, [isMyTurn, validation.message, error])

  function toggle(index: number) {
    setSelected(prev => {
      if (prev.includes(index)) {
        return prev.filter(i => i !== index)
      }
      if (!leaderMode && requiredCount && prev.length >= requiredCount) {
        return [index]
      }
      if (leaderMode && prev.length >= 4) {
        return [index]
      }
      return [...prev, index].sort((a, b) => a - b)
    })
    setFocusIndex(index)
  }

  function handlePlay(meta?: { viaDrop?: boolean }) {
    if (!canSubmit) {
      setError(isMyTurn ? validation.message : 'Сейчас ход другого игрока')
      return
    }
    if (selectedCards.length === 0) return
    onDragPreview?.(null)
    onPlay([...selectedCards], meta)
  }

  function handleClear() {
    setSelected([])
    setError(null)
    onDragPreview?.(null)
  }

  function applyHint(baseIndex?: number) {
    let suggestion: number[] | null = null
    if (leaderMode) {
      if (baseIndex !== undefined) {
        suggestion = suggestLeaderFromIndex(cards, baseIndex)
      } else {
        suggestion = suggestLeaderBest(cards)
      }
    } else if (requiredCount) {
      suggestion = suggestResponseIndexes(cards, ownerCards, requiredCount, trump)
    }
    if (suggestion && suggestion.length) {
      setSelected([...suggestion].sort((a, b) => a - b))
      setError(null)
      setFocusIndex(suggestion[0])
    }
  }

  function handleDoubleClick(index: number) {
    if (leaderMode) {
      applyHint(index)
    } else {
      applyHint()
    }
  }

  function handleDragStart(index: number, event: React.DragEvent<HTMLButtonElement>) {
    if (!isMyTurn) {
      event.preventDefault()
      return
    }
    const already = selected.includes(index)
    const future = already ? selected : [index]
    if (!already) {
      setSelected(future)
    }
    const previewValidation = evaluateSelection(future)
    const previewCards = future.map(idx => cards[idx])
    setDragging(true)
    onDragPreview?.({ cards: previewCards, valid: previewValidation.countValid && Boolean(isMyTurn) })
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('application/x-bura-cards', JSON.stringify({ count: future.length }))
  }

  function handleDragEnd() {
    setDragging(false)
    onDragPreview?.(null)
  }

  function handlePointerDown(index: number, event: React.PointerEvent<HTMLButtonElement>) {
    if (event.pointerType === 'touch') {
      pointerRef.current = { index, y: event.clientY }
    }
  }

  function handlePointerUp(index: number, event: React.PointerEvent<HTMLButtonElement>) {
    if (pointerRef.current && pointerRef.current.index === index) {
      const deltaY = event.clientY - pointerRef.current.y
      if (deltaY < -70 && selected.length === 1 && selected[0] === index) {
        handlePlay({ viaDrop: false })
      }
    }
    pointerRef.current = null
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (cards.length === 0) return
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      const next = (focusIndex + 1) % cards.length
      setFocusIndex(next)
      buttonsRef.current[next]?.focus()
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      const next = (focusIndex - 1 + cards.length) % cards.length
      setFocusIndex(next)
      buttonsRef.current[next]?.focus()
    } else if (event.key === ' ') {
      event.preventDefault()
      toggle(focusIndex)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      handlePlay({ viaDrop: false })
    } else if (event.key === 'Escape') {
      event.preventDefault()
      handleClear()
    }
  }

  const selectionSuit = leaderMode && selected.length > 0 ? cards[selected[0]].suit : null

  return (
    <div
      className={`hand ${dragging ? 'dragging' : ''}`}
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <div className="hand-header">
        <div className="hand-hint">
          {leaderMode
            ? 'Вы лидер: выберите до четырёх карт (по правилам)'
            : `Ответьте набором из ${requiredCount} карт`}
        </div>
        <div className="hand-meta">
          {trick && (
            <>
              <span className="pill">Нужно: {trick.required_count}</span>
              <span className="pill">Беру: {ownerLabel}</span>
            </>
          )}
        </div>
      </div>
      <div className={`hand-feedback ${error ? 'error' : ''}`}>{helperText}</div>
      <div className="hand-cards">
        {cards.map((card, index) => {
          const isSelected = selected.includes(index)
          const incompatible = Boolean(selectionSuit && card.suit !== selectionSuit)
          return (
            <button
              key={`${card.id}-${index}`}
              type="button"
              ref={el => {
                buttonsRef.current[index] = el
              }}
              className={`hand-card ${isSelected ? 'selected' : ''} ${incompatible ? 'incompatible' : ''}`}
              onClick={() => toggle(index)}
              onDoubleClick={() => handleDoubleClick(index)}
              draggable={Boolean(isMyTurn)}
              onDragStart={event => handleDragStart(index, event)}
              onDragEnd={handleDragEnd}
              onPointerDown={event => handlePointerDown(index, event)}
              onPointerUp={event => handlePointerUp(index, event)}
            >
              <CardView cardId={card.id} faceUp asset={card} />
            </button>
          )
        })}
      </div>
      <div className="hand-actions">
        <button className="chip" onClick={handleClear} type="button">
          Очистить выбор
        </button>
        <button className="chip" onClick={() => applyHint()} type="button">
          Подсказка
        </button>
        <button className="button primary" disabled={!canSubmit} onClick={() => handlePlay({ viaDrop: false })}>
          Сыграть
        </button>
      </div>
    </div>
  )
}
