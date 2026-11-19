'use client';

import React, { useMemo, useState } from 'react';
import type { Suggestion, SuggestionResponse } from '../lib/padelTypes';

const MAX_PLAYERS = 4;

type ActionResult = { ok: boolean; data: any };

type Props = {
  suggestions: Suggestion[];
  responsesBySuggestionId: Map<number, SuggestionResponse[]>;
  myPlayerName: string;
  adminUnlocked: boolean;
  adminAction: (action: any) => Promise<ActionResult>;
  loadData: () => Promise<void>;
};

const card: React.CSSProperties = {
  background: 'white',
  borderRadius: 20,
  padding: 20,
  border: '1px solid #e5e7eb',
};

const input: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 12,
  border: '1px solid #d1d5db',
  fontSize: 15,
};

const btnPrimary: React.CSSProperties = {
  padding: '10px 14px',
  borderRadius: 10,
  border: 'none',
  background: '#111827',
  color: 'white',
  cursor: 'pointer',
  fontWeight: 700,
};

const btnSecondary: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid #d1d5db',
  background: 'white',
  cursor: 'pointer',
  fontWeight: 700,
};

function norm(v: string) {
  return (v || '').trim().toLowerCase();
}

function hhmm(t: string | null) {
  return (t || '').slice(0, 5);
}

function isAutoMessage(s: Suggestion) {
  return !s.message || s.message.startsWith('Sacar turno ');
}

function formatWhen(date: string | null, time: string | null) {
  if (!date) return '';
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const weekday = dt.toLocaleDateString('es-AR', { weekday: 'long' });
  const cap = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  return `${cap} ${d}/${m} · ${hhmm(time)}`;
}

function isPast(date: string | null, time: string | null) {
  if (!date) return false;
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = (hhmm(time) || '23:59').split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm).getTime() < Date.now();
}

