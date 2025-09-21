import { useEffect, useMemo, useState } from 'react'

type Variant = { key:string; title:string; players_min:number; players_max:number }
type RoomRow = {
  room_id:string; name:string; players:number; players_max:number; started:boolean;
  variant: Variant
}

export default function Lobby({
  headers,
  onJoined,
}:{
  headers: Record<string,string>
  onJoined: (roomId:string)=>void
}) {
  const [rooms, setRooms] = useState<RoomRow[]>([])
  const [manual, setManual] = useState('')

  // live-обновления из /ws/lobby
  useEffect(()=>{
    const base = import.meta.env.VITE_WS_BASE || (location.origin.replace(/^http/,'ws'))
    const ws = new WebSocket(`${base}/ws/lobby`)
    ws.onmessage = (ev)=>{
      const m = JSON.parse(ev.data)
      if(m.type==='rooms') setRooms(m.payload)
    }
    return ()=>ws.close()
  },[])

  async function join(room_id: string) {
    const res = await fetch(`${import.meta.env.VITE_API_BASE || ''}/api/game/join`, {
      method: 'POST',
      headers: { 'content-type':'application/json', ...headers },
      body: JSON.stringify({ room_id })
    })
    const data = await res.json()
    if (data?.ok) onJoined(room_id)
    else alert(data?.error || 'Не удалось присоединиться')
  }

  const canShow = rooms.filter(r => r.players < r.players_max) // не полные комнаты

  return (
    <div style={{display:'grid', gap:12}}>
      <div style={{display:'flex', gap:8}}>
        <input
          placeholder="Ввести ID комнаты…"
          value={manual}
          onChange={(e)=>setManual(e.target.value)}
          className="input"
        />
        <button className="button" onClick={()=>manual && join(manual.trim())}>Присоединиться по ID</button>
      </div>

      {canShow.length === 0 && (
        <div className="badge">Пока нет доступных комнат — создайте новую или введите ID.</div>
      )}

      {canShow.map(r => (
        <div key={r.room_id} className="room-row">
          <div className="room-title">
            <div className="room-name">{r.name}</div>
            <div className="room-sub">{r.variant?.title}</div>
          </div>
          <div className="room-meta">
            <span className="badge">Игроков: {r.players}/{r.players_max}</span>
            {r.started && <span className="badge warn">Игра идёт</span>}
          </div>
          <div className="room-actions">
            <button
              className="button"
              disabled={r.players >= r.players_max}
              onClick={()=>join(r.room_id)}
            >
              Присоединиться
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
