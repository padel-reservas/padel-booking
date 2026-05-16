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

const PLAYER_IDS: Record<string, number> = {
  'Mati': 2,
  'Mariano B': 8,
  'Augusto': 30,
  'Ale': 1,
  'Dani O': 4,
  'Javi': 20,
  'Gaby R': 37,
  'Pupi': 3,
  'German': 26,
  'Dan': 31,
  'Ricky G': 28,
  'Mariano H': 55,
  'Jonas': 19,
  'Seba Z': 29,
  'Sergio': 14,
  'Facu': 25,
  'Mariano L': 9,
  'Fran S': 33,
  'Martin PI': 36,
  'Gaston R': 38,
  'Hernan L': 11,
  'Daniel S': 44,
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
    { p1: 'Ricky G', p2: 'Mariano H' },
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
    { id: 'F2', p1: 'Gaby R / Pupi', p2: 'Ricky G / Mariano H' },
    { id: 'F3', p1: 'German / Dan', p2: 'Ricky G / Mariano H' },
  ],
};

type MatchResult = {
  winner: string;
  sets: string;
};

const groupColors: Record<string, { bg: string; border: string; text: string }> = {
  E: { bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af' },
  F: { bg: '#f0fdf4', border: '#86efac', text: '#166534' },
};

function normalizeName(name: string) {
  return name.trim().toLowerCase();
}

function getPlayerIds(pareja: string): number[] {
  return pareja.split(' / ').map(n => PLAYER_IDS[n.trim()]).filter(Boolean);
}

function formatSets(match: any): string {
  const sets = [];
  if (match.set1_a != null) sets.push(`${match.set1_a}-${match.set1_b}`);
  if (match.set2_a != null) sets.push(`${match.set2_a}-${match.set2_b}`);
  if (match.set3_a != null) sets.push(`${match.set3_a}-${match.set3_b}`);
  return sets.join(' / ');
}

function getWinnerName(match: any, p1: string, p2: string): string {
  const p1ids = getPlayerIds(p1);
  const aPlayers = [match.team_a_player_1_id, match.team_a_player_2_id];
  const aIsP1 = p1ids.some(id => aPlayers.includes(id));
  if (match.winner_team === 'A') return aIsP1 ? p1 : p2;
  return aIsP1 ? p2 : p1;
}

export default function CopaDeLecheTab({ myPlayerName, adminUnlocked }: Props) {
  const [matches, setMatches] = useState<any[]>([]);
  const [resultadosManuales, setResultadosManuales] = useState<Record<string, { sets: string; ganador: string }>>({});
  const [editando, setEditando] = useState<string | null>(null);
  const [form, setForm] = useState({ sets: '', ganador: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const allIds = Object.values(PLAYER_IDS);

    supabase
      .from('matches')
      .select('*')
      .then(({ data }) => {
        if (!data) return;
        const filtered = data.filter(m => {
          const players = [m.team_a_player_1_id, m.team_a_player_2_id, m.team_b_player_1_id, m.team_b_player_2_id];
          return players.every(id => allIds.includes(id));
        });
        setMatches(filtered);
      });

    supabase.from('copa_leche_resultados').select('*').then(({ data }) => {
      if (!data) return;
      const map: Record<string, { sets: string; ganador: string }> = {};
      data.forEach((r: any) => { map[r.partido_id] = r; });
      setResultadosManuales(map);
    });
  }, []);

  function findMatch(p1: string, p2: string): MatchResult | null {
    const p1ids = getPlayerIds(p1);
    const p2ids = getPlayerIds(p2);

    const match = matches.find(m => {
      const aPlayers = [m.team_a_player_1_id, m.team_a_player_2_id];
      const bPlayers = [m.team_b_player_1_id, m.team_b_player_2_id];
      const aIsP1 = p1ids.every(id => aPlayers.includes(id));
      const bIsP2 = p2ids.every(id => bPlayers.includes(id));
      const aIsP2 = p2ids.every(id => aPlayers.includes(id));
      const bIsP1 = p1ids.every(id => bPlayers.includes(id));
      return (aIsP1 && bIsP2) || (aIsP2 && bIsP1);
    });

    if (!match) return null;
    return { winner: getWinnerName(match, p1, p2), sets: formatSets(match) };
  }

  function calcularPosiciones(grupo: 'E' | 'F') {
    const parejas = GRUPOS[grupo].map(p => `${p.p1} / ${p.p2}`);
    const stats: Record<string, { pts: number }> = {};
    parejas.forEach(p => { stats[p] = { pts: 0 }; });

    PARTIDOS_GRUPOS[grupo].forEach(partido => {
      const r = findMatch(partido.p1, partido.p2);
      if (!r) return;
      if (r.winner === partido.p1) stats[partido.p1].pts += 2;
      else if (r.winner === partido.p2) stats[partido.p2].pts += 2;
    });

    return parejas.sort((a, b) => stats[b].pts - stats[a].pts).map(p => ({ nombre: p, pts: stats[p].pts }));
  }

  async function handleSaveResultado(partidoId: string) {
    if (!form.sets || !form.ganador) { alert('Completá sets y ganador.'); return; }
    setSaving(true);

    const { error } = await supabase
      .from('copa_leche_resultados')
      .upsert({ partido_id: partidoId, sets: form.sets, ganador: form.ganador },
        { onConflict: 'partido_id' });

    setSaving(false);
    if (error) { alert(`Error: ${error.message}`); return; }

    setResultadosManuales(prev => ({ ...prev, [partidoId]: { sets: form.sets, ganador: form.ganador } }));
    setEditando(null);
    setForm({ sets: '', ganador: '' });
  }

  function renderPartidoForm(partidoId: string, p1: string, p2: string) {
    const r = resultadosManuales[partidoId];
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

  const isMe = (nombre: string) => {
    if (!myPlayerName) return false;
    return nombre.split(' / ').some(n => normalizeName(n) === normalizeName(myPlayerName));
  };

  const posE = calcularPosiciones('E');
  const posF = calcularPosiciones('F');

  const grupoECompleto = PARTIDOS_GRUPOS['E'].every(p => findMatch(p.p1, p.p2) !== null);
  const grupoFCompleto = PARTIDOS_GRUPOS['F'].every(p => findMatch(p.p1, p.p2) !== null);
  const ambosGruposCompletos = grupoECompleto && grupoFCompleto;

 const sf1p1 = 'Augusto / Ale';
const sf1p2 = 'German / Dan';
const sf2p1 = 'Gaby R / Pupi';
const sf2p2 = 'Mati / Mariano B';

  const semisCompletas = resultadosManuales['SF1R'] && resultadosManuales['SF2R'];
  const finalCLCompleta = resultadosManuales['FINAL'];

  // Repechaje
  const repSF1p1 = 'Sergio / Facu';
  const repSF1p2 = 'Jonas / Seba Z';
  const repSF2p1 = 'Mariano L / Fran S';
  const repSF2p2 = 'Dani O / Daniel S';

  const repSF1Completa = resultadosManuales['REP_SF1'];
  const repSF2Completa = resultadosManuales['REP_SF2'];
  const repFinalCompleta = resultadosManuales['REP_FINAL'];

  const superFinalP1 = finalCLCompleta?.ganador || 'Campeón CL';
  const superFinalP2 = repFinalCompleta?.ganador || 'Campeón Repechaje';
  const superFinalCompleta = repFinalCompleta && finalCLCompleta;

  function renderResultado(r: { sets: string; ganador: string } | undefined) {
    if (!r) return null;
    return (
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: '#166534' }}>{r.sets}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#166534', background: '#dcfce7', border: '1px solid #86efac', borderRadius: 999, padding: '2px 8px' }}>{r.ganador}</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>

      {/* Header */}
      <div style={{ background: 'white', borderRadius: 20, padding: 20, border: '1px solid #e5e7eb' }}>
        <h2 style={{ marginTop: 0, marginBottom: 4 }}>🥛 Copa de Leche</h2>
        <p style={{ color: '#64748b', marginBottom: 0 }}>
          2 grupos de 3 · Top 2 avanzan a semis · Ganador CL juega Super Final vs Ganador Repechaje
        </p>
      </div>

      {/* Grupos */}
      {(['E', 'F'] as const).map(grupo => {
        const colors = groupColors[grupo];
        const posiciones = grupo === 'E' ? posE : posF;
        const todosJugados = grupo === 'E' ? grupoECompleto : grupoFCompleto;

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

            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 8 }}>PARTIDOS</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {PARTIDOS_GRUPOS[grupo].map(partido => {
                  const r = findMatch(partido.p1, partido.p2);
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
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#166534', background: '#dcfce7', border: '1px solid #86efac', borderRadius: 999, padding: '2px 8px' }}>{r.winner}</span>
                          </div>
                        ) : (
                          <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 700, background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 999, padding: '2px 8px' }}>Pendiente</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}

      {/* Semis CL */}
      {(ambosGruposCompletos || true) && (
  <div style={{ background: 'white', borderRadius: 20, padding: 20, border: '1px solid #e5e7eb' }}>
    <h3 style={{ marginTop: 0, marginBottom: 12 }}>Semifinales Copa de Leche</h3>    <div style={{ display: 'grid', gap: 8 }}>
            {[
              { id: 'SF1R', label: 'SF1', p1: sf1p1, p2: sf1p2 },
              { id: 'SF2R', label: 'SF2', p1: sf2p1, p2: sf2p2 },
            ].map(sf => {
              const r = resultadosManuales[sf.id];
              return (
                <div key={sf.id} style={{ padding: '12px 14px', borderRadius: 12, background: '#f8fafc', border: '1px solid #e5e7eb' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 6 }}>{sf.label}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                      {sf.p1}<span style={{ color: '#9ca3af', margin: '0 6px' }}>vs</span>{sf.p2}
                    </div>
                    {renderResultado(r)}
                  </div>
                  {renderPartidoForm(sf.id, sf.p1, sf.p2)}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Final CL */}
      {semisCompletas && (
        <div style={{ background: 'white', borderRadius: 20, padding: 20, border: '1px solid #e5e7eb' }}>
          <h3 style={{ marginTop: 0, marginBottom: 12 }}>Final Copa de Leche 🥛</h3>
          <div style={{ padding: '12px 14px', borderRadius: 12, background: '#f8fafc', border: '1px solid #e5e7eb' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                {resultadosManuales['SF1R']?.ganador || 'Ganador SF1'}
                <span style={{ color: '#9ca3af', margin: '0 6px' }}>vs</span>
                {resultadosManuales['SF2R']?.ganador || 'Ganador SF2'}
              </div>
              {renderResultado(resultadosManuales['FINAL'])}
            </div>
            {renderPartidoForm('FINAL',
              resultadosManuales['SF1R']?.ganador || 'Ganador SF1',
              resultadosManuales['SF2R']?.ganador || 'Ganador SF2'
            )}
          </div>
        </div>
      )}

      {/* REPECHAJE */}
      <div style={{ background: 'white', borderRadius: 20, padding: 20, border: '2px solid #111827' }}>
        <h3 style={{ marginTop: 0, marginBottom: 12, color: '#111827', fontWeight: 900 }}>REPECHAJE</h3>

        <div style={{ display: 'grid', gap: 8, marginBottom: 8 }}>
          {/* SF Repechaje 1 */}
          <div style={{ padding: '12px 14px', borderRadius: 12, background: '#f8fafc', border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 6 }}>Semi Repechaje 1</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                {repSF1p1}<span style={{ color: '#9ca3af', margin: '0 6px' }}>vs</span>{repSF1p2}
              </div>
              {renderResultado(repSF1Completa)}
            </div>
            {renderPartidoForm('REP_SF1', repSF1p1, repSF1p2)}
          </div>

          {/* SF Repechaje 2 */}
          <div style={{ padding: '12px 14px', borderRadius: 12, background: '#f8fafc', border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 6 }}>Semi Repechaje 2</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                {repSF2p1}<span style={{ color: '#9ca3af', margin: '0 6px' }}>vs</span>{repSF2p2}
              </div>
              {renderResultado(repSF2Completa)}
            </div>
            {/* Selector para el rival pendiente de Mariano L/Fran S */}
            {renderPartidoForm('REP_SF2', repSF2p1, repSF2p2)}
          </div>
        </div>

        {/* Final Repechaje */}
        {repSF1Completa && repSF2Completa && (
          <div style={{ padding: '12px 14px', borderRadius: 12, background: '#f1f5f9', border: '1px solid #cbd5e1', marginTop: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 6 }}>Final Repechaje</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                {repSF1Completa.ganador}<span style={{ color: '#9ca3af', margin: '0 6px' }}>vs</span>{repSF2Completa.ganador}
              </div>
              {renderResultado(repFinalCompleta)}
            </div>
            {renderPartidoForm('REP_FINAL', repSF1Completa.ganador, repSF2Completa.ganador)}
          </div>
        )}
      </div>

      {/* Super Final */}
      {superFinalCompleta && (
        <div style={{ background: '#111827', borderRadius: 20, padding: 20, border: '2px solid #111827' }}>
          <h3 style={{ marginTop: 0, marginBottom: 12, color: 'white', fontWeight: 900 }}>⚡ SUPER FINAL</h3>
          <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>
                {superFinalP1}<span style={{ color: '#9ca3af', margin: '0 6px' }}>vs</span>{superFinalP2}
              </div>
              {resultadosManuales['SUPER_FINAL'] && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: '#fde047' }}>{resultadosManuales['SUPER_FINAL'].sets}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#111827', background: '#fde047', border: '1px solid #fde047', borderRadius: 999, padding: '2px 8px' }}>🏆 {resultadosManuales['SUPER_FINAL'].ganador}</span>
                </div>
              )}
            </div>
            {renderPartidoForm('SUPER_FINAL', superFinalP1, superFinalP2)}
          </div>
        </div>
      )}

    </div>
  );
}
