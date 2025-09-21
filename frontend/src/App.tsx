import { useEffect, useRef, useState } from 'react'
import './styles.css'
import VariantSelector from './components/VariantSelector'
import Lobby from './components/Lobby'
import Controls from './components/Controls'
import TableView from './components/Table'
import Hand from './components/Hand'
import { getState, startGame, verify } from './api'
import type { GameState, Card } from './types'

declare global { interface Window { Telegram: any } }

export default function App(){
  const tg = window.Telegram?.WebApp
  const [user, setUser] = useState<{id:string; name:string; avatar?:string}>()
  const [headers, setHeaders] = useState<Record<string,string>>({})
  const [roomId, setRoomId] = useState<string>()
  const [state, setState] = useState<GameState>()
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(()=>{
    tg?.expand?.()
    const initData = tg?.initData || ''
    verify(initData).then(u=>{
      setUser({ id: u.user_id, name: u.name, avatar: u.avatar_url })
      setHeaders({ 'x-user-id': u.user_id, 'x-user-name': encodeURIComponent(u.name), 'x-user-avatar': u.avatar_url || '' })
    })
  },[])

  useEffect(()=>{
    if(!roomId || !user) return
    getState(roomId, user.id).then(setState)
    const ws = new WebSocket((import.meta.env.VITE_WS_BASE || 'ws://localhost:8000')+`/ws/${roomId}`)
    ws.onmessage = async (ev)=>{
      const msg = JSON.parse(ev.data)
      if(msg.type==='state'){
        const s = await getState(roomId, user.id)
        setState(s)
      }
    }
    wsRef.current = ws
    return ()=>{ ws.close() }
  }, [roomId, user?.id])

  async function onPlay(card: Card){
    if(!user || !roomId || !state) return
    const hasAttackOnTable = (state.table_cards?.length || 0) > 0
    const payload = { type: hasAttackOnTable ? 'cover' : 'play', player_id: user.id, card }
    wsRef.current?.send(JSON.stringify(payload))
  }

  return (
    <div className="app">
      <h2>Бура</h2>
      {user && <div className="row"><div className="badge">{user.name}</div>{state && <div className="badge">Комната: {state.room_id}</div>}</div>}
      {!roomId && headers['x-user-id'] && (
        <div className="grid" style={{marginTop:12}}>
          <VariantSelector headers={headers} onCreated={setRoomId} />
          <Lobby headers={headers} onJoined={setRoomId} />
        </div>
      )}
      {roomId && state && (
        <div className="grid" style={{marginTop:12}}>
          <TableView table={state.table_cards} trump={state.trump} trumpCard={state.trump_card} />
          <div className="row">
            <div className="badge">Игроков: {state.players.length}/{state.variant.players_max}</div>
            <div className="badge">Колода: {state.deck_count}</div>
            <div className="badge">Ход: {state.turn_player_id?.slice(0,4)}</div>
          </div>
          <Controls onStart={async()=>{ await startGame(roomId); }} onDraw={async()=>{ wsRef.current?.send(JSON.stringify({type:'draw'})) }} />
          {state.hands && <div>
            <h4>Твоя рука</h4>
            <Hand cards={state.hands} onPlay={onPlay} />
          </div>}
        </div>
      )}
    </div>
  )
}
