import { useEffect, useState } from 'react'
import axios from 'axios'

type LeaderboardEntry = {
  rank: number
  playerId: string
  name: string
  avatarUrl?: string
  rating: number
  totalMatches: number
  wins: number
  losses: number
  winRate: number
}

export default function Leaderboard() {
  const [players, setPlayers] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        setLoading(true)
        const apiBase = import.meta.env.VITE_API_BASE || location.origin
        const response = await axios.get(`${apiBase}/api/players/leaderboard?limit=50`)
        setPlayers(response.data.players || [])
        setError(undefined)
      } catch (err) {
        console.error('[Leaderboard] Failed to fetch:', err)
        setError('Не удалось загрузить рейтинг')
      } finally {
        setLoading(false)
      }
    }

    fetchLeaderboard()
  }, [])

  if (loading) {
    return (
      <div className="leaderboard-container">
        <p className="loading-text">Загрузка рейтинга...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="leaderboard-container">
        <p className="error-text">{error}</p>
      </div>
    )
  }

  if (players.length === 0) {
    return (
      <div className="leaderboard-container">
        <p className="empty-text">Пока нет сыгранных матчей</p>
        <p className="empty-hint">Сыграйте первую игру, чтобы попасть в рейтинг!</p>
      </div>
    )
  }

  return (
    <div className="leaderboard-container">
      <table className="leaderboard-table">
        <thead>
          <tr>
            <th className="rank-col">#</th>
            <th className="name-col">Игрок</th>
            <th className="rating-col">Рейтинг</th>
            <th className="matches-col">Игры</th>
            <th className="wins-col">Побед</th>
            <th className="winrate-col">Винрейт</th>
          </tr>
        </thead>
        <tbody>
          {players.map((player) => (
            <tr key={player.playerId} className="leaderboard-row">
              <td className="rank-col">
                <span className={`rank-badge ${player.rank <= 3 ? `rank-${player.rank}` : ''}`}>
                  {player.rank}
                </span>
              </td>
              <td className="name-col">
                <div className="player-info">
                  {player.avatarUrl && (
                    <img src={player.avatarUrl} alt={player.name} className="player-avatar" />
                  )}
                  <span className="player-name">{player.name}</span>
                </div>
              </td>
              <td className="rating-col">
                <span className="rating-value">{player.rating}</span>
              </td>
              <td className="matches-col">{player.totalMatches}</td>
              <td className="wins-col">{player.wins}</td>
              <td className="winrate-col">
                <span className={`winrate ${player.winRate >= 60 ? 'high' : player.winRate >= 40 ? 'medium' : 'low'}`}>
                  {player.winRate.toFixed(1)}%
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
