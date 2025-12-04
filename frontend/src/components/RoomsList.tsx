import { useEffect, useState } from 'react'

type RoomRow = {
  room_id: string
  name: string
  players: number
  players_max: number
  started: boolean
  variant: { title: string }
}

export default function RoomsList({ onJoin, headers }:{
  onJoin: (roomId: string)=>void
  headers: Record<string,string>
}){
  const [rooms, setRooms] = useState<RoomRow[]>([])
  useEffect(()=>{
    const urlBase = import.meta.env.VITE_WS_BASE || 'ws://localhost:8000'
    const ws = new WebSocket(`${urlBase}/ws/lobby`)
    ws.onmessage = (ev)=>{
      try {
        const msg = JSON.parse(ev.data)
        if(msg.type==='rooms') setRooms(msg.payload)
      } catch (err) {
        console.error('[RoomsList] Failed to parse WebSocket message:', err)
      }
    }
    return ()=>ws.close()
  },[])
  return (
    <div style={{display:'grid', gap:8}}>
      <h3>Открытые комнаты</h3>
      {rooms.length === 0 && <div className="badge">Пока нет комнат</div>}
      {rooms.map(r=>(
        <div key={r.room_id} style={{border:'1px solid #ddd',borderRadius:12,padding:12,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div>
            <div style={{fontWeight:600}}>{r.name}</div>
            <div style={{fontSize:12,opacity:.7}}>{r.variant?.title || ''}</div>
            <div className="badge" style={{marginTop:6}}>Игроков: {r.players}/{r.players_max}{r.started?' • идёт игра':''}</div>
          </div>
          <button disabled={r.players>=r.players_max} className="button" onClick={()=>onJoin(r.room_id)}>Войти</button>
        </div>
      ))}
    </div>
  )
}