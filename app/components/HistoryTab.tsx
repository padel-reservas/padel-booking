'use client';

import React from 'react';
import type { Match, RankingPlayer } from '../lib/padelTypes';
import { formatDate, playerNameById, scoreText } from '../lib/padelUtils';

type Props = {
  matches: Match[];
  rankingPlayers: RankingPlayer[];
  adminUnlocked: boolean;
  openManualHistoryResultModal: () => void;
  deleteMatchById: (matchId: number) => void;
};

export default function HistoryTab({
  matches,
  rankingPlayers,
  adminUnlocked,
  openManualHistoryResultModal,
  deleteMatchById,
}: Props) {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div
        style={{
          background: 'white',
          borderRadius: 18,
          padding: 16,
          border: '1px solid #e5e7eb',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div style={{ fontWeight: 800, fontSize: 18 }}>Carga manual de resultados</div>
            <div style={{ color: '#64748b', marginTop: 4, fontSize: 14 }}>
              Para subir partidos viejos sin crear un turno.
            </div>
          </div>

          {adminUnlocked ? (
            <button
              onClick={openManualHistoryResultModal}
              style={{
                padding: '10px 14px',
                borderRadius: 12,
                border: 'none',
                background: '#111827',
                color: 'white',
                cursor: 'pointer',
                fontWeight: 700,
              }}
            >
              Subir resultado manual
            </button>
          ) : (
            <div
              style={{
                padding: '8px 12px',
                borderRadius: 12,
                background: '#f8fafc',
                border: '1px solid #e5e7eb',
                color: '#64748b',
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              Entrá como admin desde Turnos para habilitar esta función
            </div>
          )}
        </div>
      </div>

      {matches.length === 0 && (
        <div
          style={{
            background: 'white',
            borderRadius: 20,
            padding: 20,
            border: '1px solid #e5e7eb',
          }}
        >
          No hay partidos cargados todavía.
        </div>
      )}

      {matches.map((m) => {
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
            key={m.id}
            style={{
              background: 'white',
              borderRadius: 18,
              padding: 16,
              border: '1px solid #e5e7eb',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 8,
                alignItems: 'center',
                flexWrap: 'wrap',
                marginBottom: 10,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 18 }}>
                {formatDate(m.match_date)}
                {m.match_time ? ` · ${m.match_time}` : ''}
              </div>

              {m.source && (
                <div
                  style={{
                    padding: '6px 10px',
                    borderRadius: 999,
                    background: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {m.source === 'manual'
                    ? 'Manual'
                    : m.source === 'slot'
                    ? 'Turno'
                    : ''}
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ fontWeight: m.winner_team === 'A' ? 700 : 500 }}>
                Team A: {teamA}
              </div>
              <div style={{ fontWeight: m.winner_team === 'B' ? 700 : 500 }}>
                Team B: {teamB}
              </div>
            </div>

            <div style={{ marginTop: 10, color: '#334155', fontWeight: 700 }}>
              Resultado: {scoreText(m)}
            </div>

            {m.winner_team && (
              <div style={{ marginTop: 6, color: '#64748b', fontSize: 14 }}>
                Ganador: {m.winner_team === 'A' ? 'Team A' : 'Team B'}
              </div>
            )}

            {m.submitted_by_player_id && (
              <div style={{ marginTop: 6, color: '#64748b', fontSize: 13 }}>
                Cargado por: {playerNameById(rankingPlayers, m.submitted_by_player_id)}
              </div>
            )}

            {m.slot_id == null && (
              <div style={{ marginTop: 6, color: '#64748b', fontSize: 13 }}>
                Partido cargado sin turno asociado.
              </div>
            )}

            {m.notes && (
              <div style={{ marginTop: 6, color: '#64748b', fontSize: 13 }}>
                {m.notes}
              </div>
            )}

            {adminUnlocked && (
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  flexWrap: 'wrap',
                  marginTop: 12,
                  paddingTop: 12,
                  borderTop: '1px solid #e5e7eb',
                }}
              >
                <button
                  onClick={() => deleteMatchById(m.id)}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 12,
                    border: 'none',
                    background: '#b91c1c',
                    color: 'white',
                    cursor: 'pointer',
                    fontWeight: 700,
                  }}
                >
                  Borrar resultado
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
