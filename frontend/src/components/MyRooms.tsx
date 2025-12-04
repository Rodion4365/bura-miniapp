import { useEffect, useMemo, useState } from 'react'
type RoomRow = { room_id:string; name:string; players:number; players_max:number; started:boolean; variant:{title:string} }
function loadMyRooms(): string[] { try { return JSON.parse(localStorage.getItem('bura:myRooms')||'[]') } catch { return [] } }
export default function MyRooms({ onJoin }:{ onJoin:(roomId:string)=>void }){
  const [rooms, setRooms] = useState<RoomRow[]>([])
  const my = useMemo(loadMyRooms, [])
  useEffect(()=>{
    const base = import.meta.env.VITE_WS_BASE || (location.origin.replace(/^http/,'ws'))
    const ws = new WebSocket(`${base}/ws/lobby`)
    ws.onmessage = (ev)=>{
      try {
        const m = JSON.parse(ev.data)
        if(m.type==='rooms') setRooms(m.payload)
      } catch (err) {
        console.error('[MyRooms] Failed to parse WebSocket message:', err)
      }
    }
    return ()=>ws.close()
  },[])
  const mine = rooms.filter(r=>my.includes(r.room_id))
  if (my.length===0) return <div className="badge">Пока нет ваших комнат.</div>
  return (
    <div style={{display:'grid',gap:8}}>
      {mine.length===0 && <div className="badge">Ваши комнаты не найдены — возможно, все вышли и они были удалены.</div>}
      {mine.map(r=>(
        <div key={r.room_id} style={{border:'1px solid #ddd',borderRadius:12,padding:12,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div>
            <div style={{fontWeight:600}}>{r.name}</div>
            <div style={{fontSize:12,opacity:.7}}>{r.variant?.title||''}</div>
            <div className="badge" style={{marginTop:6}}>Игроков: {r.players}/{r.players_max}{r.started?' • идёт игра':''}</div>
          </div>
          <button className="button" onClick={()=>onJoin(r.room_id)}>Открыть</button>
        </div>
      ))}
    </div>
  )
}
