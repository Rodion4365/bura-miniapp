import React from 'react'

export default function MainMenu({
  onNewGame,
  onJoin
}:{
  onNewGame: ()=>void
  onJoin: ()=>void
}) {
  return (
    <div className="menu-wrap">
      <h1 className="menu-title">Бура</h1>
      <div className="menu-actions">
        <button className="btn-xl primary" onClick={onNewGame}>Новая игра</button>
        <button className="btn-xl" onClick={onJoin}>Присоединиться</button>
      </div>
      <p className="menu-note">Выберите действие: создать стол или присоединиться к существующему</p>
    </div>
  )
}
