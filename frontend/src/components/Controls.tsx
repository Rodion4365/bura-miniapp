import React from 'react'
import type { GameState } from '../types'
import { startGame } from '../api'

export default function Controls({
  state,
  onDraw,
  onPass,
  onDiscard
}:{
  state?: GameState
  onDraw: ()=>void
  onPass: ()=>void
  onDiscard: ()=>void
}){
  const requiredPlayers = state?.config?.maxPlayers ?? state?.variant?.players_min ?? 2
  const canStart = !!state && !state.started && state.players.length >= requiredPlayers
  const canAct = !!state?.started
  return (
    <div className="controls">
      <button
        className="button"
        disabled={!canStart}
        onClick={()=> state?.room_id && startGame(state.room_id)}
      >
        Старт
      </button>
      <button className="button secondary" disabled={!canAct} onClick={onPass}>Отбиться</button>
      <button className="button secondary" disabled={!canAct} onClick={onDiscard}>Сбросить карты</button>
      <button className="button secondary" onClick={onDraw}>Добор</button>
    </div>
  )
}
