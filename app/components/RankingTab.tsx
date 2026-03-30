'use client';

import React from 'react';
import type { ChartPoint, RankingPlayer } from '../lib/padelTypes';

type MyRankingSummary = {
  position: number;
  player: RankingPlayer;
} | null;

type ChartStats = {
  first: number;
  last: number;
  min: number;
  max: number;
  change: number;
} | null;

type ChartGeometry = {
  width: number;
  height: number;
  points: ChartPoint[];
  path: string;
  gridYs: number[];
};

type Props = {
  rankingPlayers: RankingPlayer[];
  myPlayerName: string;
  handleSelectMyPlayer: (name: string) => void;
  clearMyPlayer: () => void;
  myRankingSummary: MyRankingSummary;
  chartPlayerName: string;
  setSelectedChartPlayer: (name: string) => void;
  chartStats: ChartStats;
  chartGeometry: ChartGeometry;
};

function getStreakDisplay(streak: number) {
  if (!streak || Math.abs(streak) < 2) return null;

  const abs = Math.abs(streak);
  let level = Math.floor(abs / 2);
  if (level > 5) level = 5;

  const intensity =
    level === 1
      ? ''
      : level === 2
      ? '+'
      : level === 3
      ? '++'
      : level === 4
      ? '+++'
      : 'MAX';

  if (streak > 0) {
    return `W${streak} 🔥${intensity}`;
  } else {
    return `L${abs} 🧊${intensity}`;
  }
}

export default function RankingTab({
  rankingPlayers,
  myPlayerName,
  handleSelectMyPlayer,
  clearMyPlayer,
  myRankingSummary,
  chartPlayerName,
  setSelectedChartPlayer,
  chartStats,
  chartGeometry,
}: Props) {
  return (
    <div
      style={{
        background: 'white',
        borderRadius: 24,
        padding: '20px 14px 28px',
        border: '1px solid #e5e7eb',
        overflowX: 'auto',
        boxShadow: '0 8px 24px rgba(15, 23, 42, 0.04)',
      }}
    >
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Ranking</h2>
      </div>

      {myRankingSummary && (
        <div
          style={{
            marginBottom: 18,
            padding: 18,
            borderRadius: 20,
            background: '#1d4ed8',
            color: 'white',
          }}
        >
          <div style={{ fontWeight: 800 }}>
            #{myRankingSummary.position} en el ranking
          </div>

          <div style={{ marginTop: 8 }}>
            {Math.round(Number(myRankingSummary.player.display_rating))} pts
          </div>

          <div style={{ marginTop: 6 }}>
            {getStreakDisplay(myRankingSummary.player.current_win_streak) || '—'}
          </div>
        </div>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['#', 'Jugador', 'Puntos', 'PJ', 'G', 'P', '%', 'Racha'].map((label) => (
              <th key={label} style={{ padding: 10, textAlign: 'left' }}>
                {label}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {[...rankingPlayers]
            .sort((a, b) => b.display_rating - a.display_rating)
            .map((p, idx) => {
              const streakDisplay = getStreakDisplay(p.current_win_streak);

              return (
                <tr key={p.id}>
                  <td style={{ padding: 10 }}>{idx + 1}</td>

                  <td style={{ padding: 10 }}>{p.name}</td>

                  <td style={{ padding: 10 }}>
                    {Math.round(Number(p.display_rating))}
                  </td>

                  <td style={{ padding: 10 }}>{p.matches_played}</td>
                  <td style={{ padding: 10 }}>{p.wins}</td>
                  <td style={{ padding: 10 }}>{p.losses}</td>

                  <td style={{ padding: 10 }}>
                    {Number(p.win_pct).toFixed(2)}%
                  </td>

                  <td style={{ padding: 10 }}>
                    {streakDisplay || '—'}
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}
