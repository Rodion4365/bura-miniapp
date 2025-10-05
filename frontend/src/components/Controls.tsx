import React from 'react'
import { startGame } from '../api'
import type { GameState } from '../types'

type Props = {
  state?: GameState
  onDeclare: (combo: string) => void
  isBusy?: boolean
}

const COMBOS: { key: 'bura'|'molodka'|'moscow'|'four_ends'; label: string; hint: string }[] = [
  { key: 'bura', label: 'Бура', hint: '4 козыря' },
  { key: 'molodka', label: 'Молодка', hint: '4 карты одной масти' },
  { key: 'moscow', label: 'Москва', hint: '3 туза с козырным' },
  { key: 'four_ends', label: '4 конца', hint: '4 десятки или 4 туза' },
]

export default function Controls({ state, onDeclare, isBusy }: Props){
  const requiredPlayers = state?.config?.maxPlayers ?? state?.variant?.players_min ?? 2
  const canStart = !!state && !state.started && state.players.length >= requiredPlayers
  const trickIndex = state?.trick_index ?? 0
  const canDeclare = !!state?.started && !state?.trick && !state?.match_over && trickIndex === 0 && !isBusy
  const combos = COMBOS.filter(combo => combo.key !== 'four_ends' || state?.config?.enableFourEnds)

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
    </div>
  )
}
