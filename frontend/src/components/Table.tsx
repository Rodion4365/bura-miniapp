import React from 'react'
import type { Card } from '../types'
import CardView from './CardView'

type Pair = { a: Card; c?: Card }

export default function TableView({
  table,
  trump,
  trumpCard,
}:{
  table?: Pair[]
  trump?: string
  trumpCard?: Card
}) {
  const suitToEmoji: Record<string, string> = { S:'♠️', H:'♥️', D:'♦️', C:'♣️', s:'♠️', h:'♥️', d:'♦️', c:'♣️' }
  const trumpEmoji = trump ? (suitToEmoji[trump] ?? trump) : ''

  return (
    <div className="table-area">
      <div id="drop-zone" className="drop-zone" />
      <div className="pairs">
        {(table || []).map((p, idx)=>(
          <div className="pair" key={idx}>
            <CardView card={p.a} />
            {p.c ? <CardView card={p.c} /> : <div className="cover-slot" />}
          </div>
        ))}
      </div>

      <div className="trump-panel">
        <div className="trump-title">Козырь {trumpEmoji}</div>
        {trumpCard && <CardView card={trumpCard} />}
      </div>
    </div>
  )
}
