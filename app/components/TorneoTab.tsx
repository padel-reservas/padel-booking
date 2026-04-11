'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import type { RankingPlayer, Slot, SlotPlayer, SlotPlayerWithPaymentUI, TournamentPlayer } from '../lib/padelTypes';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const MIN_MATCHES = 5;
const TOURNAMENT_ID = 1;

type TournamentPair = {
  id: number;
  tournament_id: number;
  player1_name: string;
  player2_name: string;
  combined_rating: number;
  group_name: string | null;
  created_at: string;
};

type Props = {
  rankingPlayers: RankingPlayer[];
  slots: Slot[];
  slotPlayers: (SlotPlayer | SlotPlayerWithPaymentUI)[];
  myPlayerName: string;
  adminUnlocked: boolean;
};

function normalizeName(name: string) {
  return name.trim().toLowerCase();
}

function getFutureSlotCount(
  playerName: string,
  slots: Slot[],
  slotPlayers: (SlotPlayer | SlotPlayerWithPaymentUI)[]
): number {
  const todayStr = new Date().toISOString().slice(0, 10);
  const futureSlotIds = slots
    .filter((s) => s.date >= todayStr)
    .map((s) => s.id);

  return slotPlayers.filter(
    (sp) =>
      futureSlotIds.includes(sp.slot_id) &&
      normalizeName(sp.name) === normalizeName(playerName)
  ).length;
}

function generatePairsSerpenteo2(players: { name: string; rating: number }[]): { player1: string; player2: string; combined: number }[] {
  const sorted = [...players].sort((a, b) => b.rating - a.rating);
  const half = Math.ceil(sorted.length / 2);
  const pairs = [];

  for (let i = 0; i < half; i++) {
    const p1 = sorted[i];
    const p2 = sorted[half + i];
    if (p1 && p2) {
      pairs.push({
        player1: p1.name,
        player2: p2.name,
        combined: Math.round((p1.rating + p2.rating) * 100) / 100,
      });
    }
  }

  return pairs;
}

function assignGroupsSerpenteo(pairs: { player1: string; player2: string; combined: number }[]): { player1: string; player2: string; combined: number; group: string }[] {
  const sorted = [...pairs].sort((a, b) => b.combined - a.combined);
  const groups = ['A', 'B', 'C', 'D'];
  const result: { player1: string; player2: string; combined: number; group: string }[] = [];

  // Ronda 1: A, B, C, D
  // Ronda 2: D, C, B, A
  // Ronda 3: A, B, C, D
  // Ronda 4: D, C, B, A (si hay más)
  const pattern = ['A', 'B', 'C', 'D', 'D', 'C', 'B', 'A', 'A', 'B', 'C', 'D', 'D', 'C', 'B', 'A'];

  sorted.forEach((pair, index) => {
    result.push({
      ...pair,
      group: pattern[index] || 'A',
    });
  });

  return result;
}

