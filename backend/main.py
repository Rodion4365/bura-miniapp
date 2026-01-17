from __future__ import annotations

import os
import json
import uuid
import time
import asyncio
from typing import Dict, List, Optional, Tuple

from fastapi import (
    FastAPI,
    WebSocket,
    WebSocketDisconnect,
    Header,
    Query,
    HTTPException,
    Form,
)
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from models import CreateGameRequest, JoinGameRequest, Player, GameVariant, TableConfig
from game import ROOMS, Room, list_variants, VARIANTS, list_rooms_summary
from auth import verify_init_data
from database import init_database, get_leaderboard, get_player_stats, get_player_history

# ---------- CORS with multiple origins ----------
def _parse_origins(raw: str) -> list[str]:
    """
    Разбивает ORIGIN из env по запятым, убирает пробелы и пустые.
    Пример: "https://buragame.ru, https://www.buragame.ru"
    """
    return [x.strip() for x in raw.split(",") if x.strip()]

ORIGIN_ENV = os.getenv("ORIGIN", "")
ALLOWED_ORIGINS = ["http://localhost:5173"] + _parse_origins(ORIGIN_ENV)

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

print("[CORS] allow_origins:", ALLOWED_ORIGINS)

# ---------- API models ----------
class VerifyResult(BaseModel):
    ok: bool
    user_id: str
    name: str
    avatar_url: Optional[str] = None

# ---------- REST ----------
@app.get("/api/variants")
async def variants():
    return [v.model_dump() for v in list_variants()]

@app.get("/api/rooms")
async def rooms():
    return list_rooms_summary()

@app.post("/api/auth/verify")
async def auth_verify(init_data: str = Form(...)):
    data = verify_init_data(init_data)
    user = json.loads(data.get("user", "{}"))
    return VerifyResult(
        ok=True,
        user_id=str(user.get("id")),
        name=user.get("first_name", "Player"),
        avatar_url=user.get("photo_url"),
    )

@app.post("/api/game/create")
async def create_game(
    req: CreateGameRequest,
    x_user_id: str = Header(...),
    x_user_name: str = Header("Player"),
    x_user_avatar: str = Header(""),
):
    config = req.config or TableConfig()
    variant = VARIANTS.get(req.variant_key) if req.variant_key else None
    if variant is None:
        variant = GameVariant(
            key="custom",
            title="Пользовательский стол",
            players_min=2,
            players_max=config.max_players,
            description="Игра с настраиваемыми параметрами",
        )
    room_id = str(uuid.uuid4())[:8]
    r = Room(room_id, req.room_name, variant, config)
    ROOMS[room_id] = r
    r.add_player(Player(id=x_user_id, name=x_user_name, avatar_url=x_user_avatar))
    await broadcast_lobby()
    return {"room_id": room_id}

@app.post("/api/game/join")
async def join_game(
    req: JoinGameRequest,
    x_user_id: str = Header(...),
    x_user_name: str = Header("Player"),
    x_user_avatar: str = Header(""),
):
    r = ROOMS.get(req.room_id)
    if not r:
        return {"error": "room_not_found"}
    r.add_player(Player(id=x_user_id, name=x_user_name, avatar_url=x_user_avatar))
    await broadcast_room(req.room_id)
    await broadcast_lobby()
    return {"ok": True}


def _get_room_or_404(room_id: str) -> Room:
    room = ROOMS.get(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="room_not_found")
    return room


@app.post("/api/game/start/{room_id}")
async def start_game(room_id: str):
    room = _get_room_or_404(room_id)
    room.start()
    await broadcast_room(room_id)
    return {"ok": True}


@app.get("/api/game/state/{room_id}")
async def game_state(room_id: str, x_user_id: Optional[str] = Header(None)):
    r = _get_room_or_404(room_id)
    state = r.to_state(x_user_id)
    # Помечаем отключенных игроков
    for player in state.players:
        if hub.is_player_disconnected(room_id, player.id):
            player.disconnected = True
    return state.model_dump(by_alias=True)


