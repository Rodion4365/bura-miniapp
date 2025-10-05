import React, { useEffect, useMemo, useState } from 'react'
import type { Card, CardColor, GameState, Player, Suit, TrickState } from '../types'
import CardView from './CardView'

type DragPreview = { cards: Card[]; valid: boolean } | null

type Props = {
  state: GameState
  meId?: string
  dragPreview?: DragPreview
  onDropPlay: (cards: Card[]) => void
  cardAssets: Map<string, Card>
  fallbackTimer?: number
  countdownSeconds?: number
  isCountdownActive?: boolean
}

type BoardEntry = {
  cardId: string
  faceUp: boolean
  suit?: Suit
  rank?: number
  color?: CardColor
  imageUrl?: string
  backImageUrl?: string
}

type BoardSnapshot = {
  attacker: BoardEntry[]
  defender: BoardEntry[]
  revealUntilTs?: number
}

const MAX_PREVIEW = 4

function sortPlayers(players: Player[], meId?: string): Player[] {
  if (!players.length) return []
  const ordered = [...players].sort((a, b) => (a.seat ?? 0) - (b.seat ?? 0))
  if (!meId) return ordered
  const myIndex = ordered.findIndex(p => p.id === meId)
  if (myIndex === -1) return ordered
  return ordered.slice(myIndex).concat(ordered.slice(0, myIndex))
}

function resolveBoardFromTrick(trick?: TrickState): BoardSnapshot {
  if (!trick || trick.plays.length === 0) {
    return { attacker: [], defender: [] }
  }
  const leaderPlay = trick.plays.find(play => play.outcome === 'lead') ?? trick.plays[0]
  const defenderPlay = trick.plays.find(play => play !== leaderPlay)
  const attacker = (leaderPlay?.cards ?? []).map(card => ({
    cardId: card.cardId,
    faceUp: card.faceUp,
    suit: card.suit,
    rank: card.rank,
    color: card.color,
    imageUrl: card.imageUrl,
  }))
  const defender = (defenderPlay?.cards ?? []).map(card => ({
    cardId: card.cardId,
    faceUp: card.faceUp,
    suit: card.suit,
    rank: card.rank,
    color: card.color,
    imageUrl: card.imageUrl,
  }))
  return { attacker, defender }
}

function pickBoard(state: GameState): BoardSnapshot {
  if (state.board) {
    return {
      attacker: state.board.attacker.map(card => ({
        cardId: card.cardId,
        faceUp: card.faceUp,
        suit: card.suit,
        rank: card.rank,
        color: card.color,
        imageUrl: card.imageUrl,
        backImageUrl: card.backImageUrl,
      })),
      defender: state.board.defender.map(card => ({
        cardId: card.cardId,
        faceUp: card.faceUp,
        suit: card.suit,
        rank: card.rank,
        color: card.color,
        imageUrl: card.imageUrl,
        backImageUrl: card.backImageUrl,
      })),
      revealUntilTs: state.board.revealUntilTs,
    }
  }
  return resolveBoardFromTrick(state.trick)
}

