import { Card } from '../types'
import CardView from './Card'
export default function Hand({ cards, onPlay }: { cards: Card[]; onPlay: (c: Card) => void }) {
  const sorted = [...(cards||[])].sort((a,b)=> a.suit===b.suit ? a.rank-b.rank : a.suit.localeCompare(b.suit))
  return <div className="hand">{sorted.map((c,i)=>(<CardView key={i} card={c} onClick={()=>onPlay(c)} />))}</div>
}
