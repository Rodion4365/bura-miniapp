from __future__ import annotations

import random
import time
from collections import Counter
from dataclasses import dataclass, field
from typing import Dict, Iterable, List, Optional, Sequence
from typing import Literal

from models import (
    Announcement,
    BoardCard,
    BoardState,
    Card,
    GameState,
    GameVariant,
    Player,
    PlayerClock,
    PublicCard,
    PlayerTotals,
    TableConfig,
    TrickPlay,
    TrickState,
)

SUITS = ["♠", "♥", "♦", "♣"]
RANKS = [6, 7, 8, 9, 10, 11, 12, 13, 14]
RANK_IMAGE_CODES = {6: "6", 7: "7", 8: "8", 9: "9", 10: "0", 11: "J", 12: "Q", 13: "K", 14: "A"}
SUIT_IMAGE_CODES = {"♠": "S", "♣": "C", "♦": "D", "♥": "H"}

REVEAL_DELAY_SECONDS = 5
CARD_BACK_IMAGE_URL = "https://deckofcardsapi.com/static/img/back.png"

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


def _card_color(suit: str) -> Literal["red", "black"]:
    return "red" if suit in ("♥", "♦") else "black"


def _card_image_url(suit: str, rank: int) -> Optional[str]:
    suit_code = SUIT_IMAGE_CODES.get(suit)
    rank_code = RANK_IMAGE_CODES.get(rank)
    if not suit_code or not rank_code:
        return None
    return f"https://deckofcardsapi.com/static/img/{rank_code}{suit_code}.png"


def _make_deck() -> List[Card]:
    deck: List[Card] = []
    for suit in SUITS:
        for rank in RANKS:
            deck.append(
                Card(
                    id=f"c_{RANK_IMAGE_CODES[rank].lower()}{SUIT_IMAGE_CODES[suit].lower()}",
                    suit=suit,
                    rank=rank,
                    color=_card_color(suit),
                    image_url=_card_image_url(suit, rank),
                    back_image_url=CARD_BACK_IMAGE_URL,
                )
            )
    return deck


@dataclass
class _TrickPlayInternal:
    player_id: str
    seat: int
    cards: List[Card]
    outcome: Literal["lead", "beat", "partial", "discard"]
    owner: bool = False


