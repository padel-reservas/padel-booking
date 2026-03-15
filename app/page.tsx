'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const MAX_PLAYERS = 4;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Slot = {
  id: number;
  date: string;
  time: string;
};

type SlotPlayer = {
  id: number;
  slot_id: number;
  name: string;
  paid: boolean;
  created_at?: string;
};

type RankingPlayer = {
  id: number;
  name: string;
  elo_rating: number;
  display_rating: number;
  matches_played: number;
  wins: number;
  losses: number;
  win_pct: number;
  sets_won: number;
  sets_lost: number;
  provisional: boolean;
};

type Match = {
  id: number;
  match_date: string;
  match_time: string | null;
  slot_id: number | null;
  team_a_player_1_id: number;
  team_a_player_2_id: number;
  team_b_player_1_id: number;
  team_b_player_2_id: number;
  set1_a: number | null;
  set1_b: number | null;
  set2_a: number | null;
  set2_b: number | null;
  set3_a: number | null;
  set3_b: number | null;
  winner_team: 'A' | 'B' | null;
  source: string | null;
  notes: string | null;
  created_at?: string;
};

type TabKey = 'turnos' | 'ranking' | 'historial';

type ResultFormState = {
  slotId: number;
  editingMatchId: number | null;
  teamA1: number | '';
  teamA2: number | '';
  teamB1: number | '';
  teamB2: number | '';
  set1A: string;
  set1B: string;
  set2A: string;
  set2B: string;
  set3A: string;
  set3B: string;
  notes: string;
};

function todayISO() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDate(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString('es-AR', {
    weekday: 'short',
    day: 'numeric',
    month: 'numeric',
  });
}

function sortPlayers(players: SlotPlayer[]) {
  return [...players].sort((a, b) => {
    const aTime = a.created_at || '';
    const bTime = b.created_at || '';
    return aTime.localeCompare(bTime);
  });
}

function scoreText(m: Match) {
  const sets: string[] = [];
  if (m.set1_a != null && m.set1_b != null) sets.push(`${m.set1_a}-${m.set1_b}`);
  if (m.set2_a != null && m.set2_b != null) sets.push(`${m.set2_a}-${m.set2_b}`);
  if (m.set3_a != null && m.set3_b != null) sets.push(`${m.set3_a}-${m.set3_b}`);
  return sets.join(' / ');
}

function playerNameById(players: RankingPlayer[], id: number) {
  return players.find((p) => p.id === id)?.name || `Jugador ${id}`;
}

function statsMap(rankingPlayers: RankingPlayer[]) {
  const map = new Map<
    string,
    { position: number; display: number; winPct: number; provisional: boolean }
  >();

  const sorted = [...rankingPlayers].sort((a, b) => {
    if (b.display_rating !== a.display_rating) return b.display_rating - a.display_rating;
    if (b.elo_rating !== a.elo_rating) return b.elo_rating - a.elo_rating;
    return a.name.localeCompare(b.name);
  });

  sorted.forEach((p, idx) => {
    map.set(p.name.trim().toLowerCase(), {
      position: idx + 1,
      display: p.display_rating,
      winPct: p.win_pct,
      provisional: p.provisional,
    });
  });

  return map;
}

function parseSetValue(v: string): number | null {
  const t = v.trim();
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return n;
}

function computeWinnerTeam(form: ResultFormState): 'A' | 'B' | null {
  const sets = [
    [parseSetValue(form.set1A), parseSetValue(form.set1B)],
    [parseSetValue(form.set2A), parseSetValue(form.set2B)],
    [parseSetValue(form.set3A), parseSetValue(form.set3B)],
  ];

  let aWins = 0;
  let bWins = 0;

  for (const [a, b] of sets) {
    if (a == null || b == null) continue;
    if (a > b) aWins += 1;
    if (b > a) bWins += 1;
  }

  if (aWins === 0 && bWins === 0) return null;
  if (aWins > bWins) return 'A';
  if (bWins > aWins) return 'B';
  return null;
}

function rankingPlayerIdFromSlotPlayerId(
  slotPlayerId: number,
  slotPlayers: SlotPlayer[],
  rankingPlayers: RankingPlayer[]
) {
  const slotPlayer = slotPlayers.find((p) => p.id === slotPlayerId);
  if (!slotPlayer) return null;

  const rankingPlayer = rankingPlayers.find(
    (p) => p.name.trim().toLowerCase() === slotPlayer.name.trim().toLowerCase()
  );

  return rankingPlayer?.id ?? null;
}

