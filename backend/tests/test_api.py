import os, importlib
from fastapi.testclient import TestClient

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
