export default function Controls({ onStart, onDraw }:{ onStart:()=>void; onDraw:()=>void }){
  return (
    <div className="row">
      <button className="button" onClick={onStart}>Старт</button>
      <button className="button secondary" onClick={onDraw}>Добор</button>
    </div>
  )}