export default function TableView({ state, meId, dragPreview, onDropPlay, cardAssets, fallbackTimer, countdownSeconds, isCountdownActive }: Props) {
  const orderedPlayers = useMemo(() => sortPlayers(state.players, meId), [state.players, meId])
  const board = useMemo(() => pickBoard(state), [state])
  const activePlayerId = state.turn_player_id
  const [localNow, setLocalNow] = useState(() => Date.now())
  const dropActive = Boolean(!isCountdownActive && dragPreview?.valid && activePlayerId === meId)

  useEffect(() => {
    if (typeof countdownSeconds === 'number') {
      return undefined
    }
    if (!board.revealUntilTs) {
      return undefined
    }
    setLocalNow(Date.now())
    const id = window.setInterval(() => setLocalNow(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [board.revealUntilTs, countdownSeconds])

  const fallbackCountdown =
    typeof countdownSeconds === 'number'
      ? undefined
      : board.revealUntilTs
        ? Math.max(0, Math.ceil((board.revealUntilTs * 1000 - localNow) / 1000))
        : undefined
  const countdownValue = countdownSeconds ?? fallbackCountdown
  const showCountdown = typeof countdownValue === 'number' && countdownValue > 0
  const countdownLabel = showCountdown ? Math.max(1, countdownValue) : undefined

  const handleDragOver: React.DragEventHandler<HTMLDivElement> = event => {
    if (dropActive) {
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
    }
  }

  const handleDrop: React.DragEventHandler<HTMLDivElement> = event => {
    if (!dropActive || !dragPreview) return
    event.preventDefault()
    onDropPlay(dragPreview.cards.slice(0, MAX_PREVIEW))
  }

  const previewCards = dropActive ? dragPreview?.cards.slice(0, MAX_PREVIEW) ?? [] : []

  const boardClass = ['table-board', dropActive ? 'drop-active' : '', isCountdownActive ? 'frozen' : '']
    .filter(Boolean)
    .join(' ')

  return (
    <section className="game-table">
      <header className="table-header">
        <div className="table-meta-left">
          <span className="meta-chip">Раунд {state.round_number ?? 1}</span>
          <span className="meta-chip">Козырь {state.trump_card ? state.trump_card.suit : '—'}</span>
          <span className="meta-chip">Осталось карт: {state.deck_count}</span>
        </div>
        <div className="table-meta-right">
          <div className="players-list">
            {orderedPlayers.map(player => {
              const clock = state.tablePlayers?.find(entry => entry.playerId === player.id)
              const timerValue = clock?.isActive
                ? typeof fallbackTimer === 'number'
                  ? fallbackTimer
                  : clock?.turnTimerSec
                : undefined
              const showTimer = typeof timerValue === 'number' && timerValue > 0
              return (
                <div key={player.id} className={`table-player ${clock?.isActive ? 'active' : ''}`}>
                  <span className="player-name">{player.name}</span>
                  {clock?.isActive && showTimer && (
                    <span className="player-timer">{timerValue}s</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </header>

      <div
        className={boardClass}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <div className="lane attacker">
          {board.attacker.map(card => {
            const asset = cardAssets.get(card.cardId) ?? {
              id: card.cardId,
              suit: card.suit,
              rank: card.rank,
              color: card.color,
              imageUrl: card.imageUrl,
              backImageUrl: card.backImageUrl,
            }
            return (
              <CardView
                key={`attack-${card.cardId}`}
                cardId={card.cardId}
                faceUp={card.faceUp}
                asset={asset}
                imageUrl={card.imageUrl}
                backImageUrl={card.backImageUrl}
              />
            )
          })}
          {previewCards.length > 0 && (
            <div className="lane-preview" aria-hidden="true">
              {previewCards.map(card => (
                <CardView key={`preview-${card.id}`} cardId={card.id} faceUp asset={card} muted />
              ))}
            </div>
          )}
        </div>

        {board.defender.length > 0 && (
          <div className="lane defender">
            {board.defender.map(card => {
              const asset = cardAssets.get(card.cardId) ?? {
                id: card.cardId,
                suit: card.suit,
                rank: card.rank,
                color: card.color,
                imageUrl: card.imageUrl,
                backImageUrl: card.backImageUrl,
              }
              return (
                <CardView
                  key={`defend-${card.cardId}`}
                  cardId={card.cardId}
                  faceUp={card.faceUp}
                  asset={asset}
                  imageUrl={card.imageUrl}
                  backImageUrl={card.backImageUrl}
                />
              )
            })}
          </div>
        )}

        {dropActive && <div className="drop-hint">Отпустите карты, чтобы сыграть</div>}
      </div>

      {countdownLabel && (
        <div className="reveal-indicator">
          Смена хода через {countdownLabel}с
        </div>
      )}
    </section>
  )
}