function todayISO() {
  const now = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

export default function SugerenciasTab({
  suggestions,
  responsesBySuggestionId,
  myPlayerName,
  adminUnlocked,
  adminAction,
  loadData,
}: Props) {
  const [author, setAuthor] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [nameById, setNameById] = useState<Record<number, string>>({});

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editNote, setEditNote] = useState('');

  const me = myPlayerName.trim();

  const open = useMemo(() => suggestions.filter((s) => s.status === 'open'), [suggestions]);

  const replacements = useMemo(
    () => open.filter((s) => s.is_urgent && !s.is_booking_request),
    [open]
  );

  // Propuestas de turno: completas primero, después por fecha/hora más cercana
  const proposals = useMemo(() => {
    const list = open.filter((s) => s.is_booking_request);
    const count = (s: Suggestion) => 1 + (responsesBySuggestionId.get(s.id) || []).length;
    return [...list].sort((a, b) => {
      const fullDiff = Number(count(b) >= MAX_PLAYERS) - Number(count(a) >= MAX_PLAYERS);
      if (fullDiff !== 0) return fullDiff;
      const ak = `${a.suggested_date || ''} ${hhmm(a.suggested_time)}`;
      const bk = `${b.suggested_date || ''} ${hhmm(b.suggested_time)}`;
      return ak.localeCompare(bk);
    });
  }, [open, responsesBySuggestionId]);

  function playersOf(s: Suggestion) {
    const names: string[] = [s.author_name];
    for (const r of responsesBySuggestionId.get(s.id) || []) {
      if (!names.some((n) => norm(n) === norm(r.responder_name))) names.push(r.responder_name);
    }
    return names;
  }

  function nameFor(id: number) {
    return me || (nameById[id] || '').trim();
  }

  async function run(id: number | null, action: any) {
    setBusyId(id);
    const res = await adminAction(action);
    setBusyId(null);
    if (res.ok) await loadData();
    return res.ok;
  }

  async function createProposal() {
    const name = me || author.trim();
    if (!name) return alert('Elegí tu jugador en Ranking o escribí tu nombre.');
    if (!date || !time) return alert('Elegí día y hora.');
    if (isPast(date, time)) return alert('Ese horario ya pasó.');

    setSaving(true);
    const res = await adminAction({ action: 'createSuggestion', author: name, date, time, message: note.trim() });
    setSaving(false);
    if (!res.ok) return;

    setAuthor('');
    setDate('');
    setTime('');
    setNote('');
    await loadData();
  }

  async function join(s: Suggestion) {
    const name = nameFor(s.id);
    if (!name) return alert('Elegí tu jugador en Ranking o escribí tu nombre para sumarte.');
    const ok = await run(s.id, { action: 'joinSuggestion', suggestionId: s.id, name });
    if (ok) setNameById((prev) => ({ ...prev, [s.id]: '' }));
  }

  async function leave(s: Suggestion) {
    const name = nameFor(s.id);
    if (!name) return;
    await run(s.id, { action: 'leaveSuggestion', suggestionId: s.id, name });
  }

  async function cancel(s: Suggestion) {
    if (!window.confirm('¿Cancelar esta propuesta de turno?')) return;
    await run(s.id, { action: 'cancelSuggestion', suggestionId: s.id, editorName: me });
  }

  async function book(s: Suggestion) {
    const n = playersOf(s).length;
    if (n < MAX_PLAYERS && !window.confirm(`Hay ${n} de ${MAX_PLAYERS}. ¿Sacar el turno igual?`)) return;
    await run(s.id, { action: 'bookSuggestion', suggestionId: s.id });
  }

  function startEdit(s: Suggestion) {
    setEditingId(s.id);
    setEditDate(s.suggested_date || '');
    setEditTime(hhmm(s.suggested_time));
    setEditNote(isAutoMessage(s) ? '' : s.message);
  }

  async function saveEdit(s: Suggestion) {
    if (!editDate || !editTime) return alert('Elegí día y hora.');
    const message = editNote.trim() || `Sacar turno ${editDate} ${editTime}`;
    const ok = await run(s.id, {
      action: 'editSuggestion',
      suggestionId: s.id,
      editorName: me,
      message,
      date: editDate,
      time: editTime,
    });
    if (ok) setEditingId(null);
  }

  async function copyForWhatsApp(s: Suggestion) {
    const players = playersOf(s);
    const missing = MAX_PLAYERS - players.length;
    const lines = [
      `🎾 Turno propuesto: ${formatWhen(s.suggested_date, s.suggested_time)}`,
      `${players.length}/${MAX_PLAYERS}: ${players.join(', ')}`,
      missing > 0 ? `Faltan ${missing}. ¡Sumate en la app!` : '¡Completo!',
    ];
    if (!isAutoMessage(s)) lines.splice(1, 0, s.message);
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      alert('Mensaje copiado');
    } catch {
      alert('No se pudo copiar automáticamente.');
    }
  }

  function renderNameInput(s: Suggestion) {
    if (me) return null;
    return (
      <input
        type="text"
        value={nameById[s.id] || ''}
        onChange={(e) => setNameById((prev) => ({ ...prev, [s.id]: e.target.value }))}
        placeholder="Tu nombre"
        style={{ ...input, minWidth: 150 }}
      />
    );
  }

  function renderProposal(s: Suggestion) {
    const players = playersOf(s);
    const count = players.length;
    const full = count >= MAX_PLAYERS;
    const noCourt = s.booking_status === 'not_available';
    const past = isPast(s.suggested_date, s.suggested_time);
    const myName = nameFor(s.id);
    const isAuthor = !!myName && norm(myName) === norm(s.author_name);
    const joined = !!myName && !isAuthor && players.some((p) => norm(p) === norm(myName));
    const canEdit = adminUnlocked || (!!me && norm(me) === norm(s.author_name));
    const busy = busyId === s.id;

    const accent = noCourt ? '#b91c1c' : full ? '#047857' : '#c2410c';
    const bg = noCourt ? '#fef2f2' : full ? '#ecfdf5' : '#fff7ed';

    return (
      <div
        key={s.id}
        style={{
          border: `2px solid ${accent}`,
          background: bg,
          borderRadius: 14,
          padding: 14,
          marginBottom: 12,
          opacity: past ? 0.6 : 1,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 18, color: '#111827' }}>
            📅 {formatWhen(s.suggested_date, s.suggested_time)}
          </div>
          <div
            style={{
              fontWeight: 800,
              fontSize: 14,
              color: 'white',
              background: accent,
              borderRadius: 999,
              padding: '4px 12px',
              whiteSpace: 'nowrap',
            }}
          >
            {count}/{MAX_PLAYERS}
          </div>
        </div>

        {/* 4 lugares: se ve de un vistazo cuántos faltan */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6, marginTop: 10 }}>
          {Array.from({ length: MAX_PLAYERS }).map((_, i) => (
            <div
              key={i}
              style={{
                padding: '8px 10px',
                borderRadius: 10,
                background: players[i] ? 'white' : 'transparent',
                border: players[i] ? '1px solid #e5e7eb' : '1px dashed #cbd5e1',
                color: players[i] ? '#111827' : '#94a3b8',
                fontWeight: players[i] ? 700 : 400,
                fontSize: 14,
              }}
            >
              {players[i] || 'Lugar libre'}
            </div>
          ))}
        </div>

        {!isAutoMessage(s) && (
          <div style={{ marginTop: 10, color: '#374151', fontSize: 14 }}>💬 {s.message}</div>
        )}

        <div style={{ marginTop: 10, fontWeight: 700, fontSize: 14, color: accent }}>
          {past
            ? '⏰ Este horario ya pasó'
            : noCourt
              ? `❌ No hay cancha a esa hora. ${s.author_name} puede cambiar el horario.`
              : full
                ? '✅ ¡Completo! El admin saca el turno.'
                : `Faltan ${MAX_PLAYERS - count}`}
        </div>

        {editingId === s.id && (
          <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input type="date" value={editDate} min={todayISO()} onChange={(e) => setEditDate(e.target.value)} style={input} />
              <input type="time" value={editTime} onChange={(e) => setEditTime(e.target.value)} style={input} />
            </div>
            <input
              type="text"
              value={editNote}
              onChange={(e) => setEditNote(e.target.value)}
              placeholder="Nota (opcional)"
              style={input}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => saveEdit(s)} disabled={busy} style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }}>
                {busy ? 'Guardando…' : 'Guardar'}
              </button>
              <button onClick={() => setEditingId(null)} style={btnSecondary}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          {!isAuthor && !joined && !full && !noCourt && !past && (
            <>
              {renderNameInput(s)}
              <button onClick={() => join(s)} disabled={busy} style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }}>
                Me sumo
              </button>
            </>
          )}

          {joined && (
            <button onClick={() => leave(s)} disabled={busy} style={btnSecondary}>
              Me bajo
            </button>
          )}

          {!past && (
            <button onClick={() => copyForWhatsApp(s)} style={btnSecondary}>
              Copiar para WhatsApp
            </button>
          )}

          {canEdit && editingId !== s.id && (
            <button onClick={() => startEdit(s)} style={btnSecondary}>
              Cambiar horario
            </button>
          )}

          {canEdit && (
            <button onClick={() => cancel(s)} disabled={busy} style={btnSecondary}>
              Cancelar propuesta
            </button>
          )}
        </div>

        {adminUnlocked && (
          <div
            style={{
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
              marginTop: 12,
              paddingTop: 12,
              borderTop: '1px dashed #cbd5e1',
            }}
          >
            <span style={{ fontSize: 12, color: '#64748b', alignSelf: 'center' }}>Admin:</span>
            <button
              onClick={() => book(s)}
              disabled={busy}
              style={{ ...btnPrimary, background: full ? '#047857' : '#111827' }}
            >
              Turno sacado
            </button>
            {!noCourt && (
              <button onClick={() => run(s.id, { action: 'markSuggestionNotAvailable', suggestionId: s.id })} style={btnSecondary}>
                No hay cancha
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  function renderReplacement(s: Suggestion) {
    const responses = responsesBySuggestionId.get(s.id) || [];
    const myName = nameFor(s.id);
    const joined = !!myName && responses.some((r) => norm(r.responder_name) === norm(myName));
    const busy = busyId === s.id;

    return (
      <div
        key={s.id}
        style={{
          border: '1px solid #fecaca',
          background: '#fef2f2',
          borderRadius: 14,
          padding: 14,
          marginBottom: 12,
        }}
      >
        <div style={{ fontWeight: 800, color: '#991b1b' }}>
          🚨 Falta 1 · {formatWhen(s.suggested_date, s.suggested_time)}
        </div>
        <div style={{ marginTop: 6, color: '#111827', fontSize: 14 }}>{s.message}</div>
        {responses.length > 0 && (
          <div style={{ marginTop: 8, fontSize: 13, color: '#374151' }}>
            <strong>Se ofrecieron:</strong> {responses.map((r) => r.responder_name).join(', ')}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          {!joined && (
            <>
              {renderNameInput(s)}
              <button onClick={() => join(s)} disabled={busy} style={btnPrimary}>
                Puedo ir
              </button>
            </>
          )}
          {joined && (
            <button onClick={() => leave(s)} disabled={busy} style={btnSecondary}>
              Ya no puedo
            </button>
          )}
          {adminUnlocked && (
            <button onClick={() => run(s.id, { action: 'closeSuggestion', suggestionId: s.id })} style={btnSecondary}>
              Cerrar
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {replacements.length > 0 && (
        <div style={{ ...card, border: '1px solid #fecaca' }}>
          <h2 style={{ marginTop: 0, color: '#991b1b' }}>Reemplazos urgentes</h2>
          {replacements.map(renderReplacement)}
        </div>
      )}

      <div style={card}>
        <h2 style={{ marginTop: 0, marginBottom: 4 }}>Proponer turno</h2>
        <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>
          Elegí día y hora. Vos ya contás como jugador; cuando se sumen 4, se saca el turno.
        </div>

        <div style={{ display: 'grid', gap: 10 }}>
          {!me && (
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Tu nombre"
              style={input}
            />
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Día</div>
              <input type="date" value={date} min={todayISO()} onChange={(e) => setDate(e.target.value)} style={input} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Hora</div>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={input} />
            </div>
          </div>

          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Nota (opcional). Ej: soy principiante"
            style={input}
          />

          <div>
            <button
              onClick={createProposal}
              disabled={saving}
              style={{ ...btnPrimary, padding: '12px 16px', opacity: saving ? 0.7 : 1 }}
            >
              {saving ? 'Publicando…' : 'Publicar turno'}
            </button>
          </div>
        </div>
      </div>

      <div style={card}>
        <h2 style={{ marginTop: 0 }}>Turnos propuestos</h2>
        {proposals.length === 0 ? (
          <div style={{ color: '#64748b' }}>No hay turnos propuestos. ¡Proponé uno!</div>
        ) : (
          proposals.map(renderProposal)
        )}
      </div>
    </div>
  );
}
