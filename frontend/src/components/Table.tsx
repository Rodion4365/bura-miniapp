import React, { useMemo } from 'react'
import type { GameState, Player, TrickPlay } from '../types'
import CardView from './CardView'

type Props = {
  state: GameState
  meId?: string
  turnSecondsLeft?: number
}

const COMBO_LABELS: Record<string, string> = {
  bura: 'Бура',
  molodka: 'Молодка',
  moscow: 'Москва',
  four_ends: '4 конца',
}

function sortPlayers(players: Player[], meId?: string): Player[] {
  if (!players.length) return []
  const ordered = [...players].sort((a, b) => (a.seat ?? 0) - (b.seat ?? 0))
  if (!meId) return ordered
  const myIndex = ordered.findIndex(p => p.id === meId)
  if (myIndex === -1) return ordered
  return ordered.slice(myIndex).concat(ordered.slice(0, myIndex))
}

function describeOutcome(play: TrickPlay, ownerId?: string): string {
  if (play.outcome === 'lead') return 'Ход'
  if (play.outcome === 'beat') return ownerId === play.player_id ? 'Перебил' : 'Перебил'
  return 'Сброс'
}

export default function TableView({ state, meId, turnSecondsLeft }: Props) {
  const orderedPlayers = useMemo(() => sortPlayers(state.players, meId), [state.players, meId])
  const scores = state.scores || {}
  const trickPlays = state.trick?.plays ?? []
  const discardCards = state.discard_pile ?? []
  const takenCounts = state.taken_counts ?? {}
  const announcements = state.announcements ?? []
  const winners = state.match_over ? state.winners ?? [] : []
  const losers = state.match_over ? state.losers ?? [] : []

  const suitToEmoji: Record<string, string> = { S:'♠️', H:'♥️', D:'♦️', C:'♣️', s:'♠️', h:'♥️', d:'♦️', c:'♣️' }
  const trumpEmoji = state.trump ? (suitToEmoji[state.trump] ?? state.trump) : ''

  const isMyTurn = state.turn_player_id && state.turn_player_id === meId

  return (
    <div className="table-layout">
      <div className="score-row">
        {orderedPlayers.map(player => (
          <div key={player.id} className={`score-chip ${state.turn_player_id === player.id ? 'active' : ''}`}>
            <span className="score-name">{player.name}</span>
            <span className="score-value">Штраф: {scores[player.id] ?? 0}</span>
            <span className="score-sub">Взято карт: {takenCounts[player.id] ?? 0}</span>
          </div>
        ))}
      </div>

      <div className="table-status">
        <div className="status-pill">Раунд {state.round_number ?? 1}</div>
        <div className="status-pill">Колода: {state.deck_count}</div>
        <div className="status-pill">Козырь {trumpEmoji}</div>
        {typeof turnSecondsLeft === 'number' && (
          <div className={`status-pill timer ${isMyTurn ? 'active' : ''}`}>
            Ход {turnSecondsLeft} с
          </div>
        )}
      </div>

      {state.match_over && (
        <div className="panel match-result">
          <div className="panel-title">Матч завершён</div>
          <div className="panel-body">
            {winners.length > 0 && (
              <div className="result-line">
                <strong>Победители:</strong>
                <span>{winners.map(id => state.players.find(p => p.id === id)?.name ?? id).join(', ')}</span>
              </div>
            )}
            {losers.length > 0 && (
              <div className="result-line">
                <strong>Проигравшие:</strong>
                <span>{losers.map(id => state.players.find(p => p.id === id)?.name ?? id).join(', ')}</span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="plays-board">
        <div className="plays-header">
          <div className="plays-title">Текущая взятка</div>
          {state.trick?.required_count && (
            <div className="pill">по {state.trick.required_count} карт(ы)</div>
          )}
        </div>
        {trickPlays.length === 0 && <div className="plays-placeholder">Нет карт на столе</div>}
        {trickPlays.map((play, idx) => {
          const player = state.players.find(p => p.id === play.player_id)
          return (
            <div key={`${play.player_id}-${idx}`} className={`play-row ${play.player_id === state.trick?.owner_id ? 'owner' : ''}`}>
              <div className="play-player">{player?.name || play.player_id}</div>
              <div className="play-cards">
                {play.cards.map((card, i) => (
                  <CardView key={`${card.suit}${card.rank}-${i}`} card={card} />
                ))}
              </div>
              <div className={`play-outcome outcome-${play.outcome}`}>{describeOutcome(play, state.trick?.owner_id)}</div>
            </div>
          )
        })}
      </div>

      <div className="info-panels">
        <div className="panel">
          <div className="panel-title">Сброс ({state.discard_count ?? discardCards.length})</div>
          <div className="panel-body discard-cards">
            {discardCards.length === 0 && <span className="muted">Пока пусто</span>}
            {discardCards.slice(-6).map((card, idx) => (
              <CardView key={`${card.suit}${card.rank}-d${idx}`} card={card} />
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-title">Комбинации</div>
          <div className="panel-body combos">
            {announcements.length === 0 && <span className="muted">Не объявлялись</span>}
            {announcements.map((entry, idx) => {
              const player = state.players.find(p => p.id === entry.player_id)
              const label = COMBO_LABELS[entry.combo] ?? entry.combo
              return (
                <div key={`${entry.player_id}-${entry.combo}-${idx}`} className="combo-entry">
                  <span className="combo-player">{player?.name || entry.player_id}</span>
                  <span className="combo-name">{label}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {state.round_points && Object.keys(state.round_points).length > 0 && (
        <div className="panel round-summary">
          <div className="panel-title">Очки последнего раунда</div>
          <div className="panel-body round-points">
            {orderedPlayers.map(player => (
              <div key={`pts-${player.id}`} className="round-point-row">
                <span>{player.name}</span>
                <span>{state.round_points?.[player.id] ?? 0}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
