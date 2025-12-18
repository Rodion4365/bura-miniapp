/**
 * Надёжный канал комнаты:
 * - WebSocket с авто-переподключением, ping/keepalive
 * - гарантированный поллинг на случай сна/блокировки WS (iOS WebView)
 */
import { getState } from './api'

type GameState = Record<string, unknown>
type Listener = (state: GameState) => void
type EventListener = (event: Record<string, unknown>) => void
type ConnectionStatus = 'connected' | 'connecting' | 'disconnected'
type StatusListener = (status: ConnectionStatus) => void

export type RoomChannel = {
  /** Завершить работу канала и закрыть WebSocket */
  close(): void
  /**
   * Отправить сообщение на сервер. Возвращает true, если удалось отправить
   * (WebSocket в состоянии OPEN). В противном случае – false, чтобы вызывающий
   * код мог сделать фолбэк.
   */
  send(message: unknown): boolean
}

export function createRoomChannel(opts: {
  wsBase: string,
  roomId: string,
  playerId: string,
  onState: Listener,
  onEvent?: EventListener,
  onStatusChange?: StatusListener,
  pollIntervalMs?: number
}): RoomChannel {
  const { wsBase, roomId, playerId, onState, onEvent, onStatusChange } = opts
  const pollInterval = opts.pollIntervalMs ?? 3000

  let ws: WebSocket | null = null
  let closed = false
  let reconnectAttempts = 0
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let pingTimer: ReturnType<typeof setInterval> | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null

  const url = `${wsBase.replace(/\/$/,'')}/ws/${roomId}?player_id=${encodeURIComponent(playerId)}`

  function startPolling() {
    stopPolling()
    pollTimer = setInterval(async () => {
      try {
        const st = await getState(roomId, playerId)
        onState(st)
      } catch (err) {
        console.error('[RoomChannel] Polling failed:', err)
      }
    }, pollInterval)
  }
  function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null } }
  function stopReconnect() { if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null } }

  function startPing() {
    stopPing()
    pingTimer = setInterval(() => {
      try {
        ws?.send?.(JSON.stringify({ type: 'ping' }))
      } catch (err) {
        console.error('[RoomChannel] Ping failed:', err)
      }
    }, 20000)
  }
  function stopPing() { if (pingTimer) { clearInterval(pingTimer); pingTimer = null } }

  function connect() {
    if (closed) return
    onStatusChange?.('connecting')
    try {
      ws = new WebSocket(url)
    } catch (err) {
      console.error('[RoomChannel] WebSocket connection failed:', err)
      onStatusChange?.('disconnected')
      startPolling()
      scheduleReconnect()
      return
    }
    ws.onopen = () => {
      reconnectAttempts = 0
      stopPolling()
      startPing()
      onStatusChange?.('connected')
    }
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data)
        if (msg?.type === 'state' && msg?.payload) {
          onState(msg.payload)
        } else if (typeof msg?.type === 'string') {
          onEvent?.(msg)
        }
      } catch (err) {
        console.error('[RoomChannel] Failed to parse WebSocket message:', err)
      }
    }
    ws.onclose = () => {
      stopPing()
      startPolling()
      onStatusChange?.('connecting')
      scheduleReconnect()
    }
    ws.onerror = () => {
      startPolling()
      onStatusChange?.('disconnected')
      scheduleReconnect()
    }
  }
  function scheduleReconnect() {
    if (closed) return
    stopReconnect()  // Очищаем предыдущий таймер
    reconnectAttempts++
    // Ограничиваем reconnectAttempts, чтобы избежать overflow в 2 ** reconnectAttempts
    const safeAttempts = Math.min(reconnectAttempts, 13)
    const delay = Math.min(8000, 500 * 2 ** safeAttempts)
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      if (!closed) connect()
    }, delay)
  }

  connect()
  getState(roomId, playerId).then(onState).catch((err) => {
    console.error('[RoomChannel] Initial state fetch failed:', err)
  })

  function trySend(message: unknown): boolean {
    if (!ws || ws.readyState !== WebSocket.OPEN) return false
    try {
      if (typeof message === 'string') ws.send(message)
      else ws.send(JSON.stringify(message))
      return true
    } catch (err) {
      console.error('[RoomChannel] Failed to send message:', err)
      return false
    }
  }

  return {
    close() {
      closed = true
      stopPolling()
      stopPing()
      stopReconnect()
      try {
        ws?.close?.()
      } catch (err) {
        console.error('[RoomChannel] Failed to close WebSocket:', err)
      }
      ws = null
    },
    send(message: unknown) {
      const ok = trySend(message)
      if (!ok) startPolling()
      return ok
    },
  }
}
