from __future__ import annotations
from typing import List, Literal, Optional
from pydantic import BaseModel

Suit = Literal["♠","♥","♦","♣"]

class Card(BaseModel):
    suit: Suit
    rank: int  # 6..14 (11=J,12=Q,13=K,14=A)

class Player(BaseModel):
    id: str
    name: str
    avatar_url: Optional[str] = None
    seat: Optional[int] = None

class GameVariant(BaseModel):
    key: Literal["classic_3p","classic_2p","with_sevens","with_draw"]
    title: str
    players_min: int
    players_max: int
    description: str

class CreateGameRequest(BaseModel):
    variant_key: GameVariant.__annotations__["key"]
    room_name: str

class JoinGameRequest(BaseModel):
    room_id: str

class Action(BaseModel):
    type: Literal["play","cover","discard","pass"]
    card: Optional[Card] = None

class GameState(BaseModel):
    room_id: str
    room_name: str
    started: bool
    variant: GameVariant
    players: List[Player]
    me: Optional[Player]
    trump: Optional[Suit]
    trump_card: Optional[Card]
    table_cards: List[Card]
    deck_count: int
    hands: Optional[List[Card]] = None
    turn_player_id: Optional[str] = None
    winner_id: Optional[str] = None
