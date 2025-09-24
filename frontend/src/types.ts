export type Suit = '♠' | '♥' | '♦' | '♣'
export type CardColor = 'red' | 'black'

export type Card = {
  id: string
  suit: Suit
  rank: number
  color?: CardColor
  imageUrl?: string
  backImageUrl?: string
}

export type PublicCard = {
  cardId: string
  faceUp: boolean
  suit?: Suit
  rank?: number
  color?: CardColor
  imageUrl?: string
}

export type TrickPlayOutcome = 'lead' | 'beat' | 'partial' | 'discard'
export type TrickPlay = {
  player_id: string
  seat: number
  cards: PublicCard[]
  outcome: TrickPlayOutcome
  owner: boolean
}

export type TrickState = {
  leader_id: string
  leader_seat: number
  owner_id: string
  owner_seat: number
  required_count: number
  trick_index: number
  plays: TrickPlay[]
}

export type Announcement = {
  player_id: string
  combo: 'bura' | 'molodka' | 'moscow' | 'four_ends'
  cards: Card[]
}

export type DiscardVisibility = 'open' | 'faceDown'

export type TableConfig = {
  maxPlayers: 2 | 3 | 4
  discardVisibility: DiscardVisibility
  enableFourEnds: boolean
  turnTimeoutSec: 30 | 40 | 50 | 60
}

export type Variant = {
  key: string
  title: string
  players_min: number
  players_max: number
  description: string
}

export type Player = {
  id: string
  name: string
  avatar_url?: string
  seat?: number
}

export type BoardCard = {
  cardId: string
  faceUp: boolean
  suit?: Suit
  rank?: number
  color?: CardColor
  imageUrl?: string
  backImageUrl?: string
}

export type BoardState = {
  attacker: BoardCard[]
  defender: BoardCard[]
  revealUntilTs?: number
}

export type PlayerClock = {
  playerId: string
  name: string
  turnTimerSec?: number
  isActive?: boolean
}

export type PlayerTotals = {
  player_id: string
  name: string
  score: number
  points: number
}

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
  table_cards: PublicCard[]
  deck_count: number
  hands?: Card[]
  hand_counts?: Record<string, number>
  turn_player_id?: string
  winner_id?: string
  scores?: Record<string, number>
  trick?: TrickState
  trick_index?: number
  discard_pile?: Card[]
  discard_count?: number
  taken_counts?: Record<string, number>
  round_points?: Record<string, number>
  announcements?: Announcement[]
  turn_deadline_ts?: number
  round_number?: number
  round_id?: string
  match_over?: boolean
  winners?: string[]
  losers?: string[]
  last_trick_winner_id?: string
  player_totals?: PlayerTotals[]
  cards?: Card[]
  board?: BoardState
  tablePlayers?: PlayerClock[]
}
