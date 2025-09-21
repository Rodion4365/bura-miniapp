from game import Room, VARIANTS
from models import Player, Card

def test_turn_enforcement_and_cover_rules():
    r = Room("r1","T",VARIANTS["classic_2p"])
    a = Player(id="A", name="A")
    b = Player(id="B", name="B")
    r.add_player(a); r.add_player(b)
    r.start()
    r.hands[a.id] = [Card(suit=r.trump, rank=10)]
    r.hands[b.id] = [Card(suit=r.trump, rank=11)]
    r.table = []
    r.turn_idx = 0

    try:
        r.play("B", r.hands[b.id][0])
        assert False, "Expected Not your turn"
    except ValueError as e:
        assert "Not your turn" in str(e)

    r.play("A", Card(suit=r.trump, rank=10))
    assert len(r.table) == 1
    r.cover("B", Card(suit=r.trump, rank=11))
    assert len(r.table) == 2
    assert r.current_player_id() == "A"

def test_invalid_cover_rejected():
    r = Room("r2","T",VARIANTS["classic_2p"])
    a = Player(id="A", name="A")
    b = Player(id="B", name="B")
    r.add_player(a); r.add_player(b)
    r.start()
    r.trump = "♠"
    r.hands[a.id] = [Card(suit="♠", rank=9)]
    r.hands[b.id] = [Card(suit="♥", rank=14)]
    r.table = []
    r.turn_idx = 0
    r.play("A", Card(suit="♠", rank=9))
    try:
        r.cover("B", Card(suit="♥", rank=14))
        assert False, "Expected Card does not cover"
    except ValueError as e:
        assert "Card does not cover" in str(e)