# ---------- Players API ----------
@app.get("/api/players/leaderboard")
async def players_leaderboard(limit: int = 50):
    """Получить топ игроков по рейтингу"""
    leaderboard = await get_leaderboard(limit=min(limit, 100))
    return {"players": leaderboard}


@app.get("/api/players/{player_id}/stats")
async def player_stats(player_id: str):
    """Получить статистику конкретного игрока"""
    stats = await get_player_stats(player_id)
    if not stats:
        raise HTTPException(status_code=404, detail="player_not_found")
    return stats


@app.get("/api/players/{player_id}/history")
async def player_history(player_id: str, limit: int = 20):
    """Получить историю матчей игрока"""
    history = await get_player_history(player_id, limit=min(limit, 50))
    return {"matches": history}

# ---------- WebSockets hub ----------
class Hub:
    def __init__(self):
        self.rooms: Dict[str, List[WebSocket]] = {}
        self.lobby: List[WebSocket] = []
        self.ws_player: Dict[WebSocket, str] = {}
        self.ws_room: Dict[WebSocket, str] = {}
        # Отслеживание отключенных игроков: (room_id, player_id) -> timestamp отключения
        self.disconnected_players: Dict[Tuple[str, str], float] = {}
        # Константа таймаута переподключения (30 секунд)
        self.reconnect_timeout_sec = 30.0

    async def connect_room(self, room_id: str, player_id: str, ws: WebSocket):
        await ws.accept()

        # Проверяем, был ли игрок отключен
        disconnect_key = (room_id, player_id)
        if disconnect_key in self.disconnected_players:
            # Игрок переподключается - восстанавливаем его
            del self.disconnected_players[disconnect_key]
            print(f"[Reconnect] Player {player_id} reconnected to room {room_id}")

        self.rooms.setdefault(room_id, []).append(ws)
        self.ws_player[ws] = player_id
        self.ws_room[ws] = room_id

    async def disconnect(self, ws: WebSocket):
        pid = self.ws_player.pop(ws, None)
        rid = self.ws_room.pop(ws, None)
        if rid and ws in self.rooms.get(rid, []):
            self.rooms[rid].remove(ws)

        if rid and pid and rid in ROOMS:
            room = ROOMS[rid]
            # Проверяем, началась ли игра
            if room.started:
                # Если игра началась, даем 30 секунд на переподключение
                disconnect_key = (rid, pid)
                self.disconnected_players[disconnect_key] = time.time()
                print(f"[Reconnect] Player {pid} disconnected from room {rid}, waiting {self.reconnect_timeout_sec}s for reconnection")
                await broadcast_room_safe(rid)
            else:
                # Если игра не началась, удаляем игрока сразу
                room.remove_player(pid)
                if len(room.players) == 0:
                    # авто-удаление пустой комнаты
                    ROOMS.pop(rid, None)
                await broadcast_room_safe(rid)
                await broadcast_lobby()

    async def cleanup_disconnected_players(self):
        """Фоновая задача для удаления игроков, которые не переподключились за 30 секунд"""
        while True:
            try:
                await asyncio.sleep(5)  # Проверяем каждые 5 секунд
                current_time = time.time()
                to_remove = []

                for (room_id, player_id), disconnect_time in self.disconnected_players.items():
                    if current_time - disconnect_time > self.reconnect_timeout_sec:
                        to_remove.append((room_id, player_id))

                for room_id, player_id in to_remove:
                    del self.disconnected_players[(room_id, player_id)]
                    if room_id in ROOMS:
                        print(f"[Reconnect] Player {player_id} timeout, removing from room {room_id}")
                        ROOMS[room_id].remove_player(player_id)
                        if len(ROOMS[room_id].players) == 0:
                            ROOMS.pop(room_id, None)
                        await broadcast_room_safe(room_id)
                        await broadcast_lobby()
            except Exception as e:
                print(f"[Reconnect] Error in cleanup task: {e}")

    def is_player_disconnected(self, room_id: str, player_id: str) -> bool:
        """Проверяет, отключен ли игрок"""
        return (room_id, player_id) in self.disconnected_players

    async def connect_lobby(self, ws: WebSocket):
        await ws.accept()
        self.lobby.append(ws)

    async def send_room_state(self, room_id: str):
        room = ROOMS.get(room_id)
        if not room:
            return
        for ws in list(self.rooms.get(room_id, [])):
            player_id = self.ws_player.get(ws)
            try:
                state = room.to_state(player_id)
                # Помечаем отключенных игроков
                for player in state.players:
                    if self.is_player_disconnected(room_id, player.id):
                        player.disconnected = True
                payload = state.model_dump(by_alias=True)
                await ws.send_json({"type": "state", "payload": payload})
            except RuntimeError:
                pass

    async def send_room_event(self, room_id: str, message: dict):
        for ws in list(self.rooms.get(room_id, [])):
            try:
                await ws.send_json(message)
            except RuntimeError:
                pass

    async def send_lobby(self, message: dict):
        for ws in list(self.lobby):
            try:
                await ws.send_json(message)
            except RuntimeError:
                pass

