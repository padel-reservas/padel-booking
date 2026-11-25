'use client';

import React from 'react';
import type { TabKey } from '../lib/padelTypes';
import type { Pareja, PalmaresRow, TorneoResumen } from '../lib/torneos';

type Props = {
  torneos: TorneoResumen[];
  palmares: PalmaresRow[];
  myPlayerName: string;
  canSeeCuadro: boolean;
  onOpen: (view: TabKey) => void;
};

const card: React.CSSProperties = {
  background: 'white',
  borderRadius: 20,
  padding: 16,
  border: '1px solid #e5e7eb',
};

const btn: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 10,
  border: '1px solid #d1d5db',
  background: 'white',
  cursor: 'pointer',
  fontWeight: 700,
  fontSize: 13,
};

const btnDark: React.CSSProperties = { ...btn, background: '#111827', color: 'white', border: 'none' };

const sameName = (a: string, b: string) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

export default function TorneosTab({ torneos, palmares, myPlayerName, canSeeCuadro, onOpen }: Props) {
  const enCurso = torneos.filter((t) => t.enCurso);
  const historial = torneos.filter((t) => !t.enCurso);

  const isMine = (p: Pareja | null) => !!p && p.some((n) => sameName(n, myPlayerName));

  function podioLine(medal: string, p: Pareja | null, empty: string) {
    return (
      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'baseline',
          fontWeight: medal === '🥇' ? 800 : 600,
          color: p ? '#0f172a' : '#94a3b8',
        }}
      >
        <span style={{ width: 22 }}>{medal}</span>
        <span>
          {p ? `${p[0]} / ${p[1]}` : empty}
          {isMine(p) && <span style={{ color: '#2563eb', fontSize: 12 }}> (vos)</span>}
        </span>
      </div>
    );
  }

  function torneoCard(t: TorneoResumen) {
    const { first, second, third } = t.podioFinal;
    const hasPodio = !!(first || second || third);
    return (
      <div key={t.key} style={{ ...card, borderColor: t.enCurso ? '#93c5fd' : '#e5e7eb' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0 }}>🏆 {t.name}</h3>
          <span
            style={{
              padding: '4px 10px',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 800,
              background: t.enCurso ? '#eff6ff' : '#f1f5f9',
              color: t.enCurso ? '#1d4ed8' : '#475569',
            }}
          >
            {t.estado}
          </span>
        </div>
        <div style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>
          {t.fecha} · {t.formato}
          {t.parejas ? ` · ${t.parejas} parejas` : ''}
        </div>

        {(hasPodio || !t.enCurso) && (
          <div style={{ display: 'grid', gap: 6, marginTop: 12 }}>
            {podioLine('🥇', first, 'Por definir')}
            {podioLine('🥈', second, 'Por definir')}
            {podioLine('🥉', third, 'Por definir')}
          </div>
        )}

        {t.copaLeche && (
          <div
            style={{
              marginTop: 12,
              padding: '10px 12px',
              borderRadius: 12,
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              display: 'grid',
              gap: 4,
              fontSize: 14,
            }}
          >
            <div style={{ fontWeight: 800, color: '#334155' }}>🥛 Copa de Leche</div>
            {podioLine('🥇', t.copaLeche.first, '')}
            {t.copaLeche.second && podioLine('🥈', t.copaLeche.second, '')}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          {(t.view !== 'cuadro' || canSeeCuadro) && (
            <button onClick={() => onOpen(t.view)} style={btnDark}>
              {t.view === 'cuadro' ? 'Ver cuadro' : 'Ver torneo'}
            </button>
          )}
          {t.copaLeche && (
            <button onClick={() => onOpen(t.copaLeche!.view)} style={btn}>
              Ver Copa de Leche
            </button>
          )}
          {t.inscripcionView && (
            <button onClick={() => onOpen(t.inscripcionView!)} style={btn}>
              Inscripción
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      {enCurso.length > 0 && (
        <div style={{ display: 'grid', gap: 10 }}>
          <h2 style={{ margin: '4px 0 0' }}>En curso</h2>
          {enCurso.map(torneoCard)}
        </div>
      )}

      {historial.length > 0 && (
        <div style={{ display: 'grid', gap: 10 }}>
          <h2 style={{ margin: '4px 0 0' }}>Historial</h2>
          {historial.map(torneoCard)}
        </div>
      )}

      <div style={card}>
        <h2 style={{ marginTop: 0, marginBottom: 4 }}>Palmarés</h2>
        <div style={{ color: '#64748b', fontSize: 13, marginBottom: 12 }}>
          Medallero de todos los torneos: cada columna cuenta solo ese puesto.
        </div>
        {palmares.length === 0 ? (
          <div style={{ color: '#64748b' }}>Todavía no hay resultados.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr>
                  {['Jugador', '🥇', '🥈', '🥉', '🥛'].map((h, i) => (
                    <th
                      key={h}
                      style={{
                        textAlign: i === 0 ? 'left' : 'center',
                        padding: '10px 8px',
                        fontSize: 12,
                        color: '#475569',
                        background: '#f8fafc',
                        borderBottom: '1px solid #e5e7eb',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {palmares.map((r) => {
                  const mine = sameName(r.name, myPlayerName);
                  const cell = (v: number, bold = false): React.CSSProperties => ({
                    textAlign: 'center',
                    padding: '10px 8px',
                    borderBottom: '1px solid #eef2f7',
                    fontWeight: bold && v > 0 ? 800 : 500,
                    color: v > 0 ? '#0f172a' : '#cbd5e1',
                  });
                  return (
                    <tr key={r.name} style={{ background: mine ? '#dbeafe' : undefined }}>
                      <td style={{ padding: '10px 8px', borderBottom: '1px solid #eef2f7', fontWeight: 700 }}>
                        {r.name}
                      </td>
                      <td style={cell(r.titulos, true)}>{r.titulos}</td>
                      <td style={cell(r.segundos)}>{r.segundos}</td>
                      <td style={cell(r.bronces)}>{r.bronces}</td>
                      <td style={cell(r.copas)}>{r.copas}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
