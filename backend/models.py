from __future__ import annotations
from typing import Dict, List, Literal, Optional
from pydantic import BaseModel, Field, ConfigDict

Suit = Literal["♠","♥","♦","♣"]

class Card(BaseModel):
    suit: Suit
    rank: int  # 6..14 (11=J,12=Q,13=K,14=A)


class PublicCard(BaseModel):
    suit: Optional[Suit] = None
    rank: Optional[int] = None
    hidden: bool = False

    @classmethod
    def hidden_card(cls) -> "PublicCard":
        return cls(hidden=True)

class Player(BaseModel):
    id: str
    name: str
    avatar_url: Optional[str] = None
    seat: Optional[int] = None

class GameVariant(BaseModel):
    key: Literal["classic_3p","classic_2p","with_sevens","with_draw", "custom"]
    title: str
    players_min: int
    players_max: int
    description: str


class TableConfig(BaseModel):
    max_players: Literal[2, 3, 4] = Field(3, alias="maxPlayers")
    discard_visibility: Literal["open", "faceDown"] = Field("open", alias="discardVisibility")
    enable_four_ends: bool = Field(True, alias="enableFourEnds")
    turn_timeout_sec: Literal[30, 40, 50, 60] = Field(40, alias="turnTimeoutSec")

    model_config = ConfigDict(populate_by_name=True, extra="ignore")

class CreateGameRequest(BaseModel):
    room_name: str
    variant_key: Optional[GameVariant.__annotations__["key"]] = None
    config: Optional[TableConfig] = None

    model_config = ConfigDict(populate_by_name=True, extra="ignore")

class JoinGameRequest(BaseModel):
    room_id: str

class Action(BaseModel):
    type: Literal["play","cover","discard","pass"]
    card: Optional[Card] = None


class TrickPlay(BaseModel):
    player_id: str
    seat: int
    cards: List[PublicCard]
    outcome: Literal["lead", "beat", "partial", "discard"]
    owner: bool = False


class TrickState(BaseModel):
    leader_id: str
    leader_seat: int
    owner_id: str
    owner_seat: int
    required_count: int
    trick_index: int
    plays: List[TrickPlay] = Field(default_factory=list)


class Announcement(BaseModel):
    player_id: str
    combo: Literal["bura", "molodka", "moscow", "four_ends"]
    cards: List[Card]

class GameState(BaseModel):
    room_id: str
    room_name: str
    started: bool
    variant: GameVariant
    config: Optional[TableConfig] = None
    players: List[Player]
    me: Optional[Player]
    trump: Optional[Suit]
    trump_card: Optional[Card]
    table_cards: List[PublicCard]
    deck_count: int
    hands: Optional[List[Card]] = None
    hand_counts: Dict[str, int] = Field(default_factory=dict)
    turn_player_id: Optional[str] = None
    winner_id: Optional[str] = None
    scores: Dict[str, int] = Field(default_factory=dict)
    trick: Optional[TrickState] = None
    discard_pile: List[Card] = Field(default_factory=list)
    discard_count: int = 0
    taken_counts: Dict[str, int] = Field(default_factory=dict)
    round_points: Dict[str, int] = Field(default_factory=dict)
    announcements: List[Announcement] = Field(default_factory=list)
    turn_deadline_ts: Optional[float] = None
    round_number: int = 0
    round_id: Optional[str] = None
    match_over: bool = False
    winners: List[str] = Field(default_factory=list)
    losers: List[str] = Field(default_factory=list)
    last_trick_winner_id: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True, extra="ignore")
