import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { createRoomChannel } from '../room-channel'
import StartGame from '../components/StartGame'

type RoomProps = { roomId: string; onExit?: () => void }

function resolveWsBase(): string {
  const env = (import.meta as any).env || {}
  const fromEnv = env.VITE_WS_BASE as string | undefined
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  const loc = window.location
  const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${loc.host}`
}
function resolvePlayerId(): string {
  const saved = localStorage.getItem('player_id'); if (saved) return saved
  const usp = new URLSearchParams(window.location.search)
  const qp = usp.get('player_id'); if (qp) { localStorage.setItem('player_id', qp); return qp }
  const gen = `anon-${Math.random().toString(36).slice(2, 8)}`
  localStorage.setItem('player_id', gen); return gen
}

export default function Room({ roomId, onExit }: RoomProps) {
  const [search] = useSearchParams()
  const [state, setState] = useState<any>(null)
  const [wsBase] = useState(() => resolveWsBase())
  const [playerId] = useState(() => resolvePlayerId())
  const rid = roomId || search.get('room') || ''

  useEffect(() => {
    if (!rid || !playerId) return
    let cancelled = false
    const ch = createRoomChannel({
      wsBase,
      roomId: rid,
      playerId,
      pollIntervalMs: 3000,
      onState: (st) => { if (!cancelled) setState(st) },
    })
    return () => {
      cancelled = true
      ch.close()
    }
  }, [rid, playerId, wsBase])

  const playersCount = state?.players?.length ?? 0
  const maxPlayers = state?.variant?.players_max ?? '—'
  const minPlayers = state?.variant?.players_min ?? 2
  const canStart = useMemo(() => !state?.started && playersCount >= minPlayers, [state, playersCount, minPlayers])

  function handleExit() {
    if (onExit) onExit()
    else window.location.href = (import.meta as any).env?.BASE_URL || '/'
  }

  if (!rid) return (
    <div className="screen">
      <div className="badge warn">Не указан room_id</div>
      <button className="button" onClick={handleExit}>← Выйти в меню</button>
    </div>
  )
  if (!state) return (
    <div className="screen">
      <div className="badge">Загрузка комнаты {rid}…</div>
      <button className="button" onClick={handleExit}>← Выйти в меню</button>
    </div>
  )

  return (
    <div className="screen">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div className="chips" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span className="chip">Комната: {rid}</span>
          <span className="chip">Игроков: {playersCount}/{maxPlayers}</span>
          <span className="chip">Ход: {state?.turn ?? '—'}</span>
          <span className="chip">Колода: {state?.deck_count ?? 0}</span>
        </div>
        <StartGame roomId={rid} canStart={canStart} afterStart={(st) => setState(st)} />
      </div>

      <div style={{ marginTop: 16 }}>
        <button className="button">Козырь</button>
      </div>

      <h3 style={{ marginTop: 24 }}>Твоя рука</h3>
      <div style={{ marginTop: 16 }}>
        <button className="link" onClick={handleExit}>← Выйти в меню</button>
      </div>
    </div>
  )
}
