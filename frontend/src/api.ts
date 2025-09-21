import axios from 'axios'
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

export async function verify(initData: string) {
  const { data } = await axios.post(`${API_BASE}/api/auth/verify?init_data=${encodeURIComponent(initData)}`)
  return data as { ok: boolean; user_id: string; name: string; avatar_url?: string }
}
export async function listVariants() {
  const { data } = await axios.get(`${API_BASE}/api/variants`)
  return data
}
export async function createGame(variant_key: string, room_name: string, userHeaders: Record<string,string>) {
  const { data } = await axios.post(`${API_BASE}/api/game/create`, { variant_key, room_name }, { headers: userHeaders })
  return data as { room_id: string }
}
export async function joinGame(room_id: string, userHeaders: Record<string,string>) {
  await axios.post(`${API_BASE}/api/game/join`, { room_id }, { headers: userHeaders })
}
export async function startGame(room_id: string) {
  await axios.post(`${API_BASE}/api/game/start/${room_id}`)
}
export async function getState(room_id: string, user_id?: string) {
  const { data } = await axios.get(`${API_BASE}/api/game/state/${room_id}`, { headers: user_id ? { 'x-user-id': user_id } : {} })
  return data
}
