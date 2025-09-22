import React from 'react'
import type { GameState } from '../types'
import { startGame } from '../api'

export default function Controls({
  state,
  onDraw
}:{
  state?: GameState
  onDraw: ()=>void
}){
  const requiredPlayers = state?.variant?.players_min ?? state?.config?.maxPlayers ?? 2
  const canStart = !!state && !state.started && state.players.length >= requiredPlayers
  return (
    <div className="controls">
      <button
        className="button"
        disabled={!canStart}
        onClick={()=> state?.room_id && startGame(state.room_id)}
      >
        Старт
      </button>
      <button className="button secondary" onClick={onDraw}>Добор</button>
    </div>
  )
}
