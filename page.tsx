export default function Page() {
  return (
    <main style={{ minHeight: '100vh', background: '#f8fafc', padding: 24, fontFamily: 'Arial, sans-serif' }}>
      <PadelBookingApp />
    </main>
  );
}

'use client';

import React, { useEffect, useMemo, useState } from 'react';

const DEFAULT_TIMES = ['08:00', '09:00', '10:00', '11:00', '12:00'];
const MAX_PLAYERS = 4;
const STORAGE_KEY = 'padel-booking-mvp-v1';

type Player = {
  id: string;
  name: string;
  paid: boolean;
};

type Slot = {
  id: string;
  date: string;
  time: string;
  players: Player[];
};

function todayISO() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDate(iso: string) {
  if (!iso) return '';
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

function sortSlots(a: Slot, b: Slot) {
  const byDate = a.date.localeCompare(b.date);
  if (byDate !== 0) return byDate;
  return a.time.localeCompare(b.time);
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildSlot(date: string, time: string): Slot {
  return {
    id: makeId(),
    date,
    time,
    players: [],
  };
}

function buildInitialState(): Slot[] {
  const date = todayISO();
  return DEFAULT_TIMES.map((time) => buildSlot(date, time));
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

function PadelBookingApp() {
  const [adminMode, setAdminMode] = useState(true);
  const [title, setTitle] = useState('Reservas de pádel');
  const [slots, setSlots] = useState<Slot[]>(buildInitialState);
  const [nameInputs, setNameInputs] = useState<Record<string, string>>({});
  const [newDate, setNewDate] = useState(todayISO());
  const [newTime, setNewTime] = useState('08:00');

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;

    try {
      const parsed = JSON.parse(saved);
      if (parsed?.title) setTitle(parsed.title);
      if (Array.isArray(parsed?.slots)) {
        setSlots(parsed.slots.sort(sortSlots));
      }
    } catch {}
  }, []);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        title,
        slots,
      })
    );
  }, [title, slots]);

  const totals = useMemo(() => {
    const totalPlayers = slots.reduce((acc, slot) => acc + slot.players.length, 0);
    const totalPaid = slots.reduce(
      (acc, slot) => acc + slot.players.filter((player) => player.paid).length,
      0
    );
    const openSlots = slots.filter((slot) => slot.players.length < MAX_PLAYERS).length;
    return { totalPlayers, totalPaid, openSlots };
  }, [slots]);

  const groupedSlots = useMemo(() => {
    const sorted = [...slots].sort(sortSlots);
    return sorted.reduce<Record<string, Slot[]>>((acc, slot) => {
      if (!acc[slot.date]) acc[slot.date] = [];
      acc[slot.date].push(slot);
      return acc;
    }, {});
  }, [slots]);

  function addSlot() {
    if (!newDate || !newTime) return;

    setSlots((prev) => {
      const exists = prev.some((slot) => slot.date === newDate && slot.time === newTime);
      if (exists) return prev;
      return [...prev, buildSlot(newDate, newTime)].sort(sortSlots);
    });
  }

  function removeSlot(slotId: string) {
    setSlots((prev) => prev.filter((slot) => slot.id !== slotId));
  }

  function addPlayer(slotId: string) {
    const name = (nameInputs[slotId] || '').trim();
    if (!name) return;

    setSlots((prev) =>
      prev.map((slot) => {
        if (slot.id !== slotId) return slot;
        if (slot.players.length >= MAX_PLAYERS) return slot;
        if (slot.players.some((player) => player.name.toLowerCase() === name.toLowerCase())) {
          return slot;
        }

        return {
          ...slot,
          players: [...slot.players, { id: makeId(), name, paid: false }],
        };
      })
    );

    setNameInputs((prev) => ({ ...prev, [slotId]: '' }));
  }

  function removePlayer(slotId: string, playerId: string) {
    setSlots((prev) =>
      prev.map((slot) =>
        slot.id === slotId
          ? { ...slot, players: slot.players.filter((player) => player.id !== playerId) }
          : slot
      )
    );
  }

  function togglePaid(slotId: string, playerId: string) {
    setSlots((prev) =>
      prev.map((slot) =>
        slot.id === slotId
          ? {
              ...slot,
              players: slot.players.map((player) =>
                player.id === playerId ? { ...player, paid: !player.paid } : player
              ),
            }
          : slot
      )
    );
  }

  function clearAll() {
    setSlots(buildInitialState());
    setNameInputs({});
  }

  async function copySummary() {
    const text = [
      title,
      ...Object.entries(groupedSlots).flatMap(([date, daySlots]) => [
        formatDate(date),
        ...daySlots.map((slot) => {
          const playersText = slot.players.length
            ? slot.players.map((player) => `${player.name}${player.paid ? ' ✅' : ' ⏳'}`).join(', ')
            : 'sin anotados';
          return `${slot.time}: ${playersText}`;
        }),
      ]),
    ].join('\n');

    try {
      await navigator.clipboard.writeText(text);
      alert('Resumen copiado');
    } catch {
      alert('No se pudo copiar el resumen');
    }
  }

  return (
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
          <div style={{ color: '#64748b', fontSize: 14 }}>Mini web de reservas para pádel</div>
          <h1 style={{ margin: '8px 0', fontSize: 34, color: '#0f172a' }}>{title}</h1>
          <div style={{ color: '#475569', fontSize: 14 }}>
            Compartís un link, cada uno se anota y vos controlás pagos sin llenar WhatsApp.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button style={buttonStyle(adminMode ? 'primary' : 'secondary')} onClick={() => setAdminMode((v) => !v)}>
            {adminMode ? 'Modo admin' : 'Modo jugador'}
          </button>
          <button style={buttonStyle('secondary')} onClick={copySummary}>Copiar resumen</button>
          <button style={buttonStyle('secondary')} onClick={clearAll}>Reiniciar</button>
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
          ['Anotados', String(totals.totalPlayers)],
          ['Pagados', String(totals.totalPaid)],
          ['Turnos abiertos', String(totals.openSlots)],
        ].map(([label, value]) => (
          <div key={label} style={{ ...cardStyle(), padding: 20 }}>
            <div style={{ color: '#64748b', fontSize: 14 }}>{label}</div>
            <div style={{ fontSize: 30, fontWeight: 700, marginTop: 6 }}>{value}</div>
          </div>
        ))}

        <div style={{ ...cardStyle(), padding: 20 }}>
          <div style={{ color: '#64748b', fontSize: 14, marginBottom: 8 }}>Título</div>
          <input style={inputStyle()} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Reservas de pádel" />
        </div>
      </div>

      <div style={{ ...cardStyle(), padding: 20, marginBottom: 20 }}>
        <h2 style={{ marginTop: 0 }}>Agregar turno</h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
            alignItems: 'end',
          }}
        >
          <div>
            <div style={{ color: '#64748b', fontSize: 14, marginBottom: 8 }}>Fecha</div>
            <input style={inputStyle()} type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
          </div>
          <div>
            <div style={{ color: '#64748b', fontSize: 14, marginBottom: 8 }}>Hora</div>
            <input style={inputStyle()} type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} />
          </div>
          <div>
            <button style={buttonStyle()} onClick={addSlot}>Agregar turno</button>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 24 }}>
        {Object.entries(groupedSlots).map(([date, daySlots]) => (
          <div key={date}>
            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>{formatDate(date)}</div>

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
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 14 }}>
                      <div style={{ fontSize: 24, fontWeight: 700 }}>{slot.time}</div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
                        {adminMode && (
                          <button style={buttonStyle('secondary')} onClick={() => removeSlot(slot.id)}>Borrar turno</button>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                      <input
                        style={inputStyle()}
                        placeholder="Nombre"
                        value={nameInputs[slot.id] || ''}
                        onChange={(e) => setNameInputs((prev) => ({ ...prev, [slot.id]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') addPlayer(slot.id);
                        }}
                      />
                      <button style={buttonStyle(full ? 'secondary' : 'primary')} disabled={full} onClick={() => addPlayer(slot.id)}>
                        Anotar
                      </button>
                    </div>

                    <div style={{ display: 'grid', gap: 8 }}>
                      {slot.players.length === 0 && (
                        <div style={{ padding: 14, border: '1px dashed #cbd5e1', borderRadius: 16, color: '#64748b' }}>
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

                          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                            <label style={{ display: 'flex', gap: 6, alignItems: 'center', color: adminMode ? '#111827' : '#94a3b8' }}>
                              <input
                                type="checkbox"
                                checked={player.paid}
                                onChange={() => togglePaid(slot.id, player.id)}
                                disabled={!adminMode}
                              />
                              Pagó
                            </label>

                            <button style={buttonStyle('secondary')} onClick={() => removePlayer(slot.id, player.id)}>
                              Borrarme
                            </button>
                          </div>
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

      <div style={{ ...cardStyle(), padding: 20, marginTop: 20, color: '#475569', fontSize: 14, lineHeight: 1.5 }}>
        <strong>Nota:</strong> este prototipo guarda los datos solo en tu navegador. Para compartir un link real entre todos,
        el siguiente paso es conectarlo a una base de datos gratuita.
      </div>
    </div>
  );
}
