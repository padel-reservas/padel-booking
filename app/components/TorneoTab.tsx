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
};

type TournamentMatch = {
  id: number;
  tournament_id: number;
  pair1_id: number;
  pair2_id: number;
  round: string;
  group_name: string | null;
  set1_pair1: number | null;
  set1_pair2: number | null;
  set2_pair1: number | null;
  set2_pair2: number | null;
  set3_pair1: number | null;
  set3_pair2: number | null;
  winner_pair_id: number | null;
  elo_multiplier: number;
  status: 'pending' | 'played' | 'walkover';
};

type GroupStanding = {
  pair_id: number;
  player1_name: string;
  player2_name: string;
  group_name: string;
  played: number;
  points: number;
  wins: number;
  sets_won: number;
  sets_lost: number;
  games_won: number;
  games_lost: number;
  set_diff: number;
  game_diff: number;
  group_rank: number;
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
  const pattern = ['A', 'B', 'C', 'D', 'D', 'C', 'B', 'A', 'A', 'B', 'C', 'D', 'D', 'C', 'B', 'A'];

  return sorted.map((pair, index) => ({
    ...pair,
    group: pattern[index] || 'A',
  }));
}

const groupColors: Record<string, { bg: string; border: string; text: string }> = {
  A: { bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af' },
  B: { bg: '#f0fdf4', border: '#86efac', text: '#166534' },
  C: { bg: '#fff7ed', border: '#fed7aa', text: '#9a3412' },
  D: { bg: '#fdf4ff', border: '#e9d5ff', text: '#7e22ce' },
};

const roundLabels: Record<string, string> = {
  groups: 'Fase de grupos',
  quarters: 'Cuartos de final',
  semis: 'Semifinales',
  final: 'Final',
  third_place: '3er puesto',
};

const roundDeadlines: Record<string, string> = {
  groups: '27 de abril',
  quarters: '4 de mayo',
  semis: '11 de mayo',
  final: '16 de mayo',
  third_place: '16 de mayo',
};

export default function TorneoTab({ rankingPlayers, slots, slotPlayers, myPlayerName, adminUnlocked }: Props) {
  const [tournamentPlayers, setTournamentPlayers] = useState<TournamentPlayer[]>([]);
  const [tournamentPairs, setTournamentPairs] = useState<TournamentPair[]>([]);
  const [tournamentMatches, setTournamentMatches] = useState<TournamentMatch[]>([]);
  const [groupStandings, setGroupStandings] = useState<GroupStanding[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [adminSelectedPlayer, setAdminSelectedPlayer] = useState('');
  const [adminSelectedPlayerOverride, setAdminSelectedPlayerOverride] = useState('');
  const [generatedPairs, setGeneratedPairs] = useState<{ player1: string; player2: string; combined: number; group: string }[]>([]);
  const [showPairGenerator, setShowPairGenerator] = useState(false);
  const [resultForm, setResultForm] = useState<{ matchId: number; set1p1: string; set1p2: string; set2p1: string; set2p2: string; set3p1: string; set3p2: string } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);

    const [
      { data: tpData, error: tpError },
      { data: pairsData, error: pairsError },
      { data: matchesData, error: matchesError },
      { data: standingsData, error: standingsError },
    ] = await Promise.all([
      supabase.from('tournament_players').select('*').order('created_at', { ascending: true }),
      supabase.from('tournament_pairs').select('*').order('combined_rating', { ascending: false }),
      supabase.from('tournament_matches').select('*').eq('tournament_id', TOURNAMENT_ID).order('group_name').order('id'),
      supabase.from('tournament_group_standings').select('*').eq('tournament_id', TOURNAMENT_ID),
    ]);

    if (tpError) { alert(`Error cargando inscriptos: ${tpError.message}`); setLoading(false); return; }
    if (pairsError) { alert(`Error cargando parejas: ${pairsError.message}`); setLoading(false); return; }
    if (matchesError) { alert(`Error cargando partidos: ${matchesError.message}`); setLoading(false); return; }

    setTournamentPlayers((tpData || []) as TournamentPlayer[]);
    setTournamentPairs((pairsData || []) as TournamentPair[]);
    setTournamentMatches((matchesData || []) as TournamentMatch[]);
    setGroupStandings((standingsData || []) as GroupStanding[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const myRankingPlayer = rankingPlayers.find(
    (p) => normalizeName(p.name) === normalizeName(myPlayerName)
  );

  const matchesPlayed = myRankingPlayer?.matches_played ?? 0;
  const futureSlots = myPlayerName ? getFutureSlotCount(myPlayerName, slots, slotPlayers) : 0;
  const isEligible = matchesPlayed >= MIN_MATCHES || matchesPlayed + futureSlots >= MIN_MATCHES;

  const myRecord = tournamentPlayers.find(
    (tp) => normalizeName(tp.player_name) === normalizeName(myPlayerName)
  );
  const isConfirmed = myRecord?.status === 'confirmed';

  const confirmedPlayers = tournamentPlayers.filter((tp) => tp.status === 'confirmed');

  const myPair = tournamentPairs.find(
    (p) =>
      normalizeName(p.player1_name) === normalizeName(myPlayerName) ||
      normalizeName(p.player2_name) === normalizeName(myPlayerName)
  );

  const eligibleNotConfirmed = rankingPlayers
    .filter((p) => {
      const pFutureSlots = getFutureSlotCount(p.name, slots, slotPlayers);
      const pMatchesPlayed = p.matches_played ?? 0;
      const pEligible = pMatchesPlayed >= MIN_MATCHES || pMatchesPlayed + pFutureSlots >= MIN_MATCHES;
      const alreadyConfirmed = confirmedPlayers.some((tp) => normalizeName(tp.player_name) === normalizeName(p.name));
      return pEligible && !alreadyConfirmed;
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const allNotConfirmed = rankingPlayers
    .filter((p) => {
      const alreadyConfirmed = confirmedPlayers.some((tp) => normalizeName(tp.player_name) === normalizeName(p.name));
      return !alreadyConfirmed;
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const pairsByGroup = ['A', 'B', 'C', 'D'].reduce((acc, group) => {
    acc[group] = tournamentPairs.filter((p) => p.group_name === group);
    return acc;
  }, {} as Record<string, TournamentPair[]>);

  const matchesByGroup = ['A', 'B', 'C', 'D'].reduce((acc, group) => {
    acc[group] = tournamentMatches.filter((m) => m.group_name === group && m.round === 'groups');
    return acc;
  }, {} as Record<string, TournamentMatch[]>);

  const standingsByGroup = ['A', 'B', 'C', 'D'].reduce((acc, group) => {
    acc[group] = groupStandings
      .filter((s) => s.group_name === group)
      .sort((a, b) => a.group_rank - b.group_rank);
    return acc;
  }, {} as Record<string, GroupStanding[]>);

  function getPairName(pairId: number) {
    const pair = tournamentPairs.find((p) => p.id === pairId);
    if (!pair) return '?';
    return `${pair.player1_name} / ${pair.player2_name}`;
  }

  function isMyMatch(match: TournamentMatch) {
    if (!myPair) return false;
    return match.pair1_id === myPair.id || match.pair2_id === myPair.id;
  }

  function handleGeneratePairs() {
    const players = confirmedPlayers
      .map((tp) => {
        const rp = rankingPlayers.find((p) => normalizeName(p.name) === normalizeName(tp.player_name));
        return { name: tp.player_name, rating: rp?.display_rating ?? 1500 };
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

    const { error: deleteError } = await supabase
      .from('tournament_pairs')
      .delete()
      .eq('tournament_id', TOURNAMENT_ID);

    if (deleteError) {
      alert(`No se pudieron borrar las parejas anteriores: ${deleteError.message}`);
      setSaving(false);
      return;
    }

    const payload = generatedPairs.map((p) => ({
      tournament_id: TOURNAMENT_ID,
      player1_name: p.player1,
      player2_name: p.player2,
      combined_rating: p.combined,
      group_name: p.group,
    }));

    const { error: insertError } = await supabase.from('tournament_pairs').insert(payload);

    setSaving(false);

    if (insertError) {
      alert(`No se pudieron guardar las parejas: ${insertError.message}`);
      return;
    }

    setShowPairGenerator(false);
    setGeneratedPairs([]);
    await loadData();
  }

  async function handleGenerateMatches() {
    const ok = window.confirm('¿Generar todos los partidos de grupos? Esto borrará los partidos existentes.');
    if (!ok) return;

    setSaving(true);

    const { error } = await supabase.rpc('generate_group_matches', {
      p_tournament_id: TOURNAMENT_ID,
    });

    setSaving(false);

    if (error) {
      alert(`No se pudieron generar los partidos: ${error.message}`);
      return;
    }

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

  async function handleSaveResult() {
    if (!resultForm) return;

    const { matchId, set1p1, set1p2, set2p1, set2p2, set3p1, set3p2 } = resultForm;

    const s1p1 = parseInt(set1p1);
    const s1p2 = parseInt(set1p2);
    const s2p1 = parseInt(set2p1);
    const s2p2 = parseInt(set2p2);

    if (isNaN(s1p1) || isNaN(s1p2) || isNaN(s2p1) || isNaN(s2p2)) {
      alert('Cargá al menos los primeros 2 sets.');
      return;
    }

    const match = tournamentMatches.find((m) => m.id === matchId);
    if (!match) return;

    // Determinar ganador
    let setsP1 = 0;
    let setsP2 = 0;
    if (s1p1 > s1p2) setsP1++; else setsP2++;
    if (s2p1 > s2p2) setsP1++; else setsP2++;

    let s3p1: number | null = null;
    let s3p2: number | null = null;

    if (setsP1 === 1 && setsP2 === 1) {
      s3p1 = parseInt(set3p1);
      s3p2 = parseInt(set3p2);
      if (isNaN(s3p1) || isNaN(s3p2)) {
        alert('Hay empate en sets, cargá el 3er set.');
        return;
      }
      if (s3p1 > s3p2) setsP1++; else setsP2++;
    }

    const winnerPairId = setsP1 > setsP2 ? match.pair1_id : match.pair2_id;

    setSaving(true);

    const { error } = await supabase
      .from('tournament_matches')
      .update({
        set1_pair1: s1p1,
        set1_pair2: s1p2,
        set2_pair1: s2p1,
        set2_pair2: s2p2,
        set3_pair1: s3p1,
        set3_pair2: s3p2,
        winner_pair_id: winnerPairId,
        status: 'played',
        played_at: new Date().toISOString(),
      })
      .eq('id', matchId);

    setSaving(false);

    if (error) {
      alert(`No se pudo guardar el resultado: ${error.message}`);
      return;
    }

    setResultForm(null);
    await loadData();
  }

  async function handleConfirm() {
    if (!myPlayerName) { alert('Primero elegí tu jugador en la tab Ranking.'); return; }
    if (!isEligible) return;
    setSaving(true);
    const { error } = await supabase.from('tournament_players').upsert(
      { player_name: myPlayerName.trim(), status: 'confirmed' },
      { onConflict: 'player_name' }
    );
    setSaving(false);
    if (error) { alert(`No se pudo confirmar: ${error.message}`); return; }
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
    if (error) { alert(`No se pudo retirar: ${error.message}`); return; }
    await loadData();
  }

  async function handleAdminAdd() {
    if (!adminSelectedPlayer) { alert('Elegí un jugador para agregar.'); return; }
    setSaving(true);
    const { error } = await supabase.from('tournament_players').upsert(
      { player_name: adminSelectedPlayer.trim(), status: 'confirmed' },
      { onConflict: 'player_name' }
    );
    setSaving(false);
    if (error) { alert(`No se pudo agregar: ${error.message}`); return; }
    setAdminSelectedPlayer('');
    await loadData();
  }

  async function handleAdminAddOverride() {
    if (!adminSelectedPlayerOverride) { alert('Elegí un jugador para agregar.'); return; }
    setSaving(true);
    const { error } = await supabase.from('tournament_players').upsert(
      { player_name: adminSelectedPlayerOverride.trim(), status: 'confirmed' },
      { onConflict: 'player_name' }
    );
    setSaving(false);
    if (error) { alert(`No se pudo agregar: ${error.message}`); return; }
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
    if (error) { alert(`No se pudo sacar: ${error.message}`); return; }
    await loadData();
  }

  const hasMatches = tournamentMatches.filter((m) => m.round === 'groups').length > 0;

  return (
    <div style={{ display: 'grid', gap: 16 }}>

      {/* Header */}
      <div style={{ background: 'white', borderRadius: 20, padding: 20, border: '1px solid #e5e7eb' }}>
        <h2 style={{ marginTop: 0, marginBottom: 4 }}>🏆 Greenwich Padel Open Spring 26</h2>
        <p style={{ color: '#64748b', marginBottom: 0 }}>
          Fase de grupos — fecha límite: <strong>27 de abril</strong>
        </p>
      </div>

      {/* Panel admin */}
      {adminUnlocked && (
        <div style={{ background: 'white', borderRadius: 20, padding: 20, border: '2px solid #111827' }}>
          <h3 style={{ marginTop: 0, marginBottom: 16 }}>Admin — Gestión del torneo</h3>

          {/* Agregar elegible */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6, fontWeight: 700 }}>Agregar jugador elegible</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <select value={adminSelectedPlayer} onChange={(e) => setAdminSelectedPlayer(e.target.value)}
                style={{ padding: '10px 12px', borderRadius: 12, border: '1px solid #d1d5db', background: 'white', minWidth: 200 }}>
                <option value="">Elegí un jugador...</option>
                {eligibleNotConfirmed.map((p) => (
                  <option key={p.id} value={p.name}>{p.name} ({p.matches_played} partidos)</option>
                ))}
              </select>
              <button onClick={handleAdminAdd} disabled={saving || !adminSelectedPlayer}
                style={{ padding: '10px 16px', borderRadius: 12, border: 'none', background: '#111827', color: 'white', cursor: saving || !adminSelectedPlayer ? 'default' : 'pointer', fontWeight: 700, opacity: saving || !adminSelectedPlayer ? 0.5 : 1 }}>
                Agregar
              </button>
            </div>
          </div>

          {/* Override */}
          <div style={{ paddingTop: 16, borderTop: '1px solid #e5e7eb', marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: '#92400e', marginBottom: 6, fontWeight: 700 }}>Agregar sin mínimo de partidos (override)</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <select value={adminSelectedPlayerOverride} onChange={(e) => setAdminSelectedPlayerOverride(e.target.value)}
                style={{ padding: '10px 12px', borderRadius: 12, border: '1px solid #fde68a', background: '#fffbeb', minWidth: 200 }}>
                <option value="">Elegí un jugador...</option>
                {allNotConfirmed.map((p) => (
                  <option key={p.id} value={p.name}>{p.name} ({p.matches_played} partidos)</option>
                ))}
              </select>
              <button onClick={handleAdminAddOverride} disabled={saving || !adminSelectedPlayerOverride}
                style={{ padding: '10px 16px', borderRadius: 12, border: 'none', background: '#92400e', color: 'white', cursor: saving || !adminSelectedPlayerOverride ? 'default' : 'pointer', fontWeight: 700, opacity: saving || !adminSelectedPlayerOverride ? 0.5 : 1 }}>
                Agregar igual
              </button>
            </div>
          </div>

          {/* Generar parejas y partidos */}
          <div style={{ paddingTop: 16, borderTop: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10, fontWeight: 700 }}>Armado de parejas, grupos y partidos</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={handleGeneratePairs} disabled={saving}
                style={{ padding: '10px 16px', borderRadius: 12, border: 'none', background: '#111827', color: 'white', cursor: saving ? 'default' : 'pointer', fontWeight: 700, opacity: saving ? 0.5 : 1 }}>
                Generar parejas (Serpenteo 2)
              </button>

              {tournamentPairs.length > 0 && !hasMatches && (
                <button onClick={handleGenerateMatches} disabled={saving}
                  style={{ padding: '10px 16px', borderRadius: 12, border: 'none', background: '#166534', color: 'white', cursor: saving ? 'default' : 'pointer', fontWeight: 700, opacity: saving ? 0.5 : 1 }}>
                  Generar partidos de grupos
                </button>
              )}

              {tournamentPairs.length > 0 && (
                <button onClick={handleDeletePairs} disabled={saving}
                  style={{ padding: '10px 16px', borderRadius: 12, border: '1px solid #fca5a5', background: 'white', color: '#991b1b', cursor: saving ? 'default' : 'pointer', fontWeight: 700 }}>
                  Borrar todo y empezar de nuevo
                </button>
              )}
            </div>

            {/* Preview parejas */}
            {showPairGenerator && generatedPairs.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontWeight: 800, marginBottom: 10 }}>Preview — {generatedPairs.length} parejas:</div>
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
                          <select value={p.group}
                            onChange={(e) => {
                              const newPairs = generatedPairs.map((pair) =>
                                pair.player1 === p.player1 ? { ...pair, group: e.target.value } : pair
                              );
                              setGeneratedPairs(newPairs);
                            }}
                            style={{ padding: '4px 8px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 12 }}>
                            {['A', 'B', 'C', 'D'].map((g) => <option key={g} value={g}>Grupo {g}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                  );
                })}
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button onClick={handleSavePairs} disabled={saving}
                    style={{ padding: '10px 16px', borderRadius: 12, border: 'none', background: '#111827', color: 'white', cursor: saving ? 'default' : 'pointer', fontWeight: 700, opacity: saving ? 0.5 : 1 }}>
                    {saving ? 'Guardando...' : 'Confirmar y guardar parejas'}
                  </button>
                  <button onClick={() => { setShowPairGenerator(false); setGeneratedPairs([]); }}
                    style={{ padding: '10px 16px', borderRadius: 12, border: '1px solid #d1d5db', background: 'white', cursor: 'pointer', fontWeight: 700 }}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mi pareja y grupo */}
      {myPlayerName ? (
        <div style={{ background: 'white', borderRadius: 20, padding: 20, border: '1px solid #e5e7eb' }}>
          <h3 style={{ marginTop: 0 }}>Tu estado</h3>

          <div style={{ marginBottom: 12, fontSize: 14, color: '#374151' }}>
            <span style={{ fontWeight: 700 }}>{myPlayerName}</span>
            {' — '}
            {matchesPlayed} partido{matchesPlayed !== 1 ? 's' : ''} jugado{matchesPlayed !== 1 ? 's' : ''}
          </div>

          {!isEligible && (
            <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 12, padding: '10px 14px', fontSize: 13, color: '#92400e', fontWeight: 700 }}>
              Necesitás al menos {MIN_MATCHES} partidos para anotarte.
            </div>
          )}

          {isEligible && !isConfirmed && (
            <button onClick={handleConfirm} disabled={saving}
              style={{ padding: '12px 20px', borderRadius: 12, border: 'none', background: '#111827', color: 'white', cursor: saving ? 'default' : 'pointer', fontWeight: 700, fontSize: 15, opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Guardando...' : '✅ Quiero jugar el torneo'}
            </button>
          )}

          {isConfirmed && !myPair && (
            <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 12, padding: '10px 16px', fontWeight: 800, color: '#166534', fontSize: 14 }}>
              ✅ Confirmado — las parejas se anuncian pronto
            </div>
          )}

          {isConfirmed && myPair && (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ background: myPair.group_name ? groupColors[myPair.group_name].bg : '#f8fafc', border: `1px solid ${myPair.group_name ? groupColors[myPair.group_name].border : '#e5e7eb'}`, borderRadius: 12, padding: '12px 16px' }}>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Tu pareja</div>
                <div style={{ fontWeight: 800, fontSize: 16, color: '#111827' }}>
                  {myPair.player1_name} / {myPair.player2_name}
                </div>
                {myPair.group_name && (
                  <div style={{ marginTop: 6, fontSize: 13, fontWeight: 700, color: myPair.group_name ? groupColors[myPair.group_name].text : '#374151' }}>
                    Grupo {myPair.group_name}
                  </div>
                )}
              </div>

              <button onClick={handleWithdraw} disabled={saving}
                style={{ padding: '10px 14px', borderRadius: 12, border: '1px solid #d1d5db', background: 'white', cursor: saving ? 'default' : 'pointer', fontWeight: 700, fontSize: 13, opacity: saving ? 0.7 : 1, width: 'fit-content' }}>
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

      {/* Grupos con partidos y posiciones */}
      {tournamentPairs.length > 0 && (
        <div style={{ display: 'grid', gap: 16 }}>
          {['A', 'B', 'C', 'D'].map((group) => {
            const pairs = pairsByGroup[group] || [];
            const matches = matchesByGroup[group] || [];
            const standings = standingsByGroup[group] || [];
            if (pairs.length === 0) return null;
            const colors = groupColors[group];

            return (
              <div key={group} style={{ background: 'white', borderRadius: 20, padding: 20, border: `1px solid ${colors.border}` }}>
                <h3 style={{ marginTop: 0, marginBottom: 16, color: colors.text }}>
                  Grupo {group} — {pairs.length} parejas
                  <span style={{ fontSize: 12, fontWeight: 400, color: '#6b7280', marginLeft: 8 }}>
                    Fecha límite: 27 de abril
                  </span>
                </h3>

                {/* Tabla de posiciones */}
                {standings.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 8 }}>POSICIONES</div>
                    <div style={{ display: 'grid', gap: 6 }}>
                      {standings.map((s, idx) => {
                        const isMyStanding = myPair && s.pair_id === myPair.id;
                        const advances = idx < 2;
                        return (
                          <div key={s.pair_id} style={{
                            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10,
                            background: isMyStanding ? colors.bg : advances ? '#f0fdf4' : '#f8fafc',
                            border: isMyStanding ? `1px solid ${colors.border}` : advances ? '1px solid #86efac' : '1px solid #e5e7eb',
                            fontSize: 13,
                          }}>
                            <span style={{ fontWeight: 800, minWidth: 20, color: advances ? '#166534' : '#9ca3af' }}>
                              {idx + 1}
                            </span>
                            <span style={{ fontWeight: isMyStanding ? 800 : 600 }}>
                              {s.player1_name} / {s.player2_name}
                            </span>
                            <span style={{ marginLeft: 'auto', display: 'flex', gap: 12, fontSize: 12, color: '#6b7280' }}>
                              <span title="Puntos" style={{ fontWeight: 800, color: '#111827' }}>{s.points}pts</span>
                              <span title="Sets">{s.sets_won}-{s.sets_lost}</span>
                              <span title="Games">{s.games_won}-{s.games_lost}</span>
                            </span>
                            {advances && (
                              <span style={{ fontSize: 11, fontWeight: 700, color: '#166534', background: '#dcfce7', border: '1px solid #86efac', borderRadius: 999, padding: '2px 6px' }}>
                                Avanza
              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Partidos */}
                {matches.length > 0 && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 8 }}>PARTIDOS</div>
                    <div style={{ display: 'grid', gap: 8 }}>
                      {matches.map((match) => {
                        const isMine = isMyMatch(match);
                        const isPlayed = match.status === 'played';
                        const pair1Name = getPairName(match.pair1_id);
                        const pair2Name = getPairName(match.pair2_id);

                        return (
                          <div key={match.id} style={{
                            padding: '12px 14px', borderRadius: 12,
                            background: isMine ? colors.bg : '#f8fafc',
                            border: isMine ? `1px solid ${colors.border}` : '1px solid #e5e7eb',
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <div style={{ fontWeight: isMine ? 800 : 600, fontSize: 13 }}>
                                {pair1Name}
                                <span style={{ color: '#9ca3af', margin: '0 6px' }}>vs</span>
                                {pair2Name}
                              </div>

                              {isPlayed && (
                                <div style={{ fontSize: 13, fontWeight: 800, color: '#166534' }}>
                                  {match.set1_pair1}-{match.set1_pair2}
                                  {match.set2_pair1 != null && ` / ${match.set2_pair1}-${match.set2_pair2}`}
                                  {match.set3_pair1 != null && ` / ${match.set3_pair1}-${match.set3_pair2}`}
                                </div>
                              )}

                              {!isPlayed && (
                                <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 700, background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 999, padding: '2px 8px' }}>
                                  Pendiente
                                </span>
                              )}
                            </div>

                            {/* Cargar resultado — admin o pareja involucrada */}
                            {!isPlayed && (adminUnlocked || isMine) && (
                              <div style={{ marginTop: 10 }}>
                                {resultForm?.matchId === match.id ? (
                                  <div style={{ display: 'grid', gap: 8 }}>
                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                                      <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 700, minWidth: 40 }}>Set 1</span>
                                      <input type="number" min="0" max="7" value={resultForm.set1p1}
                                        onChange={(e) => setResultForm({ ...resultForm, set1p1: e.target.value })}
                                        style={{ width: 48, padding: '6px 8px', borderRadius: 8, border: '1px solid #d1d5db', textAlign: 'center' }} />
                                      <span style={{ color: '#9ca3af' }}>-</span>
                                      <input type="number" min="0" max="7" value={resultForm.set1p2}
                                        onChange={(e) => setResultForm({ ...resultForm, set1p2: e.target.value })}
                                        style={{ width: 48, padding: '6px 8px', borderRadius: 8, border: '1px solid #d1d5db', textAlign: 'center' }} />
                                    </div>
                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                                      <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 700, minWidth: 40 }}>Set 2</span>
                                      <input type="number" min="0" max="7" value={resultForm.set2p1}
                                        onChange={(e) => setResultForm({ ...resultForm, set2p1: e.target.value })}
                                        style={{ width: 48, padding: '6px 8px', borderRadius: 8, border: '1px solid #d1d5db', textAlign: 'center' }} />
                                      <span style={{ color: '#9ca3af' }}>-</span>
                                      <input type="number" min="0" max="7" value={resultForm.set2p2}
                                        onChange={(e) => setResultForm({ ...resultForm, set2p2: e.target.value })}
                                        style={{ width: 48, padding: '6px 8px', borderRadius: 8, border: '1px solid #d1d5db', textAlign: 'center' }} />
                                    </div>
                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                                      <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 700, minWidth: 40 }}>Set 3</span>
                                      <input type="number" min="0" max="7" value={resultForm.set3p1}
                                        onChange={(e) => setResultForm({ ...resultForm, set3p1: e.target.value })}
                                        style={{ width: 48, padding: '6px 8px', borderRadius: 8, border: '1px solid #d1d5db', textAlign: 'center' }} />
                                      <span style={{ color: '#9ca3af' }}>-</span>
                                      <input type="number" min="0" max="7" value={resultForm.set3p2}
                                        onChange={(e) => setResultForm({ ...resultForm, set3p2: e.target.value })}
                                        style={{ width: 48, padding: '6px 8px', borderRadius: 8, border: '1px solid #d1d5db', textAlign: 'center' }} />
                                      <span style={{ fontSize: 11, color: '#9ca3af' }}>(si hubo)</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                      <button onClick={handleSaveResult} disabled={saving}
                                        style={{ padding: '8px 14px', borderRadius: 10, border: 'none', background: '#111827', color: 'white', cursor: saving ? 'default' : 'pointer', fontWeight: 700, opacity: saving ? 0.7 : 1 }}>
                                        {saving ? 'Guardando...' : 'Guardar resultado'}
                                      </button>
                                      <button onClick={() => setResultForm(null)}
                                        style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid #d1d5db', background: 'white', cursor: 'pointer', fontWeight: 700 }}>
                                        Cancelar
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => setResultForm({ matchId: match.id, set1p1: '', set1p2: '', set2p1: '', set2p2: '', set3p1: '', set3p2: '' })}
                                    style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid #d1d5db', background: 'white', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                                    Cargar resultado
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Solo parejas si no hay partidos aún */}
                {matches.length === 0 && (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {pairs.map((pair) => {
                      const isMyPair = normalizeName(pair.player1_name) === normalizeName(myPlayerName) ||
                        normalizeName(pair.player2_name) === normalizeName(myPlayerName);
                      return (
                        <div key={pair.id} style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 12,
                          background: isMyPair ? colors.bg : '#f8fafc',
                          border: isMyPair ? `1px solid ${colors.border}` : '1px solid #e5e7eb',
                          fontWeight: isMyPair ? 800 : 600,
                        }}>
                          <span style={{ color: '#111827' }}>{pair.player1_name} / {pair.player2_name}</span>
                          <span style={{ marginLeft: 'auto', fontSize: 12, color: '#9ca3af' }}>{pair.combined_rating}</span>
                          {adminUnlocked && (
                            <select value={pair.group_name || ''} onChange={(e) => handleUpdatePairGroup(pair.id, e.target.value)}
                              style={{ padding: '4px 8px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 12 }}>
                              {['A', 'B', 'C', 'D'].map((g) => <option key={g} value={g}>Grupo {g}</option>)}
                            </select>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Confirmados */}
      <div style={{ background: 'white', borderRadius: 20, padding: 20, border: '1px solid #e5e7eb' }}>
        <h3 style={{ marginTop: 0, marginBottom: 12 }}>Confirmados ({confirmedPlayers.length})</h3>
        {loading ? (
          <div style={{ color: '#64748b' }}>Cargando...</div>
        ) : confirmedPlayers.length === 0 ? (
          <div style={{ color: '#64748b' }}>Todavía no hay nadie anotado.</div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {confirmedPlayers.map((tp, index) => {
              const isMe = !!myPlayerName && normalizeName(tp.player_name) === normalizeName(myPlayerName);
              return (
                <div key={tp.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 12,
                  background: isMe ? '#f0fdf4' : '#f8fafc',
                  border: isMe ? '1px solid #86efac' : '1px solid #e5e7eb',
                  fontWeight: isMe ? 800 : 600, color: '#111827',
                }}>
                  <span style={{ color: '#9ca3af', fontSize: 13, minWidth: 24 }}>{index + 1}.</span>
                  <span>{tp.player_name}</span>
                  {isMe && (
                    <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: '#166534', background: '#dcfce7', border: '1px solid #86efac', borderRadius: 999, padding: '2px 8px' }}>
                      Vos
                    </span>
                  )}
                  {adminUnlocked && (
                    <button onClick={() => handleAdminRemove(tp.player_name)}
                      style={{ marginLeft: isMe ? 8 : 'auto', padding: '4px 10px', borderRadius: 8, border: '1px solid #d1d5db', background: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#6b7280' }}>
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
