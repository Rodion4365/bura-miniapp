import { useMemo, useState } from 'react'
import { createGame, type DiscardVisibility, type TableConfig } from '../api'

type Props = {
  headers: Record<string, string>
  onCreated: (roomId: string) => void
}

const MAX_PLAYERS_OPTIONS: TableConfig['maxPlayers'][] = [2, 3, 4]
const DISCARD_OPTIONS: { value: DiscardVisibility; title: string; description: string }[] = [
  {
    value: 'open',
    title: 'Открытый сброс',
    description: 'Все игроки видят, какие карты ушли в сброс. Легче отслеживать разыгранные карты.'
  },
  {
    value: 'faceDown',
    title: 'Закрытый сброс',
    description: 'Карты уходят рубашкой вниз, видна только их численность. Усложняет чтение игры.'
  }
]
const TIMEOUT_OPTIONS: TableConfig['turnTimeoutSec'][] = [30, 40, 50, 60]

export default function CreateTableForm({ headers, onCreated }: Props) {
  const [roomName, setRoomName] = useState(() => `Стол #${Math.floor(Math.random() * 1000)}`)
  const [maxPlayers, setMaxPlayers] = useState<TableConfig['maxPlayers']>(3)
  const [discardVisibility, setDiscardVisibility] = useState<DiscardVisibility>('open')
  const [enableFourEnds, setEnableFourEnds] = useState(true)
  const [turnTimeoutSec, setTurnTimeoutSec] = useState<TableConfig['turnTimeoutSec']>(40)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const summary = useMemo(() => {
    const discardLabel = DISCARD_OPTIONS.find(o => o.value === discardVisibility)?.title ?? ''
    return `Максимум игроков: ${maxPlayers} · ${discardLabel.toLowerCase()} · ` +
      `${enableFourEnds ? 'Комбо «4 конца» включено' : 'Комбо «4 конца» отключено'} · ` +
      `Таймер хода: ${turnTimeoutSec} с`
  }, [maxPlayers, discardVisibility, enableFourEnds, turnTimeoutSec])

  const canCreate = useMemo(() => {
    return !!roomName.trim() && !loading
  }, [roomName, loading])

  async function handleCreate() {
    if (!canCreate) return
    setLoading(true)
    setError(null)
    const config: TableConfig = { maxPlayers, discardVisibility, enableFourEnds, turnTimeoutSec }
    try {
      const id = await createGame(roomName.trim(), config, headers)
      onCreated(id)
    } catch (e: unknown) {
      console.error('Failed to create table', e)
      const errorMessage = e instanceof Error ? e.message : 'Не удалось создать стол'
      setError(errorMessage)
      alert(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="create-form">
      <div className="form-row">
        <label className="label" htmlFor="room-name">Название стола</label>
        <input
          id="room-name"
          className="input"
          placeholder="Например: Вечерняя Бура"
          value={roomName}
          onChange={e => setRoomName(e.target.value)}
        />
      </div>

      <section className="settings-section">
        <h3 className="section-title">Настройки стола</h3>

        <div className="settings-grid">
          <fieldset className="settings-card">
            <legend>Максимум игроков</legend>
            <p className="settings-note">Игра длится до 12 штрафных очков. Добор по одной карте до 4 на руке.</p>
            <div className="options-row">
              {MAX_PLAYERS_OPTIONS.map(opt => (
                <label key={opt} className={`option-chip ${maxPlayers === opt ? 'active' : ''}`}>
                  <input
                    type="radio"
                    name="maxPlayers"
                    value={opt}
                    checked={maxPlayers === opt}
                    onChange={() => setMaxPlayers(opt)}
                  />
                  {opt}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="settings-card">
            <legend>Видимость сброса</legend>
            {DISCARD_OPTIONS.map(opt => (
              <label key={opt.value} className={`option-tile ${discardVisibility === opt.value ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="discardVisibility"
                  value={opt.value}
                  checked={discardVisibility === opt.value}
                  onChange={() => setDiscardVisibility(opt.value)}
                />
                <div className="option-title">{opt.title}</div>
                <div className="option-desc">{opt.description}</div>
              </label>
            ))}
          </fieldset>

          <fieldset className="settings-card">
            <legend>Комбинация «4 конца»</legend>
            <p className="settings-note">Четыре десятки или четыре туза. Можно отключить, если хотите играть без неё.</p>
            <label className="switch">
              <input
                type="checkbox"
                checked={enableFourEnds}
                onChange={e => setEnableFourEnds(e.target.checked)}
              />
              <span>{enableFourEnds ? 'Включена' : 'Отключена'}</span>
            </label>
          </fieldset>

          <fieldset className="settings-card">
            <legend>Таймер хода</legend>
            <p className="settings-note">Если игрок не уложился — раунд для него проигран (+6 штрафных).</p>
            <div className="options-row">
              {TIMEOUT_OPTIONS.map(opt => (
                <label key={opt} className={`option-chip ${turnTimeoutSec === opt ? 'active' : ''}`}>
                  <input
                    type="radio"
                    name="turnTimeout"
                    value={opt}
                    checked={turnTimeoutSec === opt}
                    onChange={() => setTurnTimeoutSec(opt)}
                  />
                  {opt} с
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </section>

      <div className="form-summary">
        <div className="summary-title">Итоговая конфигурация</div>
        <div className="summary-text">{summary}</div>
      </div>

      {error && <div className="badge warn">{error}</div>}

      <div className="form-actions">
        <button className="button primary" disabled={!canCreate} onClick={handleCreate}>
          {loading ? 'Создаём…' : 'Создать стол'}
        </button>
      </div>
    </div>
  )
}
