import React from 'react'
import { startGame } from '../api'
import type { Card, GameState, Suit } from '../types'

type Props = {
  state?: GameState
  onDeclare: (combo: string) => void
  isBusy?: boolean
  earlyTurnOptions?: EarlyTurnOption[]
  canRequestEarlyTurn?: boolean
  onRequestEarlyTurn?: (cards: Card[]) => void
}

type EarlyTurnOption = {
  id: string
  cards: Card[]
  summary: string
  label: string
  pattern: 'same_suit' | 'aces_tens'
  suit?: Suit
}

const COMBOS: { key: 'bura'|'molodka'|'moscow'|'four_ends'; label: string; hint: string }[] = [
  { key: 'bura', label: 'Бура', hint: '4 козыря' },
  { key: 'molodka', label: 'Молодка', hint: '4 карты одной масти' },
  { key: 'moscow', label: 'Москва', hint: '3 туза с козырным' },
  { key: 'four_ends', label: '4 конца', hint: '4 десятки или 4 туза' },
]

export default function Controls({ state, onDeclare, isBusy, earlyTurnOptions, canRequestEarlyTurn, onRequestEarlyTurn }: Props){
  const requiredPlayers = state?.config?.maxPlayers ?? state?.variant?.players_min ?? 2
  const canStart = !!state && !state.started && state.players.length >= requiredPlayers
  const trickIndex = state?.trick_index ?? 0
  const canDeclare = !!state?.started && !state?.trick && !state?.match_over && trickIndex === 0 && !isBusy
  const combos = COMBOS.filter(combo => combo.key !== 'four_ends' || state?.config?.enableFourEnds)
  const earlyOptions = earlyTurnOptions ?? []
  const disableEarlyTurn = Boolean(isBusy || !canRequestEarlyTurn || !onRequestEarlyTurn)

  return (
    <div className="controls">
      <button
        className="button"
        disabled={!canStart || isBusy}
        onClick={()=> state?.room_id && startGame(state.room_id)}
        type="button"
      >
        Старт
      </button>

      <div className="combo-panel">
        <span className="combo-title">Комбинации:</span>
        {combos.map(combo => (
          <button
            key={combo.key}
            className="chip"
            disabled={!canDeclare}
            onClick={()=> onDeclare(combo.key)}
            title={combo.hint}
            type="button"
          >
            {combo.label}
          </button>
        ))}
      </div>

      {earlyOptions.length > 0 && (
        <div className="combo-panel">
          <span className="combo-title">Досрочный ход:</span>
          {earlyOptions.map(option => {
            const suitClass = option.suit === '♥' || option.suit === '♦' ? 'red' : 'black'
            const title = `${option.label}: ${option.summary.replace(/ · /g, ', ')}`
            return (
              <button
                key={`early-${option.id}`}
                className="chip early-turn-chip"
                disabled={disableEarlyTurn}
                onClick={() => onRequestEarlyTurn?.(option.cards)}
                title={title}
                type="button"
              >
                {option.suit && option.pattern === 'same_suit' ? (
                  <span className={`chip-suit ${suitClass}`}>{option.suit}</span>
                ) : null}
                <span className="combo-label">{option.label}</span>
                <span className="combo-cards">{option.summary}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
