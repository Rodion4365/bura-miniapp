import React from 'react'

export default function MainMenu({
  onNewGame,
  onJoin,
  onShowRules
}:{
  onNewGame: ()=>void
  onJoin: ()=>void
  onShowRules: ()=>void
}) {
  return (
    <div className="menu-wrap">
      <h1 className="menu-title">Бура</h1>
      <div className="menu-actions">
        <button className="btn-xl primary" onClick={onNewGame}>Новая игра</button>
        <button className="btn-xl" onClick={onJoin}>Присоединиться</button>
        <button className="btn-xl ghost" onClick={onShowRules}>Правила</button>
      </div>
      <p className="menu-note">Выберите действие: создать стол, присоединиться к существующему или изучить правила.</p>
    </div>
  )
}
