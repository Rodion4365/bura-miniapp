import time

import pytest

from game import Room, VARIANTS
from models import Card, Player


def make_room(two_players: bool = True) -> Room:
    variant = VARIANTS["classic_2p"] if two_players else VARIANTS["classic_3p"]
    room = Room("r", "Test", variant)
    player_ids = ["A", "B"]
    if not two_players:
        player_ids.append("C")
    for pid in player_ids:
        room.add_player(Player(id=pid, name=pid))
    room.start()
    # simplify deterministic state
    room.deck = []
    room.trump = "♣"
    room.trump_card = Card(suit="♣", rank=6)
    room.hands = {pid: [] for pid in player_ids}
    room.taken_cards = {pid: [] for pid in player_ids}
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


def test_leader_can_throw_four_combo():
    room = make_room()
    room.hands["A"] = [
        Card(suit="♠", rank=14),
        Card(suit="♥", rank=14),
        Card(suit="♦", rank=14),
        Card(suit="♣", rank=14),
    ]
    room.hands["B"] = [
        Card(suit="♠", rank=9),
        Card(suit="♥", rank=9),
        Card(suit="♦", rank=9),
        Card(suit="♣", rank=9),
    ]

    room.play_cards("A", list(room.hands["A"]))
    assert room.current_trick is not None
    assert room.current_trick.required_count == 4


def test_invalid_four_combo_rejected():
    room = make_room()
    room.hands["A"] = [
        Card(suit="♠", rank=14),
        Card(suit="♥", rank=13),
        Card(suit="♦", rank=12),
        Card(suit="♣", rank=11),
    ]
    room.hands["B"] = [
        Card(suit="♠", rank=9),
        Card(suit="♥", rank=9),
        Card(suit="♦", rank=9),
        Card(suit="♣", rank=9),
    ]

    with pytest.raises(ValueError):
        room.play_cards("A", list(room.hands["A"]))


def test_reveal_delay_keeps_board_visible():
    room = make_room()
    room.hands["A"] = [Card(suit="♠", rank=14), Card(suit="♠", rank=13)]
    room.hands["B"] = [Card(suit="♣", rank=10), Card(suit="♣", rank=9)]

    room.play_cards("A", list(room.hands["A"]))
    room.play_cards("B", list(room.hands["B"]))

    assert room.reveal_until_ts is not None
    state = room.to_state("A")
    assert state.board is not None
    assert state.board.reveal_until_ts is not None

    room.reveal_until_ts = time.time() - 1
    room.to_state("A")
    assert room.reveal_snapshot is None


def test_board_state_includes_card_metadata():
    room = make_room()
    room.hands["A"] = [Card(suit="♠", rank=14), Card(suit="♠", rank=13)]
    room.hands["B"] = [Card(suit="♣", rank=10), Card(suit="♣", rank=9)]

    room.play_cards("A", [Card(suit="♠", rank=14)])
    room.play_cards("B", [Card(suit="♣", rank=10)])

    state = room.to_state("A")
    assert state.board is not None
    assert state.cards
    assert state.board.attacker
    card = state.board.attacker[0]
    assert card.suit == "♠"
    assert card.rank == 14
    assert card.image_url and card.image_url.endswith(".png")
    assert card.back_image_url and card.back_image_url.endswith(".png")


def test_penalties_and_round_summary():
    room = make_room()
    room.taken_cards = {
        "A": [Card(suit="♠", rank=14), Card(suit="♠", rank=10)],
        "B": [],
    }
    room.round_active = True
    points = room._calculate_round_result()
    penalties, leaders = room._calculate_penalties(points)
    room.round_summary = points
    room._finalize_round(penalties, leaders)

    assert room.scores["A"] == 0
    assert room.scores["B"] == 6
    assert room.round_summary["A"] == 21
    assert room.round_summary["B"] == 0
    assert room.game_wins["A"] == 1
    assert room.game_wins["B"] == 0


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
    with pytest.raises(ValueError):
        room.declare_combination("A", "bura")


def test_draw_up_from_deck_round_robin_distribution():
    room = make_room(two_players=False)
    deck_cards = [
        Card(suit="♠", rank=6),
        Card(suit="♥", rank=7),
        Card(suit="♦", rank=8),
        Card(suit="♣", rank=9),
        Card(suit="♠", rank=10),
    ]
    room.deck = list(deck_cards)
    room.card_catalog = {card.id: card for card in deck_cards}
    room.hands["A"] = []
    room.hands["B"] = []
    room.hands["C"] = []

    room._draw_up_from_deck("B")

    assert [card.id for card in room.hands["B"]] == [deck_cards[0].id, deck_cards[3].id]
    assert [card.id for card in room.hands["C"]] == [deck_cards[1].id, deck_cards[4].id]
    assert [card.id for card in room.hands["A"]] == [deck_cards[2].id]
    assert room.deck == []

    state = room.to_state("C")
    assert state.hand_counts == {"A": 1, "B": 2, "C": 2}
    assert state.deck_count == 0
