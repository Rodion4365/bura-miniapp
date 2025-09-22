from __future__ import annotations

import random
import time
from dataclasses import dataclass, field
from typing import Dict, Iterable, List, Optional

from models import (
    Announcement,
    Card,
    GameState,
    GameVariant,
    Player,
    TableConfig,
    TrickPlay,
    TrickState,
)

SUITS = ["♠", "♥", "♦", "♣"]
RANKS = [6, 7, 8, 9, 10, 11, 12, 13, 14]

CARD_POINTS: Dict[int, int] = {
    14: 11,  # Ace
    10: 10,
    13: 4,   # King
    12: 3,   # Queen
    11: 2,   # Jack
}

RANK_STRENGTH: Dict[int, int] = {rank: idx for idx, rank in enumerate(RANKS)}

COMBINATION_NAMES = {
    "bura": "Бура",
    "molodka": "Молодка",
    "moscow": "Москва",
    "four_ends": "4 конца",
}


def _make_deck() -> List[Card]:
    return [Card(suit=suit, rank=rank) for suit in SUITS for rank in RANKS]


@dataclass
class _TrickInternal:
    leader_id: str
    required_count: int
    owner_id: str
    owner_cards: List[Card]
    captured_cards: List[Card] = field(default_factory=list)
    plays: List[TrickPlay] = field(default_factory=list)

    def to_public(self) -> TrickState:
        return TrickState(
            leader_id=self.leader_id,
            owner_id=self.owner_id,
            required_count=self.required_count,
            plays=list(self.plays),
        )


