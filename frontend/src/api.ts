export type Variant = {
  key: string
  title: string
  players_min: number
  players_max: number
  description?: string
}

const API_BASE = import.meta.env.VITE_API_BASE || ""

/** Список вариантов игры */
export async function listVariants(): Promise<Variant[]> {
  const res = await fetch(`${API_BASE}/api/variants`, { cache: 'no-store' })
  if (!res.ok) throw new Error('Failed to load variants')
  return await res.json()
}

/** Создание игры */
export async function createGame(
  variant_key: string,
  room_name: string,
  headers: Record<string, string>
): Promise<string> {
  const res = await fetch(`${API_BASE}/api/game/create`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ variant_key, room_name }),
  })
  const data = await res.json()
  if (!res.ok || data?.error) {
    throw new Error(data?.error || 'Failed to create game')
  }
  return data.room_id as string
}

/** Верификация через Telegram initData */
export async function verify(init_data: string): Promise<{
  ok: boolean
  user_id: string
  name: string
  avatar_url?: string
}> {
  const body = new URLSearchParams({ init_data }).toString()
  const res = await fetch(`${API_BASE}/api/auth/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body,
  })
  if (!res.ok) throw new Error('Verify failed')
  return await res.json()
}

/** Получение состояния игры */
export async function getState(room_id: string, x_user_id?: string): Promise<any> {
  const res = await fetch(`${API_BASE}/api/game/state/${room_id}`, {
    headers: x_user_id ? { 'x-user-id': x_user_id } : {},
    cache: 'no-store',
  })
  if (!res.ok) throw new Error('Failed to load game state')
  return await res.json()
}

/** Старт игры */
export async function startGame(room_id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/game/start/${room_id}`, { method: 'POST' })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || 'Failed to start game')
  }
}
