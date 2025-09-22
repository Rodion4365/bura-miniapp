import { useEffect, useRef, useState } from 'react'
import './styles.css'
import MainMenu from './components/MainMenu'
import VariantSelector from './components/VariantSelector'
import Lobby from './components/Lobby'
import Controls from './components/Controls'
import TableView from './components/Table'
import Hand from './components/Hand'
import { getState, verify } from './api'
import type { GameState, Card } from './types'
import { applyThemeOnce, watchTelegramTheme } from './theme'

declare global { interface Window { Telegram: any } }

type Screen = 'menu' | 'create' | 'join' | 'room'

export default function App(){
  const tg = window.Telegram?.WebApp
  const [user, setUser] = useState<{id:string; name:string; avatar?:string}>()
  const [headers, setHeaders] = useState<Record<string,string>>({})
  const [roomId, setRoomId] = useState<string>()
  const [state, setState] = useState<GameState>()
  const [screen, setScreen] = useState<Screen>('menu')
  const wsRef = useRef<WebSocket | null>(null)

  // Тема
  useEffect(() => {
    applyThemeOnce()
    watchTelegramTheme()
  }, [])

  // Telegram auth (с безопасным фолбэком)
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

  // Подключение к комнате по WS + загрузка состояния
  useEffect(()=>{
    if(!roomId || !user) return

    getState(roomId, user.id).then(s => {
      setState(s)
      setScreen('room')
    }).catch(err => {
      console.error('Failed to load game state', err)
    })

    const base = import.meta.env.VITE_WS_BASE || (location.origin.replace(/^http/,'ws'))
    const ws = new WebSocket(`${base}/ws/${roomId}?player_id=${encodeURIComponent(user.id)}`)

    ws.onmessage = async (ev)=>{
      try {
        const msg = JSON.parse(ev.data)
        if(msg?.type === 'state' && msg?.payload){
          const payload = msg.payload as GameState
          setScreen('room')
          setState(prev => {
            if(!prev) return payload as GameState
            const merged: GameState = {
              ...prev,
              ...payload,
              me: payload.me ?? prev.me,
              hands: payload.hands ?? prev.hands,
            }
            return merged
          })
          try {
            const s = await getState(roomId, user.id)
            setState(s)
          } catch (err) {
            console.error('Failed to refresh state after WS update', err)
          }
        }
      } catch (err) {
        console.error('WS message parse error', err)
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

  // рендер
  return (
    <div className="app">
      {screen === 'menu' && (
        <MainMenu
          onNewGame={()=> setScreen('create')}
          onJoin={()=> setScreen('join')}
        />
      )}

      {screen === 'create' && (
        <div className="page-wrap">
          <h2 className="page-title">Новая игра</h2>
          <VariantSelector headers={headers} onCreated={(id)=> setRoomId(id)} />
          <button className="link-btn" onClick={()=> setScreen('menu')}>← Назад</button>
        </div>
      )}

      {screen === 'join' && (
        <div className="page-wrap">
          <h2 className="page-title">Присоединиться</h2>
          <Lobby headers={headers} onJoined={(id)=> setRoomId(id)} />
          <button className="link-btn" onClick={()=> setScreen('menu')}>← Назад</button>
        </div>
      )}

      {screen === 'room' && state && (
        <div className="page-wrap">
          <div className="room-top">
            <div className="badge strong">{user?.name}</div>
            <div className="badge">Комната: {state.room_id}</div>
            <div className="badge">Игроков: {state.players.length}/{state.variant.players_max}</div>
            <div className="badge">Колода: {state.deck_count}</div>
            <div className="badge">Ход: {state.turn_player_id?.slice(0,4) || '—'}</div>
          </div>

          <TableView table={state.table_cards} trump={state.trump} trumpCard={state.trump_card} opponents={1} />

          <div className="controls">
            {/* Кнопка Старт внутри Controls (использует state) */}
          </div>

          {state.hands && (
            <div>
              <h4>Твоя рука</h4>
              <Hand cards={state.hands} onPlay={onPlay} />
            </div>
          )}

          <button className="link-btn" onClick={()=> { setRoomId(undefined); setScreen('menu'); }}>
            ← Выйти в меню
          </button>
        </div>
      )}
    </div>
  )
}