class Room:
    def __init__(self, room_id: str, room_name: str, variant: GameVariant, config: Optional[TableConfig] = None):
        self.id = room_id
        self.name = room_name
        self.variant = variant
        self.config = config or TableConfig()
        self.players: List[Player] = []
        self.started = False

        self.deck: List[Card] = []
        self.trump: Optional[str] = None
        self.trump_card: Optional[Card] = None
        self.hands: Dict[str, List[Card]] = {}
        self.taken_cards: Dict[str, List[Card]] = {}
        self.discard_pile: List[Card] = []
        self.announcements: List[Announcement] = []
        self.declared_combos: Dict[str, set[str]] = {}

        self.turn_idx: int = 0
        self.turn_deadline: Optional[float] = None
        self.current_trick: Optional[_TrickInternal] = None
        self.last_trick_winner_id: Optional[str] = None
        self.dealer_idx: int = 0

        self.round_number: int = 0
        self.round_active: bool = False
        self.round_summary: Dict[str, int] = {}

        self.winner_id: Optional[str] = None
        self.match_over: bool = False
        self.winners: List[str] = []
        self.losers: List[str] = []

        self.scores: Dict[str, int] = {}

    # ------------------------------------------------------------------
    # Lobby management
    # ------------------------------------------------------------------
    def add_player(self, p: Player):
        if self.started:
            raise ValueError("Game already started")
        if any(x.id == p.id for x in self.players):
            return
        max_players = self.config.max_players or self.variant.players_max
        if len(self.players) >= max_players:
            raise ValueError("Room full")
        p.seat = len(self.players)
        self.players.append(p)
        self.hands.setdefault(p.id, [])
        self.scores.setdefault(p.id, 0)

    def remove_player(self, player_id: str):
        self.players = [p for p in self.players if p.id != player_id]
        self.hands.pop(player_id, None)
        self.taken_cards.pop(player_id, None)
        self.scores.pop(player_id, None)
        self.declared_combos.pop(player_id, None)
        if self.players:
            self.turn_idx %= len(self.players)
        else:
            self.started = False
            self.round_active = False

    # ------------------------------------------------------------------
    # Match lifecycle
    # ------------------------------------------------------------------
    def start(self):
        if self.started:
            return
        min_players = self.variant.players_min
        max_players = self.config.max_players or self.variant.players_max
        min_players = max(2, min(min_players, max_players))
        if len(self.players) < min_players:
            raise ValueError("Not enough players")
        self.started = True
        self.match_over = False
        self.round_summary = {}
        self.winners = []
        self.losers = []
        self.turn_deadline = None
        self.last_trick_winner_id = None
        self.dealer_idx = random.randrange(len(self.players))
        self.round_number = 0
        self._start_new_round(initial=True)

    def _start_new_round(self, *, initial: bool):
        if not self.players:
            return
        self.round_number += 1
        self.round_active = True
        self.deck = _make_deck()
        random.shuffle(self.deck)
        self.trump_card = self.deck[-1] if self.deck else None
        self.trump = self.trump_card.suit if self.trump_card else None
        self.discard_pile = []
        self.announcements = []
        self.declared_combos = {p.id: set() for p in self.players}
        self.taken_cards = {p.id: [] for p in self.players}
        self.hands = {p.id: [] for p in self.players}
        self.current_trick = None

        for _ in range(4):
            for pl in self.players:
                if self.deck:
                    self.hands[pl.id].append(self.deck.pop(0))

        if initial or not self.last_trick_winner_id:
            self.turn_idx = (self.dealer_idx + 1) % len(self.players)
        else:
            self.turn_idx = self._player_index(self.last_trick_winner_id)
        self._refresh_deadline()

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    def _player_index(self, player_id: str) -> int:
        for idx, player in enumerate(self.players):
            if player.id == player_id:
                return idx
        raise ValueError("Unknown player")

    def current_player_id(self) -> Optional[str]:
        if not self.players:
            return None
        return self.players[self.turn_idx].id

    def _refresh_deadline(self):
        if not self.round_active:
            self.turn_deadline = None
            return
        timeout = self.config.turn_timeout_sec
        self.turn_deadline = time.time() + timeout if timeout else None

    def _check_timeout(self):
        if not self.round_active or not self.turn_deadline:
            return
        if time.time() <= self.turn_deadline:
            return
        offender = self.current_player_id()
        if not offender:
            return
        penalties = {p.id: 0 for p in self.players}
        penalties[offender] = 6
        self.round_summary = {p.id: 0 for p in self.players}
        self._finalize_round(penalties)

    def _beats(self, a: Card, b: Card) -> bool:
        if a.suit == b.suit:
            return RANK_STRENGTH[a.rank] > RANK_STRENGTH[b.rank]
        if a.suit == self.trump and b.suit != self.trump:
            return True
        return False

    def _cards_fully_beat(self, challenger: Iterable[Card], owner_cards: Iterable[Card]) -> bool:
        challenger_cards = list(challenger)
        remaining = challenger_cards.copy()
        for owner_card in owner_cards:
            idx = next((i for i, card in enumerate(remaining) if self._beats(card, owner_card)), None)
            if idx is None:
                return False
            remaining.pop(idx)
        return True

    def _draw_up_from_deck(self, winner_id: str):
        if not self.deck:
            return
        start_idx = self._player_index(winner_id)
        total_players = len(self.players)
        for offset in range(total_players):
            pid = self.players[(start_idx + offset) % total_players].id
            while len(self.hands[pid]) < 4 and self.deck:
                self.hands[pid].append(self.deck.pop(0))

    def _round_finished(self) -> bool:
        return all(len(hand) == 0 for hand in self.hands.values()) and not self.deck

    def _calculate_round_result(self) -> Dict[str, int]:
        return {
            pid: sum(CARD_POINTS.get(card.rank, 0) for card in cards)
            for pid, cards in self.taken_cards.items()
        }

    def _finalize_round(self, penalties: Dict[str, int]):
        for pid, value in penalties.items():
            self.scores[pid] = self.scores.get(pid, 0) + value
        self.round_active = False
        self.current_trick = None
        self.turn_deadline = None
        self.match_over = any(score >= 12 for score in self.scores.values())
        if self.match_over:
            self.losers = [pid for pid, score in self.scores.items() if score >= 12]
            self.winners = [pid for pid in self.scores.keys() if pid not in self.losers]
            self.winner_id = self.winners[0] if len(self.winners) == 1 else None
            self.started = False
            return
        self.winner_id = None
        self._start_new_round(initial=False)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def declare_combination(self, player_id: str, combo_key: str):
        self._check_timeout()
        if not self.round_active:
            raise ValueError("Round is not active")
        if self.current_trick is not None:
            raise ValueError("Cannot declare after trick has started")
        if combo_key not in COMBINATION_NAMES:
            raise ValueError("Unknown combination")
        if combo_key == "four_ends" and not self.config.enable_four_ends:
            raise ValueError("Combination not enabled")
        allowed = self.declared_combos.setdefault(player_id, set())
        if combo_key in allowed:
            raise ValueError("Combination already declared")
        cards = self._find_combination_cards(player_id, combo_key)
        if not cards:
            raise ValueError("Combination cards not present")
        announcement = Announcement(player_id=player_id, combo=combo_key, cards=cards)
        self.announcements.append(announcement)
        allowed.add(combo_key)

    def _find_combination_cards(self, player_id: str, combo_key: str) -> List[Card]:
        hand = list(self.hands.get(player_id) or [])
        if not hand:
            return []
        if combo_key == "bura" and self.trump:
            trumps = [card for card in hand if card.suit == self.trump]
            if len(trumps) >= 4:
                return trumps[:4]
            return []
        if combo_key == "molodka":
            for suit in SUITS:
                same_suit = [card for card in hand if card.suit == suit]
                if len(same_suit) >= 4:
                    return same_suit[:4]
            return []
        if combo_key == "moscow":
            aces = [card for card in hand if card.rank == 14]
            if len(aces) >= 3 and any(card.suit == self.trump for card in aces):
                return aces[:3]
            return []
        if combo_key == "four_ends":
            tens = [card for card in hand if card.rank == 10]
            if len(tens) == 4:
                return tens
            aces = [card for card in hand if card.rank == 14]
            if len(aces) == 4:
                return aces
            return []
        return []

    def play(self, player_id: str, cards_payload: List[dict | Card]):
        self._check_timeout()
        if not self.started or not self.round_active:
            raise ValueError("Round not active")
        if player_id != self.current_player_id():
            raise ValueError("Not your turn")
        if not isinstance(cards_payload, list) or not cards_payload:
            raise ValueError("Must play one or more cards")

        hand = self.hands.get(player_id, [])
        cards = [card if isinstance(card, Card) else Card.model_validate(card) for card in cards_payload]

        for card in cards:
            if not any(c.suit == card.suit and c.rank == card.rank for c in hand):
                raise ValueError("Card not in hand")

        if self.current_trick is None:
            if len(cards) not in (1, 2, 3):
                raise ValueError("Leader must play 1, 2 or 3 cards")
            if len({card.suit for card in cards}) != 1:
                raise ValueError("Leader cards must share suit")
            min_available = min(len(self.hands[p.id]) for p in self.players)
            if len(cards) > min_available:
                raise ValueError("Other players do not have enough cards")
            self.current_trick = _TrickInternal(
                leader_id=player_id,
                required_count=len(cards),
                owner_id=player_id,
                owner_cards=list(cards),
            )
            self.current_trick.plays.append(TrickPlay(player_id=player_id, cards=list(cards), outcome="lead"))
        else:
            trick = self.current_trick
            if len(cards) != trick.required_count:
                raise ValueError("Must play the required number of cards")
            if self._cards_fully_beat(cards, trick.owner_cards):
                trick.captured_cards.extend(trick.owner_cards)
                trick.owner_id = player_id
                trick.owner_cards = list(cards)
                trick.plays.append(TrickPlay(player_id=player_id, cards=list(cards), outcome="beat"))
            else:
                self.discard_pile.extend(cards)
                trick.plays.append(TrickPlay(player_id=player_id, cards=list(cards), outcome="discard"))

        for card in cards:
            idx = next(i for i, owned in enumerate(hand) if owned.suit == card.suit and owned.rank == card.rank)
            hand.pop(idx)

        self.turn_idx = (self.turn_idx + 1) % len(self.players)

        if self.current_trick and len(self.current_trick.plays) == len(self.players):
            self._complete_trick()
        else:
            self._refresh_deadline()

    def _complete_trick(self):
        trick = self.current_trick
        if not trick:
            return
        winner_id = trick.owner_id
        cards_for_winner = trick.captured_cards + trick.owner_cards
        self.taken_cards[winner_id].extend(cards_for_winner)
        self.last_trick_winner_id = winner_id
        self.current_trick = None
        self.turn_idx = self._player_index(winner_id)
        self._draw_up_from_deck(winner_id)
        if self._round_finished():
            points = self._calculate_round_result()
            self.round_summary = points
            penalties = self._calculate_penalties(points)
            self._finalize_round(penalties)
        else:
            self._refresh_deadline()

    def _calculate_penalties(self, points: Dict[str, int]) -> Dict[str, int]:
        if not points:
            return {p.id: 0 for p in self.players}
        max_points = max(points.values()) if points else 0
        leaders = [pid for pid, value in points.items() if value == max_points]
        penalties: Dict[str, int] = {}
        for player in self.players:
            pid = player.id
            value = points.get(pid, 0)
            if pid in leaders:
                penalties[pid] = 0
            elif value == 31:
                penalties[pid] = 2
            elif value == 0:
                penalties[pid] = 6
            else:
                penalties[pid] = 4
        return penalties

    def to_state(self, me_id: Optional[str]) -> GameState:
        self._check_timeout()
        trick_public = self.current_trick.to_public() if self.current_trick else None
        discard_cards = list(self.discard_pile) if self.config.discard_visibility == "open" else []
        hands = self.hands.get(me_id)
        return GameState(
            room_id=self.id,
            room_name=self.name,
            started=self.started,
            variant=self.variant,
            config=self.config,
            players=self.players,
            me=next((p for p in self.players if p.id == me_id), None),
            trump=self.trump,
            trump_card=self.trump_card,
            table_cards=[card for play in (trick_public.plays if trick_public else []) for card in play.cards],
            deck_count=len(self.deck),
            hands=list(hands) if hands is not None else None,
            turn_player_id=self.players[self.turn_idx].id if self.players and self.round_active else None,
            winner_id=self.winner_id,
            scores=self.scores,
            trick=trick_public,
            discard_pile=discard_cards,
            discard_count=len(self.discard_pile),
            taken_counts={pid: len(cards) for pid, cards in self.taken_cards.items()},
            round_points=dict(self.round_summary),
            announcements=list(self.announcements),
            turn_deadline_ts=self.turn_deadline,
            round_number=self.round_number,
            match_over=self.match_over,
            winners=list(self.winners),
            losers=list(self.losers),
            last_trick_winner_id=self.last_trick_winner_id,
        )


