from __future__ import annotations
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os, json, uuid
from typing import Dict, List, Optional
from models import CreateGameRequest, JoinGameRequest, Player
from game import ROOMS, Room, list_variants, VARIANTS
from auth import verify_init_data

ORIGIN = os.getenv("ORIGIN", "http://localhost:5173")

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[ORIGIN, "http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

class VerifyResult(BaseModel):
    ok: bool
    user_id: str
    name: str
    avatar_url: Optional[str] = None

@app.get("/api/variants")
async def variants():
    return [v.model_dump() for v in list_variants()]

@app.post("/api/auth/verify")
async def auth_verify(init_data: str):
    data = verify_init_data(init_data)
    user = json.loads(data.get("user","{}"))
    return VerifyResult(ok=True, user_id=str(user.get("id")), name=user.get("first_name","Player"), avatar_url=user.get("photo_url"))

@app.post("/api/game/create")
async def create_game(req: CreateGameRequest, x_user_id: str = Header(...), x_user_name: str = Header("Player"), x_user_avatar: str = Header("")):
    variant = VARIANTS[req.variant_key]
    room_id = str(uuid.uuid4())[:8]
    r = Room(room_id, req.room_name, variant)
    ROOMS[room_id] = r
    r.add_player(Player(id=x_user_id, name=x_user_name, avatar_url=x_user_avatar))
    return {"room_id": room_id}

@app.post("/api/game/join")
async def join_game(req: JoinGameRequest, x_user_id: str = Header(...), x_user_name: str = Header("Player"), x_user_avatar: str = Header("")):
    r = ROOMS.get(req.room_id)
    if not r: return {"error":"room_not_found"}
    r.add_player(Player(id=x_user_id, name=x_user_name, avatar_url=x_user_avatar))
    return {"ok": True}

@app.post("/api/game/start/{room_id}")
async def start_game(room_id: str):
    ROOMS[room_id].start()
    await broadcast_room(room_id)
    return {"ok": True}

@app.get("/api/game/state/{room_id}")
async def game_state(room_id: str, x_user_id: Optional[str] = Header(None)):
    r = ROOMS[room_id]
    return r.to_state(x_user_id).model_dump()

class Hub:
    def __init__(self):
        self.rooms: Dict[str, List[WebSocket]] = {}
    async def connect(self, room_id: str, ws: WebSocket):
        await ws.accept()
        self.rooms.setdefault(room_id, []).append(ws)
    async def send_room(self, room_id: str, message: dict):
        for ws in list(self.rooms.get(room_id, [])):
            try: await ws.send_json(message)
            except RuntimeError: pass

hub = Hub()

async def broadcast_room(room_id: str):
    r = ROOMS[room_id]
    await hub.send_room(room_id, {"type":"state","payload": r.to_state(None).model_dump()})

@app.websocket("/ws/{room_id}")
async def ws_room(ws: WebSocket, room_id: str):
    await hub.connect(room_id, ws)
    try:
        while True:
            data = await ws.receive_json()
            t = data.get("type")
            if t == "play":
                pid = data["player_id"]
                ROOMS[room_id].play(pid, data["card"])
                await broadcast_room(room_id)
            elif t == "cover":
                pid = data["player_id"]
                ROOMS[room_id].cover(pid, data["card"])
                await broadcast_room(room_id)
            elif t == "draw":
                ROOMS[room_id].draw_up()
                await broadcast_room(room_id)
    except WebSocketDisconnect:
        pass
