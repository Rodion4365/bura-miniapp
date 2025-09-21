import { useEffect, useState } from 'react'
import { listVariants, createGame } from '../api'

export default function VariantSelector({ headers, onCreated }: { headers: Record<string,string>, onCreated: (room_id: string) => void }) {
  const [variants, setVariants] = useState<any[]>([])
  const [roomName, setRoomName] = useState('Комната')
  useEffect(() => { listVariants().then(setVariants) }, [])
  return (
    <div className="grid">
      <h3>Новая игра</h3>
      <input value={roomName} onChange={e=>setRoomName(e.target.value)} placeholder="Название" />
      {variants.map(v => (
        <div key={v.key} style={{border:'1px solid #ddd',borderRadius:12,padding:12}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div>
              <div style={{fontWeight:600}}>{v.title}</div>
              <div style={{fontSize:12,opacity:.7}}>{v.description}</div>
            </div>
            <button className="button" onClick={async()=>{
              const { room_id } = await createGame(v.key, roomName, headers)
              onCreated(room_id)
            }}>Создать</button>
          </div>
        </div>
      ))}
    </div>
  )
}