export default function TorneoTab({ rankingPlayers, slots, slotPlayers, myPlayerName, adminUnlocked }: Props) {
  const [tournamentPlayers, setTournamentPlayers] = useState<TournamentPlayer[]>([]);
  const [tournamentPairs, setTournamentPairs] = useState<TournamentPair[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [adminSelectedPlayer, setAdminSelectedPlayer] = useState('');
  const [adminSelectedPlayerOverride, setAdminSelectedPlayerOverride] = useState('');
  const [generatedPairs, setGeneratedPairs] = useState<{ player1: string; player2: string; combined: number; group: string }[]>([]);
  const [showPairGenerator, setShowPairGenerator] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);

    const [
      { data: tpData, error: tpError },
      { data: pairsData, error: pairsError },
    ] = await Promise.all([
      supabase.from('tournament_players').select('*').order('created_at', { ascending: true }),
      supabase.from('tournament_pairs').select('*').order('combined_rating', { ascending: false }),
    ]);

    if (tpError) {
      alert(`Error cargando inscriptos: ${tpError.message}`);
      setLoading(false);
      return;
    }

    if (pairsError) {
      alert(`Error cargando parejas: ${pairsError.message}`);
      setLoading(false);
      return;
    }

    setTournamentPlayers((tpData || []) as TournamentPlayer[]);
    setTournamentPairs((pairsData || []) as TournamentPair[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const myRankingPlayer = rankingPlayers.find(
    (p) => normalizeName(p.name) === normalizeName(myPlayerName)
  );

  const matchesPlayed = myRankingPlayer?.matches_played ?? 0;
  const futureSlots = myPlayerName
    ? getFutureSlotCount(myPlayerName, slots, slotPlayers)
    : 0;
  const isEligible = matchesPlayed >= MIN_MATCHES || matchesPlayed + futureSlots >= MIN_MATCHES;

  const myRecord = tournamentPlayers.find(
    (tp) => normalizeName(tp.player_name) === normalizeName(myPlayerName)
  );
  const isConfirmed = myRecord?.status === 'confirmed';

  const confirmedPlayers = tournamentPlayers.filter((tp) => tp.status === 'confirmed');

  const eligibleNotConfirmed = rankingPlayers
    .filter((p) => {
      const pFutureSlots = getFutureSlotCount(p.name, slots, slotPlayers);
      const pMatchesPlayed = p.matches_played ?? 0;
      const pEligible = pMatchesPlayed >= MIN_MATCHES || pMatchesPlayed + pFutureSlots >= MIN_MATCHES;
      const alreadyConfirmed = confirmedPlayers.some(
        (tp) => normalizeName(tp.player_name) === normalizeName(p.name)
      );
      return pEligible && !alreadyConfirmed;
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const allNotConfirmed = rankingPlayers
    .filter((p) => {
      const alreadyConfirmed = confirmedPlayers.some(
        (tp) => normalizeName(tp.player_name) === normalizeName(p.name)
      );
      return !alreadyConfirmed;
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  function handleGeneratePairs() {
    const players = confirmedPlayers
      .map((tp) => {
        const rp = rankingPlayers.find(
          (p) => normalizeName(p.name) === normalizeName(tp.player_name)
        );
        return {
          name: tp.player_name,
          rating: rp?.display_rating ?? 1500,
        };
      })
      .sort((a, b) => b.rating - a.rating);

    const pairs = generatePairsSerpenteo2(players);
    const pairsWithGroups = assignGroupsSerpenteo(pairs);
    setGeneratedPairs(pairsWithGroups);
    setShowPairGenerator(true);
  }

  async function handleSavePairs() {
    if (generatedPairs.length === 0) return;

    setSaving(true);

    // Borrar parejas existentes
    const { error: deleteError } = await supabase
      .from('tournament_pairs')
      .delete()
      .eq('tournament_id', TOURNAMENT_ID);

    if (deleteError) {
      alert(`No se pudieron borrar las parejas anteriores: ${deleteError.message}`);
      setSaving(false);
      return;
    }

    // Insertar nuevas parejas
    const payload = generatedPairs.map((p) => ({
      tournament_id: TOURNAMENT_ID,
      player1_name: p.player1,
      player2_name: p.player2,
      combined_rating: p.combined,
      group_name: p.group,
    }));

    const { error: insertError } = await supabase
      .from('tournament_pairs')
      .insert(payload);

    setSaving(false);

    if (insertError) {
      alert(`No se pudieron guardar las parejas: ${insertError.message}`);
      return;
    }

    setShowPairGenerator(false);
    setGeneratedPairs([]);
    await loadData();
  }

  async function handleUpdatePairGroup(pairId: number, newGroup: string) {
    const { error } = await supabase
      .from('tournament_pairs')
      .update({ group_name: newGroup })
      .eq('id', pairId);

    if (error) {
      alert(`No se pudo actualizar el grupo: ${error.message}`);
      return;
    }

    await loadData();
  }

  async function handleDeletePairs() {
    const ok = window.confirm('¿Seguro que querés borrar todas las parejas y empezar de nuevo?');
    if (!ok) return;

    setSaving(true);

    const { error } = await supabase
      .from('tournament_pairs')
      .delete()
      .eq('tournament_id', TOURNAMENT_ID);

    setSaving(false);

    if (error) {
      alert(`No se pudieron borrar las parejas: ${error.message}`);
      return;
    }

    await loadData();
  }

  async function handleConfirm() {
    if (!myPlayerName) {
      alert('Primero elegí tu jugador en la tab Ranking.');
      return;
    }
    if (!isEligible) return;

    setSaving(true);

    const { error } = await supabase.from('tournament_players').upsert(
      { player_name: myPlayerName.trim(), status: 'confirmed' },
      { onConflict: 'player_name' }
    );

    setSaving(false);

    if (error) {
      alert(`No se pudo confirmar: ${error.message}`);
      return;
    }

    await loadData();
  }

  async function handleWithdraw() {
    if (!myPlayerName) return;

    setSaving(true);

    const { error } = await supabase.from('tournament_players').upsert(
      { player_name: myPlayerName.trim(), status: 'withdrawn' },
      { onConflict: 'player_name' }
    );

    setSaving(false);

    if (error) {
      alert(`No se pudo retirar: ${error.message}`);
      return;
    }

    await loadData();
  }

  async function handleAdminAdd() {
    if (!adminSelectedPlayer) {
      alert('Elegí un jugador para agregar.');
      return;
    }

    setSaving(true);

    const { error } = await supabase.from('tournament_players').upsert(
      { player_name: adminSelectedPlayer.trim(), status: 'confirmed' },
      { onConflict: 'player_name' }
    );

    setSaving(false);

    if (error) {
      alert(`No se pudo agregar: ${error.message}`);
      return;
    }

    setAdminSelectedPlayer('');
    await loadData();
  }

  async function handleAdminAddOverride() {
    if (!adminSelectedPlayerOverride) {
      alert('Elegí un jugador para agregar.');
      return;
    }

    setSaving(true);

    const { error } = await supabase.from('tournament_players').upsert(
      { player_name: adminSelectedPlayerOverride.trim(), status: 'confirmed' },
      { onConflict: 'player_name' }
    );

    setSaving(false);

    if (error) {
      alert(`No se pudo agregar: ${error.message}`);
      return;
    }

    setAdminSelectedPlayerOverride('');
    await loadData();
  }

  async function handleAdminRemove(playerName: string) {
    const ok = window.confirm(`¿Seguro que querés sacar a ${playerName} del torneo?`);
    if (!ok) return;

    setSaving(true);

    const { error } = await supabase.from('tournament_players').upsert(
      { player_name: playerName.trim(), status: 'withdrawn' },
      { onConflict: 'player_name' }
    );

    setSaving(false);

    if (error) {
      alert(`No se pudo sacar: ${error.message}`);
      return;
    }

    await loadData();
  }

  const groupColors: Record<string, { bg: string; border: string; text: string }> = {
    A: { bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af' },
    B: { bg: '#f0fdf4', border: '#86efac', text: '#166534' },
    C: { bg: '#fff7ed', border: '#fed7aa', text: '#9a3412' },
    D: { bg: '#fdf4ff', border: '#e9d5ff', text: '#7e22ce' },
  };

  const pairsByGroup = ['A', 'B', 'C', 'D'].reduce((acc, group) => {
    acc[group] = tournamentPairs.filter((p) => p.group_name === group);
    return acc;
  }, {} as Record<string, TournamentPair[]>);

  const myPair = tournamentPairs.find(
    (p) =>
      normalizeName(p.player1_name) === normalizeName(myPlayerName) ||
      normalizeName(p.player2_name) === normalizeName(myPlayerName)
  );

  return (
    <div style={{ display: 'grid', gap: 16 }}>

      {/* Header */}
      <div style={{ background: 'white', borderRadius: 20, padding: 20, border: '1px solid #e5e7eb' }}>
        <h2 style={{ marginTop: 0, marginBottom: 4 }}>🏆 Greenwich Padel Open Spring 26</h2>
        <p style={{ color: '#64748b', marginBottom: 0 }}>
          Anotate si querés participar. Mínimo {MIN_MATCHES} partidos jugados para ser elegible.
        </p>
      </div>

      {/* Panel admin */}
      {adminUnlocked && (
        <div style={{ background: 'white', borderRadius: 20, padding: 20, border: '2px solid #111827' }}>
          <h3 style={{ marginTop: 0, marginBottom: 16 }}>Admin — Gestión del torneo</h3>

          {/* Agregar elegible */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6, fontWeight: 700 }}>
              Agregar jugador elegible
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <select
                value={adminSelectedPlayer}
                onChange={(e) => setAdminSelectedPlayer(e.target.value)}
                style={{ padding: '10px 12px', borderRadius: 12, border: '1px solid #d1d5db', background: 'white', minWidth: 200 }}
              >
                <option value="">Elegí un jugador...</option>
                {eligibleNotConfirmed.map((p) => (
                  <option key={p.id} value={p.name}>{p.name} ({p.matches_played} partidos)</option>
                ))}
              </select>
              <button
                onClick={handleAdminAdd}
                disabled={saving || !adminSelectedPlayer}
                style={{ padding: '10px 16px', borderRadius: 12, border: 'none', background: '#111827', color: 'white', cursor: saving || !adminSelectedPlayer ? 'default' : 'pointer', fontWeight: 700, opacity: saving || !adminSelectedPlayer ? 0.5 : 1 }}
              >
                Agregar
              </button>
            </div>
          </div>

          {/* Agregar override */}
          <div style={{ paddingTop: 16, borderTop: '1px solid #e5e7eb', marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: '#92400e', marginBottom: 6, fontWeight: 700 }}>
              Agregar sin mínimo de partidos (override)
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <select
                value={adminSelectedPlayerOverride}
                onChange={(e) => setAdminSelectedPlayerOverride(e.target.value)}
                style={{ padding: '10px 12px', borderRadius: 12, border: '1px solid #fde68a', background: '#fffbeb', minWidth: 200 }}
              >
                <option value="">Elegí un jugador...</option>
                {allNotConfirmed.map((p) => (
                  <option key={p.id} value={p.name}>{p.name} ({p.matches_played} partidos)</option>
                ))}
              </select>
              <button
                onClick={handleAdminAddOverride}
                disabled={saving || !adminSelectedPlayerOverride}
                style={{ padding: '10px 16px', borderRadius: 12, border: 'none', background: '#92400e', color: 'white', cursor: saving || !adminSelectedPlayerOverride ? 'default' : 'pointer', fontWeight: 700, opacity: saving || !adminSelectedPlayerOverride ? 0.5 : 1 }}
              >
                Agregar igual
              </button>
            </div>
          </div>

          {/* Generador de parejas */}
          <div style={{ paddingTop: 16, borderTop: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10, fontWeight: 700 }}>
              Armado de parejas y grupos
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={handleGeneratePairs}
                disabled={saving}
                style={{ padding: '10px 16px', borderRadius: 12, border: 'none', background: '#111827', color: 'white', cursor: saving ? 'default' : 'pointer', fontWeight: 700, opacity: saving ? 0.5 : 1 }}
              >
                Generar parejas (Serpenteo 2)
              </button>

              {tournamentPairs.length > 0 && (
                <button
                  onClick={handleDeletePairs}
                  disabled={saving}
                  style={{ padding: '10px 16px', borderRadius: 12, border: '1px solid #fca5a5', background: 'white', color: '#991b1b', cursor: saving ? 'default' : 'pointer', fontWeight: 700 }}
                >
                  Borrar parejas
                </button>
              )}
            </div>

            {/* Preview de parejas generadas */}
            {showPairGenerator && generatedPairs.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontWeight: 800, marginBottom: 10 }}>
                  Preview — {generatedPairs.length} parejas generadas:
                </div>

                {['A', 'B', 'C', 'D'].map((group) => {
                  const groupPairs = generatedPairs.filter((p) => p.group === group);
                  if (groupPairs.length === 0) return null;
                  const colors = groupColors[group];
                  return (
                    <div key={group} style={{ marginBottom: 12 }}>
                      <div style={{ fontWeight: 800, fontSize: 13, color: colors.text, marginBottom: 6 }}>
                        Grupo {group} ({groupPairs.length} parejas)
                      </div>
                      {groupPairs.map((p, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, background: colors.bg, border: `1px solid ${colors.border}`, marginBottom: 6, fontSize: 13 }}>
                          <span style={{ fontWeight: 700 }}>{p.player1} / {p.player2}</span>
                          <span style={{ marginLeft: 'auto', color: '#6b7280' }}>{p.combined}</span>
                          <select
                            value={p.group}
                            onChange={(e) => {
                              const newPairs = generatedPairs.map((pair, idx) =>
                                pair.player1 === p.player1 ? { ...pair, group: e.target.value } : pair
                              );
                              setGeneratedPairs(newPairs);
                            }}
                            style={{ padding: '4px 8px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 12 }}
                          >
                            {['A', 'B', 'C', 'D'].map((g) => (
                              <option key={g} value={g}>Grupo {g}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  );
                })}

                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button
                    onClick={handleSavePairs}
                    disabled={saving}
                    style={{ padding: '10px 16px', borderRadius: 12, border: 'none', background: '#111827', color: 'white', cursor: saving ? 'default' : 'pointer', fontWeight: 700, opacity: saving ? 0.5 : 1 }}
                  >
                    {saving ? 'Guardando...' : 'Confirmar y guardar parejas'}
                  </button>
                  <button
                    onClick={() => { setShowPairGenerator(false); setGeneratedPairs([]); }}
                    style={{ padding: '10px 16px', borderRadius: 12, border: '1px solid #d1d5db', background: 'white', cursor: 'pointer', fontWeight: 700 }}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mi estado */}
      {myPlayerName ? (
        <div style={{ background: 'white', borderRadius: 20, padding: 20, border: '1px solid #e5e7eb' }}>
          <h3 style={{ marginTop: 0 }}>Tu estado</h3>

          <div style={{ marginBottom: 12, fontSize: 14, color: '#374151' }}>
            <span style={{ fontWeight: 700 }}>{myPlayerName}</span>
            {' — '}
            {matchesPlayed} partido{matchesPlayed !== 1 ? 's' : ''} jugado{matchesPlayed !== 1 ? 's' : ''}
            {futureSlots > 0 && (
              <span style={{ color: '#6b7280' }}>
                {' '}+ {futureSlots} turno{futureSlots !== 1 ? 's' : ''} futuro{futureSlots !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {!isEligible && (
            <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 12, padding: '10px 14px', fontSize: 13, color: '#92400e', fontWeight: 700 }}>
              Necesitás al menos {MIN_MATCHES} partidos para anotarte.
            </div>
          )}

          {isEligible && !isConfirmed && (
            <button
              onClick={handleConfirm}
              disabled={saving}
              style={{ padding: '12px 20px', borderRadius: 12, border: 'none', background: '#111827', color: 'white', cursor: saving ? 'default' : 'pointer', fontWeight: 700, fontSize: 15, opacity: saving ? 0.7 : 1 }}
            >
              {saving ? 'Guardando...' : '✅ Quiero jugar el torneo'}
            </button>
          )}

          {isConfirmed && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 12, padding: '10px 16px', fontWeight: 800, color: '#166534', fontSize: 14 }}>
                ✅ Confirmado para el torneo
              </div>
              <button
                onClick={handleWithdraw}
                disabled={saving}
                style={{ padding: '10px 14px', borderRadius: 12, border: '1px solid #d1d5db', background: 'white', cursor: saving ? 'default' : 'pointer', fontWeight: 700, fontSize: 13, opacity: saving ? 0.7 : 1 }}
              >
                {saving ? '...' : 'Me bajo'}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div style={{ background: 'white', borderRadius: 20, padding: 20, border: '1px solid #e5e7eb', color: '#64748b' }}>
          Elegí tu jugador en la tab <strong>Ranking</strong> para ver tu estado y anotarte.
        </div>
      )}

      {/* Grupos — solo visible si hay parejas cargadas */}
      {tournamentPairs.length > 0 && (
        <div style={{ display: 'grid', gap: 16 }}>
          {['A', 'B', 'C', 'D'].map((group) => {
            const pairs = pairsByGroup[group] || [];
            if (pairs.length === 0) return null;
            const colors = groupColors[group];

            return (
              <div key={group} style={{ background: 'white', borderRadius: 20, padding: 20, border: `1px solid ${colors.border}` }}>
                <h3 style={{ marginTop: 0, marginBottom: 12, color: colors.text }}>
                  Grupo {group} ({pairs.length} parejas)
                </h3>

                <div style={{ display: 'grid', gap: 8 }}>
                  {pairs.map((pair) => {
                    const isMyPair =
                      normalizeName(pair.player1_name) === normalizeName(myPlayerName) ||
                      normalizeName(pair.player2_name) === normalizeName(myPlayerName);

                    return (
                      <div
                        key={pair.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '10px 14px',
                          borderRadius: 12,
                          background: isMyPair ? colors.bg : '#f8fafc',
                          border: isMyPair ? `1px solid ${colors.border}` : '1px solid #e5e7eb',
                          fontWeight: isMyPair ? 800 : 600,
                        }}
                      >
                        <span style={{ color: '#111827' }}>
                          {pair.player1_name} / {pair.player2_name}
                        </span>
                        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#9ca3af' }}>
                          {pair.combined_rating}
                        </span>
                        {isMyPair && (
                          <span style={{ fontSize: 11, fontWeight: 700, color: colors.text, background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 999, padding: '2px 8px' }}>
                            Vos
                          </span>
                        )}
                        {adminUnlocked && (
                          <select
                            value={pair.group_name || ''}
                            onChange={(e) => handleUpdatePairGroup(pair.id, e.target.value)}
                            style={{ padding: '4px 8px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 12 }}
                          >
                            {['A', 'B', 'C', 'D'].map((g) => (
                              <option key={g} value={g}>Grupo {g}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirmados */}
      <div style={{ background: 'white', borderRadius: 20, padding: 20, border: '1px solid #e5e7eb' }}>
        <h3 style={{ marginTop: 0, marginBottom: 12 }}>
          Confirmados ({confirmedPlayers.length})
        </h3>

        {loading ? (
          <div style={{ color: '#64748b' }}>Cargando...</div>
        ) : confirmedPlayers.length === 0 ? (
          <div style={{ color: '#64748b' }}>Todavía no hay nadie anotado.</div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {confirmedPlayers.map((tp, index) => {
              const isMe = !!myPlayerName && normalizeName(tp.player_name) === normalizeName(myPlayerName);
              return (
                <div
                  key={tp.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 14px',
                    borderRadius: 12,
                    background: isMe ? '#f0fdf4' : '#f8fafc',
                    border: isMe ? '1px solid #86efac' : '1px solid #e5e7eb',
                    fontWeight: isMe ? 800 : 600,
                    color: '#111827',
                  }}
                >
                  <span style={{ color: '#9ca3af', fontSize: 13, minWidth: 24 }}>{index + 1}.</span>
                  <span>{tp.player_name}</span>
                  {isMe && (
                    <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: '#166534', background: '#dcfce7', border: '1px solid #86efac', borderRadius: 999, padding: '2px 8px' }}>
                      Vos
                    </span>
                  )}
                  {adminUnlocked && (
                    <button
                      onClick={() => handleAdminRemove(tp.player_name)}
                      style={{ marginLeft: isMe ? 8 : 'auto', padding: '4px 10px', borderRadius: 8, border: '1px solid #d1d5db', background: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#6b7280' }}
                    >
                      Sacar
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
