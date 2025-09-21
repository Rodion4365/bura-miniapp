import React from 'react'
type Tab = { key: string; title: string }
export default function Tabs({ tabs, active, onChange }:{
  tabs: Tab[]; active: string; onChange: (key:string)=>void
}){
  return (
    <div className="tabs">
      {tabs.map(t => (
        <button key={t.key} className={`tab ${active===t.key ? 'active' : ''}`} onClick={()=>onChange(t.key)}>
          {t.title}
        </button>
      ))}
    </div>
  )
}
