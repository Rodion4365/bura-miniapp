import { useEffect, useMemo, useRef, useState } from 'react'
import type { TableConfig } from '../api'

type Variant = { key:string; title:string; players_min:number; players_max:number }
type RoomRow = {
  room_id:string
  name:string
  players:number
  players_max:number
  started:boolean
  variant?: Variant
  config?: TableConfig
}

export default function Lobby({
  headers,
  onJoined,
}:{
  headers: Record<string,string>
  onJoined: (roomId:string)=>void
}){
  const [rooms, setRooms] = useState<RoomRow[]>([])
  const [manual, setManual] = useState('')
  const [loading, setLoading] = useState(false)
  const wsRef = useRef<WebSocket|null>(null)
  const apiBase = import.meta.env.VITE_API_BASE || ''
  const wsBase  = import.meta.env.VITE_WS_BASE || (location.origin.replace(/^http/,'ws'))

  // live через WS
  useEffect(()=>{
    const ws = new WebSocket(`${wsBase}/ws/lobby`)
    wsRef.current = ws
    ws.onmessage = (ev)=>{
      try {
        const m = JSON.parse(ev.data)
        if (m.type === 'rooms') setRooms(m.payload)
      } catch (err) {
        console.error('[Lobby] Failed to parse WebSocket message:', err)
      }
    }
    ws.onerror = () => {/* игнорим */}
    return ()=> ws.close()
  },[])

  // периодический опрос JSON (подстраховка на случай потери WS)
  useEffect(()=>{
    let stop = false
    async function pull(){
      setLoading(true)
      try{
        const res = await fetch(`${apiBase}/api/rooms`, { cache: 'no-store' })
        const data: RoomRow[] = await res.json()
        if (!stop) setRooms(data)
      } catch (err) {
        console.error('[Lobby] Failed to fetch rooms:', err)
      } finally {
        setLoading(false)
      }
    }
    pull()
    const id = setInterval(pull, 10000) // каждые 10с
    return ()=>{ stop = true; clearInterval(id) }
  },[apiBase])

  function visibleRooms(list: RoomRow[]){
    // показываем только столы, где есть хотя бы 1 игрок
    return list.filter(r => r.players > 0)
  }

  async function refreshNow(){
    setLoading(true)
    try{
      const res = await fetch(`${apiBase}/api/rooms`, { cache: 'no-store' })
      const data: RoomRow[] = await res.json()
      setRooms(data)
    } catch (err) {
      console.error('[Lobby] Failed to refresh rooms:', err)
    } finally {
      setLoading(false)
    }
  }

  async function join(room_id: string) {
    try {
      const res = await fetch(`${apiBase}/api/game/join`, {
        method: 'POST',
        headers: { 'content-type':'application/json', ...headers },
        body: JSON.stringify({ room_id })
      })
      const data = await res.json()
      if (data?.ok) onJoined(room_id)
      else alert(data?.error || 'Не удалось присоединиться')
    } catch (err) {
      console.error('[Lobby] Failed to join room:', err)
      alert('Ошибка при подключении к комнате')
    }
  }

  const canShow = useMemo(()=>visibleRooms(rooms), [rooms])

  return (
    <div className="lobby-wrap">
      <div className="lobby-toolbar">
        <div className="search-row">
          <input
            className="input"
            placeholder="Ввести ID комнаты…"
            value={manual}
            onChange={e=>setManual(e.target.value)}
          />
          <button className="button" onClick={()=> manual.trim() && join(manual.trim())}>
            Присоединиться по ID
          </button>
        </div>
        <button className="icon-btn" title="Обновить" onClick={refreshNow} aria-label="Refresh">
          ⟳
        </button>
      </div>

      {loading && <div className="badge">Обновляем…</div>}

      {canShow.length === 0 && !loading && (
        <div className="badge">Нет доступных комнат. Создайте новую или обновите список.</div>
      )}

      <div className="rooms-grid">
        {canShow.map(r=>(
          <div key={r.room_id} className="room-card">
            <div className="room-head">
              <div className="room-name">{r.name}</div>
              <div className="room-variant">
                {r.variant?.title || 'Пользовательский стол'}
              </div>
            </div>
            <div className="room-meta">
              <span className="badge">Игроков: {r.players}/{r.players_max}</span>
              {r.config && (
                <span className="badge">
                  {r.config.maxPlayers} макс · {r.config.turnTimeoutSec} с · {r.config.discardVisibility === 'open' ? 'открытый сброс' : 'закрытый сброс'}
                </span>
              )}
              {r.started && <span className="badge warn">Игра идёт</span>}
            </div>
            <button
              className="button primary full"
              disabled={r.players >= r.players_max}
              onClick={()=>join(r.room_id)}
            >
              Присоединиться
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
