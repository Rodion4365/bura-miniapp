from __future__ import annotations
import random
from typing import Dict, List, Optional
from models import Card, GameVariant, Player, GameState, TableConfig

SUITS = ["♠","♥","♦","♣"]
RANKS = [6,7,8,9,10,11,12,13,14]

VARIANTS: Dict[str, GameVariant] = {
    "classic_3p": GameVariant(key="classic_3p", title="Классика (3 игрока)", players_min=3, players_max=3,
                              description="36 карт, козырь последняя карта. Игроки добирают до 3 карт."),
    "classic_2p": GameVariant(key="classic_2p", title="Классика (2 игрока)", players_min=2, players_max=2,
                              description="36 карт, на двоих. Добор до 3 карт."),
    "with_sevens": GameVariant(key="with_sevens", title="С семёрками (3 игрока)", players_min=3, players_max=3,
                              description="Особые правила для 7 в колоде."),
    "with_draw": GameVariant(key="with_draw", title="С добором (2–4 игрока)", players_min=2, players_max=4,
                              description="Гибка версия с добором из колоды до 3 карт."),
}

class Room:
    def __init__(self, room_id: str, room_name: str, variant: GameVariant, config: Optional[TableConfig] = None):
        self.id = room_id
        self.name = room_name
        self.variant = variant
        self.config = config
        self.players: List[Player] = []
        self.started = False
        self.deck: List[Card] = []
        self.trump: Optional[str] = None
        self.trump_card: Optional[Card] = None
        self.hands: Dict[str, List[Card]] = {}
        self.table: List[Card] = []
        self.turn_idx: int = 0
        self.winner_id: Optional[str] = None
        self.scores: Dict[str, int] = {}

    def add_player(self, p: Player):
        if self.started:
            raise ValueError("Game already started")
        if any(x.id == p.id for x in self.players):
            return
        max_players = self.config.max_players if self.config else self.variant.players_max
        if len(self.players) >= max_players:
            raise ValueError("Room full")
        p.seat = len(self.players)
        self.players.append(p)
        self.hands.setdefault(p.id, [])
        self.scores.setdefault(p.id, 0)

    def remove_player(self, player_id: str):
        self.players = [p for p in self.players if p.id != player_id]
        self.hands.pop(player_id, None)
        self.scores.pop(player_id, None)
        if self.players:
            self.turn_idx %= len(self.players)
        else:
            self.started = False

    def start(self):
        if self.started:
            return
        min_players = self.variant.players_min
        if self.config:
            min_players = min(min_players, self.config.max_players)
            min_players = max(2, min_players)
        if len(self.players) < min_players:
            raise ValueError("Not enough players")
        self.deck = [Card(suit=s, rank=r) for s in SUITS for r in RANKS]
        random.shuffle(self.deck)
        self.trump_card = self.deck[-1]
        self.trump = self.trump_card.suit
        for pl in self.players:
            self.hands[pl.id] = []
        for _ in range(3):
            for pl in self.players:
                if self.deck:
                    self.hands[pl.id].append(self.deck.pop(0))
        self.started = True
        self.turn_idx = 0
        self.table.clear()

    def to_state(self, me_id: Optional[str]) -> GameState:
        return GameState(
            room_id=self.id, room_name=self.name, started=self.started, variant=self.variant,
            config=self.config,
            players=self.players, me=next((p for p in self.players if p.id == me_id), None),
            trump=self.trump, trump_card=self.trump_card, table_cards=list(self.table),
            deck_count=len(self.deck), hands=self.hands.get(me_id),
            turn_player_id=self.players[self.turn_idx].id if self.started and self.players else None,
            winner_id=self.winner_id,
            scores=self.scores,
        )

    def current_player_id(self) -> Optional[str]:
        if not self.players:
            return None
        return self.players[self.turn_idx].id

    def _beats(self, a: Card, b: Card) -> bool:
        if a.suit == b.suit and a.rank > b.rank: return True
        if a.suit == self.trump and b.suit != self.trump: return True
        return False

    def play(self, pid: str, card: Card):
        if pid != self.current_player_id(): raise ValueError("Not your turn")
        hand = self.hands.get(pid, [])
        for i,c in enumerate(hand):
            if c.suit == card.suit and c.rank == card.rank:
                self.table.append(hand.pop(i))
                self.turn_idx = (self.turn_idx + 1) % len(self.players)
                return
        raise ValueError("Card not in hand")

    def cover(self, pid: str, card: Card):
        if pid != self.current_player_id(): raise ValueError("Not your turn")
        if not self.table: raise ValueError("Nothing to cover")
        last = self.table[-1]
        if not self._beats(card, last): raise ValueError("Card does not cover")
        hand = self.hands.get(pid, [])
        for i,c in enumerate(hand):
            if c.suit == card.suit and c.rank == card.rank:
                self.table.append(hand.pop(i))
                self.turn_idx = (self.turn_idx + 1) % len(self.players)
                return
        raise ValueError("Card not in hand")

    def draw_up(self):
        for pl in self.players:
            while len(self.hands[pl.id]) < 3 and self.deck:
                self.hands[pl.id].append(self.deck.pop(0))

    def discard(self, pid: Optional[str] = None):
        if pid and pid != self.current_player_id():
            raise ValueError("Not your turn")
        self.table.clear()

    def pass_turn(self, pid: Optional[str] = None):
        if pid and pid != self.current_player_id():
            raise ValueError("Not your turn")
        if not self.players:
            return
        self.turn_idx = (self.turn_idx + 1) % len(self.players)

ROOMS: Dict[str, Room] = {}

def list_variants(): return list(VARIANTS.values())

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
