import type { Card, Suit } from '../types'

const EARLY_RANK_ORDER = [14, 13, 12, 11, 10, 9, 8, 7, 6]
const EARLY_RANK_LABEL: Record<number, string> = {
  6: '6',
  7: '7',
  8: '8',
  9: '9',
  10: '10',
  11: 'J',
  12: 'Q',
  13: 'K',
  14: 'A',
}

const ACE_TEN_PATTERNS = new Set(['1-3', '2-2', '3-1', '4-0'])

export type EarlyTurnPattern = 'same_suit' | 'aces_tens'

export type EarlyTurnDescription = {
  label: string
  pattern: EarlyTurnPattern
  suit?: Suit
  aces: number
  tens: number
}

export function formatEarlyTurnSummary(cards: Card[]): string {
  return [...cards]
    .sort((a, b) => {
      const ai = EARLY_RANK_ORDER.indexOf(a.rank)
      const bi = EARLY_RANK_ORDER.indexOf(b.rank)
      return ai - bi
    })
    .map(card => EARLY_RANK_LABEL[card.rank] ?? String(card.rank))
    .join(' · ')
}

export function isAllowedEarlyTurnCombo(cards: Card[]): boolean {
  if (cards.length !== 4) return false
  const suitSet = new Set(cards.map(card => card.suit))
  if (suitSet.size === 1) return true
  const rankCounts = cards.reduce<Map<number, number>>((map, card) => {
    map.set(card.rank, (map.get(card.rank) ?? 0) + 1)
    return map
  }, new Map<number, number>())
  const aces = rankCounts.get(14) ?? 0
  const tens = rankCounts.get(10) ?? 0
  if (rankCounts.size === 0) return false
  for (const rank of rankCounts.keys()) {
    if (rank !== 14 && rank !== 10) return false
  }
  return ACE_TEN_PATTERNS.has(`${aces}-${tens}`)
}

export function describeEarlyTurnCombo(cards: Card[]): EarlyTurnDescription {
  const suitSet = new Set(cards.map(card => card.suit))
  if (suitSet.size === 1) {
    const suit = cards[0]?.suit as Suit | undefined
    return {
      label: `${suit ?? ''}×4`,
      pattern: 'same_suit',
      suit,
      aces: cards.filter(card => card.rank === 14).length,
      tens: cards.filter(card => card.rank === 10).length,
    }
  }

  const rankCounts = cards.reduce<Map<number, number>>((map, card) => {
    map.set(card.rank, (map.get(card.rank) ?? 0) + 1)
    return map
  }, new Map<number, number>())
  const aces = rankCounts.get(14) ?? 0
  const tens = rankCounts.get(10) ?? 0

  let label = 'Комбо А/10'
  if (aces === 4) label = '4 туза'
  else if (aces === 3 && tens === 1) label = '3 туза и десятка'
  else if (aces === 2 && tens === 2) label = '2 туза и 2 десятки'
  else if (aces === 1 && tens === 3) label = 'Туз и 3 десятки'

  return {
    label,
    pattern: 'aces_tens',
    aces,
    tens,
  }
}
