import React, { useEffect, useMemo, useRef, useState } from "react";
import { API_BASE, WS_BASE, RoomSummary, joinRoom } from "../api";

type Props = {
  headers: Record<string,string>;
  onJoined: (roomId: string) => void;
};

export default function JoinTab({ headers, onJoined }: Props) {
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  async function loadOnce() {
    try {
      const r = await fetch(`${API_BASE}/api/rooms`);
      const data = await r.json();
      setRooms(data);
    } catch (err) {
      console.error('[JoinTab] Failed to load rooms:', err)
    }
  }

  useEffect(() => {
    loadOnce();
    const ws = new WebSocket(`${WS_BASE}/ws/lobby`);
    wsRef.current = ws;

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg?.type === "rooms") {
          setRooms(msg.payload);
        }
      } catch (err) {
        console.error('[JoinTab] Failed to parse WebSocket message:', err)
      }
    };
    ws.onclose = () => { /* можно переподключаться при желании */ };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, []);

  async function handleJoin(id: string) {
    const res = await joinRoom(id, headers);
    if (res?.ok || res?.room_id || !res?.error) {
      onJoined(id);
    }
  }

  return (
    <div className="space-y-3">
      <div className="text-sm text-gray-500">Активные комнаты (live)</div>
      <div className="flex flex-col gap-8">
        {rooms.length === 0 && (
          <div className="text-gray-400 text-sm">Пока нет открытых комнат</div>
        )}
        {rooms.map((r) => (
          <div
            key={r.id}
            className="flex items-center justify-between rounded-xl border p-3"
          >
            <div className="flex flex-col">
              <div className="font-medium">{r.name || "Без названия"}</div>
              <div className="text-xs text-gray-500">
                Вариант: {r.variant_title} • Игроки: {r.players}/{r.players_max}
              </div>
            </div>
            <button
              className="px-3 py-2 rounded-lg bg-black text-white disabled:opacity-40"
              onClick={() => handleJoin(r.id)}
              disabled={r.players >= r.players_max}
            >
              Присоединиться
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