# Создаем hub
hub = Hub()

# Инициализация базы данных при старте
@app.on_event("startup")
async def startup_event():
    await init_database()
    # Запускаем фоновую задачу для очистки отключенных игроков
    asyncio.create_task(hub.cleanup_disconnected_players())
    print("[Main] Application started")

# ---------- broadcasters ----------
async def broadcast_room(room_id: str):
    await hub.send_room_state(room_id)

async def broadcast_room_safe(room_id: Optional[str]):
    if room_id and room_id in ROOMS:
        await broadcast_room(room_id)

async def broadcast_lobby():
    await hub.send_lobby({"type": "rooms", "payload": list_rooms_summary()})

# ---------- WS endpoints ----------
@app.websocket("/ws/{room_id}")
async def ws_room(ws: WebSocket, room_id: str, player_id: str = Query(...)):
    if room_id not in ROOMS:
        await ws.close(code=1008, reason="room_not_found")
        return

    await hub.connect_room(room_id, player_id, ws)
    try:
        await broadcast_room(room_id)
        while True:
            data = await ws.receive_json()
            t = data.get("type")
            room = ROOMS.get(room_id)
            if room is None:
                await ws.close(code=1011, reason="room_not_found")
                await hub.disconnect(ws)
                break
            if t in {"play", "play_cards"}:
                cards = data.get("cards")
                card = data.get("card")
                if cards is None and card is not None:
                    cards = [card]
                kwargs = {}
                if "roundId" in data:
                    kwargs["round_id"] = data["roundId"]
                if "trickIndex" in data:
                    kwargs["trick_index"] = data["trickIndex"]
                try:
                    room.play_cards(data["player_id"], cards or [], **kwargs)
                except ValueError as exc:
                    await ws.send_json({"type": "error", "error": str(exc)})
                else:
                    await broadcast_room(room_id)
            elif t == "declare":
                try:
                    room.declare_combination(data["player_id"], data["combo"])
                except ValueError as exc:
                    await ws.send_json({"type": "error", "error": str(exc)})
                else:
                    await broadcast_room(room_id)
            elif t == "request_early_turn":
                cards_payload = data.get("cards")
                try:
                    cards = room.request_early_turn(
                        data["player_id"], cards_payload or [], round_id=data.get("roundId")
                    )
                except ValueError as exc:
                    await ws.send_json({"type": "error", "error": str(exc)})
                else:
                    suits = {card.suit for card in cards}
                    same_suit = suits.pop() if len(suits) == 1 else None
                    await hub.send_room_event(
                        room_id,
                        {
                            "type": "EARLY_TURN_GRANTED",
                            "playerId": data["player_id"],
                            "suit": same_suit,
                            "cardIds": [card.id for card in cards],
                            "ranks": [card.rank for card in cards],
                        },
                    )
                    await broadcast_room(room_id)
    except WebSocketDisconnect:
        await hub.disconnect(ws)

@app.websocket("/ws/lobby")
async def ws_lobby(ws: WebSocket):
    await hub.connect_lobby(ws)
    try:
        await ws.send_json({"type": "rooms", "payload": list_rooms_summary()})
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        if ws in hub.lobby:
            hub.lobby.remove(ws)