ROOMS: Dict[str, Room] = {}


def list_variants() -> List[GameVariant]:
    return list(VARIANTS.values())


def list_rooms_summary():
    res = []
    for r in ROOMS.values():
        payload = {
            "room_id": r.id,
            "name": r.name,
            "variant": r.variant.model_dump(),
            "players": len(r.players),
            "players_max": r.config.max_players if r.config else r.variant.players_max,
            "started": r.started,
        }
        if r.config:
            payload["config"] = r.config.model_dump(by_alias=True)
        res.append(payload)
    return res


VARIANTS: Dict[str, GameVariant] = {
    "classic_3p": GameVariant(
        key="classic_3p",
        title="Классика (3 игрока)",
        players_min=3,
        players_max=3,
        description="36 карт, игра до 12 штрафных очков.",
    ),
    "classic_2p": GameVariant(
        key="classic_2p",
        title="Классика (2 игрока)",
        players_min=2,
        players_max=2,
        description="Дуэльная Бура: добор до 4 карт после каждой взятки.",
    ),
    "with_sevens": GameVariant(
        key="with_sevens",
        title="С семёрками (3 игрока)",
        players_min=3,
        players_max=3,
        description="Экспериментальные правила с семёрками.",
    ),
    "with_draw": GameVariant(
        key="with_draw",
        title="Свободный стол (2–4 игрока)",
        players_min=2,
        players_max=4,
        description="Настраиваемый стол с добором до 4 карт.",
    ),
}
