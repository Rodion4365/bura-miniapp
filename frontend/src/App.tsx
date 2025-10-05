import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './styles.css'
import MainMenu from './components/MainMenu'
import CreateTableForm from './components/CreateTableForm'
import Lobby from './components/Lobby'
import Controls from './components/Controls'
import TableView from './components/Table'
import Hand from './components/Hand'
import ScoreBoard from './components/ScoreBoard'
import { getState, verify } from './api'
import type { GameState, Card } from './types'
import { applyThemeOnce, watchTelegramTheme } from './theme'
import { initViewportSizing } from './viewport'
import { createRoomChannel, type RoomChannel } from './room-channel'
import GameRules from './components/GameRules'

declare global { interface Window { Telegram: any } }

type Screen = 'menu' | 'create' | 'join' | 'room' | 'rules'

type CountdownSource = 'board' | 'phase' | 'event'

type CountdownInfo = {
  endsAt: number
  source: CountdownSource
}

function toMillis(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return value > 1e12 ? value : value * 1000
}

function resolveCountdownFromState(state?: GameState | null): CountdownInfo | null {
  if (!state) return null
  const revealUntil = state.board?.revealUntilTs
  if (typeof revealUntil === 'number' && Number.isFinite(revealUntil)) {
    return { endsAt: revealUntil * 1000, source: 'board' }
  }
  const phase = (state as any)?.phase
  if (phase === 'COUNTDOWN') {
    const rawEnds: unknown[] = [
      (state as any)?.phaseEndsAt,
      (state as any)?.phaseEndsAtTs,
      (state as any)?.phaseEndsAtMs,
      (state as any)?.countdownEndsAt,
      (state as any)?.countdownEndsAtTs,
      (state as any)?.countdownEndsAtMs,
    ]
    for (const value of rawEnds) {
      const ms = toMillis(value)
      if (ms) {
        return { endsAt: ms, source: 'phase' }
      }
    }
    const remainingCandidates: unknown[] = [
      (state as any)?.phaseRemainingSec,
      (state as any)?.countdownRemainingSec,
      (state as any)?.nextTurnInSec,
    ]
    const remaining = remainingCandidates.find(value => typeof value === 'number' && Number.isFinite(value)) as number | undefined
    if (typeof remaining === 'number') {
      const nowCandidates: unknown[] = [
        (state as any)?.serverNow,
        (state as any)?.serverNowMs,
        (state as any)?.now,
      ]
      let baseNow = Date.now()
      for (const candidate of nowCandidates) {
        const ms = toMillis(candidate)
        if (ms) {
          baseNow = ms
          break
        }
      }
      return { endsAt: baseNow + remaining * 1000, source: 'phase' }
    }
  }
  return null
}

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
  const [countdownInfo, setCountdownInfo] = useState<CountdownInfo | null>(null)
  const [countdownNow, setCountdownNow] = useState(() => Date.now())
  const channelRef = useRef<RoomChannel | null>(null)
  const countdownSyncRef = useRef(false)
  const cardAssets = useMemo(() => {
    const map = new Map<string, Card>()
    state?.cards?.forEach(card => map.set(card.id, card))
    return map
  }, [state?.cards])

  const handleRoomEvent = useCallback((evt: any) => {
    if (!evt) return
    const eventType = typeof evt.event === 'string' ? evt.event : typeof evt.type === 'string' ? evt.type : undefined
    if (!eventType || eventType === 'state') return

    if (eventType === 'TRICK_RESOLVED') {
      const payload = (evt.payload ?? evt.data ?? {}) as Record<string, unknown>
      const serverCandidates: unknown[] = [
        payload.serverNow,
        payload.server_now,
        payload.serverNowMs,
        payload.server_now_ms,
        evt.serverNow,
        evt.server_now,
        evt.serverNowMs,
        evt.server_now_ms,
      ]
      let baseNow = Date.now()
      for (const candidate of serverCandidates) {
        const ms = toMillis(candidate)
        if (ms) {
          baseNow = ms
          break
        }
      }
      const nextCandidates: unknown[] = [
        payload.nextTurnInSec,
        payload.next_turn_in_sec,
        payload.next_turn_in,
        payload.nextTurnIn,
        evt.nextTurnInSec,
        evt.next_turn_in_sec,
        evt.next_turn_in,
        evt.nextTurnIn,
      ]
      const nextValue = nextCandidates.find(value => typeof value === 'number' && Number.isFinite(value)) as number | undefined
      if (typeof nextValue === 'number') {
        countdownSyncRef.current = false
        setCountdownInfo({ endsAt: baseNow + nextValue * 1000, source: 'event' })
      }
    }

    if (eventType === 'CLEAR_TABLE') {
      countdownSyncRef.current = false
      setCountdownInfo(null)
    }

    if (eventType === 'TURN_SWITCHED') {
      countdownSyncRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!state) {
      setCountdownInfo(null)
      return
    }
    const derived = resolveCountdownFromState(state)
    if (derived) {
      setCountdownInfo(prev => {
        if (prev && Math.abs(prev.endsAt - derived.endsAt) < 400 && prev.source === derived.source) {
          return prev
        }
        return derived
      })
      return
    }
    const boardEmpty = !state.board || (state.board.attacker.length === 0 && state.board.defender.length === 0)
    const phase = (state as any)?.phase
    if (boardEmpty && phase !== 'COUNTDOWN') {
      setCountdownInfo(null)
    }
  }, [state])

  useEffect(() => {
    if (!countdownInfo) {
      return
    }
    setCountdownNow(Date.now())
    const id = window.setInterval(() => setCountdownNow(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [countdownInfo?.endsAt])

  useEffect(() => {
    countdownSyncRef.current = false
  }, [countdownInfo?.endsAt])

  // Тема
  useEffect(() => {
    applyThemeOnce()
    watchTelegramTheme()
    const disposeViewport = initViewportSizing()
    return () => {
      disposeViewport?.()
    }
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
      onEvent: handleRoomEvent,
      pollIntervalMs: 3000,
    })
    channelRef.current = channel
    return () => {
      channel.close()
      if (channelRef.current === channel) channelRef.current = null
    }
  }, [roomId, user?.id, handleRoomEvent])

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
      faceUp: state.config?.discardVisibility !== 'faceDown',
    }
    sendAction(payload)
    setPlayStamp(Date.now())
    setDragPreview(null)
  }

  function onDeclare(combo: string){
    if(!user || !roomId || !state) return
    sendAction({ type: 'declare', player_id: user.id, combo })
  }

  useEffect(() => {
    const deadline = state?.turn_deadline_ts
    if (!deadline) {
      setNow(Date.now())
      return
    }

    const initial = Date.now()
    setNow(initial)
    if (initial / 1000 >= deadline) {
      return
    }

    const intervalId = window.setInterval(() => {
      const current = Date.now()
      setNow(current)
      if (current / 1000 >= deadline) {
        window.clearInterval(intervalId)
      }
    }, 500)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [state?.turn_deadline_ts])

  const fallbackTimer = useMemo(() => {
    const deadline = state?.turn_deadline_ts
    if (!deadline) return undefined
    const secondsLeft = deadline - now / 1000
    if (secondsLeft <= 0) return 0
    return Math.ceil(secondsLeft)
  }, [state?.turn_deadline_ts, now])

  const countdownSecondsFloat = countdownInfo ? (countdownInfo.endsAt - countdownNow) / 1000 : null
  const countdownActive = typeof countdownSecondsFloat === 'number' && countdownSecondsFloat > 0
  const countdownSeconds = countdownActive ? Math.max(1, Math.ceil(countdownSecondsFloat)) : undefined

  useEffect(() => {
    if (!countdownInfo) return
    if (!roomId || !user) return
    if (typeof countdownSecondsFloat === 'number' && countdownSecondsFloat <= 0 && !countdownSyncRef.current) {
      countdownSyncRef.current = true
      getState(roomId, user.id).then(setState).catch(() => {})
    }
  }, [countdownInfo, countdownSecondsFloat, roomId, user?.id])

  useEffect(() => {
    if (countdownActive) {
      setDragPreview(null)
    }
  }, [countdownActive])

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
          <section className="game-settings">
            <div className="settings-head">
              <div className="settings-title">{state.room_name}</div>
              <div className="settings-sub">Комната #{state.room_id}</div>
            </div>
            <div className="settings-pills">
              <span className="meta-chip">Игроков {state.players.length}/{state.config?.maxPlayers ?? state.variant?.players_max ?? state.players.length}</span>
              {state.config && (
                <span className="meta-chip">Сброс: {state.config.discardVisibility === 'open' ? 'открытый' : 'закрытый'}</span>
              )}
            </div>
          <Controls state={state} onDeclare={onDeclare} isBusy={countdownActive} />
          </section>

          <TableView
            state={state}
            meId={user?.id}
            dragPreview={dragPreview}
            onDropPlay={(cards)=> onPlay(cards, { viaDrop: true })}
            cardAssets={cardAssets}
            fallbackTimer={fallbackTimer}
            countdownSeconds={countdownSeconds}
            isCountdownActive={countdownActive}
          />

          {state.hands && (
            <section className="hand-wrap">
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
                isLocked={countdownActive}
                lockReason="Ожидайте очистки стола"
              />
            </section>
          )}

          <ScoreBoard totals={state.player_totals} />

          <button className="link-btn" onClick={()=> { setRoomId(undefined); setScreen('menu'); }}>
            ← Выйти в меню
          </button>
        </div>
      )}
    </div>
  )
}
