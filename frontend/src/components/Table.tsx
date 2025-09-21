import { Card } from '../types'
import CardView from './Card'
export default function TableView({ table, trump, trumpCard }:{ table: Card[]; trump?: string; trumpCard?: Card }){
  return (
    <div>
      <div className="row" style={{marginBottom:8}}>
        <div className="badge">Козырь: {trump || '—'}</div>
        {trumpCard && <div className="badge">{`${trumpCard.rank}${trumpCard.suit}`}</div>}
      </div>
      <div className="table">
        {table.map((c,i)=>(<CardView key={i} card={c} />))}
      </div>
    </div>
  )
}
