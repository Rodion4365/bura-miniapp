import React, { useState } from 'react'
import { startGame, getState } from '../api'

export default function StartGame({
  roomId,
  canStart,
  afterStart
}:{
  roomId: string
  canStart: boolean
  afterStart: (st: Record<string, unknown>) => void
}) {
  const [loading, setLoading] = useState(false)
  async function onClick() {
    if (!canStart || loading) return
    setLoading(true)
    try {
      await startGame(roomId)
      const st = await getState(roomId)
      afterStart(st)
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : 'Не удалось стартовать'
      alert(errorMessage)
    } finally { setLoading(false) }
  }
  return (
    <button className="button primary" disabled={!canStart || loading} onClick={onClick}>
      {loading ? 'Стартуем…' : 'Start'}
    </button>
  )
}
