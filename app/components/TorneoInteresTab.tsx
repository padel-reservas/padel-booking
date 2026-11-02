'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import type { RankingPlayer } from '../lib/padelTypes';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Cambiá esto para cada nuevo torneo (queda guardado aparte en la tabla)
const TOURNAMENT_KEY = 'torneo-2026-11';
const TOURNAMENT_TITLE = '🏆 Próximo torneo — ¿Quién juega?';

// Cada ronda: miércoles a domingo. Última ventana cortada al sábado 12/12.
const INSCRIPCION_HASTA = 'domingo 8/11';
const ROUND_WINDOWS = [
  'mié 11/11 – dom 15/11',
  'mié 18/11 – dom 22/11',
  'mié 25/11 – dom 29/11',
  'mié 2/12 – dom 6/12',
  'mié 9/12 – sáb 12/12',
];

function roundName(matches: number) {
  if (matches === 1) return 'Final';
  if (matches === 2) return 'Semis';
  if (matches === 4) return 'Cuartos';
  if (matches === 8) return 'Octavos';
  if (matches === 16) return '16avos';
  return `Ronda de ${matches * 2}`;
}

// Arma el plan de rondas para N parejas (eliminación simple, byes a los mejores ELO)
function bracketPlan(pairs: number) {
  if (pairs < 2) return null;
  const rounds = Math.ceil(Math.log2(pairs));
  const size = 2 ** rounds;
  const byes = size - pairs;
  const list = [];
  for (let r = 0; r < rounds; r++) {
    const slotsThisRound = size / 2 ** r;
    const matches = slotsThisRound / 2;
    const playedMatches = r === 0 ? pairs - size / 2 : matches;
    list.push({
      name: roundName(matches),
      matches: playedMatches,
      window: ROUND_WINDOWS[r] ?? 'sin ventana disponible',
    });
  }
  return { rounds, size, byes, list, fits: rounds <= ROUND_WINDOWS.length };
}

type Status = 'in' | 'out';

type InteresRow = {
  id: number;
  tournament_key: string;
  player_name: string;
  status: Status;
  updated_at: string;
};

type Props = {
  rankingPlayers: RankingPlayer[];
  myPlayerName: string;
  adminUnlocked: boolean;
};

function normalizeName(name: string) {
  return name.trim().toLowerCase();
}

