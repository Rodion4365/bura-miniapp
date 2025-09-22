import { useEffect, useMemo, useState } from 'react'
import { listVariants, createGame } from '../api'
import type { Variant } from '../api'

export default function VariantSelector({
  headers,
  onCreated
}:{
  headers: Record<string,string>
  onCreated: (room_id: string)=>void
}) {
  const [variants, setVariants] = useState<Variant[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [variantKey, setVariantKey] = useState('')
  const [roomName, setRoomName]   = useState(() => `Стол #${Math.floor(Math.random()*1000)}`)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const v = await listVariants()
        if (!cancelled) {
          setVariants(v)
          // выбрать первую по умолчанию
          if (v.length && !variantKey) setVariantKey(v[0].key)
        }
      } catch (e:any) {
        if (!cancelled) setError(e?.message || 'Не удалось загрузить варианты')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const canCreate = useMemo(() => {
    return !loading && !!variantKey && !!roomName.trim()
  }, [loading, variantKey, roomName])

  async function onCreateClick() {
    if (!canCreate) return
    setLoading(true)
    setError(null)
    try {
      const id = await createGame(variantKey, roomName.trim(), headers)
      onCreated(id) // ← важно: передаём id наверх, App переключит на комнату
    } catch (e:any) {
      console.error('createGame error:', e)
      setError(e?.message || 'Не удалось создать игру')
      alert(e?.message || 'Не удалось создать игру')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="create-form">
      <div className="form-row">
        <label className="label">Название стола</label>
        <input
          className="input"
          placeholder="Например: Быстрый матч"
          value={roomName}
          onChange={e=>setRoomName(e.target.value)}
        />
      </div>

      <div className="form-row">
        <label className="label">Вариант игры</label>
        <select
          className="input"
          value={variantKey}
          onChange={e=>setVariantKey(e.target.value)}
        >
          {variants.map(v=>(
            <option key={v.key} value={v.key}>
              {v.title} · {v.players_min}/{v.players_max}
            </option>
          ))}
        </select>
      </div>

      {error && <div className="badge warn">{error}</div>}

      <div className="form-actions">
        <button className="button primary" disabled={!canCreate} onClick={onCreateClick}>
          {loading ? 'Создаём…' : 'Создать игру'}
        </button>
      </div>
    </div>
  )
}
