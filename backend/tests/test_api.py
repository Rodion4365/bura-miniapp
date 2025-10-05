import os, importlib
from fastapi.testclient import TestClient

from models import Card

os.environ.setdefault("ORIGIN", "http://localhost:5173")
app_mod = importlib.import_module("main")
client = TestClient(app_mod.app)

def test_variants_list():
    r = client.get("/api/variants")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list) and len(data) >= 2
    keys = {v["key"] for v in data}
    assert "classic_2p" in keys
    assert "classic_3p" in keys

def test_create_join_start_flow():
    headers_a = {"x-user-id":"userA","x-user-name":"User A","x-user-avatar":""}
    r = client.post("/api/game/create", json={"variant_key":"classic_2p","room_name":"Test"}, headers=headers_a)
    assert r.status_code == 200
    room_id = r.json()["room_id"]

    headers_b = {"x-user-id":"userB","x-user-name":"User B","x-user-avatar":""}
    rj = client.post("/api/game/join", json={"room_id": room_id}, headers=headers_b)
    assert rj.status_code == 200

    rs = client.post(f"/api/game/start/{room_id}")
    assert rs.status_code == 200

    sa = client.get(f"/api/game/state/{room_id}", headers={"x-user-id":"userA"})
    assert sa.status_code == 200
    st = sa.json()
    assert st["started"] is True
    assert isinstance(st.get("hands"), list)
    assert st["variant"]["players_max"] == 2
    assert st["scores"]["userA"] == 0
    assert st["scores"]["userB"] == 0


def test_create_with_custom_config():
    headers = {"x-user-id":"host","x-user-name":"Host","x-user-avatar":""}
    payload = {
        "room_name": "Custom",
        "config": {
            "maxPlayers": 4,
            "discardVisibility": "faceDown",
            "enableFourEnds": True,
            "turnTimeoutSec": 60,
        },
    }
    r = client.post("/api/game/create", json=payload, headers=headers)
    assert r.status_code == 200
    room_id = r.json()["room_id"]

    state = client.get(f"/api/game/state/{room_id}", headers=headers)
    assert state.status_code == 200
    data = state.json()
    assert data["config"]["maxPlayers"] == 4
    assert data["config"]["discardVisibility"] == "faceDown"
    assert data["variant"]["key"] == "custom"


def test_ws_invalid_action_returns_error_without_disconnect():
    headers_a = {"x-user-id":"userA","x-user-name":"User A","x-user-avatar":""}
    create_resp = client.post(
        "/api/game/create",
        json={"variant_key": "classic_2p", "room_name": "WS"},
        headers=headers_a,
    )
    assert create_resp.status_code == 200
    room_id = create_resp.json()["room_id"]

    headers_b = {"x-user-id":"userB","x-user-name":"User B","x-user-avatar":""}
    join_resp = client.post("/api/game/join", json={"room_id": room_id}, headers=headers_b)
    assert join_resp.status_code == 200

    start_resp = client.post(f"/api/game/start/{room_id}")
    assert start_resp.status_code == 200

    with client.websocket_connect(f"/ws/{room_id}?player_id=userA") as ws:
        first_message = ws.receive_json()
        assert first_message["type"] == "state"

        ws.send_json({"type": "declare", "player_id": "userA", "combo": "unknown"})
        error_message = ws.receive_json()
        assert error_message["type"] == "error"
        assert "Unknown combination" in error_message["error"]

        ws.send_json({"type": "declare", "player_id": "userA", "combo": "unknown"})
        repeat_error = ws.receive_json()
        assert repeat_error["type"] == "error"


def _make_card(suit: str, rank: int, idx: int) -> Card:
    return Card(id=f"test_{suit}_{rank}_{idx}", suit=suit, rank=rank)


def test_request_early_turn_via_ws():
    headers_a = {"x-user-id": "userA", "x-user-name": "User A", "x-user-avatar": ""}
    create_resp = client.post(
        "/api/game/create",
        json={"variant_key": "classic_2p", "room_name": "Early"},
        headers=headers_a,
    )
    assert create_resp.status_code == 200
    room_id = create_resp.json()["room_id"]

    headers_b = {"x-user-id": "userB", "x-user-name": "User B", "x-user-avatar": ""}
    join_resp = client.post("/api/game/join", json={"room_id": room_id}, headers=headers_b)
    assert join_resp.status_code == 200

    start_resp = client.post(f"/api/game/start/{room_id}")
    assert start_resp.status_code == 200

    room = app_mod.ROOMS[room_id]
    room.hands["userA"] = [
        _make_card("♥", 14, 1),
        _make_card("♥", 14, 2),
        _make_card("♥", 10, 1),
        _make_card("♥", 9, 1),
    ]
    room.hands["userB"] = [
        _make_card("♠", 6, 1),
        _make_card("♠", 7, 1),
        _make_card("♠", 8, 1),
        _make_card("♠", 9, 2),
    ]
    room.turn_idx = room._player_index("userB")
    room._refresh_deadline()

    with client.websocket_connect(f"/ws/{room_id}?player_id=userA") as ws:
        first_state = ws.receive_json()
        assert first_state["type"] == "state"
        assert first_state["payload"]["turn_player_id"] == "userB"

        ws.send_json({"type": "request_early_turn", "player_id": "userA", "suit": "♠"})
        error_message = ws.receive_json()
        assert error_message["type"] == "error"

        ws.send_json({
            "type": "request_early_turn",
            "player_id": "userA",
            "suit": "♥",
            "roundId": room.round_id,
        })
        event_message = ws.receive_json()
        assert event_message["type"] == "EARLY_TURN_GRANTED"
        assert event_message["playerId"] == "userA"
        assert event_message["suit"] == "♥"

        state_update = ws.receive_json()
        assert state_update["type"] == "state"
        assert state_update["payload"]["turn_player_id"] == "userA"
