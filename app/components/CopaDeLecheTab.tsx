'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import type { RankingPlayer } from '../lib/padelTypes';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Props = {
  rankingPlayers: RankingPlayer[];
  myPlayerName: string;
  adminUnlocked: boolean;
};

const GRUPOS = {
  E: [
    { p1: 'Mati', p2: 'Mariano B' },
    { p1: 'Augusto', p2: 'Ale' },
    { p1: 'Dani O', p2: 'Javi' },
  ],
  F: [
    { p1: 'Gaby R', p2: 'Pupi' },
    { p1: 'German', p2: 'Dan' },
    { p1: 'Ricky G', p2: 'Leo' },
  ],
};

const PARTIDOS_GRUPOS = {
  E: [
    { id: 'E1', p1: 'Mati / Mariano B', p2: 'Augusto / Ale' },
    { id: 'E2', p1: 'Mati / Mariano B', p2: 'Dani O / Javi' },
    { id: 'E3', p1: 'Augusto / Ale', p2: 'Dani O / Javi' },
  ],
  F: [
    { id: 'F1', p1: 'Gaby R / Pupi', p2: 'German / Dan' },
    { id: 'F2', p1: 'Gaby R / Pupi', p2: 'Ricky G / Leo' },
    { id: 'F3', p1: 'German / Dan', p2: 'Ricky G / Leo' },
  ],
};

type Resultado = {
  id: string;
  partido_id: string;
  sets: string;
  ganador: string;
};

