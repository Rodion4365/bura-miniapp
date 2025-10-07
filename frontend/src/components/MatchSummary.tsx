import type { GameState } from '../types'
import ScoreBoard from './ScoreBoard'

type Props = {
  state: GameState
  meId?: string
  onExit: () => void
}

function resolvePlayerName(state: GameState, playerId: string | undefined): string | undefined {
  if (!playerId) return undefined
  return state.players?.find(player => player.id === playerId)?.name
}

export default function MatchSummary({ state, meId, onExit }: Props) {
  const winners = state.winners ?? []
  const losers = state.losers ?? []
  const resolvedWinnerId = state.winner_id ?? (winners.length === 1 ? winners[0] : undefined)
  const meIsWinner = Boolean(meId && (resolvedWinnerId ? resolvedWinnerId === meId : winners.includes(meId)))

  let subtitle: string
  if (meIsWinner) {
    subtitle = 'Вы победили!'
  } else if (resolvedWinnerId) {
    const winnerName = resolvePlayerName(state, resolvedWinnerId) ?? 'победитель'
    subtitle = `Победил ${winnerName}`
  } else if (winners.length > 1) {
    const names = winners
      .map(id => resolvePlayerName(state, id))
      .filter((name): name is string => Boolean(name))
    subtitle = names.length > 0 ? `Победили: ${names.join(', ')}` : 'Победители определены'
  } else if (losers.length > 0) {
    const name = resolvePlayerName(state, losers[0]) ?? 'противник'
    subtitle = `Поражение для ${name}`
  } else {
    subtitle = 'Матч завершён'
  }

  const penaltyValues = (state.players ?? []).map(player => state.scores?.[player.id] ?? 0)
  const scoreLine = penaltyValues.length > 0 ? penaltyValues.join(':') : null

  const hasTotals = Boolean(state.player_totals && state.player_totals.length > 0)

  return (
    <div className="match-summary-screen">
      <div className="match-summary-card">
        <div className="match-summary-head">
          <h1 className="match-summary-title">Матч завершён</h1>
          <h2 className="match-summary-subtitle">{subtitle}</h2>
          {scoreLine && (
            <div className="match-summary-score">Со счётом: {scoreLine}</div>
          )}
          <p className="match-summary-note">12 штрафных очков — поражение.</p>
        </div>
        <button className="button primary match-summary-action" onClick={onExit}>
          Вернуться на главный экран
        </button>
        {hasTotals && (
          <div className="match-summary-table">
            <ScoreBoard totals={state.player_totals} />
          </div>
        )}
      </div>
    </div>
  )
}
