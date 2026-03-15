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

function rankingPositionMap(rankingPlayers: RankingPlayer[]) {
  const sorted = [...rankingPlayers].sort((a, b) => {
    if (b.display_rating !== a.display_rating) return b.display_rating - a.display_rating;
    if (b.elo_rating !== a.elo_rating) return b.elo_rating - a.elo_rating;
    return a.name.localeCompare(b.name);
  });

  const map = new Map<string, number>();
  sorted.forEach((p, idx) => map.set(p.name.trim().toLowerCase(), idx + 1));
  return map;
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
      supabase.from('matches').select('*').order('match_date', { ascending: false }).order('id', { ascending: false }),
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

  const slotsWithPlayers = useMemo(() => {
    return slots.map((s) => {
      const allPlayers = sortPlayers(slotPlayers.filter((p) => p.slot_id === s.id));

      return {
        ...s,
        allPlayers,
        activePlayers: allPlayers.slice(0, MAX_PLAYERS),
        waitlistPlayers: allPlayers.slice(MAX_PLAYERS),
      };
    });
  }, [slots, slotPlayers]);

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
                <th style={{ padding: '10px 8px' }}>Display</th>
                <th style={{ padding: '10px 8px' }}>Elo</th>
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
                    <td style={{ padding: '10px 8px' }}>{Number(p.display_rating).toFixed(2)}</td>
                    <td style={{ padding: '10px 8px' }}>{Number(p.elo_rating).toFixed(2)}</td>
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
    </div>
  );
}
