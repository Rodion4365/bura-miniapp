from game import Room, VARIANTS
from models import Player, Card


def make_room(two_players: bool = True) -> Room:
    variant = VARIANTS["classic_2p"] if two_players else VARIANTS["classic_3p"]
    room = Room("r", "Test", variant)
    room.add_player(Player(id="A", name="A"))
    room.add_player(Player(id="B", name="B"))
    room.start()
    # simplify deterministic state
    room.deck = []
    room.trump = "♣"
    room.trump_card = Card(suit="♣", rank=6)
    room.hands["A"] = []
    room.hands["B"] = []
    room.taken_cards = {"A": [], "B": []}
    room.discard_pile = []
    room.round_summary = {}
    room.turn_idx = 0
    room.round_active = True
    return room


def test_trick_resolution_and_owner_switch():
    room = make_room()
    room.hands["A"] = [Card(suit="♠", rank=14), Card(suit="♠", rank=13), Card(suit="♦", rank=6)]
    room.hands["B"] = [Card(suit="♣", rank=10), Card(suit="♣", rank=9), Card(suit="♦", rank=7)]

    room.play_cards("A", [Card(suit="♠", rank=14), Card(suit="♠", rank=13)])
    assert room.current_trick is not None
    assert room.current_trick.owner_id == "A"

    room.play_cards("B", [Card(suit="♣", rank=10), Card(suit="♣", rank=9)])
    assert room.current_trick is None  # trick finished (2 players)
    assert room.taken_cards["B"] and len(room.taken_cards["B"]) == 4
    assert room.last_trick_winner_id == "B"
    assert room.turn_idx == room._player_index("B")


def test_partial_response_keeps_owner():
    room = make_room()
    room.hands["A"] = [Card(suit="♠", rank=12), Card(suit="♠", rank=11), Card(suit="♥", rank=6)]
    room.hands["B"] = [Card(suit="♣", rank=10), Card(suit="♠", rank=6), Card(suit="♦", rank=7)]

    room.play_cards("A", [Card(suit="♠", rank=12), Card(suit="♠", rank=11)])
    assert room.current_trick is not None
    assert room.current_trick.owner_id == "A"

    room.play_cards("B", [Card(suit="♣", rank=10), Card(suit="♠", rank=6)])
    assert room.current_trick is None
    assert room.last_trick_winner_id == "A"
    assert room.taken_cards["A"] and len(room.taken_cards["A"]) == 4

def test_penalties_and_round_summary():
    room = make_room()
    room.taken_cards = {
        "A": [Card(suit="♠", rank=14), Card(suit="♠", rank=10)],
        "B": [],
    }
    room.round_active = True
    penalties = room._calculate_penalties(room._calculate_round_result())
    room.round_summary = room._calculate_round_result()
    room._finalize_round(penalties)

    assert room.scores["A"] == 0
    assert room.scores["B"] == 6
    assert room.round_summary["A"] == 21
    assert room.round_summary["B"] == 0


def test_declare_combination():
    room = make_room()
    room.hands["A"] = [
        Card(suit="♣", rank=14),
        Card(suit="♣", rank=13),
        Card(suit="♣", rank=12),
        Card(suit="♣", rank=11),
    ]
    room.declared_combos = {"A": set()}

    room.declare_combination("A", "bura")
    assert len(room.announcements) == 1
    assert room.announcements[0].combo == "bura"
    assert all(card.suit == "♣" for card in room.announcements[0].cards)

    # cannot declare twice
    try:
        room.declare_combination("A", "bura")
        assert False, "expected ValueError"
    except ValueError:
        pass
