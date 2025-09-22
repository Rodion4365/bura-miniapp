export type Suit = '♠'|'♥'|'♦'|'♣'
export type Card = { suit: Suit; rank: number }
export type DiscardVisibility = 'open'|'faceDown'
export type TableConfig = {
  maxPlayers: 2|3|4
  discardVisibility: DiscardVisibility
  enableFourEnds: boolean
  turnTimeoutSec: 30|40|50|60
}
export type Variant = { key: string; title: string; players_min: number; players_max: number; description: string }
export type Player = { id: string; name: string; avatar_url?: string; seat?: number }
export type GameState = {
  room_id: string
  room_name: string
  started: boolean
  variant?: Variant
  config?: TableConfig
  players: Player[]
  me?: Player
  trump?: Suit
  trump_card?: Card
  table_cards: Card[]
  deck_count: number
  hands?: Card[]
  turn_player_id?: string
  winner_id?: string
  scores?: Record<string, number>
}
