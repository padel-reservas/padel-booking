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
        padding: 24,
        border: '1px solid #e5e7eb',
        overflowX: 'auto',
        boxShadow: '0 8px 24px rgba(15, 23, 42, 0.04)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 18,
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 24 }}>Ranking</h2>
          <div style={{ marginTop: 6, color: '#64748b', fontSize: 14 }}>
            Puntos = ranking del sistema
          </div>
        </div>

        <div
          style={{
            padding: '8px 12px',
            borderRadius: 999,
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            color: '#334155',
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          {rankingPlayers.length} jugadores
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          alignItems: 'center',
          marginBottom: 18,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, color: '#334155' }}>¿Quién sos?</div>

        <select
          value={myPlayerName}
          onChange={(e) => handleSelectMyPlayer(e.target.value)}
          style={{
            padding: '10px 12px',
            borderRadius: 12,
            border: '1px solid #d1d5db',
            background: 'white',
            minWidth: 220,
          }}
        >
          <option value="">Elegir jugador</option>
          {[...rankingPlayers]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((p) => (
              <option key={p.id} value={p.name}>
                {p.name}
              </option>
            ))}
        </select>

        {myPlayerName && (
          <button
            onClick={clearMyPlayer}
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              border: '1px solid #d1d5db',
              background: 'white',
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            Cambiar
          </button>
        )}
      </div>

      {myRankingSummary && (
        <div
          style={{
            marginBottom: 18,
            padding: 16,
            borderRadius: 18,
            background: '#eff6ff',
            border: '1px solid #bfdbfe',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            alignItems: 'center',
          }}
        >
          <div style={{ fontWeight: 800, color: '#1e3a8a' }}>
            Vos estás #{myRankingSummary.position}
          </div>
          <div
            style={{
              padding: '6px 10px',
              borderRadius: 999,
              background: '#1d4ed8',
              color: 'white',
              fontWeight: 800,
              fontSize: 13,
            }}
          >
            {Math.round(Number(myRankingSummary.player.display_rating))} pts
          </div>
          <div style={{ color: '#334155', fontWeight: 700 }}>
            {myRankingSummary.player.wins}G - {myRankingSummary.player.losses}P
          </div>
          <div style={{ color: '#334155', fontWeight: 700 }}>
            {Number(myRankingSummary.player.win_pct).toFixed(2)}%
          </div>
          <div
            style={{
              padding: '5px 10px',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 800,
              background:
                myRankingSummary.player.current_win_streak > 0 ? '#fff7ed' : '#f8fafc',
              color:
                myRankingSummary.player.current_win_streak > 0 ? '#c2410c' : '#64748b',
              border: `1px solid ${
                myRankingSummary.player.current_win_streak > 0 ? '#fdba74' : '#e2e8f0'
              }`,
            }}
          >
            {myRankingSummary.player.current_win_streak > 0
              ? `🔥 ${myRankingSummary.player.current_win_streak}`
              : 'Racha 0'}
          </div>
        </div>
      )}

      <div
        style={{
          marginBottom: 18,
          background: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: 20,
          padding: 18,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
            marginBottom: 14,
          }}
        >
          <div>
            <div style={{ fontWeight: 800, fontSize: 18, color: '#0f172a' }}>
              Evolución de puntos
            </div>
            <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
              Jugador: {chartPlayerName || '—'}
            </div>
          </div>

          <select
            value={chartPlayerName}
            onChange={(e) => setSelectedChartPlayer(e.target.value)}
            style={{
              padding: '10px 12px',
              borderRadius: 12,
              border: '1px solid #d1d5db',
              background: 'white',
              minWidth: 220,
            }}
          >
            {[...rankingPlayers]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((p) => (
                <option key={p.id} value={p.name}>
                  {p.name}
                </option>
              ))}
          </select>
        </div>

        {chartStats && (
          <div
            style={{
              display: 'flex',
              gap: 10,
              flexWrap: 'wrap',
              marginBottom: 14,
            }}
          >
            <div
              style={{
                padding: '6px 10px',
                borderRadius: 999,
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                fontSize: 13,
                fontWeight: 700,
                color: '#334155',
              }}
            >
              Inicio: {Math.round(chartStats.first)}
            </div>
            <div
              style={{
                padding: '6px 10px',
                borderRadius: 999,
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                fontSize: 13,
                fontWeight: 700,
                color: '#1d4ed8',
              }}
            >
              Actual: {Math.round(chartStats.last)}
            </div>
            <div
              style={{
                padding: '6px 10px',
                borderRadius: 999,
                background: chartStats.change >= 0 ? '#ecfdf5' : '#fef2f2',
                border: `1px solid ${chartStats.change >= 0 ? '#bbf7d0' : '#fecaca'}`,
                fontSize: 13,
                fontWeight: 700,
                color: chartStats.change >= 0 ? '#166534' : '#b91c1c',
              }}
            >
              {chartStats.change >= 0 ? '+' : ''}
              {chartStats.change.toFixed(2)} pts
            </div>
          </div>
        )}

        {chartGeometry.points.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <svg
              width={chartGeometry.width}
              height={chartGeometry.height}
              viewBox={`0 0 ${chartGeometry.width} ${chartGeometry.height}`}
              style={{
                width: '100%',
                maxWidth: chartGeometry.width,
                height: 'auto',
                display: 'block',
                background: '#f8fafc',
                borderRadius: 16,
                border: '1px solid #e2e8f0',
              }}
            >
              {chartGeometry.gridYs.map((y, i) => (
                <line
                  key={i}
                  x1="40"
                  x2={chartGeometry.width - 20}
                  y1={y}
                  y2={y}
                  stroke="#e2e8f0"
                  strokeWidth="1"
                />
              ))}

              <path
                d={chartGeometry.path}
                fill="none"
                stroke="#2563eb"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {chartGeometry.points.map((p, i) => {
                const fill =
                  p.changeDirection === 'up'
                    ? '#16a34a'
                    : p.changeDirection === 'down'
                    ? '#dc2626'
                    : '#64748b';

                return <circle key={i} cx={p.x} cy={p.y} r="5" fill={fill} />;
              })}

              {chartGeometry.points.length > 0 && (
                <text
                  x={chartGeometry.points[chartGeometry.points.length - 1].x}
                  y={chartGeometry.points[chartGeometry.points.length - 1].y - 10}
                  textAnchor="middle"
                  fontSize="12"
                  fontWeight="700"
                  fill="#1d4ed8"
                >
                  {Math.round(chartGeometry.points[chartGeometry.points.length - 1].value)}
                </text>
              )}
            </svg>
          </div>
        ) : (
          <div
            style={{
              padding: 20,
              borderRadius: 16,
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              color: '#64748b',
            }}
          >
            No hay historial suficiente para mostrar el gráfico.
          </div>
        )}
      </div>

      <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 980 }}>
        <thead>
          <tr>
            {['#', 'Jugador', 'Puntos', 'PJ', 'G', 'P', '%', 'Prov.', 'Racha', 'Mejor'].map((label) => (
              <th
                key={label}
                style={{
                  textAlign: 'left',
                  padding: '14px 12px',
                  fontSize: 13,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  color: '#475569',
                  background: '#f8fafc',
                  borderTop: '1px solid #e5e7eb',
                  borderBottom: '1px solid #e5e7eb',
                }}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {[...rankingPlayers]
            .sort((a, b) => {
              if (b.display_rating !== a.display_rating) return b.display_rating - a.display_rating;
              if (b.elo_rating !== a.elo_rating) return b.elo_rating - a.elo_rating;
              return a.name.localeCompare(b.name);
            })
            .map((p, idx) => {
              const isTop3 = idx < 3;
              const isMe =
                myPlayerName &&
                p.name.trim().toLowerCase() === myPlayerName.trim().toLowerCase();
              const isChartPlayer =
                chartPlayerName &&
                p.name.trim().toLowerCase() === chartPlayerName.trim().toLowerCase();

              const rowBg = isMe
                ? '#eff6ff'
                : idx === 0
                ? '#fffbea'
                : idx === 1
                ? '#f8fafc'
                : idx === 2
                ? '#fff7ed'
                : idx % 2 === 0
                ? 'white'
                : '#fcfcfd';

              return (
                <tr
                  key={p.id}
                  onClick={() => setSelectedChartPlayer(p.name)}
                  style={{
                    background: rowBg,
                    cursor: 'pointer',
                    boxShadow: isChartPlayer ? 'inset 0 0 0 2px #93c5fd' : undefined,
                  }}
                >
                  <td
                    style={{
                      padding: '14px 12px',
                      borderBottom: '1px solid #eef2f7',
                      fontWeight: 800,
                    }}
                  >
                    {idx + 1}
                  </td>

                  <td
                    style={{
                      padding: '14px 12px',
                      borderBottom: '1px solid #eef2f7',
                    }}
                  >
                    <div style={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>{p.name}</span>
                      {isMe && (
                        <span
                          style={{
                            padding: '4px 8px',
                            borderRadius: 999,
                            fontSize: 11,
                            fontWeight: 800,
                            background: '#1d4ed8',
                            color: 'white',
                          }}
                        >
                          Vos
                        </span>
                      )}
                    </div>
                  </td>

                  <td
                    style={{
                      padding: '14px 12px',
                      borderBottom: '1px solid #eef2f7',
                    }}
                  >
                    <div
                      style={{
                        display: 'inline-flex',
                        padding: '6px 10px',
                        borderRadius: 999,
                        background: isTop3 ? '#111827' : '#eff6ff',
                        color: isTop3 ? 'white' : '#1d4ed8',
                        fontWeight: 800,
                      }}
                    >
                      {Math.round(Number(p.display_rating))}
                    </div>
                  </td>

                  <td style={{ padding: '14px 12px', borderBottom: '1px solid #eef2f7' }}>
                    {p.matches_played}
                  </td>

                  <td
                    style={{
                      padding: '14px 12px',
                      borderBottom: '1px solid #eef2f7',
                      color: '#166534',
                      fontWeight: 700,
                    }}
                  >
                    {p.wins}
                  </td>

                  <td
                    style={{
                      padding: '14px 12px',
                      borderBottom: '1px solid #eef2f7',
                      color: '#b91c1c',
                      fontWeight: 700,
                    }}
                  >
                    {p.losses}
                  </td>

                  <td style={{ padding: '14px 12px', borderBottom: '1px solid #eef2f7' }}>
                    {Number(p.win_pct).toFixed(2)}%
                  </td>

                  <td style={{ padding: '14px 12px', borderBottom: '1px solid #eef2f7' }}>
                    <span
                      style={{
                        padding: '5px 10px',
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 700,
                        background: p.provisional ? '#fef2f2' : '#ecfdf5',
                        color: p.provisional ? '#b91c1c' : '#166534',
                      }}
                    >
                      {p.provisional ? 'Sí' : 'No'}
                    </span>
                  </td>

                  <td style={{ padding: '14px 12px', borderBottom: '1px solid #eef2f7' }}>
                    <span
                      style={{
                        padding: '5px 10px',
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 800,
                        background: p.current_win_streak > 0 ? '#fff7ed' : '#f8fafc',
                        color: p.current_win_streak > 0 ? '#c2410c' : '#64748b',
                      }}
                    >
                      {p.current_win_streak > 0 ? `🔥 ${p.current_win_streak}` : '0'}
                    </span>
                  </td>

                  <td style={{ padding: '14px 12px', borderBottom: '1px solid #eef2f7' }}>
                    {p.best_win_streak}
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}
