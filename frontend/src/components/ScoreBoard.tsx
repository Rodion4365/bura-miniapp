import React from 'react'
import type { PlayerTotals } from '../types'

type Props = { totals?: PlayerTotals[] }

export default function ScoreBoard({ totals }: Props) {
  if (!totals || totals.length === 0) return null
  return (
    <section className="scoreboard">
      <table>
        <thead>
          <tr>
            <th>Показатель</th>
            {totals.map(player => (
              <th key={player.player_id}>{player.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Счёт (игры)</td>
            {totals.map(player => (
              <td key={`score-${player.player_id}`}>{player.score}</td>
            ))}
          </tr>
          <tr>
            <td>Очки (раунд)</td>
            {totals.map(player => (
              <td key={`points-${player.player_id}`}>{player.points}</td>
            ))}
          </tr>
        </tbody>
      </table>
    </section>
  )
}
