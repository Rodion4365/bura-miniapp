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

const COMBO_LABELS: Record<string, string> = {
  bura: 'Бура',
  molodka: 'Молодка',
  moscow: 'Москва',
  four_ends: '4 конца',
}

const OUTCOME_LABEL: Record<TrickPlay['outcome'], string> = {
  lead: 'Ход',
  beat: 'Перебил',
  partial: 'Частично',
  discard: 'Сброс',
}

function sortPlayers(players: Player[], meId?: string): Player[] {
  if (!players.length) return []
  const ordered = [...players].sort((a, b) => (a.seat ?? 0) - (b.seat ?? 0))
  if (!meId) return ordered
  const myIndex = ordered.findIndex(p => p.id === meId)
  if (myIndex === -1) return ordered
  return ordered.slice(myIndex).concat(ordered.slice(0, myIndex))
}

function visibleCardCount(state: GameState, playerId: string): number | undefined {
  if (state.me?.id === playerId && state.hands) return state.hands.length
  return state.hand_counts?.[playerId]
}

function trumpLabel(card?: PublicCard): string {
  if (!card) return '—'
  if ('hidden' in card && card.hidden) return '—'
  const suitToEmoji: Record<string, string> = { S: '♠️', H: '♥️', D: '♦️', C: '♣️', '♠': '♠️', '♥': '♥️', '♦': '♦️', '♣': '♣️' }
  const rankMap: Record<number, string> = { 11: 'В', 12: 'Д', 13: 'К', 14: 'Т' }
  const rank = rankMap[(card as Card).rank] ?? (card as Card).rank
  const suit = suitToEmoji[(card as Card).suit] ?? (card as Card).suit
  return `${rank}${suit}`
}

export default function TableView({ state, meId, turnSecondsLeft, dragPreview, onDropPlay }: Props) {
  const orderedPlayers = useMemo(() => sortPlayers(state.players, meId), [state.players, meId])
  const playsMap = useMemo(() => {
    const map = new Map<string, TrickPlay>()
    state.trick?.plays.forEach(play => map.set(play.player_id, play))
    return map
  }, [state.trick?.plays])

  const slotCount = state.trick?.required_count ?? 0
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

  return (
    <div className="table-layout">
      <div className="table-indicators">
        <div className="indicator">Раунд {state.round_number ?? 1}</div>
        <div className="indicator">Козырь: {trumpLabel(state.trump_card)}</div>
        <div className="indicator">Нужно карт: {slotCount || '—'}</div>
        <div className="indicator">Сброс: {state.config?.discardVisibility === 'open' ? 'Открыто' : 'Рубашкой'}</div>
        <div className={`indicator timer ${state.turn_player_id === meId ? 'active' : ''}`}>
          Таймер: {typeof turnSecondsLeft === 'number' ? `${turnSecondsLeft} c` : state.config?.turnTimeoutSec ?? '—'}
        </div>
      </div>

      <div className="table-opponents">
        {orderedPlayers.map(player => {
          const cardCount = visibleCardCount(state, player.id)
          const isTurn = state.turn_player_id === player.id
          const isOwner = state.trick?.owner_id === player.id
          return (
            <div key={player.id} className={`player-chip ${isTurn ? 'turn' : ''} ${player.id === meId ? 'me' : ''}`}>
              <div className="chip-name">{player.name}</div>
              <div className="chip-count">{cardCount !== undefined ? `${cardCount} карт` : '—'}</div>
              {isOwner && <div className="chip-owner">Беру</div>}
            </div>
          )
        })}
      </div>

      <div
        className={`trick-area slots-${Math.max(slotCount, dragPreview?.cards.length ?? 0)} ${dropActive ? 'drop-active' : ''}`}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {orderedPlayers.map(player => {
          const play = playsMap.get(player.id)
          const cards = play?.cards ?? []
          const showSlots = slotCount || cards.length || (dropActive ? dragPreview?.cards.length ?? 0 : 0)
          return (
            <div key={`row-${player.id}`} className={`trick-row ${play?.owner ? 'owner' : ''} outcome-${play?.outcome ?? 'pending'}`}>
              <div className="trick-player">{player.name}</div>
              <div className="trick-slots">
                {Array.from({ length: showSlots || 1 }).map((_, idx) => (
                  <div key={`slot-${player.id}-${idx}`} className="trick-slot">
                    {cards[idx] ? (
                      <CardView card={cards[idx]} muted={play?.outcome === 'partial' || play?.outcome === 'discard'} />
                    ) : (
                      <div className="slot-placeholder" />
                    )}
                  </div>
                ))}
              </div>
              <div className="trick-outcome">{play ? OUTCOME_LABEL[play.outcome] : '—'}</div>
            </div>
          )
        })}
        {!state.trick && <div className="trick-empty">Ход лидера</div>}
        {dropActive && <div className="drop-hint">Отпустите, чтобы сыграть</div>}
      </div>

      <div className="table-summary">
        <div className="summary-panel">
          <div className="panel-title">Очки штрафа</div>
          <div className="panel-body">
            {orderedPlayers.map(player => (
              <div key={`score-${player.id}`} className="summary-row">
                <span>{player.name}</span>
                <span>{state.scores?.[player.id] ?? 0}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="summary-panel">
          <div className="panel-title">Взято карт</div>
          <div className="panel-body">
            {orderedPlayers.map(player => (
              <div key={`taken-${player.id}`} className="summary-row">
                <span>{player.name}</span>
                <span>{state.taken_counts?.[player.id] ?? 0}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="summary-panel">
          <div className="panel-title">Комбинации</div>
          <div className="panel-body combos">
            {state.announcements?.length ? (
              state.announcements.map((entry, idx) => {
                const player = state.players.find(p => p.id === entry.player_id)
                return (
                  <div key={`combo-${entry.player_id}-${idx}`} className="combo-row">
                    <span>{player?.name ?? entry.player_id}</span>
                    <span>{COMBO_LABELS[entry.combo] ?? entry.combo}</span>
                  </div>
                )
              })
            ) : (
              <span className="muted">Не объявлялись</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
