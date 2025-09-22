import { useCallback, useEffect, useRef, useState } from 'react'
import './styles.css'
import MainMenu from './components/MainMenu'
import CreateTableForm from './components/CreateTableForm'
import Lobby from './components/Lobby'
import Controls from './components/Controls'
import TableView from './components/Table'
import Hand from './components/Hand'
import { getState, verify } from './api'
import type { GameState, Card } from './types'
import { applyThemeOnce, watchTelegramTheme } from './theme'
import { createRoomChannel, type RoomChannel } from './room-channel'
import GameRules from './components/GameRules'

declare global { interface Window { Telegram: any } }

type Screen = 'menu' | 'create' | 'join' | 'room' | 'rules'

export default function App(){
  const tg = window.Telegram?.WebApp
  const [user, setUser] = useState<{id:string; name:string; avatar?:string}>()
  const [headers, setHeaders] = useState<Record<string,string>>({})
  const [roomId, setRoomId] = useState<string>()
  const [state, setState] = useState<GameState>()
  const [now, setNow] = useState(() => Date.now())
  const [screen, setScreen] = useState<Screen>('menu')
  const [dragPreview, setDragPreview] = useState<{cards: Card[]; valid: boolean} | null>(null)
  const [playStamp, setPlayStamp] = useState(0)
  const channelRef = useRef<RoomChannel | null>(null)

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

  // Подключение к комнате (WS + fallback-поллинг)
  useEffect(()=>{
    // закрываем предыдущий канал, если меняется комната/пользователь
    if (channelRef.current) {
      channelRef.current.close()
      channelRef.current = null
    }
    if(!roomId || !user){
      setState(undefined)
      return
    }

    const base = import.meta.env.VITE_WS_BASE || (location.origin.replace(/^http/,'ws'))
    const channel = createRoomChannel({
      wsBase: base,
      roomId,
      playerId: user.id,
      onState: (next)=>{
        setState(next)
        setScreen('room')
      },
      pollIntervalMs: 3000,
    })
    channelRef.current = channel
    return () => {
      channel.close()
      if (channelRef.current === channel) channelRef.current = null
    }
  }, [roomId, user?.id])

  const sendAction = useCallback((message: unknown)=>{
    if (!channelRef.current) return false
    const ok = channelRef.current.send(message)
    if (!ok && roomId && user){
      getState(roomId, user.id).then(setState).catch(()=>{})
    }
    return ok
  }, [roomId, user?.id])

  function onPlay(cards: Card[], meta?: { viaDrop?: boolean }){
    if(!user || !roomId || !state) return
    if(cards.length === 0) return
    const payload = {
      type: 'play_cards',
      player_id: user.id,
      cards,
      roundId: state.round_id,
      trickIndex: state.trick?.trick_index,
    }
    sendAction(payload)
    setPlayStamp(Date.now())
    setDragPreview(null)
  }

  function onDeclare(combo: string){
    if(!user || !roomId || !state) return
    sendAction({ type: 'declare', player_id: user.id, combo })
  }

  useEffect(()=>{
    if(!state?.turn_deadline_ts) return
    setNow(Date.now())
    const id = setInterval(()=> setNow(Date.now()), 1000)
    return ()=> clearInterval(id)
  }, [state?.turn_deadline_ts])

  const turnSecondsLeft = state?.turn_deadline_ts
    ? Math.max(0, Math.ceil(state.turn_deadline_ts - now / 1000))
    : undefined

  // рендер
  return (
    <div className="app">
      {screen === 'menu' && (
        <MainMenu
          onNewGame={()=> setScreen('create')}
          onJoin={()=> setScreen('join')}
          onShowRules={()=> setScreen('rules')}
        />
      )}

      {screen === 'create' && (
        <div className="page-wrap">
          <h2 className="page-title">Новая игра</h2>
          <CreateTableForm headers={headers} onCreated={(id)=> setRoomId(id)} />
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

      {screen === 'rules' && (
        <div className="page-wrap">
          <h2 className="page-title">Правила</h2>
          <GameRules />
          <button className="link-btn" onClick={()=> setScreen('menu')}>← Назад</button>
        </div>
      )}

      {screen === 'room' && state && (
        <div className="game-page">
          <header className="game-hud">
            <div className="hud-primary">
              <div className="hud-title">{state.room_name}</div>
              <div className="hud-sub">Комната #{state.room_id}</div>
            </div>
            <div className="hud-stats">
              <span className="pill">Игроков {state.players.length}/{state.config?.maxPlayers ?? state.variant?.players_max ?? state.players.length}</span>
              <span className="pill">Колода {state.deck_count}</span>
              <span className="pill">Ход: {state.turn_player_id?.slice(0, 4) || '—'}</span>
              {state.config && (
                <span className="pill">
                  Таймер {state.config.turnTimeoutSec} с · {state.config.discardVisibility === 'open' ? 'открытый' : 'закрытый'} сброс
                </span>
              )}
            </div>
          </header>

          <TableView
            state={state}
            meId={user?.id}
            turnSecondsLeft={turnSecondsLeft}
            dragPreview={dragPreview}
            onDropPlay={(cards)=> onPlay(cards, { viaDrop: true })}
          />

          <Controls state={state} onDeclare={onDeclare} />

          {state.hands && (
            <div className="hand-wrap">
              <h4 className="hand-title">Твои карты</h4>
              <Hand
                cards={state.hands}
                trick={state.trick}
                trump={state.trump}
                isMyTurn={state.turn_player_id === user?.id}
                playStamp={playStamp}
                meId={user?.id}
                onPlay={onPlay}
                onDragPreview={setDragPreview}
              />
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
