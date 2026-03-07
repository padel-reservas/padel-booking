'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const MAX_PLAYERS = 4;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

type SlotRow = {
  id: number;
  date: string;
  time: string;
  created_at?: string;
};

type PlayerRow = {
  id: number;
  slot_id: number;
  name: string;
  paid: boolean;
  created_at?: string;
};

type SlotWithPlayers = SlotRow & {
  players: PlayerRow[];
};

function formatDate(iso: string) {
  if (!iso) return '';
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

function sortSlots(a: SlotRow, b: SlotRow) {
  const byDate = a.date.localeCompare(b.date);
  if (byDate !== 0) return byDate;
  return a.time.localeCompare(b.time);
}

function cardStyle(): React.CSSProperties {
  return {
    background: 'white',
    borderRadius: 20,
    boxShadow: '0 1px 8px rgba(0,0,0,0.06)',
    border: '1px solid #e5e7eb',
  };
}

function buttonStyle(kind: 'primary' | 'secondary' = 'primary'): React.CSSProperties {
  return {
    border: kind === 'primary' ? 'none' : '1px solid #d1d5db',
    background: kind === 'primary' ? '#111827' : 'white',
    color: kind === 'primary' ? 'white' : '#111827',
    borderRadius: 12,
    padding: '10px 14px',
    cursor: 'pointer',
    fontWeight: 600,
  };
}

function inputStyle(): React.CSSProperties {
  return {
    width: '100%',
    border: '1px solid #d1d5db',
    borderRadius: 12,
    padding: '10px 12px',
    fontSize: 14,
    boxSizing: 'border-box',
  };
}

export default function Page() {
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [nameInputs, setNameInputs] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadData() {
    setLoading(true);
    setError('');

    const [{ data: slotsData, error: slotsError }, { data: playersData, error: playersError }] =
      await Promise.all([
        supabase.from('slots').select('*').order('date', { ascending: true }).order('time', { ascending: true }),
        supabase.from('players').select('*').order('created_at', { ascending: true }),
      ]);

    if (slotsError || playersError) {
      setError(slotsError?.message || playersError?.message || 'Error cargando datos');
      setLoading(false);
      return;
    }

    setSlots((slotsData || []) as SlotRow[]);
    setPlayers((playersData || []) as PlayerRow[]);
    setLoading(false);
  }

  useEffect(() => {
    loadData();

    const channel = supabase
      .channel('padel-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'slots' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, () => loadData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const slotsWithPlayers = useMemo<SlotWithPlayers[]>(() => {
    return [...slots]
      .sort(sortSlots)
      .map((slot) => ({
        ...slot,
        players: players.filter((player) => player.slot_id === slot.id),
      }));
  }, [slots, players]);

  const groupedSlots = useMemo(() => {
    return slotsWithPlayers.reduce<Record<string, SlotWithPlayers[]>>((acc, slot) => {
      if (!acc[slot.date]) acc[slot.date] = [];
      acc[slot.date].push(slot);
      return acc;
    }, {});
  }, [slotsWithPlayers]);

  const totalPlayers = players.length;
  const totalPaid = players.filter((p) => p.paid).length;
  const openSlots = slotsWithPlayers.filter((slot) => slot.players.length < MAX_PLAYERS).length;

  async function addPlayer(slotId: number) {
    const name = (nameInputs[slotId] || '').trim();
    if (!name) return;

    const slot = slotsWithPlayers.find((s) => s.id === slotId);
    if (!slot) return;
    if (slot.players.length >= MAX_PLAYERS) return;

    const duplicate = slot.players.some(
      (player) => player.name.trim().toLowerCase() === name.toLowerCase()
    );
    if (duplicate) {
      alert('Ese nombre ya está anotado en este turno');
      return;
    }

    const { error } = await supabase.from('players').insert({
      slot_id: slotId,
      name,
      paid: false,
    });

    if (error) {
      alert(`No se pudo anotar: ${error.message}`);
      return;
    }

    setNameInputs((prev) => ({ ...prev, [slotId]: '' }));
    await loadData();
  }

  async function removePlayer(playerId: number) {
    const { error } = await supabase.from('players').delete().eq('id', playerId);

    if (error) {
      alert(`No se pudo borrar: ${error.message}`);
      return;
    }

    await loadData();
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#f8fafc',
        padding: 24,
        fontFamily: 'Arial, sans-serif',
      }}
    >
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div
          style={{
            ...cardStyle(),
            padding: 24,
            display: 'flex',
            gap: 16,
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            marginBottom: 20,
          }}
        >
          <div>
            <div style={{ color: '#64748b', fontSize: 14 }}>Reservas compartidas de pádel</div>
            <h1 style={{ margin: '8px 0', fontSize: 34, color: '#0f172a' }}>
              Reservas de pádel
            </h1>
            <div style={{ color: '#475569', fontSize: 14 }}>
              Vos cargás los turnos y el grupo se anota acá.
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button style={buttonStyle('secondary')} onClick={loadData}>
              Refrescar
            </button>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 16,
            marginBottom: 20,
          }}
        >
          {[
            ['Anotados', String(totalPlayers)],
            ['Pagados', String(totalPaid)],
            ['Turnos abiertos', String(openSlots)],
          ].map(([label, value]) => (
            <div key={label} style={{ ...cardStyle(), padding: 20 }}>
              <div style={{ color: '#64748b', fontSize: 14 }}>{label}</div>
              <div style={{ fontSize: 30, fontWeight: 700, marginTop: 6 }}>{value}</div>
            </div>
          ))}
        </div>

        {loading && (
          <div style={{ ...cardStyle(), padding: 20, marginBottom: 20 }}>
            Cargando turnos...
          </div>
        )}

        {!!error && (
          <div style={{ ...cardStyle(), padding: 20, marginBottom: 20, color: '#b91c1c' }}>
            Error: {error}
          </div>
        )}

        {!loading && slotsWithPlayers.length === 0 && (
          <div style={{ ...cardStyle(), padding: 20, marginBottom: 20 }}>
            No hay turnos cargados todavía. Cargalos en Supabase y van a aparecer acá.
          </div>
        )}

        <div style={{ display: 'grid', gap: 24 }}>
          {Object.entries(groupedSlots).map(([date, daySlots]) => (
            <div key={date}>
              <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>
                {formatDate(date)}
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                  gap: 16,
                }}
              >
                {daySlots.map((slot) => {
                  const full = slot.players.length >= MAX_PLAYERS;

                  return (
                    <div key={slot.id} style={{ ...cardStyle(), padding: 18 }}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: 12,
                          alignItems: 'center',
                          marginBottom: 14,
                        }}
                      >
                        <div style={{ fontSize: 24, fontWeight: 700 }}>{slot.time}</div>

                        <div
                          style={{
                            padding: '6px 10px',
                            borderRadius: 999,
                            background: full ? '#111827' : '#e5e7eb',
                            color: full ? 'white' : '#111827',
                            fontSize: 13,
                            fontWeight: 700,
                          }}
                        >
                          {slot.players.length}/{MAX_PLAYERS}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                        <input
                          style={inputStyle()}
                          placeholder="Tu nombre"
                          value={nameInputs[slot.id] || ''}
                          onChange={(e) =>
                            setNameInputs((prev) => ({ ...prev, [slot.id]: e.target.value }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') addPlayer(slot.id);
                          }}
                        />
                        <button
                          style={buttonStyle(full ? 'secondary' : 'primary')}
                          disabled={full}
                          onClick={() => addPlayer(slot.id)}
                        >
                          Anotar
                        </button>
                      </div>

                      <div style={{ display: 'grid', gap: 8 }}>
                        {slot.players.length === 0 && (
                          <div
                            style={{
                              padding: 14,
                              border: '1px dashed #cbd5e1',
                              borderRadius: 16,
                              color: '#64748b',
                            }}
                          >
                            Todavía no hay jugadores anotados.
                          </div>
                        )}

                        {slot.players.map((player) => (
                          <div
                            key={player.id}
                            style={{
                              border: '1px solid #e5e7eb',
                              background: '#f8fafc',
                              borderRadius: 16,
                              padding: 12,
                              display: 'flex',
                              justifyContent: 'space-between',
                              gap: 12,
                              alignItems: 'center',
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: 700 }}>{player.name}</div>
                              <div style={{ color: '#64748b', fontSize: 14 }}>
                                {player.paid ? 'Pago registrado' : 'Pendiente de pago'}
                              </div>
                            </div>

                            <button
                              style={buttonStyle('secondary')}
                              onClick={() => removePlayer(player.id)}
                            >
                              Borrarme
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            ...cardStyle(),
            padding: 20,
            marginTop: 20,
            color: '#475569',
            fontSize: 14,
            lineHeight: 1.5,
          }}
        >
          <strong>Importante:</strong> por ahora vos cargás los turnos en Supabase y la gente se
          anota acá. En la próxima versión te puedo dejar una pantalla admin para crear turnos desde
          la web.
        </div>
      </div>
    </main>
  );
}
