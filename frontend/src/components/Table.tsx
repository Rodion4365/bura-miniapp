import React, { useMemo } from 'react'
import type { Card, GameState, Player, PublicCard, TrickPlay } from '../types'
import CardView from './CardView'

type DragPreview = { cards: Card[]; valid: boolean } | null

type Props = {
  state: GameState
  meId?: string
  turnSecondsLeft?: number
  dragPreview?: DragPreview
  onDropPlay: (cards: Card[]) => void
}

const MAX_PER_ROW = 4

function sortPlayers(players: Player[], meId?: string): Player[] {
  if (!players.length) return []
  const ordered = [...players].sort((a, b) => (a.seat ?? 0) - (b.seat ?? 0))
  if (!meId) return ordered
  const myIndex = ordered.findIndex(p => p.id === meId)
  if (myIndex === -1) return ordered
  return ordered.slice(myIndex).concat(ordered.slice(0, myIndex))
}

function chunkColumns<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return []
  const result: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size))
  }
  return result
}

function trumpLabel(card?: PublicCard): string {
  if (!card || ('hidden' in card && card.hidden)) return '—'
  const rankMap: Record<number, string> = { 11: 'В', 12: 'Д', 13: 'К', 14: 'Т' }
  const rank = rankMap[(card as Card).rank] ?? (card as Card).rank
  const suit = (card as Card).suit
  return `${rank}${suit}`
}

function buildPlaysMap(plays?: TrickPlay[]) {
  const map = new Map<string, TrickPlay>()
  plays?.forEach(play => map.set(play.player_id, play))
  return map
}

export default function TableView({ state, meId, turnSecondsLeft, dragPreview, onDropPlay }: Props) {
  const orderedPlayers = useMemo(() => sortPlayers(state.players, meId), [state.players, meId])
  const playsMap = useMemo(() => buildPlaysMap(state.trick?.plays), [state.trick?.plays])
  const dropActive = Boolean(dragPreview?.valid && state.turn_player_id === meId)

  const handleDragOver: React.DragEventHandler<HTMLDivElement> = event => {
    if (dropActive) {
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
    }
  }

  const handleDrop: React.DragEventHandler<HTMLDivElement> = event => {
    if (!dropActive || !dragPreview) return
    event.preventDefault()
    onDropPlay(dragPreview.cards)
  }

  const leaderPlay = state.trick?.plays.find(play => play.player_id === state.trick?.leader_id)
    ?? state.trick?.plays[0]
  const defenderPlay = state.trick && state.players.length > 1
    ? state.trick.plays.find(play => play.player_id !== leaderPlay?.player_id)
    : undefined
  const previewCards = dropActive ? dragPreview?.cards ?? [] : []
  const totalSlots = Math.max(
    state.trick?.required_count ?? 0,
    leaderPlay?.cards.length ?? 0,
    defenderPlay?.cards.length ?? 0,
    previewCards.length,
  )
  const boardColumns = Array.from({ length: Math.max(totalSlots, previewCards.length, state.trick ? 0 : 0) }).map((_, index) => ({
    attack: leaderPlay?.cards[index],
    defense: defenderPlay?.cards[index],
    preview: previewCards[index],
  }))
  const columnGroups = boardColumns.length ? chunkColumns(boardColumns, MAX_PER_ROW) : []
  const isDuel = orderedPlayers.length <= 2

  return (
    <section className="game-table">
      <div className="table-header">
        <div className="table-meta-left">
          <span className="meta-chip">Раунд {state.round_number ?? 1}</span>
          <span className="meta-chip">Козырь {trumpLabel(state.trump_card)}</span>
          <span className="meta-chip">Осталось карт: {state.deck_count}</span>
        </div>
        <div className="table-meta-right">
          {orderedPlayers.map(player => {
            const isTurn = state.turn_player_id === player.id
            return (
              <div key={player.id} className={`table-player ${isTurn ? 'active' : ''}`}>
                <span className="player-name">{player.name}</span>
                {isTurn && typeof turnSecondsLeft === 'number' && (
                  <span className="player-timer">{turnSecondsLeft}с</span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div
        className={`table-board ${dropActive ? 'drop-active' : ''}`}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {isDuel ? (
          columnGroups.length ? (
            columnGroups.map((group, groupIndex) => (
              <div className="board-row" key={`group-${groupIndex}`}>
                {group.map((column, index) => (
                  <div className="board-slot" key={`slot-${groupIndex}-${index}`}>
                    <div className="slot-top">
                      {column.attack ? <CardView card={column.attack} /> : column.preview ? <CardView card={column.preview} /> : <div className="card-placeholder" />}
                    </div>
                    <div className="slot-bottom">
                      {column.defense ? <CardView card={column.defense} /> : <div className="card-placeholder" />}
                    </div>
                  </div>
                ))}
              </div>
            ))
          ) : (
            <div className="board-empty">{state.trick ? 'Ожидание ответа' : 'Стол пуст'}</div>
          )
        ) : (
          <div className="board-stack">
            {orderedPlayers.map(player => {
              const play = playsMap.get(player.id)
              return (
                <div key={player.id} className="stack-row">
                  <span className="stack-name">{player.name}</span>
                  <div className="stack-cards">
                    {(play?.cards ?? []).map((card, idx) => (
                      <CardView key={`${player.id}-${idx}`} card={card} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {dropActive && <div className="drop-hint">Отпустите карты, чтобы сыграть</div>}
      </div>
    </section>
  )
}
