import { useEffect, useRef, useState } from 'react'
import './styles.css'
import Tabs from './components/Tabs'
import VariantSelector from './components/VariantSelector'
import Lobby from './components/Lobby'
import MyRooms from './components/MyRooms'
import Controls from './components/Controls'
import TableView from './components/Table'
import Hand from './components/Hand'
import { getState, startGame, verify } from './api'
import type { GameState, Card } from './types'

declare global { interface Window { Telegram: any } }

const MY_ROOMS_KEY = 'bura:myRooms'
function addMyRoom(id: string){
  try {
    const cur: string[] = JSON.parse(localStorage.getItem(MY_ROOMS_KEY) || '[]')
    if (!cur.includes(id)) {
      cur.unshift(id); localStorage.setItem(MY_ROOMS_KEY, JSON.stringify(cur.slice(0,20)))
    }
  } catch {}
}

export default function App(){
  const tg = window.Telegram?.WebApp
  const [user, setUser] = useState<{id:string; name:string; avatar?:string}>()
  const [headers, setHeaders] = useState<Record<string,string>>({})
  const [roomId, setRoomId] = useState<string>()
  const [state, setState] = useState<GameState>()
  const [tab, setTab] = useState<'new'|'join'|'mine'>('new')
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    tg?.expand?.()
    const run = async () => {
      try {
        const initData = tg?.initData || ''
        if (!initData) throw new Error('No initData')
        const u = await verify(initData)
        setUser({ id: u.user_id, name: u.name, avatar: u.avatar_url })
        setHeaders({ 'x-user-id': u.user_id, 'x-user-name': encodeURIComponent(u.name), 'x-user-avatar': u.avatar_url || '' })
      } catch (err) {
        console.error('Auth failed, fallback to guest:', err)
        const unsafe = tg?.initDataUnsafe?.user
        const id = unsafe?.id ? String(unsafe.id) : 'guest'
        const name = unsafe?.first_name || 'Guest'
        setUser({ id, name })
        setHeaders({ 'x-user-id': id, 'x-user-name': encodeURIComponent(name), 'x-user-avatar': '' })
      } finally {
        tg?.ready?.()
      }
    }
    run()
  }, [])

  useEffect(()=>{
    if(!roomId || !user) return
    getState(roomId, user.id).then(setState)
    const base = import.meta.env.VITE_WS_BASE || (location.origin.replace(/^http/,'ws'))
    const ws = new WebSocket(`${base}/ws/${roomId}?player_id=${encodeURIComponent(user.id)}`)
    ws.onmessage = async (ev)=>{
      const msg = JSON.parse(ev.data)
      if(msg.type==='state'){
        const s = await getState(roomId, user.id)
        setState(s)
      }
    }
    ws.onerror = (e)=>console.error('WS error', e)
    wsRef.current = ws
    return ()=>ws.close()
  }, [roomId, user?.id])

  async function onPlay(card: Card){
    if(!user || !roomId || !state) return
    const hasAttackOnTable = (state.table_cards?.length || 0) > 0
    const payload = { type: hasAttackOnTable ? 'cover' : 'play', player_id: user.id, card }
    wsRef.current?.send(JSON.stringify(payload))
  }

  const handleCreated = (id: string) => { addMyRoom(id); setRoomId(id); setTab('mine') }
  const handleJoined  = (id: string) => { addMyRoom(id); setRoomId(id); setTab('mine') }

  const topTabs = [
    { key: 'new',  title: 'Новая игра' },
    { key: 'join', title: 'Присоединиться' },
    { key: 'mine', title: 'Мои столы' },
  ]

  return (
    <div className="app">
      <h2>Бура</h2>
      {user && (<div className="row">
        <div className="badge">{user.name}</div>
        {state && <div className="badge">Комната: {state.room_id}</div>}
      </div>)}

      {!roomId && (<>
        <Tabs tabs={topTabs} active={tab} onChange={(k)=>setTab(k as any)} />
        <div style={{marginTop:12}}>
          {tab==='new'  && <VariantSelector headers={headers} onCreated={handleCreated} />}
          {tab==='join' && <Lobby           headers={headers} onJoined={handleJoined} />}
          {tab==='mine' && <MyRooms         onJoin={handleJoined} />}
        </div>
      </>)}

      {roomId && state && (
        <div className="grid" style={{marginTop:12}}>
          <TableView table={state.table_cards} trump={state.trump} trumpCard={state.trump_card} />
          <div className="row">
            <div className="badge">Игроков: {state.players.length}/{state.variant.players_max}</div>
            <div className="badge">Колода: {state.deck_count}</div>
            <div className="badge">Ход: {state.turn_player_id?.slice(0,4) || '—'}</div>
          </div>
          <Controls
            onStart={async()=>{ if(roomId) await startGame(roomId) }}
            onDraw ={async()=>{ wsRef.current?.send(JSON.stringify({type:'draw'})) }}
          />
          {state.hands && (<div>
            <h4>Твоя рука</h4>
            <Hand cards={state.hands} onPlay={onPlay} />
          </div>)}
        </div>
      )}
    </div>
  )
}