@dataclass
class _TrickInternal:
    leader_id: str
    leader_seat: int
    required_count: int
    owner_id: str
    owner_seat: int
    owner_cards: List[Card]
    trick_index: int
    plays: List[_TrickPlayInternal] = field(default_factory=list)

    def to_public(self, *, viewer_id: Optional[str], discard_visibility: str) -> TrickState:
        plays: List[TrickPlay] = []
        for play in self.plays:
            show_cards = (
                discard_visibility == "open"
                or play.outcome in ("lead", "beat")
                or play.player_id == viewer_id
            )
            public_cards: List[PublicCard] = []
            for card in play.cards:
                if show_cards:
                    public_cards.append(
                        PublicCard(
                            cardId=card.id,
                            faceUp=True,
                            suit=card.suit,
                            rank=card.rank,
                            color=card.color,
                            imageUrl=card.image_url,
                        )
                    )
                else:
                    public_cards.append(PublicCard.hidden_card(card.id))
            plays.append(
                TrickPlay(
                    player_id=play.player_id,
                    seat=play.seat,
                    cards=public_cards,
                    outcome=play.outcome,
                    owner=play.owner,
                )
            )
        return TrickState(
            leader_id=self.leader_id,
            leader_seat=self.leader_seat,
            owner_id=self.owner_id,
            owner_seat=self.owner_seat,
            required_count=self.required_count,
            trick_index=self.trick_index,
            plays=plays,
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
        self.card_catalog: Dict[str, Card] = {}
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
        self.round_id: Optional[str] = None
        self.round_active: bool = False
        self.round_summary: Dict[str, int] = {}
        self.trick_index: int = 0
        self.reveal_snapshot: Optional[_TrickInternal] = None
        self.reveal_until_ts: Optional[float] = None
        self.pending_turn_resume: bool = False
        self.pending_round_start: bool = False

        self.winner_id: Optional[str] = None
        self.match_over: bool = False
        self.winners: List[str] = []
        self.losers: List[str] = []

        self.scores: Dict[str, int] = {}
        self.game_wins: Dict[str, int] = {}

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
        self.game_wins.setdefault(p.id, 0)

    def remove_player(self, player_id: str):
        self.players = [p for p in self.players if p.id != player_id]
        self.hands.pop(player_id, None)
        self.taken_cards.pop(player_id, None)
        self.scores.pop(player_id, None)
        self.declared_combos.pop(player_id, None)
        self.game_wins.pop(player_id, None)
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
        self.game_wins = {p.id: 0 for p in self.players}
        self._start_new_round(initial=True)

    def _start_new_round(self, *, initial: bool):
        if not self.players:
            return
        self.round_number += 1
        self.round_id = f"r_{self.round_number}"
        self.round_active = True
        base_deck = _make_deck()
        self.card_catalog = {card.id: card for card in base_deck}
        self.deck = list(base_deck)
        random.shuffle(self.deck)
        self.trump_card = self.deck[-1] if self.deck else None
        self.trump = self.trump_card.suit if self.trump_card else None
        self.discard_pile = []
        self.announcements = []
        self.declared_combos = {p.id: set() for p in self.players}
        self.taken_cards = {p.id: [] for p in self.players}
        self.hands = {p.id: [] for p in self.players}
        self.current_trick = None
        self.trick_index = 0
        self.reveal_snapshot = None
        self.reveal_until_ts = None
        self.pending_turn_resume = False
        self.pending_round_start = False

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

    def _player_seat(self, player_id: str) -> int:
        for player in self.players:
            if player.id == player_id:
                return player.seat or 0
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
        self._finalize_round(penalties, [])

    def _check_reveal(self):
        if self.reveal_until_ts is None:
            return
        if time.time() < self.reveal_until_ts:
            return
        self.reveal_until_ts = None
        self.reveal_snapshot = None
        if self.pending_round_start and not self.match_over:
            self.pending_round_start = False
            self._start_new_round(initial=False)
            return
        if self.pending_turn_resume and self.round_active:
            self.pending_turn_resume = False
            self._refresh_deadline()

    def _beats(self, a: Card, b: Card) -> bool:
        if a.suit == b.suit:
            return RANK_STRENGTH[a.rank] > RANK_STRENGTH[b.rank]
        if a.suit == self.trump and b.suit != self.trump:
            return True
        return False

    def _max_beat_count(self, challenger: Sequence[Card], owner_cards: Sequence[Card]) -> int:
        owner_list = list(owner_cards)
        challenger_list = list(challenger)
        used = [False] * len(challenger_list)

        def helper(owner_idx: int) -> int:
            if owner_idx >= len(owner_list):
                return 0
            best = helper(owner_idx + 1)
            owner_card = owner_list[owner_idx]
            for idx, card in enumerate(challenger_list):
                if used[idx]:
                    continue
                if self._beats(card, owner_card):
                    used[idx] = True
                    best = max(best, 1 + helper(owner_idx + 1))
                    used[idx] = False
            return best

        return helper(0)

    def _draw_up_from_deck(self, winner_id: str):
        if not self.deck:
            return
        start_idx = self._player_index(winner_id)
        total_players = len(self.players)
        while self.deck:
            drew_any = False
            for offset in range(total_players):
                if not self.deck:
                    break
                pid = self.players[(start_idx + offset) % total_players].id
                if len(self.hands[pid]) >= 4:
                    continue
                self.hands[pid].append(self.deck.pop(0))
                drew_any = True
            if not drew_any:
                break

    def _round_finished(self) -> bool:
        return all(len(hand) == 0 for hand in self.hands.values()) and not self.deck

    def _calculate_round_result(self) -> Dict[str, int]:
        return {
            pid: sum(CARD_POINTS.get(card.rank, 0) for card in cards)
            for pid, cards in self.taken_cards.items()
        }

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def declare_combination(self, player_id: str, combo_key: str):
        self._check_timeout()
        if not self.round_active:
            raise ValueError("Round is not active")
        if self.trick_index > 0 or self.current_trick is not None:
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

    def _is_valid_four_card_throw(self, cards: Sequence[Card]) -> bool:
        if len(cards) != 4:
            return False
        suits = {card.suit for card in cards}
        if len(suits) == 1:
            return True
        ranks = [card.rank for card in cards]
        rank_counts = Counter(ranks)
        tens = rank_counts.get(10, 0)
        aces = rank_counts.get(14, 0)
        other_ranks = set(rank_counts.keys()) - {10, 14}
        if other_ranks:
            return False
        if tens == 4 or aces == 4:
            return True
        if 0 < tens < 4 and 0 < aces < 4 and tens + aces == 4:
            return True
        return False

    def request_early_turn(self, player_id: str, suit: str, *, round_id: Optional[str] = None) -> List[Card]:
        self._check_timeout()
        self._check_reveal()
        if self.reveal_until_ts is not None:
            raise ValueError("Ожидайте завершения текущего розыгрыша")
        if not self.started or not self.round_active:
            raise ValueError("Round not active")
        if round_id is not None and self.round_id is not None and round_id != self.round_id:
            raise ValueError("Round mismatch")
        if player_id == self.current_player_id():
            raise ValueError("Already your turn")
        if self.current_trick is not None:
            raise ValueError("Cannot request during trick")
        if suit not in SUITS:
            raise ValueError("Unknown suit")
        hand = self.hands.get(player_id)
        if not hand:
            raise ValueError("Hand not available")
        same_suit = [card for card in hand if card.suit == suit]
        if len(same_suit) != 4:
            raise ValueError("Нужны ровно 4 карты выбранной масти")
        aces = sum(1 for card in same_suit if card.rank == 14)
        high_cards = sum(1 for card in same_suit if card.rank in (14, 10))
        if aces < 1:
            raise ValueError("В наборе должен быть хотя бы один туз")
        if high_cards < 3:
            raise ValueError("Требуются как минимум три туза или десятки")
        self.turn_idx = self._player_index(player_id)
        self._refresh_deadline()
        return same_suit

    def play_cards(
        self,
        player_id: str,
        cards_payload: List[dict | Card],
        *,
        round_id: Optional[str] = None,
        trick_index: Optional[int] = None,
    ):
        self._check_timeout()
        self._check_reveal()
        if self.reveal_until_ts is not None:
            raise ValueError("Ожидайте завершения текущего розыгрыша")
        if not self.started or not self.round_active:
            raise ValueError("Round not active")
        if player_id != self.current_player_id():
            raise ValueError("Not your turn")
        if round_id is not None and self.round_id is not None and round_id != self.round_id:
            raise ValueError("Round mismatch")
        if not isinstance(cards_payload, list) or not cards_payload:
            raise ValueError("Must play one or more cards")

        hand = self.hands.get(player_id, [])
        cards = [card if isinstance(card, Card) else Card.model_validate(card) for card in cards_payload]

        for card in cards:
            if not any(c.suit == card.suit and c.rank == card.rank for c in hand):
                raise ValueError("Card not in hand")

        seat = self._player_seat(player_id)

        if self.current_trick is None:
            if len(cards) == 4:
                if not self._is_valid_four_card_throw(cards):
                    raise ValueError("Нельзя скинуть выбранные 4 карты")
            else:
                if len(cards) not in (1, 2, 3):
                    raise ValueError("Leader must play 1, 2 or 3 cards")
                if len({card.suit for card in cards}) != 1:
                    raise ValueError("Leader cards must share suit")
            min_available = min(len(self.hands[p.id]) for p in self.players)
            if len(cards) > min_available:
                raise ValueError("Other players do not have enough cards")
            self.trick_index += 1
            trick = _TrickInternal(
                leader_id=player_id,
                leader_seat=seat,
                required_count=len(cards),
                owner_id=player_id,
                owner_seat=seat,
                owner_cards=list(cards),
                trick_index=self.trick_index,
            )
            trick.plays.append(
                _TrickPlayInternal(
                    player_id=player_id,
                    seat=seat,
                    cards=list(cards),
                    outcome="lead",
                    owner=True,
                )
            )
            self.current_trick = trick
        else:
            trick = self.current_trick
            if trick_index is not None and trick_index != trick.trick_index:
                raise ValueError("Trick mismatch")
            if len(cards) != trick.required_count:
                raise ValueError("Must play the required number of cards")
            beat_count = self._max_beat_count(cards, trick.owner_cards)
            if beat_count == trick.required_count:
                outcome: Literal["beat", "partial", "discard"] = "beat"
                for play in trick.plays:
                    play.owner = False
                trick.owner_id = player_id
                trick.owner_seat = seat
                trick.owner_cards = list(cards)
                owner_flag = True
            elif beat_count > 0:
                outcome = "partial"
                owner_flag = False
            else:
                outcome = "discard"
                owner_flag = False
            trick.plays.append(
                _TrickPlayInternal(
                    player_id=player_id,
                    seat=seat,
                    cards=list(cards),
                    outcome=outcome,
                    owner=owner_flag,
                )
            )

        for card in cards:
            idx = next(i for i, owned in enumerate(hand) if owned.suit == card.suit and owned.rank == card.rank)
            hand.pop(idx)

        self.turn_idx = (self.turn_idx + 1) % len(self.players)

        if self.current_trick and len(self.current_trick.plays) == len(self.players):
            self._complete_trick()
        else:
            self._refresh_deadline()

    def play(self, player_id: str, cards_payload: List[dict | Card]):
        self.play_cards(player_id, cards_payload)

    def _complete_trick(self):
        trick = self.current_trick
        if not trick:
            return
        winner_id = trick.owner_id
        cards_for_winner = [card for play in trick.plays for card in play.cards]
        self.taken_cards[winner_id].extend(cards_for_winner)
        self.discard_pile.extend(cards_for_winner)
        self.last_trick_winner_id = winner_id
        self.reveal_snapshot = trick
        self.reveal_until_ts = time.time() + REVEAL_DELAY_SECONDS
        self.current_trick = None
        self.turn_idx = self._player_index(winner_id)
        self._draw_up_from_deck(winner_id)
        self.turn_deadline = None
        if self._round_finished():
            points = self._calculate_round_result()
            self.round_summary = points
            penalties, leaders = self._calculate_penalties(points)
            self._finalize_round(penalties, leaders)
        else:
            self.pending_turn_resume = True

    def _calculate_penalties(self, points: Dict[str, int]) -> tuple[Dict[str, int], List[str]]:
        if not points:
            return ({p.id: 0 for p in self.players}, [])
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
        return penalties, leaders

    def _finalize_round(self, penalties: Dict[str, int], leaders: List[str]):
        for pid, value in penalties.items():
            self.scores[pid] = self.scores.get(pid, 0) + value
        for pid in leaders:
            self.game_wins[pid] = self.game_wins.get(pid, 0) + 1
        self.round_active = False
        self.current_trick = None
        self.turn_deadline = None
        self.pending_turn_resume = False
        self.match_over = any(score >= 12 for score in self.scores.values())
        if self.match_over:
            self.losers = [pid for pid, score in self.scores.items() if score >= 12]
            self.winners = [pid for pid in self.scores.keys() if pid not in self.losers]
            self.winner_id = self.winners[0] if len(self.winners) == 1 else None
            self.pending_round_start = False
            self.started = False
            return
        self.winner_id = None
        self.pending_round_start = True

    def _collect_player_totals(self) -> List[PlayerTotals]:
        totals: List[PlayerTotals] = []
        for player in self.players:
            pid = player.id
            taken_cards = self.taken_cards.get(pid, [])
            points = sum(CARD_POINTS.get(card.rank, 0) for card in taken_cards)
            totals.append(
                PlayerTotals(
                    player_id=pid,
                    name=player.name,
                    score=self.game_wins.get(pid, 0),
                    points=points,
                )
            )
        return totals

    def to_state(self, me_id: Optional[str]) -> GameState:
        self._check_timeout()
        self._check_reveal()
        trick_source = self.current_trick
        reveal_active = False
        if trick_source is None and self.reveal_snapshot is not None and self.reveal_until_ts:
            trick_source = self.reveal_snapshot
            reveal_active = True
        trick_public = (
            trick_source.to_public(
                viewer_id=me_id,
                discard_visibility=self.config.discard_visibility,
            )
            if trick_source
            else None
        )
        discard_cards = list(self.discard_pile) if self.config.discard_visibility == "open" else []
        hands = self.hands.get(me_id)
        hand_counts = {pid: len(hand) for pid, hand in self.hands.items()}

        def _board_entry(card: PublicCard) -> BoardCard:
            catalog_card = self.card_catalog.get(card.card_id)
            return BoardCard(
                cardId=card.card_id,
                faceUp=card.face_up,
                suit=card.suit or (catalog_card.suit if catalog_card else None),
                rank=card.rank or (catalog_card.rank if catalog_card else None),
                color=card.color or (catalog_card.color if catalog_card else None),
                imageUrl=card.image_url or (catalog_card.image_url if catalog_card else None),
                backImageUrl=catalog_card.back_image_url if catalog_card else None,
            )

        board_state: Optional[BoardState] = None
        if trick_public and trick_public.plays:
            leader_play = next((play for play in trick_public.plays if play.outcome in ("lead", "beat")), trick_public.plays[0])
            defender_play = None
            if trick_public.plays and len(trick_public.plays) > 1:
                defender_play = next((play for play in trick_public.plays if play is not leader_play), None)
            attacker_cards = leader_play.cards if leader_play else []
            defender_cards = defender_play.cards if defender_play else []
            board_state = BoardState(
                attacker=[_board_entry(card) for card in attacker_cards],
                defender=[_board_entry(card) for card in defender_cards],
                reveal_until_ts=self.reveal_until_ts if reveal_active else None,
            )

        active_player_id = self.current_player_id() if self.round_active else None
        table_players = []
        now_ts = time.time()
        for player in self.players:
            is_active = bool(active_player_id == player.id and self.turn_deadline and not reveal_active)
            remaining = None
            if is_active and self.turn_deadline:
                remaining = max(0, int(self.turn_deadline - now_ts))
            table_players.append(
                PlayerClock(
                    player_id=player.id,
                    name=player.name,
                    turn_timer_sec=remaining,
                    is_active=is_active,
                )
            )

        cards_catalog = list(self.card_catalog.values())
        cards_catalog.sort(key=lambda c: c.id)

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
            hand_counts=hand_counts,
            turn_player_id=self.players[self.turn_idx].id if self.players and self.round_active else None,
            winner_id=self.winner_id,
            scores=self.scores,
            trick=trick_public,
            trick_index=self.trick_index,
            discard_pile=discard_cards,
            discard_count=len(self.discard_pile),
            taken_counts={pid: len(cards) for pid, cards in self.taken_cards.items()},
            round_points=dict(self.round_summary),
            announcements=list(self.announcements),
            turn_deadline_ts=self.turn_deadline,
            round_number=self.round_number,
            round_id=self.round_id,
            match_over=self.match_over,
            winners=list(self.winners),
            losers=list(self.losers),
            last_trick_winner_id=self.last_trick_winner_id,
            player_totals=self._collect_player_totals(),
            cards=cards_catalog,
            board=board_state,
            tablePlayers=table_players,
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