import React from 'react'
import { startGame } from '../api'
import type { Card, GameState, Suit } from '../types'

type Props = {
  state?: GameState
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

export default function Controls({ state, isBusy, earlyTurnOptions, canRequestEarlyTurn, onRequestEarlyTurn }: Props){
  const requiredPlayers = state?.config?.maxPlayers ?? state?.variant?.players_min ?? 2
  const playersCount = state?.players.length ?? 0
  const isTableFull = !!state && !state.started && playersCount >= requiredPlayers
  const canStart = isTableFull && !isBusy
  const trickIndex = state?.trick_index ?? 0
  const earlyOptions = earlyTurnOptions ?? []
  const disableEarlyTurn = Boolean(isBusy || !canRequestEarlyTurn || !onRequestEarlyTurn)

  const startButtonClassName = [
    'button',
    'start-button',
    isTableFull ? 'start-button--ready' : 'start-button--waiting',
  ].join(' ')

  return (
    <div className="controls">
      <button
        className={startButtonClassName}
        disabled={!canStart}
        onClick={()=> state?.room_id && startGame(state.room_id)}
        type="button"
      >
        Старт
      </button>

      {earlyOptions.length > 0 && (
        <div className="combo-panel">
          <span className="combo-title">Досрочный ход:</span>
          {earlyOptions.map(option => {
            const suitClass = option.suit === '♥' || option.suit === '♦' ? 'red' : 'black'
            return (
              <button
                key={`early-${option.id}`}
                className="chip early-turn-chip"
                disabled={disableEarlyTurn}
                onClick={() => onRequestEarlyTurn?.(option.cards)}
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
