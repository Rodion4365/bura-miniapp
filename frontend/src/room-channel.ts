/**
 * Надёжный канал комнаты:
 * - WebSocket с авто-переподключением, ping/keepalive
 * - гарантированный поллинг на случай сна/блокировки WS (iOS WebView)
 */
import { getState } from './api'

type Listener = (state: any) => void

export function createRoomChannel(opts: {
  wsBase: string,
  roomId: string,
  playerId: string,
  onState: Listener,
  pollIntervalMs?: number
}) {
  const { wsBase, roomId, playerId, onState } = opts
  const pollInterval = opts.pollIntervalMs ?? 3000

  let ws: WebSocket | null = null
  let closed = false
  let reconnectAttempts = 0
  let pollTimer: any = null
  let pingTimer: any = null

  const url = `${wsBase.replace(/\/$/,'')}/ws/${roomId}?player_id=${encodeURIComponent(playerId)}`

  function startPolling() {
    stopPolling()
    pollTimer = setInterval(async () => {
      try {
        const st = await getState(roomId, playerId)
        onState(st)
      } catch (_) {}
    }, pollInterval)
  }
  function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null } }

  function startPing() {
    stopPing()
    pingTimer = setInterval(() => {
      try { ws?.send?.(JSON.stringify({ type: 'ping' })) } catch (_) {}
    }, 20000)
  }
  function stopPing() { if (pingTimer) { clearInterval(pingTimer); pingTimer = null } }

  function connect() {
    if (closed) return
    try { ws = new WebSocket(url) } catch (_) {
      startPolling(); scheduleReconnect(); return
    }
    ws.onopen = () => { reconnectAttempts = 0; stopPolling(); startPing() }
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data)
        if (msg?.type === 'state' && msg?.payload) onState(msg.payload)
      } catch (_) {}
    }
    ws.onclose = () => { stopPing(); startPolling(); scheduleReconnect() }
    ws.onerror = () => { startPolling(); scheduleReconnect() }
  }
  function scheduleReconnect() {
    if (closed) return
    reconnectAttempts++
    const delay = Math.min(8000, 500 * 2 ** reconnectAttempts)
    setTimeout(() => { if (!closed) connect() }, delay)
  }

  connect()
  getState(roomId, playerId).then(onState).catch(()=>{})

  return {
    close() {
      closed = true
      stopPolling()
      stopPing()
      try { ws?.close?.() } catch (_) {}
      ws = null
    }
  }
}