const groupColors: Record<string, { bg: string; border: string; text: string }> = {
  E: { bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af' },
  F: { bg: '#f0fdf4', border: '#86efac', text: '#166534' },
};

function normalizeName(name: string) {
  return name.trim().toLowerCase();
}

export default function CopaDeLecheTab({ myPlayerName, adminUnlocked }: Props) {
  const [resultados, setResultados] = useState<Record<string, Resultado>>({});
  const [editando, setEditando] = useState<string | null>(null);
  const [form, setForm] = useState({ sets: '', ganador: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from('copa_leche_resultados').select('*').then(({ data }) => {
      if (!data) return;
      const map: Record<string, Resultado> = {};
      data.forEach((r: any) => { map[r.partido_id] = r; });
      setResultados(map);
    });
  }, []);

  const isMe = (nombre: string) => {
    if (!myPlayerName) return false;
    return nombre.split(' / ').some(n => normalizeName(n) === normalizeName(myPlayerName));
  };

  async function handleSaveResultado(partidoId: string) {
    if (!form.sets || !form.ganador) {
      alert('Completá sets y ganador.');
      return;
    }
    setSaving(true);

    const { error } = await supabase
      .from('copa_leche_resultados')
      .upsert({ partido_id: partidoId, sets: form.sets, ganador: form.ganador },
        { onConflict: 'partido_id' });

    setSaving(false);
    if (error) { alert(`Error: ${error.message}`); return; }

    setResultados(prev => ({ ...prev, [partidoId]: { id: partidoId, partido_id: partidoId, sets: form.sets, ganador: form.ganador } }));
    setEditando(null);
    setForm({ sets: '', ganador: '' });
  }

  function calcularPosiciones(grupo: 'E' | 'F') {
    const parejas = GRUPOS[grupo].map(p => `${p.p1} / ${p.p2}`);
    const stats: Record<string, { pts: number }> = {};
    parejas.forEach(p => { stats[p] = { pts: 0 }; });

    PARTIDOS_GRUPOS[grupo].forEach(partido => {
      const r = resultados[partido.id];
      if (!r) return;
      if (r.ganador === partido.p1) stats[partido.p1].pts += 2;
      else if (r.ganador === partido.p2) stats[partido.p2].pts += 2;
    });

    return parejas.sort((a, b) => stats[b].pts - stats[a].pts).map(p => ({ nombre: p, pts: stats[p].pts }));
  }

  function renderPartidoForm(partidoId: string, p1: string, p2: string) {
    const r = resultados[partidoId];
    if (!adminUnlocked) return null;
    return (
      <div style={{ marginTop: 10 }}>
        {editando === partidoId ? (
          <div style={{ display: 'grid', gap: 8 }}>
            <input type="text" placeholder="Sets (ej: 6-3 / 7-5)"
              value={form.sets} onChange={e => setForm(f => ({ ...f, sets: e.target.value }))}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13 }} />
            <select value={form.ganador} onChange={e => setForm(f => ({ ...f, ganador: e.target.value }))}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13, background: 'white' }}>
              <option value="">Ganador...</option>
              <option value={p1}>{p1}</option>
              <option value={p2}>{p2}</option>
            </select>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => handleSaveResultado(partidoId)} disabled={saving}
                style={{ padding: '8px 14px', borderRadius: 10, border: 'none', background: '#111827', color: 'white', cursor: saving ? 'default' : 'pointer', fontWeight: 700, opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
              <button onClick={() => setEditando(null)}
                style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid #d1d5db', background: 'white', cursor: 'pointer', fontWeight: 700 }}>
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => { setEditando(partidoId); setForm({ sets: r?.sets || '', ganador: r?.ganador || '' }); }}
            style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #d1d5db', background: 'white', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
            {r ? 'Editar resultado' : 'Cargar resultado'}
          </button>
        )}
      </div>
    );
  }

  const posE = calcularPosiciones('E');
  const posF = calcularPosiciones('F');

  const sf1p1 = posE[0]?.nombre || '1ro Grupo E';
  const sf1p2 = posF[1]?.nombre || '2do Grupo F';
  const sf2p1 = posF[0]?.nombre || '1ro Grupo F';
  const sf2p2 = posE[1]?.nombre || '2do Grupo E';

  return (
    <div style={{ display: 'grid', gap: 16 }}>

      {/* Header */}
      <div style={{ background: 'white', borderRadius: 20, padding: 20, border: '1px solid #e5e7eb' }}>
        <h2 style={{ marginTop: 0, marginBottom: 4 }}>🥛 Copa de Leche</h2>
        <p style={{ color: '#64748b', marginBottom: 0 }}>
          2 grupos de 3 · Top 2 avanzan a semis · Final sin 3er puesto
        </p>
      </div>

      {/* Grupos */}
      {(['E', 'F'] as const).map(grupo => {
        const colors = groupColors[grupo];
        const posiciones = grupo === 'E' ? posE : posF;
        const todosJugados = PARTIDOS_GRUPOS[grupo].every(p => resultados[p.id]);

        return (
          <div key={grupo} style={{
            background: 'white', borderRadius: 20, padding: 20,
            border: todosJugados ? `2px solid ${colors.border}` : `1px solid ${colors.border}`
          }}>
            <h3 style={{ marginTop: 0, marginBottom: 16, color: colors.text, display: 'flex', alignItems: 'center', gap: 8 }}>
              Grupo {grupo} — 3 parejas
              {todosJugados && (
                <span style={{ fontSize: 11, fontWeight: 700, color: colors.text, background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 999, padding: '2px 8px' }}>
                  ✅ Finalizado
                </span>
              )}
            </h3>

            {/* Posiciones */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 8 }}>POSICIONES</div>
              <div style={{ display: 'grid', gap: 6 }}>
                {posiciones.map((p, idx) => {
                  const mia = isMe(p.nombre);
                  const avanza = idx < 2;
                  return (
                    <div key={p.nombre} style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, fontSize: 13,
                      background: todosJugados && idx === 0 ? '#fefce8' : todosJugados && idx === 1 ? '#f8fafc' : mia ? colors.bg : '#f8fafc',
                      border: `1px solid ${todosJugados && idx === 0 ? '#fde047' : todosJugados && idx === 1 ? '#cbd5e1' : mia ? colors.border : '#e5e7eb'}`,
                    }}>
                      <span style={{ fontWeight: 800, minWidth: 20, color: avanza ? colors.text : '#9ca3af' }}>{idx + 1}</span>
                      <span style={{ fontWeight: mia ? 800 : 600 }}>{p.nombre}</span>
                      <span style={{ marginLeft: 'auto', fontWeight: 800, color: '#111827' }}>{p.pts} pts</span>
                      {todosJugados && idx === 0 && <span style={{ fontSize: 11, fontWeight: 700, color: '#713f12', background: '#fefce8', border: '1px solid #fde047', borderRadius: 999, padding: '2px 6px' }}>🥇 1ro</span>}
                      {todosJugados && idx === 1 && <span style={{ fontSize: 11, fontWeight: 700, color: '#334155', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 999, padding: '2px 6px' }}>🥈 2do</span>}
                      {!todosJugados && avanza && <span style={{ fontSize: 11, fontWeight: 700, color: colors.text, background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 999, padding: '2px 6px' }}>Avanza</span>}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Partidos */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 8 }}>PARTIDOS</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {PARTIDOS_GRUPOS[grupo].map(partido => {
                  const r = resultados[partido.id];
                  const mio = isMe(partido.p1) || isMe(partido.p2);
                  return (
                    <div key={partido.id} style={{
                      padding: '12px 14px', borderRadius: 12,
                      background: mio ? colors.bg : '#f8fafc',
                      border: mio ? `1px solid ${colors.border}` : '1px solid #e5e7eb',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <div style={{ fontWeight: mio ? 800 : 600, fontSize: 13 }}>
                          {partido.p1}<span style={{ color: '#9ca3af', margin: '0 6px' }}>vs</span>{partido.p2}
                        </div>
                        {r ? (
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <span style={{ fontSize: 13, fontWeight: 800, color: '#166534' }}>{r.sets}</span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#166534', background: '#dcfce7', border: '1px solid #86efac', borderRadius: 999, padding: '2px 8px' }}>{r.ganador}</span>
                          </div>
                        ) : (
                          <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 700, background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 999, padding: '2px 8px' }}>Pendiente</span>
                        )}
                      </div>
                      {renderPartidoForm(partido.id, partido.p1, partido.p2)}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}

      {/* Semis */}
      <div style={{ background: 'white', borderRadius: 20, padding: 20, border: '1px solid #e5e7eb' }}>
        <h3 style={{ marginTop: 0, marginBottom: 12 }}>Semifinales</h3>
        <div style={{ display: 'grid', gap: 8 }}>
          {[
            { id: 'SF1R', label: 'SF1', p1: sf1p1, p2: sf1p2 },
            { id: 'SF2R', label: 'SF2', p1: sf2p1, p2: sf2p2 },
          ].map(sf => {
            const r = resultados[sf.id];
            return (
              <div key={sf.id} style={{ padding: '12px 14px', borderRadius: 12, background: '#f8fafc', border: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 6 }}>{sf.label}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {sf.p1}<span style={{ color: '#9ca3af', margin: '0 6px' }}>vs</span>{sf.p2}
                  </div>
                  {r && (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: '#166534' }}>{r.sets}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#166534', background: '#dcfce7', border: '1px solid #86efac', borderRadius: 999, padding: '2px 8px' }}>{r.ganador}</span>
                    </div>
                  )}
                </div>
                {renderPartidoForm(sf.id, sf.p1, sf.p2)}
              </div>
            );
          })}
        </div>
      </div>

      {/* Final */}
      <div style={{ background: 'white', borderRadius: 20, padding: 20, border: '1px solid #e5e7eb' }}>
        <h3 style={{ marginTop: 0, marginBottom: 12 }}>Final 🏆</h3>
        <div style={{ padding: '12px 14px', borderRadius: 12, background: '#f8fafc', border: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {resultados['SF1R']?.ganador || 'Ganador SF1'}
              <span style={{ color: '#9ca3af', margin: '0 6px' }}>vs</span>
              {resultados['SF2R']?.ganador || 'Ganador SF2'}
            </div>
            {resultados['FINAL'] && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#166534' }}>{resultados['FINAL'].sets}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#713f12', background: '#fefce8', border: '1px solid #fde047', borderRadius: 999, padding: '2px 8px' }}>🏆 {resultados['FINAL'].ganador}</span>
              </div>
            )}
          </div>
          {renderPartidoForm('FINAL',
            resultados['SF1R']?.ganador || 'Ganador SF1',
            resultados['SF2R']?.ganador || 'Ganador SF2'
          )}
        </div>
      </div>

    </div>
  );
}
