'use client';

import React from 'react';
import type { H2HMatch, PartnershipMatch, RankingPlayer } from '../lib/padelTypes';
import { formatDate, playerNameById, scoreText } from '../lib/padelUtils';

type H2HData = {
  matches: H2HMatch[];
  winsA: number;
  winsB: number;
  total: number;
  winPctA: number;
  currentStreakText: string;
};

type PartnershipData = {
  matches: PartnershipMatch[];
  wins: number;
  losses: number;
  total: number;
  winPct: number;
  currentStreakText: string;
};

type Props = {
  rankingPlayers: RankingPlayer[];
  duelPlayerA: string;
  duelPlayerB: string;
  setDuelPlayerA: (value: string) => void;
  setDuelPlayerB: (value: string) => void;
  h2hData: H2HData;
  partnershipData: PartnershipData;
};

export default function DuelTab({
  rankingPlayers,
  duelPlayerA,
  duelPlayerB,
  setDuelPlayerA,
  setDuelPlayerB,
  h2hData,
  partnershipData,
}: Props) {
  return (
    <div
      style={{
        background: 'white',
        borderRadius: 24,
        padding: 24,
        border: '1px solid #e5e7eb',
        boxShadow: '0 8px 24px rgba(15, 23, 42, 0.04)',
      }}
    >
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ margin: 0, fontSize: 24 }}>Duelo</h2>
        <div style={{ marginTop: 6, color: '#64748b', fontSize: 14 }}>
          Compará dos jugadores como rivales y como pareja.
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
          alignItems: 'center',
          marginBottom: 18,
        }}
      >
        <select
          value={duelPlayerA}
          onChange={(e) => setDuelPlayerA(e.target.value)}
          style={{
            padding: '10px 12px',
            borderRadius: 12,
            border: '1px solid #d1d5db',
            background: 'white',
            minWidth: 220,
          }}
        >
          <option value="">Jugador A</option>
          {[...rankingPlayers]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((p) => (
              <option key={p.id} value={p.name}>
                {p.name}
              </option>
            ))}
        </select>

        <div style={{ fontWeight: 800, color: '#64748b' }}>y</div>

        <select
          value={duelPlayerB}
          onChange={(e) => setDuelPlayerB(e.target.value)}
          style={{
            padding: '10px 12px',
            borderRadius: 12,
            border: '1px solid #d1d5db',
            background: 'white',
            minWidth: 220,
          }}
        >
          <option value="">Jugador B</option>
          {[...rankingPlayers]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((p) => (
              <option key={p.id} value={p.name}>
                {p.name}
              </option>
            ))}
        </select>
      </div>

      {duelPlayerA && duelPlayerB && duelPlayerA === duelPlayerB ? (
        <div
          style={{
            padding: 14,
            borderRadius: 14,
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            color: '#64748b',
          }}
        >
          Elegí dos jugadores distintos.
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gap: 18,
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          }}
        >
          <div
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: 18,
              padding: 16,
              background: '#fcfcfd',
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 12 }}>
              Head-to-head
            </div>

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
                  padding: '10px 12px',
                  borderRadius: 14,
                  background: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  color: '#1d4ed8',
                  fontWeight: 800,
                }}
              >
                {duelPlayerA || 'Jugador A'} {h2hData.winsA} - {h2hData.winsB} {duelPlayerB || 'Jugador B'}
              </div>

              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: 14,
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  color: '#334155',
                  fontWeight: 700,
                }}
              >
                Partidos: {h2hData.total}
              </div>

              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: 14,
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  color: '#334155',
                  fontWeight: 700,
                }}
              >
                Win % {duelPlayerA || 'A'}: {h2hData.winPctA.toFixed(1)}%
              </div>

              {h2hData.currentStreakText && (
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: 14,
                    background: '#fff7ed',
                    border: '1px solid #fdba74',
                    color: '#c2410c',
                    fontWeight: 800,
                  }}
                >
                  {h2hData.currentStreakText}
                </div>
              )}
            </div>

            {h2hData.matches.length === 0 ? (
              <div
                style={{
                  padding: 14,
                  borderRadius: 14,
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  color: '#64748b',
                }}
              >
                No hay cruces cargados entre esos dos jugadores.
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {h2hData.matches.map((m) => {
                  const teamA = `${playerNameById(rankingPlayers, m.team_a_player_1_id)} / ${playerNameById(
                    rankingPlayers,
                    m.team_a_player_2_id
                  )}`;
                  const teamB = `${playerNameById(rankingPlayers, m.team_b_player_1_id)} / ${playerNameById(
                    rankingPlayers,
                    m.team_b_player_2_id
                  )}`;

                  return (
                    <div
                      key={`h2h-${m.id}`}
                      style={{
                        border: '1px solid #e5e7eb',
                        borderRadius: 14,
                        padding: 14,
                        background: 'white',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: 8,
                          flexWrap: 'wrap',
                          marginBottom: 8,
                        }}
                      >
                        <div style={{ fontWeight: 800 }}>
                          {formatDate(m.match_date)}
                          {m.match_time ? ` · ${m.match_time}` : ''}
                        </div>

                        <div
                          style={{
                            padding: '6px 10px',
                            borderRadius: 999,
                            background: m.winnerLabel === 'A' ? '#ecfdf5' : '#fef2f2',
                            border: `1px solid ${m.winnerLabel === 'A' ? '#bbf7d0' : '#fecaca'}`,
                            color: m.winnerLabel === 'A' ? '#166534' : '#b91c1c',
                            fontWeight: 800,
                            fontSize: 12,
                          }}
                        >
                          Ganó {m.winnerLabel === 'A' ? duelPlayerA : duelPlayerB}
                        </div>
                      </div>

                      <div style={{ color: '#334155', marginBottom: 4 }}>Team A: {teamA}</div>
                      <div style={{ color: '#334155', marginBottom: 6 }}>Team B: {teamB}</div>
                      <div style={{ fontWeight: 800 }}>Score: {scoreText(m)}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: 18,
              padding: 16,
              background: '#fcfcfd',
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 12 }}>
              Como pareja
            </div>

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
                  padding: '10px 12px',
                  borderRadius: 14,
                  background: '#eefbf3',
                  border: '1px solid #bbf7d0',
                  color: '#166534',
                  fontWeight: 800,
                }}
              >
                {duelPlayerA || 'Jugador A'} + {duelPlayerB || 'Jugador B'}: {partnershipData.wins} - {partnershipData.losses}
              </div>

              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: 14,
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  color: '#334155',
                  fontWeight: 700,
                }}
              >
                Juntos: {partnershipData.total}
              </div>

              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: 14,
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  color: '#334155',
                  fontWeight: 700,
                }}
              >
                Win % juntos: {partnershipData.winPct.toFixed(1)}%
              </div>

              {partnershipData.currentStreakText && (
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: 14,
                    background: '#fff7ed',
                    border: '1px solid #fdba74',
                    color: '#c2410c',
                    fontWeight: 800,
                  }}
                >
                  {partnershipData.currentStreakText}
                </div>
              )}
            </div>

            {partnershipData.matches.length === 0 ? (
              <div
                style={{
                  padding: 14,
                  borderRadius: 14,
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  color: '#64748b',
                }}
              >
                No hay partidos cargados donde hayan jugado juntos.
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {partnershipData.matches.map((m) => {
                  const teamA = `${playerNameById(rankingPlayers, m.team_a_player_1_id)} / ${playerNameById(
                    rankingPlayers,
                    m.team_a_player_2_id
                  )}`;
                  const teamB = `${playerNameById(rankingPlayers, m.team_b_player_1_id)} / ${playerNameById(
                    rankingPlayers,
                    m.team_b_player_2_id
                  )}`;

                  return (
                    <div
                      key={`pair-${m.id}`}
                      style={{
                        border: '1px solid #e5e7eb',
                        borderRadius: 14,
                        padding: 14,
                        background: 'white',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: 8,
                          flexWrap: 'wrap',
                          marginBottom: 8,
                        }}
                      >
                        <div style={{ fontWeight: 800 }}>
                          {formatDate(m.match_date)}
                          {m.match_time ? ` · ${m.match_time}` : ''}
                        </div>

                        <div
                          style={{
                            padding: '6px 10px',
                            borderRadius: 999,
                            background: m.resultLabel === 'W' ? '#ecfdf5' : '#fef2f2',
                            border: `1px solid ${m.resultLabel === 'W' ? '#bbf7d0' : '#fecaca'}`,
                            color: m.resultLabel === 'W' ? '#166534' : '#b91c1c',
                            fontWeight: 800,
                            fontSize: 12,
                          }}
                        >
                          {m.resultLabel === 'W' ? 'Ganaron juntos' : 'Perdieron juntos'}
                        </div>
                      </div>

                      <div style={{ color: '#334155', marginBottom: 4 }}>Team A: {teamA}</div>
                      <div style={{ color: '#334155', marginBottom: 6 }}>Team B: {teamB}</div>
                      <div style={{ fontWeight: 800 }}>Score: {scoreText(m)}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
