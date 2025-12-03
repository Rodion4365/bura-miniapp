from __future__ import annotations

import os
import json
import uuid
from typing import Dict, List, Optional

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

from app.api.auth import router as telegram_auth_router
from app.database import init_db
from models import CreateGameRequest, JoinGameRequest, Player, GameVariant, TableConfig
from game import ROOMS, Room, list_variants, VARIANTS, list_rooms_summary
from auth import verify_init_data

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

app.include_router(telegram_auth_router)


@app.on_event("startup")
async def _prepare_db() -> None:
    await init_db()

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
    return r.to_state(x_user_id).model_dump(by_alias=True)

# ---------- WebSockets hub ----------
class Hub:
    def __init__(self):
        self.rooms: Dict[str, List[WebSocket]] = {}
        self.lobby: List[WebSocket] = []
        self.ws_player: Dict[WebSocket, str] = {}
        self.ws_room: Dict[WebSocket, str] = {}

    async def connect_room(self, room_id: str, player_id: str, ws: WebSocket):
        await ws.accept()
        self.rooms.setdefault(room_id, []).append(ws)
        self.ws_player[ws] = player_id
        self.ws_room[ws] = room_id

    async def disconnect(self, ws: WebSocket):
        pid = self.ws_player.pop(ws, None)
        rid = self.ws_room.pop(ws, None)
        if rid and ws in self.rooms.get(rid, []):
            self.rooms[rid].remove(ws)
        if rid and pid and rid in ROOMS:
            ROOMS[rid].remove_player(pid)
            if len(ROOMS[rid].players) == 0:
                # авто-удаление пустой комнаты
                ROOMS.pop(rid, None)
            await broadcast_room_safe(rid)
            await broadcast_lobby()

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
                payload = room.to_state(player_id).model_dump(by_alias=True)
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

hub = Hub()

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
