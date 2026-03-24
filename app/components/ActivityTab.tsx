'use client';

import React from 'react';
import type { ActivityMatch, RankingPlayer } from '../lib/padelTypes';
import { formatDate, scoreText } from '../lib/padelUtils';

type Props = {
  rankingPlayers: RankingPlayer[];
  selectedActivityPlayer: string;
  setSelectedActivityPlayer: (value: string) => void;
  activityData: ActivityMatch[];
};

export default function ActivityTab({
  rankingPlayers,
  selectedActivityPlayer,
  setSelectedActivityPlayer,
  activityData,
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
        <h2 style={{ margin: 0, fontSize: 24 }}>Actividad</h2>
        <div style={{ marginTop: 6, color: '#64748b', fontSize: 14 }}>
          Historial completo de partidos por jugador.
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
        <div style={{ fontSize: 14, fontWeight: 700, color: '#334155' }}>Jugador</div>

        <select
          value={selectedActivityPlayer}
          onChange={(e) => setSelectedActivityPlayer(e.target.value)}
          style={{
            padding: '10px 12px',
            borderRadius: 12,
            border: '1px solid #d1d5db',
            background: 'white',
            minWidth: 240,
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
      </div>

      {selectedActivityPlayer && activityData.length === 0 && (
        <div
          style={{
            padding: 14,
            borderRadius: 14,
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            color: '#64748b',
          }}
        >
          No hay partidos cargados para ese jugador.
        </div>
      )}

      <div style={{ display: 'grid', gap: 12 }}>
        {activityData.map((m) => (
          <div
            key={`activity-${m.id}`}
            style={{
              background: '#fcfcfd',
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

              <div
                style={{
                  padding: '6px 10px',
                  borderRadius: 999,
                  background: m.didWin ? '#ecfdf5' : '#fef2f2',
                  border: `1px solid ${m.didWin ? '#bbf7d0' : '#fecaca'}`,
                  color: m.didWin ? '#166534' : '#b91c1c',
                  fontSize: 12,
                  fontWeight: 800,
                }}
              >
                {m.didWin ? 'Victoria' : 'Derrota'}
              </div>
            </div>

            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ color: '#334155' }}>
                <strong>Compañero:</strong> {m.partnerName}
              </div>
              <div style={{ color: '#334155' }}>
                <strong>Rivales:</strong> {m.opponent1Name} / {m.opponent2Name}
              </div>
            </div>

            <div style={{ marginTop: 10, color: '#334155', fontWeight: 700 }}>
              Resultado: {scoreText(m)}
            </div>

            {m.notes && (
              <div style={{ marginTop: 6, color: '#64748b', fontSize: 13 }}>
                {m.notes}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