export default function TorneoInteresTab({ rankingPlayers, myPlayerName, adminUnlocked }: Props) {
  const [rows, setRows] = useState<InteresRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('torneo_interes')
      .select('*')
      .eq('tournament_key', TOURNAMENT_KEY);

    if (error) {
      setLoadError(error.message);
      setLoading(false);
      return;
    }
    setLoadError(null);
    setRows((data || []) as InteresRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const isMe = (name: string) =>
    !!myPlayerName && normalizeName(name) === normalizeName(myPlayerName);

  const canEdit = (name: string) => adminUnlocked || isMe(name);

  async function setStatus(playerName: string, status: Status | null) {
    if (!canEdit(playerName)) return;
    setSaving(playerName);

    const existing = rows.find(
      (r) => normalizeName(r.player_name) === normalizeName(playerName)
    );

    let error;
    if (status === null) {
      if (existing) {
        ({ error } = await supabase.from('torneo_interes').delete().eq('id', existing.id));
      }
    } else if (existing) {
      ({ error } = await supabase
        .from('torneo_interes')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', existing.id));
    } else {
      ({ error } = await supabase.from('torneo_interes').insert({
        tournament_key: TOURNAMENT_KEY,
        player_name: playerName.trim(),
        status,
      }));
    }

    if (error) alert(`Error: ${error.message}`);
    setSaving(null);
    await loadData();
  }

  const players = [...rankingPlayers]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((p) => {
      const row = rows.find((r) => normalizeName(r.player_name) === normalizeName(p.name));
      return { name: p.name, status: (row?.status ?? null) as Status | null };
    });

  // Yo primero
  players.sort((a, b) => Number(isMe(b.name)) - Number(isMe(a.name)));

  const juegan = players.filter((p) => p.status === 'in');
  const noJuegan = players.filter((p) => p.status === 'out');
  const pendientes = players.filter((p) => p.status === null);

  const card: React.CSSProperties = {
    background: 'white',
    borderRadius: 20,
    padding: 20,
    border: '1px solid #e5e7eb',
  };

  function renderRow(name: string, status: Status | null) {
    const editable = canEdit(name);
    const busy = saving === name;
    const me = isMe(name);

    return (
      <div
        key={name}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '10px 12px',
          borderRadius: 12,
          background: me ? '#eff6ff' : '#f8fafc',
          border: me ? '1px solid #93c5fd' : '1px solid #f1f5f9',
          opacity: busy ? 0.6 : 1,
        }}
      >
        <span style={{ fontWeight: me ? 700 : 500 }}>
          {status === 'in' ? '✅ ' : status === 'out' ? '❌ ' : '⏳ '}
          {name}
          {me && <span style={{ color: '#2563eb', fontSize: 12 }}> (vos)</span>}
        </span>

        {editable && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              disabled={busy}
              onClick={() => setStatus(name, status === 'in' ? null : 'in')}
              style={{
                padding: '6px 12px',
                borderRadius: 999,
                border: '1px solid #16a34a',
                background: status === 'in' ? '#16a34a' : 'white',
                color: status === 'in' ? 'white' : '#16a34a',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Juego
            </button>
            <button
              disabled={busy}
              onClick={() => setStatus(name, status === 'out' ? null : 'out')}
              style={{
                padding: '6px 12px',
                borderRadius: 999,
                border: '1px solid #dc2626',
                background: status === 'out' ? '#dc2626' : 'white',
                color: status === 'out' ? 'white' : '#dc2626',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Paso
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={card}>
        <h2 style={{ marginTop: 0, marginBottom: 4 }}>{TOURNAMENT_TITLE}</h2>
        <p style={{ color: '#64748b', margin: 0 }}>
          Marcá si te anotás para el próximo torneo. Tocá de nuevo para deshacer.
        </p>
        <div style={{ display: 'flex', gap: 16, marginTop: 14, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, color: '#16a34a' }}>✅ {juegan.length} juegan</span>
          <span style={{ fontWeight: 700, color: '#dc2626' }}>❌ {noJuegan.length} no</span>
          <span style={{ fontWeight: 700, color: '#64748b' }}>⏳ {pendientes.length} sin responder</span>
        </div>
      </div>

      <div style={card}>
        <h3 style={{ marginTop: 0, marginBottom: 8 }}>📋 Formato</h3>
        <ul style={{ margin: 0, paddingLeft: 18, color: '#334155', lineHeight: 1.6 }}>
          <li>Cuadro a <b>eliminación simple</b>. Pierde y queda afuera.</li>
          <li>Inscripción hasta el <b>{INSCRIPCION_HASTA}</b>. Después se arma el cuadro.</li>
          <li>Cada ronda se juega de <b>miércoles a domingo</b> (5 días). La final, a más tardar el <b>sábado 12/12</b>.</li>
          <li>Si el número de parejas no cierra justo, las mejores por ELO pasan directo a la ronda siguiente (bye).</li>
          <li>Si los anotados son impares, el último queda de <b>suplente</b> y entra si alguien se baja.</li>
          <li>Partido no jugado en la ventana: pasa la pareja que ofreció al menos 2 horarios; si ninguna, decide el organizador.</li>
        </ul>
      </div>

      {(() => {
        const pairs = Math.floor(juegan.length / 2);
        const suplente = juegan.length % 2 === 1;
        const plan = bracketPlan(pairs);
        return (
          <div style={card}>
            <h3 style={{ marginTop: 0, marginBottom: 8 }}>📅 Calendario estimado</h3>
            <p style={{ color: '#64748b', marginTop: 0 }}>
              {juegan.length} anotados → <b>{pairs} parejas</b>
              {suplente ? ' + 1 suplente' : ''}
              {plan ? ` → cuadro de ${plan.size}${plan.byes > 0 ? ` (${plan.byes} byes)` : ''}, ${plan.rounds} rondas` : ''}
            </p>
            {!plan ? (
              <p style={{ color: '#64748b', marginBottom: 0 }}>Se calcula cuando haya al menos 2 parejas.</p>
            ) : (
              <div style={{ display: 'grid', gap: 6 }}>
                {plan.list.map((r) => (
                  <div
                    key={r.name}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 12,
                      padding: '8px 12px',
                      borderRadius: 10,
                      background: '#f8fafc',
                      fontSize: 14,
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>
                      {r.name} <span style={{ color: '#64748b', fontWeight: 400 }}>({r.matches} {r.matches === 1 ? 'partido' : 'partidos'})</span>
                    </span>
                    <span style={{ color: '#334155' }}>{r.window}</span>
                  </div>
                ))}
                {!plan.fits && (
                  <p style={{ color: '#b45309', margin: 0 }}>Demasiadas parejas para terminar el 12/12.</p>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {loading ? (
        <div style={card}>Cargando…</div>
      ) : loadError ? (
        <div style={{ ...card, color: '#b45309' }}>
          No se pudo cargar la lista todavía ({loadError}).
        </div>
      ) : (
        <>
          {[
            { title: 'Juegan', list: juegan },
            { title: 'Sin responder', list: pendientes },
            { title: 'No juegan', list: noJuegan },
          ]
            .filter((s) => s.list.length > 0)
            .map((s) => (
              <div key={s.title} style={card}>
                <h3 style={{ marginTop: 0 }}>
                  {s.title} ({s.list.length})
                </h3>
                <div style={{ display: 'grid', gap: 8 }}>
                  {s.list.map((p) => renderRow(p.name, p.status))}
                </div>
              </div>
            ))}
        </>
      )}
    </div>
  );
}
