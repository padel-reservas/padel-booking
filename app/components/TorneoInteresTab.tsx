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
        {juegan.length > 0 && (
          <p style={{ color: '#64748b', marginBottom: 0, fontSize: 13 }}>
            {Math.floor(juegan.length / 2)} parejas posibles
            {juegan.length % 2 === 1 ? ' (falta 1 para cerrar pareja)' : ''}
          </p>
        )}
      </div>

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