export default function Page() {
  const [activeTab, setActiveTab] = useState<TabKey>('turnos');

  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotPlayers, setSlotPlayers] = useState<SlotPlayer[]>([]);
  const [rankingPlayers, setRankingPlayers] = useState<RankingPlayer[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);

  const [nameInput, setNameInput] = useState<Record<number, string>>({});
  const [showAdmin, setShowAdmin] = useState(false);
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [pin, setPin] = useState('');
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState('09:00');
  const [loading, setLoading] = useState(true);

  const [resultModalOpen, setResultModalOpen] = useState(false);
  const [resultForm, setResultForm] = useState<ResultFormState | null>(null);
  const [savingResult, setSavingResult] = useState(false);

  const canSeeAdmin = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return params.get('admin') === '1';
  }, []);

  async function loadData() {
    setLoading(true);

    const [
      { data: slotsData },
      { data: slotPlayersData },
      { data: rankingPlayersData },
      { data: matchesData },
    ] = await Promise.all([
      supabase.from('slots').select('*').order('date').order('time'),
      supabase.from('players').select('*').order('created_at', { ascending: true }),
      supabase
        .from('ranking_players')
        .select('*')
        .order('display_rating', { ascending: false })
        .order('elo_rating', { ascending: false })
        .order('name', { ascending: true }),
      supabase
        .from('matches')
        .select('*')
        .order('match_date', { ascending: false })
        .order('id', { ascending: false }),
    ]);

    setSlots((slotsData || []) as Slot[]);
    setSlotPlayers((slotPlayersData || []) as SlotPlayer[]);
    setRankingPlayers((rankingPlayersData || []) as RankingPlayer[]);
    setMatches((matchesData || []) as Match[]);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  const rankingStats = useMemo(() => statsMap(rankingPlayers), [rankingPlayers]);

  const slotMatchMap = useMemo(() => {
    const map = new Map<number, Match>();
    for (const m of matches) {
      if (m.slot_id != null && !map.has(m.slot_id)) {
        map.set(m.slot_id, m);
      }
    }
    return map;
  }, [matches]);

  const slotsWithPlayers = useMemo(() => {
    return slots.map((s) => {
      const allPlayers = sortPlayers(slotPlayers.filter((p) => p.slot_id === s.id));
      const match = slotMatchMap.get(s.id) || null;

      return {
        ...s,
        allPlayers,
        activePlayers: allPlayers.slice(0, MAX_PLAYERS),
        waitlistPlayers: allPlayers.slice(MAX_PLAYERS),
        match,
      };
    });
  }, [slots, slotPlayers, slotMatchMap]);

  const groupedSlots = useMemo(() => {
    const grouped: Record<string, typeof slotsWithPlayers> = {};
    for (const slot of slotsWithPlayers) {
      if (!grouped[slot.date]) grouped[slot.date] = [];
      grouped[slot.date].push(slot);
    }
    return grouped;
  }, [slotsWithPlayers]);

  async function addPlayer(slotId: number) {
    const rawName = (nameInput[slotId] || '').trim();

    if (!rawName) {
      alert('Poné tu nombre');
      return;
    }

    const slot = slotsWithPlayers.find((s) => s.id === slotId);
    if (!slot) return;

    const alreadyThere = slot.allPlayers.some(
      (p) => p.name.trim().toLowerCase() === rawName.toLowerCase()
    );

    if (alreadyThere) {
      alert('Ese nombre ya está anotado en este turno');
      return;
    }

    const { error } = await supabase.from('players').insert({
      slot_id: slotId,
      name: rawName,
      paid: false,
    });

    if (error) {
      alert(`No se pudo anotar: ${error.message}`);
      return;
    }

    setNameInput((v) => ({ ...v, [slotId]: '' }));
    loadData();
  }

  async function removePlayer(playerId: number) {
    const { error } = await supabase.from('players').delete().eq('id', playerId);

    if (error) {
      alert(`No se pudo borrar: ${error.message}`);
      return;
    }

    loadData();
  }

  async function adminAction(action: any) {
    const res = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...action, pin }),
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      loadData();
      return true;
    }

    alert(data.error || `Error admin (${res.status})`);
    return false;
  }

  async function unlockAdmin() {
    const ok = await adminAction({ action: 'noop' });
    if (ok) setAdminUnlocked(true);
  }

  function openNewResultModal(slotId: number) {
    const slot = slotsWithPlayers.find((s) => s.id === slotId);
    if (!slot) return;

    if (slot.activePlayers.length !== 4) {
      alert('Para cargar resultado el turno debe tener exactamente 4 jugadores.');
      return;
    }

    const p1 = slot.activePlayers[0]?.id ?? '';
    const p2 = slot.activePlayers[1]?.id ?? '';
    const p3 = slot.activePlayers[2]?.id ?? '';
    const p4 = slot.activePlayers[3]?.id ?? '';

    setResultForm({
      slotId,
      editingMatchId: null,
      teamA1: p1,
      teamA2: p2,
      teamB1: p3,
      teamB2: p4,
      set1A: '',
      set1B: '',
      set2A: '',
      set2B: '',
      set3A: '',
      set3B: '',
      notes: '',
    });

    setResultModalOpen(true);
  }

  function openEditResultModal(slotId: number) {
    const slot = slotsWithPlayers.find((s) => s.id === slotId);
    if (!slot || !slot.match) return;

    const m = slot.match;

    const slotPlayerIdByRankingId = (rankingId: number): number | '' => {
      const rankingName = rankingPlayers.find((p) => p.id === rankingId)?.name?.trim().toLowerCase();
      if (!rankingName) return '';
      const slotPlayer = slot.activePlayers.find(
        (p) => p.name.trim().toLowerCase() === rankingName
      );
      return slotPlayer?.id ?? '';
    };

    setResultForm({
      slotId,
      editingMatchId: m.id,
      teamA1: slotPlayerIdByRankingId(m.team_a_player_1_id),
      teamA2: slotPlayerIdByRankingId(m.team_a_player_2_id),
      teamB1: slotPlayerIdByRankingId(m.team_b_player_1_id),
      teamB2: slotPlayerIdByRankingId(m.team_b_player_2_id),
      set1A: m.set1_a != null ? String(m.set1_a) : '',
      set1B: m.set1_b != null ? String(m.set1_b) : '',
      set2A: m.set2_a != null ? String(m.set2_a) : '',
      set2B: m.set2_b != null ? String(m.set2_b) : '',
      set3A: m.set3_a != null ? String(m.set3_a) : '',
      set3B: m.set3_b != null ? String(m.set3_b) : '',
      notes: m.notes || '',
    });

    setResultModalOpen(true);
  }

  function closeResultModal() {
    setResultModalOpen(false);
    setResultForm(null);
  }

  async function saveResult() {
    if (!resultForm) return;

    const slot = slotsWithPlayers.find((s) => s.id === resultForm.slotId);
    if (!slot) {
      alert('No se encontró el turno.');
      return;
    }

    const selectedIds = [
      resultForm.teamA1,
      resultForm.teamA2,
      resultForm.teamB1,
      resultForm.teamB2,
    ];

    if (selectedIds.some((id) => id === '')) {
      alert('Tenés que elegir los 4 jugadores.');
      return;
    }

    const slotPlayerIds = selectedIds as number[];
    const uniqueIds = new Set(slotPlayerIds);

    if (uniqueIds.size !== 4) {
      alert('No podés repetir jugadores en las parejas.');
      return;
    }

    const validSlotPlayerIds = new Set(slot.activePlayers.map((p) => p.id));
    const allValid = slotPlayerIds.every((id) => validSlotPlayerIds.has(id));

    if (!allValid) {
      alert('Solo podés usar los 4 jugadores de ese turno.');
      return;
    }

    const rankingIdA1 = rankingPlayerIdFromSlotPlayerId(
      resultForm.teamA1 as number,
      slotPlayers,
      rankingPlayers
    );
    const rankingIdA2 = rankingPlayerIdFromSlotPlayerId(
      resultForm.teamA2 as number,
      slotPlayers,
      rankingPlayers
    );
    const rankingIdB1 = rankingPlayerIdFromSlotPlayerId(
      resultForm.teamB1 as number,
      slotPlayers,
      rankingPlayers
    );
    const rankingIdB2 = rankingPlayerIdFromSlotPlayerId(
      resultForm.teamB2 as number,
      slotPlayers,
      rankingPlayers
    );

    if (!rankingIdA1 || !rankingIdA2 || !rankingIdB1 || !rankingIdB2) {
      alert(
        'Uno o más jugadores del turno no existen en ranking_players. Revisá que los nombres coincidan exactamente con los del ranking.'
      );
      return;
    }

    const winnerTeam = computeWinnerTeam(resultForm);
    if (!winnerTeam) {
      alert('Cargá al menos un resultado válido para determinar ganador.');
      return;
    }

    const payload = {
      match_date: slot.date,
      match_time: slot.time,
      slot_id: slot.id,
      team_a_player_1_id: rankingIdA1,
      team_a_player_2_id: rankingIdA2,
      team_b_player_1_id: rankingIdB1,
      team_b_player_2_id: rankingIdB2,
      set1_a: parseSetValue(resultForm.set1A),
      set1_b: parseSetValue(resultForm.set1B),
      set2_a: parseSetValue(resultForm.set2A),
      set2_b: parseSetValue(resultForm.set2B),
      set3_a: parseSetValue(resultForm.set3A),
      set3_b: parseSetValue(resultForm.set3B),
      winner_team: winnerTeam,
      source: 'slot',
      notes: resultForm.notes.trim() || null,
    };

    setSavingResult(true);

    let error = null;

    if (resultForm.editingMatchId) {
      const res = await supabase.from('matches').update(payload).eq('id', resultForm.editingMatchId);
      error = res.error;
    } else {
      const res = await supabase.from('matches').insert(payload);
      error = res.error;
    }

    setSavingResult(false);

    if (error) {
      alert(`No se pudo guardar el resultado: ${error.message}`);
      return;
    }

    closeResultModal();
    await loadData();
  }

  async function deleteResult(slotId: number) {
    const slot = slotsWithPlayers.find((s) => s.id === slotId);
    if (!slot || !slot.match) return;

    const ok = window.confirm('¿Seguro que querés borrar este resultado?');
    if (!ok) return;

    const { error } = await supabase.from('matches').delete().eq('id', slot.match.id);

    if (error) {
      alert(`No se pudo borrar el resultado: ${error.message}`);
      return;
    }

    await loadData();
  }

  function tabButton(label: string, key: TabKey) {
    const active = activeTab === key;
    return (
      <button
        onClick={() => setActiveTab(key)}
        style={{
          padding: '10px 14px',
          borderRadius: 12,
          border: active ? 'none' : '1px solid #d1d5db',
          background: active ? '#111827' : 'white',
          color: active ? 'white' : '#111827',
          cursor: 'pointer',
          fontWeight: 700,
        }}
      >
        {label}
      </button>
    );
  }

  return (
    <div
      style={{
        padding: 16,
        fontFamily: 'Arial, sans-serif',
        maxWidth: 1080,
        margin: '0 auto',
        background: '#f8fafc',
        minHeight: '100vh',
      }}
    >
      <div
        style={{
          background: 'white',
          borderRadius: 20,
          padding: 20,
          marginBottom: 16,
          border: '1px solid #e5e7eb',
        }}
      >
        <h1 style={{ margin: 0, fontSize: 30 }}>Reservas de Pádel</h1>
        <p style={{ marginTop: 8, color: '#64748b' }}>
          Turnos, ranking e historial en una sola app.
        </p>

        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            marginTop: 12,
          }}
        >
          <button
            onClick={loadData}
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              border: '1px solid #d1d5db',
              background: 'white',
              cursor: 'pointer',
            }}
          >
            Refrescar
          </button>

          {tabButton('Turnos', 'turnos')}
          {tabButton('Ranking', 'ranking')}
          {tabButton('Historial', 'historial')}

          {canSeeAdmin && activeTab === 'turnos' && (
            <button
              onClick={() => setShowAdmin(!showAdmin)}
              style={{
                padding: '10px 14px',
                borderRadius: 12,
                border: '1px solid #d1d5db',
                background: 'white',
                cursor: 'pointer',
              }}
            >
              Admin
            </button>
          )}
        </div>
      </div>

      {activeTab === 'turnos' && showAdmin && canSeeAdmin && (
        <div
          style={{
            background: 'white',
            borderRadius: 20,
            padding: 20,
            marginBottom: 16,
            border: '1px solid #e5e7eb',
          }}
        >
          {!adminUnlocked ? (
            <>
              <h3 style={{ marginTop: 0 }}>Ingresar PIN admin</h3>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input
                  type="password"
                  placeholder="PIN"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  autoComplete="new-password"
                  style={{
                    padding: '10px 12px',
                    borderRadius: 12,
                    border: '1px solid #d1d5db',
                  }}
                />
                <button
                  onClick={unlockAdmin}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 12,
                    border: 'none',
                    background: '#111827',
                    color: 'white',
                    cursor: 'pointer',
                  }}
                >
                  Entrar
                </button>
              </div>
            </>
          ) : (
            <>
              <h3 style={{ marginTop: 0 }}>Crear turno</h3>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
                <div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>Fecha</div>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 12,
                      border: '1px solid #d1d5db',
                    }}
                  />
                </div>

                <div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>Hora</div>
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 12,
                      border: '1px solid #d1d5db',
                    }}
                  />
                </div>

                <button
                  onClick={() =>
                    adminAction({
                      action: 'createSlot',
                      date,
                      time,
                    })
                  }
                  style={{
                    padding: '10px 14px',
                    borderRadius: 12,
                    border: 'none',
                    background: '#111827',
                    color: 'white',
                    cursor: 'pointer',
                  }}
                >
                  Crear turno
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {loading && (
        <div
          style={{
            background: 'white',
            borderRadius: 20,
            padding: 20,
            border: '1px solid #e5e7eb',
          }}
        >
          Cargando...
        </div>
      )}

      {!loading && activeTab === 'turnos' && (
        <>
          {Object.keys(groupedSlots).length === 0 && (
            <div
              style={{
                background: 'white',
                borderRadius: 20,
                padding: 20,
                border: '1px solid #e5e7eb',
              }}
            >
              No hay turnos cargados.
            </div>
          )}

          {Object.entries(groupedSlots).map(([dateKey, daySlots]) => (
            <div key={dateKey} style={{ marginBottom: 22 }}>
              <h2 style={{ marginBottom: 10, fontSize: 22 }}>{formatDate(dateKey)}</h2>

              <div style={{ display: 'grid', gap: 12 }}>
                {daySlots.map((slot) => {
                  const isFull = slot.activePlayers.length >= MAX_PLAYERS;
                  const hasMatch = !!slot.match;

                  return (
                    <div
                      key={slot.id}
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
                        }}
                      >
                        <div style={{ fontSize: 24, fontWeight: 700 }}>{slot.time}</div>

                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <div
                            style={{
                              padding: '6px 10px',
                              borderRadius: 999,
                              background: isFull ? '#111827' : '#e5e7eb',
                              color: isFull ? 'white' : '#111827',
                              fontWeight: 700,
                              fontSize: 12,
                            }}
                          >
                            {isFull ? 'COMPLETO' : `${slot.activePlayers.length}/${MAX_PLAYERS}`}
                          </div>

                          {slot.waitlistPlayers.length > 0 && (
                            <div
                              style={{
                                padding: '6px 10px',
                                borderRadius: 999,
                                background: '#f1f5f9',
                                color: '#111827',
                                fontWeight: 700,
                                fontSize: 12,
                                border: '1px solid #cbd5e1',
                              }}
                            >
                              Espera: {slot.waitlistPlayers.length}
                            </div>
                          )}

                          {hasMatch && (
                            <div
                              style={{
                                padding: '6px 10px',
                                borderRadius: 999,
                                background: '#dcfce7',
                                color: '#166534',
                                fontWeight: 700,
                                fontSize: 12,
                                border: '1px solid #bbf7d0',
                              }}
                            >
                              Resultado cargado
                            </div>
                          )}

                          {adminUnlocked && (
                            <button
                              onClick={() =>
                                adminAction({
                                  action: 'deleteSlot',
                                  slotId: slot.id,
                                })
                              }
                              style={{
                                padding: '8px 10px',
                                borderRadius: 10,
                                border: '1px solid #d1d5db',
                                background: 'white',
                                cursor: 'pointer',
                              }}
                            >
                              Borrar turno
                            </button>
                          )}
                        </div>
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          gap: 8,
                          marginTop: 12,
                          marginBottom: 12,
                          flexWrap: 'wrap',
                        }}
                      >
                        <input
                          placeholder={isFull ? 'Anotate en lista de espera' : 'Tu nombre'}
                          value={nameInput[slot.id] || ''}
                          onChange={(e) =>
                            setNameInput((v) => ({ ...v, [slot.id]: e.target.value }))
                          }
                          autoComplete="new-password"
                          name={`slot-player-${slot.id}`}
                          data-form-type="other"
                          style={{
                            flex: 1,
                            minWidth: 180,
                            padding: '10px 12px',
                            borderRadius: 12,
                            border: '1px solid #d1d5db',
                          }}
                        />

                        <button
                          onClick={() => addPlayer(slot.id)}
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
                          {isFull ? 'Lista de espera' : 'Anotar'}
                        </button>

                        {slot.activePlayers.length === 4 && !hasMatch && (
                          <button
                            onClick={() => openNewResultModal(slot.id)}
                            style={{
                              padding: '10px 14px',
                              borderRadius: 12,
                              border: 'none',
                              background: '#0f766e',
                              color: 'white',
                              cursor: 'pointer',
                              fontWeight: 700,
                            }}
                          >
                            Subir resultado
                          </button>
                        )}

                        {slot.activePlayers.length === 4 && hasMatch && (
                          <button
                            onClick={() => openEditResultModal(slot.id)}
                            style={{
                              padding: '10px 14px',
                              borderRadius: 12,
                              border: '1px solid #d1d5db',
                              background: 'white',
                              color: '#111827',
                              cursor: 'pointer',
                              fontWeight: 700,
                            }}
                          >
                            Ver resultado
                          </button>
                        )}

                        {slot.activePlayers.length === 4 && hasMatch && adminUnlocked && (
                          <>
                            <button
                              onClick={() => openEditResultModal(slot.id)}
                              style={{
                                padding: '10px 14px',
                                borderRadius: 12,
                                border: 'none',
                                background: '#7c3aed',
                                color: 'white',
                                cursor: 'pointer',
                                fontWeight: 700,
                              }}
                            >
                              Editar resultado
                            </button>

                            <button
                              onClick={() => deleteResult(slot.id)}
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
                          </>
                        )}
                      </div>

                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontWeight: 700, marginBottom: 8 }}>Jugadores</div>

                        {slot.activePlayers.length === 0 ? (
                          <div style={{ color: '#64748b' }}>Todavía no hay jugadores anotados.</div>
                        ) : (
                          <div style={{ display: 'grid', gap: 8 }}>
                            {slot.activePlayers.map((p, index) => {
                              const stats = rankingStats.get(p.name.trim().toLowerCase());

                              return (
                                <div
                                  key={p.id}
                                  style={{
                                    border: '1px solid #e5e7eb',
                                    borderRadius: 14,
                                    padding: 12,
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    gap: 8,
                                    alignItems: 'center',
                                    flexWrap: 'wrap',
                                    background: '#f8fafc',
                                  }}
                                >
                                  <div>
                                    <div style={{ fontWeight: 700 }}>
                                      {index + 1}. {p.name}
                                    </div>

                                    <div style={{ fontSize: 13, color: '#64748b' }}>
                                      {stats
                                        ? `#${stats.position} · ${stats.winPct}% victorias${
                                            stats.provisional ? ' · Provisional' : ''
                                          }`
                                        : p.paid
                                        ? 'Pago registrado'
                                        : 'Pendiente de pago'}
                                    </div>
                                  </div>

                                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    {adminUnlocked && (
                                      <button
                                        onClick={() =>
                                          adminAction({
                                            action: 'togglePaid',
                                            playerId: p.id,
                                            paid: !p.paid,
                                          })
                                        }
                                        style={{
                                          padding: '8px 10px',
                                          borderRadius: 10,
                                          border: '1px solid #d1d5db',
                                          background: 'white',
                                          cursor: 'pointer',
                                        }}
                                      >
                                        {p.paid ? 'Desmarcar pago' : 'Marcar pago'}
                                      </button>
                                    )}

                                    <button
                                      onClick={() => removePlayer(p.id)}
                                      style={{
                                        padding: '8px 10px',
                                        borderRadius: 10,
                                        border: '1px solid #d1d5db',
                                        background: 'white',
                                        cursor: 'pointer',
                                      }}
                                    >
                                      Borrarme
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {hasMatch && slot.match && (
                        <div
                          style={{
                            marginTop: 12,
                            borderTop: '1px solid #e5e7eb',
                            paddingTop: 12,
                            background: '#f8fafc',
                            borderRadius: 12,
                          }}
                        >
                          <div style={{ fontWeight: 700, marginBottom: 6 }}>Resultado</div>
                          <div style={{ color: '#334155', marginBottom: 4 }}>
                            A: {playerNameById(rankingPlayers, slot.match.team_a_player_1_id)} /{' '}
                            {playerNameById(rankingPlayers, slot.match.team_a_player_2_id)}
                          </div>
                          <div style={{ color: '#334155', marginBottom: 4 }}>
                            B: {playerNameById(rankingPlayers, slot.match.team_b_player_1_id)} /{' '}
                            {playerNameById(rankingPlayers, slot.match.team_b_player_2_id)}
                          </div>
                          <div style={{ fontWeight: 700 }}>Score: {scoreText(slot.match)}</div>
                        </div>
                      )}

                      {slot.waitlistPlayers.length > 0 && (
                        <div style={{ marginTop: 14 }}>
                          <div style={{ fontWeight: 700, marginBottom: 8 }}>Lista de espera</div>
                          <div style={{ display: 'grid', gap: 8 }}>
                            {slot.waitlistPlayers.map((p, index) => {
                              const stats = rankingStats.get(p.name.trim().toLowerCase());

                              return (
                                <div
                                  key={p.id}
                                  style={{
                                    border: '1px dashed #cbd5e1',
                                    borderRadius: 14,
                                    padding: 12,
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    gap: 8,
                                    alignItems: 'center',
                                    flexWrap: 'wrap',
                                    background: '#f8fafc',
                                  }}
                                >
                                  <div>
                                    <div style={{ fontWeight: 700 }}>
                                      {MAX_PLAYERS + index + 1}. {p.name}
                                    </div>

                                    <div style={{ fontSize: 13, color: '#64748b' }}>
                                      {stats
                                        ? `En espera · #${stats.position} · ${stats.winPct}% victorias${
                                            stats.provisional ? ' · Provisional' : ''
                                          }`
                                        : 'En espera'}
                                    </div>
                                  </div>

                                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    {adminUnlocked && (
                                      <button
                                        onClick={() =>
                                          adminAction({
                                            action: 'togglePaid',
                                            playerId: p.id,
                                            paid: !p.paid,
                                          })
                                        }
                                        style={{
                                          padding: '8px 10px',
                                          borderRadius: 10,
                                          border: '1px solid #d1d5db',
                                          background: 'white',
                                          cursor: 'pointer',
                                        }}
                                      >
                                        {p.paid ? 'Desmarcar pago' : 'Marcar pago'}
                                      </button>
                                    )}

                                    <button
                                      onClick={() => removePlayer(p.id)}
                                      style={{
                                        padding: '8px 10px',
                                        borderRadius: 10,
                                        border: '1px solid #d1d5db',
                                        background: 'white',
                                        cursor: 'pointer',
                                      }}
                                    >
                                      Borrarme
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </>
      )}

      {!loading && activeTab === 'ranking' && (
        <div
          style={{
            background: 'white',
            borderRadius: 20,
            padding: 20,
            border: '1px solid #e5e7eb',
            overflowX: 'auto',
          }}
        >
          <h2 style={{ marginTop: 0 }}>Ranking</h2>

          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
                <th style={{ padding: '10px 8px' }}>#</th>
                <th style={{ padding: '10px 8px' }}>Jugador</th>
                <th style={{ padding: '10px 8px' }}>Puntos</th>
                <th style={{ padding: '10px 8px' }}>PJ</th>
                <th style={{ padding: '10px 8px' }}>G</th>
                <th style={{ padding: '10px 8px' }}>P</th>
                <th style={{ padding: '10px 8px' }}>%</th>
                <th style={{ padding: '10px 8px' }}>Prov.</th>
              </tr>
            </thead>
            <tbody>
              {[...rankingPlayers]
                .sort((a, b) => {
                  if (b.display_rating !== a.display_rating) return b.display_rating - a.display_rating;
                  if (b.elo_rating !== a.elo_rating) return b.elo_rating - a.elo_rating;
                  return a.name.localeCompare(b.name);
                })
                .map((p, idx) => (
                  <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 8px', fontWeight: 700 }}>{idx + 1}</td>
                    <td style={{ padding: '10px 8px', fontWeight: 700 }}>{p.name}</td>
                    <td style={{ padding: '10px 8px' }}>{Math.round(Number(p.display_rating))}</td>
                    <td style={{ padding: '10px 8px' }}>{p.matches_played}</td>
                    <td style={{ padding: '10px 8px' }}>{p.wins}</td>
                    <td style={{ padding: '10px 8px' }}>{p.losses}</td>
                    <td style={{ padding: '10px 8px' }}>{Number(p.win_pct).toFixed(2)}%</td>
                    <td style={{ padding: '10px 8px' }}>{p.provisional ? 'Sí' : 'No'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && activeTab === 'historial' && (
        <div style={{ display: 'grid', gap: 12 }}>
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
                    {m.source || 'match'}
                  </div>
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

                {m.notes && (
                  <div style={{ marginTop: 6, color: '#64748b', fontSize: 13 }}>
                    {m.notes}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {resultModalOpen && resultForm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            zIndex: 1000,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 720,
              background: 'white',
              borderRadius: 20,
              padding: 20,
              border: '1px solid #e5e7eb',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>
              {resultForm.editingMatchId ? 'Editar resultado' : 'Subir resultado'}
            </h3>

            {(() => {
              const slot = slotsWithPlayers.find((s) => s.id === resultForm.slotId);
              const players = slot?.activePlayers || [];

              return (
                <>
                  <div style={{ color: '#64748b', marginBottom: 14 }}>
                    Turno {slot?.time} · {slot ? formatDate(slot.date) : ''}
                  </div>

                  <div style={{ display: 'grid', gap: 14 }}>
                    <div>
                      <div style={{ fontWeight: 700, marginBottom: 8 }}>Pareja A</div>
                      <div style={{ display: 'grid', gap: 8 }}>
                        <select
                          value={resultForm.teamA1}
                          onChange={(e) =>
                            setResultForm((prev) =>
                              prev
                                ? { ...prev, teamA1: e.target.value === '' ? '' : Number(e.target.value) }
                                : prev
                            )
                          }
                          style={{
                            padding: '10px 12px',
                            borderRadius: 12,
                            border: '1px solid #d1d5db',
                          }}
                        >
                          <option value="">Elegir jugador</option>
                          {players.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>

                        <select
                          value={resultForm.teamA2}
                          onChange={(e) =>
                            setResultForm((prev) =>
                              prev
                                ? { ...prev, teamA2: e.target.value === '' ? '' : Number(e.target.value) }
                                : prev
                            )
                          }
                          style={{
                            padding: '10px 12px',
                            borderRadius: 12,
                            border: '1px solid #d1d5db',
                          }}
                        >
                          <option value="">Elegir jugador</option>
                          {players.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <div style={{ fontWeight: 700, marginBottom: 8 }}>Pareja B</div>
                      <div style={{ display: 'grid', gap: 8 }}>
                        <select
                          value={resultForm.teamB1}
                          onChange={(e) =>
                            setResultForm((prev) =>
                              prev
                                ? { ...prev, teamB1: e.target.value === '' ? '' : Number(e.target.value) }
                                : prev
                            )
                          }
                          style={{
                            padding: '10px 12px',
                            borderRadius: 12,
                            border: '1px solid #d1d5db',
                          }}
                        >
                          <option value="">Elegir jugador</option>
                          {players.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>

                        <select
                          value={resultForm.teamB2}
                          onChange={(e) =>
                            setResultForm((prev) =>
                              prev
                                ? { ...prev, teamB2: e.target.value === '' ? '' : Number(e.target.value) }
                                : prev
                            )
                          }
                          style={{
                            padding: '10px 12px',
                            borderRadius: 12,
                            border: '1px solid #d1d5db',
                          }}
                        >
                          <option value="">Elegir jugador</option>
                          {players.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <div style={{ fontWeight: 700, marginBottom: 8 }}>Resultado por sets</div>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 80px 80px',
                          gap: 8,
                          alignItems: 'center',
                        }}
                      >
                        <div>Set 1</div>
                        <input
                          value={resultForm.set1A}
                          onChange={(e) =>
                            setResultForm((prev) => (prev ? { ...prev, set1A: e.target.value } : prev))
                          }
                          placeholder="A"
                          style={{
                            padding: '10px 12px',
                            borderRadius: 12,
                            border: '1px solid #d1d5db',
                          }}
                        />
                        <input
                          value={resultForm.set1B}
                          onChange={(e) =>
                            setResultForm((prev) => (prev ? { ...prev, set1B: e.target.value } : prev))
                          }
                          placeholder="B"
                          style={{
                            padding: '10px 12px',
                            borderRadius: 12,
                            border: '1px solid #d1d5db',
                          }}
                        />

                        <div>Set 2</div>
                        <input
                          value={resultForm.set2A}
                          onChange={(e) =>
                            setResultForm((prev) => (prev ? { ...prev, set2A: e.target.value } : prev))
                          }
                          placeholder="A"
                          style={{
                            padding: '10px 12px',
                            borderRadius: 12,
                            border: '1px solid #d1d5db',
                          }}
                        />
                        <input
                          value={resultForm.set2B}
                          onChange={(e) =>
                            setResultForm((prev) => (prev ? { ...prev, set2B: e.target.value } : prev))
                          }
                          placeholder="B"
                          style={{
                            padding: '10px 12px',
                            borderRadius: 12,
                            border: '1px solid #d1d5db',
                          }}
                        />

                        <div>Set 3</div>
                        <input
                          value={resultForm.set3A}
                          onChange={(e) =>
                            setResultForm((prev) => (prev ? { ...prev, set3A: e.target.value } : prev))
                          }
                          placeholder="A"
                          style={{
                            padding: '10px 12px',
                            borderRadius: 12,
                            border: '1px solid #d1d5db',
                          }}
                        />
                        <input
                          value={resultForm.set3B}
                          onChange={(e) =>
                            setResultForm((prev) => (prev ? { ...prev, set3B: e.target.value } : prev))
                          }
                          placeholder="B"
                          style={{
                            padding: '10px 12px',
                            borderRadius: 12,
                            border: '1px solid #d1d5db',
                          }}
                        />
                      </div>
                    </div>

                    <div>
                      <div style={{ fontWeight: 700, marginBottom: 8 }}>Notas</div>
                      <textarea
                        value={resultForm.notes}
                        onChange={(e) =>
                          setResultForm((prev) => (prev ? { ...prev, notes: e.target.value } : prev))
                        }
                        rows={3}
                        placeholder="Opcional"
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          borderRadius: 12,
                          border: '1px solid #d1d5db',
                          resize: 'vertical',
                        }}
                      />
                    </div>
                  </div>
                </>
              );
            })()}

            <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
              <button
                onClick={closeResultModal}
                disabled={savingResult}
                style={{
                  padding: '10px 14px',
                  borderRadius: 12,
                  border: '1px solid #d1d5db',
                  background: 'white',
                  cursor: savingResult ? 'not-allowed' : 'pointer',
                }}
              >
                Cancelar
              </button>

              <button
                onClick={saveResult}
                disabled={savingResult}
                style={{
                  padding: '10px 14px',
                  borderRadius: 12,
                  border: 'none',
                  background: '#111827',
                  color: 'white',
                  cursor: savingResult ? 'not-allowed' : 'pointer',
                  fontWeight: 700,
                }}
              >
                {savingResult
                  ? 'Guardando...'
                  : resultForm.editingMatchId
                  ? 'Guardar cambios'
                  : 'Guardar resultado'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
