import React, { useEffect, useMemo, useRef, useState } from "react";
import { API_BASE, WS_BASE, fetchVariants, createRoom, startGame } from "./api";
import JoinTab from "./components/JoinTab";

type Variant = { key: string; title: string; players_min: number; players_max: number; description?: string };
type Card = { suit: string; rank: string };
type PlayerState = { id: string; name: string; hand: Card[] };
type RoomState = {
  id: string;
  name: string;
  variant_title: string;
  players: PlayerState[];
  players_min: number;
  players_max: number;
  table: { attack: Card[]; defend: Card[] };
  trump?: Card | null;
  deck_count: number;
  current_turn?: string | null;
};

function useHeaders() {
  // Telegram init-data или guest
  const [h, setH] = useState<Record<string,string>>({
    "x-user-id": "guest",
    "x-user-name": "Guest",
    "x-user-avatar": "",
  });

  useEffect(() => {
    try {
      // если встроено в Telegram, можно подтянуть из initData
      // сейчас оставить guest, чтобы не блокировать работу
    } catch {}
  }, []);

  return h;
}

export default function App() {
  const headers = useHeaders();
  const [tab, setTab] = useState<"new"|"join">("new");

  const [variants, setVariants] = useState<Variant[]>([]);
  const [variantKey, setVariantKey] = useState<string>("classic_2p");
  const [roomId, setRoomId] = useState<string | null>(null);
  const [roomState, setRoomState] = useState<RoomState | null>(null);

  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    fetchVariants().then(setVariants).catch(() => {});
  }, []);

  // подключение к комнате по WS
  function connectRoomWS(id: string, playerId: string) {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    const ws = new WebSocket(`${WS_BASE}/ws/${id}?player_id=${encodeURIComponent(playerId)}`);
    wsRef.current = ws;

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg?.type === "state") {
          setRoomState(msg.payload as RoomState);
        }
      } catch {}
    };
    ws.onclose = () => {
      wsRef.current = null;
    };
  }

  async function handleCreate() {
    const v = variants.find(v => v.key === variantKey);
    const res = await createRoom(variantKey, "Комната", headers);
    if (res?.room_id) {
      setRoomId(res.room_id);
      // создатель тоже должен быть в WS комнаты и получать live-обновления
      connectRoomWS(res.room_id, headers["x-user-id"]);
      setTab("new"); // остаёмся в своей комнате
    }
  }

  async function handleStart() {
    if (!roomId) return;
    await startGame(roomId);
    // сервер разошлёт новое состояние, мы его примем из ws.onmessage
  }

  const canStart = useMemo(() => {
    if (!roomState) return false;
    // кнопка активна только если игроков >= players_min
    const p = roomState.players?.length ?? 0;
    return p >= (roomState.players_min ?? 2);
  }, [roomState]);

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold mb-4">Бура</h1>

      {/* Табы */}
      <div className="flex gap-2 mb-6">
        <button
          className={"tab " + (tab === "new" ? "active" : "")}
          onClick={() => setTab("new")}
        >
          Новая игра
        </button>
        <button
          className={"tab " + (tab === "join" ? "active" : "")}
          onClick={() => setTab("join")}
        >
          Присоединиться
        </button>
      </div>

      {/* Содержимое вкладок */}
      {tab === "join" ? (
        <JoinTab
          headers={headers}
          onJoined={(id) => {
            setRoomId(id);
            connectRoomWS(id, headers["x-user-id"]);
            setTab("new"); // после присоединения переходим в стол
          }}
        />
      ) : (
        <div className="space-y-4">
          {/* Создание комнаты */}
          {!roomId && (
            <div className="flex items-center gap-3">
              <select
                className="border rounded-lg p-2"
                value={variantKey}
                onChange={(e) => setVariantKey(e.target.value)}
              >
                {variants.map((v) => (
                  <option key={v.key} value={v.key}>
                    {v.title} ({v.players_min}–{v.players_max})
                  </option>
                ))}
              </select>
              <button className="px-3 py-2 rounded-lg bg-black text-white" onClick={handleCreate}>
                Создать
              </button>
            </div>
          )}

          {/* Стол */}
          {roomId && (
            <div className="space-y-3">
              <div className="text-sm text-gray-500">Комната: {roomId}</div>
              <div className="flex items-center gap-3">
                <div className="text-sm">
                  Игроков: {roomState?.players?.length ?? 0}/{roomState?.players_max ?? "—"}
                </div>
                <button
                  className="px-3 py-2 rounded-lg bg-black text-white disabled:opacity-40"
                  onClick={handleStart}
                  disabled={!canStart}
                >
                  Старт
                </button>
              </div>

              {/* Упрощённая визуализация: козырь и зона стола */}
              <div className="flex gap-10 items-start">
                <div className="text-center">
                  <div className="text-sm text-gray-500 mb-2">Козырь</div>
                  <div className="w-16 h-24 rounded-xl border flex items-center justify-center text-2xl bg-gray-50">
                    {roomState?.trump ? "🂠" : "?"}
                  </div>
                </div>
                <div className="flex-1">
                  <div className="text-sm text-gray-500 mb-2">Стол</div>
                  <div className="min-h-[100px] rounded-xl border p-3">
                    {/* здесь можно рисовать attack/defend */}
                    {roomState?.table?.attack?.length
                      ? <div className="text-sm">Карты на столе: {roomState.table.attack.length}</div>
                      : <div className="text-sm text-gray-400">Пока пусто</div>}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
