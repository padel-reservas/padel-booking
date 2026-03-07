'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const MAX_PLAYERS = 4;
const PLAYER_NAME_KEY = 'padel-player-name';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Slot = {
  id: number;
  date: string;
  time: string;
};

type Player = {
  id: number;
  slot_id: number;
  name: string;
  paid: boolean;
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

export default function Page() {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [nameInput, setNameInput] = useState<Record<number, string>>({});
  const [defaultName, setDefaultName] = useState('');
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
    const { data: slotsData } = await supabase
      .from('slots')
      .select('*')
      .order('date')
      .order('time');

    const { data: playersData } = await supabase.from('players').select('*');

    setSlots(slotsData || []);
    setPlayers(playersData || []);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
    const savedName = localStorage.getItem(PLAYER_NAME_KEY) || '';
    setDefaultName(savedName);
  }, []);

  const slotsWithPlayers = useMemo(() => {
    return slots.map((s) => ({
      ...s,
      players: players
        .filter((p) => p.slot_id === s.id)
        .sort((a, b) => a.name.localeCompare(b.name)),
    }));
  }, [slots, players]);

  const groupedSlots = useMemo(() => {
    const grouped: Record<string, typeof slotsWithPlayers> = {};
    for (const slot of slotsWithPlayers) {
      if (!grouped[slot.date]) grouped[slot.date] = [];
      grouped[slot.date].push(slot);
    }
    return grouped;
  }, [slotsWithPlayers]);

  async function addPlayer(slotId: number) {
  const rawName = (nameInput[slotId] ?? defaultName).trim();
  if (!rawName) {
    alert('Poné tu nombre');
    return;
  }

  const slot = slotsWithPlayers.find((s) => s.id === slotId);
  if (!slot) return;

  if (slot.players.length >= MAX_PLAYERS) {
    alert('Ese turno ya está completo');
    return;
  }

  const alreadyThere = slot.players.some(
    (p) => p.name.trim().toLowerCase() === rawName.toLowerCase()
  );
  if (alreadyThere) {
    alert('Ese nombre ya está anotado en este turno');
    return;
  }

  await supabase.from('players').insert({
    slot_id: slotId,
    name: rawName,
    paid: false,
  });

  localStorage.setItem(PLAYER_NAME_KEY, rawName);
  setDefaultName(rawName);
  setNameInput((v) => ({ ...v, [slotId]: '' }));
  loadData();
}
    const alreadyThere = slot.players.some(
      (p) => p.name.trim().toLowerCase() === rawName.toLowerCase()
    );
    if (alreadyThere) {
      alert('Ese nombre ya está anotado en este turno');
      return;
    }

    await supabase.from('players').insert({
      slot_id: slotId,
      name: rawName,
      paid: false,
    });

    localStorage.setItem(PLAYER_NAME_KEY, rawName);
    setDefaultName(rawName);
    setNameInput((v) => ({ ...v, [slotId]: '' }));
    loadData();
  }

  async function removePlayer(playerId: number) {
    await supabase.from('players').delete().eq('id', playerId);
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

  return (
    <div
      style={{
        padding: 16,
        fontFamily: 'Arial, sans-serif',
        maxWidth: 980,
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
          Yo cargo los turnos y ustedes se anotan acá.
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

          {canSeeAdmin && (
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

      {showAdmin && canSeeAdmin && (
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

      {!loading &&
        Object.entries(groupedSlots).map(([dateKey, daySlots]) => (
          <div key={dateKey} style={{ marginBottom: 22 }}>
            <h2 style={{ marginBottom: 10, fontSize: 22 }}>{formatDate(dateKey)}</h2>

            <div style={{ display: 'grid', gap: 12 }}>
              {daySlots.map((slot) => {
                const isFull = slot.players.length >= MAX_PLAYERS;

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
                          {isFull ? 'COMPLETO' : `${slot.players.length}/${MAX_PLAYERS}`}
                        </div>

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
  placeholder={defaultName || 'Tu nombre'}
  value={nameInput[slot.id] ?? ''}
  onChange={(e) =>
    setNameInput((v) => ({ ...v, [slot.id]: e.target.value }))
  }
  style={{
    flex: 1,
    minWidth: 180,
    padding: '10px 12px',
    borderRadius: 12,
    border: '1px solid #d1d5db',
  }}
/>
                      <button
                        disabled={isFull}
                        onClick={() => addPlayer(slot.id)}
                        style={{
                          padding: '10px 14px',
                          borderRadius: 12,
                          border: 'none',
                          background: isFull ? '#cbd5e1' : '#111827',
                          color: 'white',
                          cursor: isFull ? 'not-allowed' : 'pointer',
                          fontWeight: 700,
                        }}
                      >
                        Anotar
                      </button>
                    </div>

                    {slot.players.length === 0 ? (
                      <div style={{ color: '#64748b' }}>Todavía no hay jugadores anotados.</div>
                    ) : (
                      <div style={{ display: 'grid', gap: 8 }}>
                        {slot.players.map((p) => (
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
                              <div style={{ fontWeight: 700 }}>{p.name}</div>
                              <div style={{ fontSize: 13, color: '#64748b' }}>
                                {p.paid ? 'Pago registrado' : 'Pendiente de pago'}
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
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
    </div>
  );
}
