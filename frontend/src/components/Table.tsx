import React, { useMemo } from 'react'
import type { Card, GameState, Player } from '../types'
import CardView from './CardView'

type TablePair = { attack: Card; defend?: Card }

type Props = {
  state: GameState
  meId?: string
}

function pairCards(cards: Card[] = []): TablePair[] {
  const pairs: TablePair[] = []
  for (let i = 0; i < cards.length; i += 2) {
    const attack = cards[i]
    const defend = cards[i + 1]
    if (attack) {
      pairs.push({ attack, defend })
    }
  }
  return pairs
}

function sortPlayers(players: Player[], meId?: string): Player[] {
  if (!players.length) return []
  const ordered = [...players].sort((a, b) => (a.seat ?? 0) - (b.seat ?? 0))
  if (!meId) return ordered
  const myIndex = ordered.findIndex(p => p.id === meId)
  if (myIndex === -1) return ordered
  return ordered.slice(myIndex).concat(ordered.slice(0, myIndex))
}

function OpponentBadge({ player, isTurn, score }: {
  player: Player
  isTurn: boolean
  score?: number
}) {
  return (
    <div className={`opponent-badge ${isTurn ? 'turn' : ''}`}>
      <div className="opponent-name">{player.name}</div>
      <div className="opponent-meta">
        <span className="pill">Счёт: {score ?? 0}</span>
      </div>
    </div>
  )
}

export default function TableView({ state, meId }: Props) {
  const pairs = useMemo(() => pairCards(state.table_cards), [state.table_cards])
  const orderedPlayers = useMemo(() => sortPlayers(state.players, meId), [state.players, meId])
  const me = orderedPlayers[0]?.id === meId ? orderedPlayers[0] : undefined
  const opponents = me ? orderedPlayers.slice(1) : orderedPlayers
  const top = opponents[0]
  const right = opponents[1]
  const left = opponents[2]

  const suitToEmoji: Record<string, string> = { S:'♠️', H:'♥️', D:'♦️', C:'♣️', s:'♠️', h:'♥️', d:'♦️', c:'♣️' }
  const trumpEmoji = state.trump ? (suitToEmoji[state.trump] ?? state.trump) : ''
  const scores = state.scores || {}

  return (
    <div className="table-layout">
      <div className="score-row">
        {orderedPlayers.map(player => (
          <div
            key={player.id}
            className={`score-chip ${state.turn_player_id === player.id ? 'active' : ''}`}
          >
            <span className="score-name">{player.name}</span>
            <span className="score-value">{scores[player.id] ?? 0}</span>
          </div>
        ))}
      </div>

      <div className="board-grid">
        <div className="seat seat-top">
          {top && (
            <OpponentBadge
              player={top}
              isTurn={state.turn_player_id === top.id}
              score={scores[top.id]}
            />
          )}
        </div>
        <div className="seat seat-left">
          {left && (
            <OpponentBadge
              player={left}
              isTurn={state.turn_player_id === left.id}
              score={scores[left.id]}
            />
          )}
        </div>

        <div className="table-center">
          <div className="table-pairs">
            {pairs.length === 0 && <div className="table-placeholder">Ходите картой</div>}
            {pairs.map((pair, idx) => (
              <div className="table-pair" key={`${pair.attack.suit}${pair.attack.rank}-${idx}`}>
                <div className="table-card attack">
                  <CardView card={pair.attack} />
                </div>
                <div className={`table-card defend ${pair.defend ? 'visible' : 'ghost'}`}>
                  {pair.defend ? <CardView card={pair.defend} /> : null}
                </div>
              </div>
            ))}
          </div>
          <div className="trump-info">
            <div className="trump-label">Козырь {trumpEmoji}</div>
            <div className={`trump-card ${state.trump_card ? '' : 'ghost'}`}>
              {state.trump_card ? <CardView card={state.trump_card} /> : <span>—</span>}
            </div>
            <div className="deck-counter">Колода: {state.deck_count}</div>
          </div>
        </div>

        <div className="seat seat-right">
          {right && (
            <OpponentBadge
              player={right}
              isTurn={state.turn_player_id === right.id}
              score={scores[right.id]}
            />
          )}
        </div>
      </div>

      {me && (
        <div className="player-badge">
          <div className="player-name">{me.name}</div>
          <div className="player-meta">
            <span className="pill">Вы</span>
            <span className="pill">Счёт: {scores[me.id] ?? 0}</span>
          </div>
        </div>
      )}
    </div>
  )
}
