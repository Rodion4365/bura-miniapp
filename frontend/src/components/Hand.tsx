import React, { useEffect, useRef } from 'react'
import type { Card } from '../types'
import CardView from './CardView'

export default function Hand({
  cards,
  onPlay
}:{
  cards: Card[],
  onPlay: (card: Card)=>void
}) {
  const containerRef = useRef<HTMLDivElement>(null)

  // лёгкая анимация «раздачи» при изменении состава руки
  useEffect(()=>{
    const el = containerRef.current
    if (!el) return
    el.classList.remove('deal-anim')
    // next tick
    const id = setTimeout(()=> el.classList.add('deal-anim'), 0)
    return ()=> clearTimeout(id)
  }, [cards.map(c=>c.suit+':'+c.rank).join(',')])

  // простой DnD на pointer-событиях
  function attachDrag(e: React.PointerEvent, card: Card) {
    const target = e.currentTarget as HTMLElement
    const ghost = target.cloneNode(true) as HTMLElement
    const rect = target.getBoundingClientRect()
    ghost.style.position = 'fixed'
    ghost.style.left = `${rect.left}px`
    ghost.style.top = `${rect.top}px`
    ghost.style.width = `${rect.width}px`
    ghost.style.height = `${rect.height}px`
    ghost.style.pointerEvents = 'none'
    ghost.style.zIndex = '9999'
    ghost.style.transform = 'scale(1.05)'
    ghost.style.opacity = '0.95'
    document.body.appendChild(ghost)

    let lastX = e.clientX, lastY = e.clientY
    let overDrop = false

    function onMove(ev: PointerEvent){
      lastX = ev.clientX; lastY = ev.clientY
      ghost.style.left = `${lastX - rect.width/2}px`
      ghost.style.top  = `${lastY - rect.height/2}px`

      const dz = document.getElementById('drop-zone')
      if (dz) {
        const dr = dz.getBoundingClientRect()
        const inside = lastX >= dr.left && lastX <= dr.right && lastY >= dr.top && lastY <= dr.bottom
        overDrop = inside
        dz.classList.toggle('drop-active', inside)
      }
    }
    function onUp(){
      document.removeEventListener('pointermove', onMove, true)
      document.removeEventListener('pointerup', onUp, true)
      const dz = document.getElementById('drop-zone')
      dz?.classList.remove('drop-active')
      ghost.remove()
      if (overDrop) onPlay(card)
    }

    document.addEventListener('pointermove', onMove, true)
    document.addEventListener('pointerup', onUp, true)
  }

  return (
    <div className="hand" ref={containerRef}>
      {cards.map((c, i)=>(
        <div
          key={`${c.suit}${c.rank}-${i}`}
          className="hand-card"
          style={{ animationDelay: `${i * 60}ms` }}
          onPointerDown={(e)=>attachDrag(e, c)}
          onClick={()=>onPlay(c)}
        >
          <CardView card={c} />
        </div>
      ))}
    </div>
  )
}
