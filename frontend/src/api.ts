export const API_BASE =
  (import.meta.env.VITE_API_BASE as string) ||
  (location.hostname.endsWith("buragame.ru")
    ? "https://api.buragame.ru"
    : "https://bura-miniapp.onrender.com");

export const WS_BASE =
  (import.meta.env.VITE_WS_BASE as string) ||
  (location.hostname.endsWith("buragame.ru")
    ? "wss://api.buragame.ru"
    : "wss://bura-miniapp.onrender.com");

export type RoomSummary = {
  id: string;
  name: string;
  variant_title: string;
  players: number;
  players_max: number;
};

export async function fetchVariants() {
  const r = await fetch(`${API_BASE}/api/variants`);
  return r.json();
}

export async function fetchRooms(): Promise<RoomSummary[]> {
  const r = await fetch(`${API_BASE}/api/rooms`);
  return r.json();
}

export async function createRoom(variant_key: string, room_name: string, headers: Record<string,string>) {
  const r = await fetch(`${API_BASE}/api/game/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ variant_key, room_name }),
  });
  return r.json();
}

export async function joinRoom(room_id: string, headers: Record<string,string>) {
  const r = await fetch(`${API_BASE}/api/game/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ room_id }),
  });
  return r.json();
}

export async function startGame(room_id: string) {
  const r = await fetch(`${API_BASE}/api/game/start/${room_id}`, { method: "POST" });
  return r.json();
}
