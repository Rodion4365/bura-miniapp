import React from 'react'
import type { Card } from '../types'

function suitIcon(s: string){
  // простые иконки мастей (можно заменить на SVG)
  if (s === '♠') return '♠'
  if (s === '♥') return '♥'
  if (s === '♦') return '♦'
  if (s === '♣') return '♣'
  return s
}

function rankText(r: number){
  if (r === 11) return 'J'
  if (r === 12) return 'Q'
  if (r === 13) return 'K'
  if (r === 14) return 'A'
  return String(r)
}

export default function TableView({
  table,
  trump,
  trumpCard,
  opponents = 1,
}:{
  table: Card[] | undefined
  trump: string | undefined
  trumpCard: Card | undefined
  opponents?: number
}){
  return (
    <div className="board">
      {/* ВЕРХНЯЯ РАССТАНОВКА (оппоненты, рубашки) */}
      <div className="opponents">
        {Array.from({length: opponents}).map((_,i)=>(
          <div key={i} className="opponent-slot">
            <div className="card-back"></div>
            <div className="card-back"></div>
            <div className="card-back"></div>
          </div>
        ))}
      </div>

      {/* СТОЛ */}
      <div className="table-center">
        <div className="table-cards">
          {(table || []).map((c, idx)=>(
            <div key={idx} className="card on-table">
              <div className="rank">{rankText(c.rank)}</div>
              <div className={`suit ${['♥','♦'].includes(c.suit) ? 'red' : ''}`}>{suitIcon(c.suit)}</div>
            </div>
          ))}
          {(table?.length ?? 0) === 0 && (
            <div className="badge">Ходите!</div>
          )}
        </div>

        {/* КОЗЫРЬ — фиксированная большая иконка */}
        <div className="trump">
          <div className="trump-title">Козырь</div>
          {trumpCard ? (
            <div className="card trump-card">
              <div className="rank">{rankText(trumpCard.rank)}</div>
              <div className={`suit ${['♥','♦'].includes(trumpCard.suit) ? 'red' : ''}`}>{suitIcon(trumpCard.suit)}</div>
            </div>
          ) : (
            <div className="card trump-card ghost">?</div>
          )}
        </div>
      </div>
    </div>
  )
}
