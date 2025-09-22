export type Suit = '♠'|'♥'|'♦'|'♣'
export type Card = { suit: Suit; rank: number }
export type TrickPlayOutcome = 'lead'|'beat'|'discard'
export type TrickPlay = { player_id: string; cards: Card[]; outcome: TrickPlayOutcome }
export type TrickState = { leader_id: string; owner_id: string; required_count: number; plays: TrickPlay[] }
export type Announcement = { player_id: string; combo: 'bura'|'molodka'|'moscow'|'four_ends'; cards: Card[] }
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
  trick?: TrickState
  discard_pile?: Card[]
  discard_count?: number
  taken_counts?: Record<string, number>
  round_points?: Record<string, number>
  announcements?: Announcement[]
  turn_deadline_ts?: number
  round_number?: number
  match_over?: boolean
  winners?: string[]
  losers?: string[]
  last_trick_winner_id?: string
}
