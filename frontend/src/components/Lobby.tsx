import { useState } from 'react'
import { joinGame } from '../api'
import RoomsList from './RoomsList'

export default function Lobby({ headers, onJoined }:{
  headers: Record<string,string>,
  onJoined: (room_id: string) => void
}){
  const [code, setCode] = useState('')
  return (
    <div className="grid">
      <h3>Присоединиться</h3>
      <div className="row">
        <input value={code} onChange={e=>setCode(e.target.value)} placeholder="Код комнаты" />
        <button className="button" onClick={async()=>{ await joinGame(code, headers); onJoined(code) }}>Войти</button>
      </div>

      <div style={{marginTop:16}}>
        <RoomsList headers={headers} onJoin={async (rid)=>{
          await joinGame(rid, headers)
          onJoined(rid)
        }} />
      </div>
    </div>
  )
}