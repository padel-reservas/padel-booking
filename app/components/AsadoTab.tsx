'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import type { RankingPlayer } from '../lib/padelTypes';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type AsadoRsvp = {
  id: number;
  player_name: string;
  attending: boolean;
  declined: boolean;
  guests: number;
  kids: number;
  created_at: string;
  updated_at?: string;
};

type Props = {
  rankingPlayers: RankingPlayer[];
  myPlayerName: string;
  adminUnlocked: boolean;
};

function normalizeName(name: string) {
  return name.trim().toLowerCase();
}

export default function AsadoTab({ rankingPlayers, myPlayerName, adminUnlocked }: Props) {
  const [rsvps, setRsvps] = useState<AsadoRsvp[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from('asado_rsvp')
      .select('*')
      .order('player_name', { ascending: true });

    if (error) {
      alert(`Error cargando RSVPs: ${error.message}`);
      setLoading(false);
      return;
    }

    setRsvps((data || []) as AsadoRsvp[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleConfirm(playerName: string) {
    setSaving(playerName);

    const existing = rsvps.find(
      (r) => normalizeName(r.player_name) === normalizeName(playerName)
    );

    if (existing) {
      const { error } = await supabase
        .from('asado_rsvp')
        .update({ attending: true, declined: false })
        .eq('id', existing.id);

      if (error) { alert(`Error: ${error.message}`); setSaving(null); return; }
    } else {
      const { error } = await supabase
        .from('asado_rsvp')
        .insert({ player_name: playerName.trim(), attending: true, declined: false, guests: 0, kids: 0 });

      if (error) { alert(`Error: ${error.message}`); setSaving(null); return; }
    }

    setSaving(null);
    await loadData();
  }

  async function handleDecline(playerName: string) {
    setSaving(playerName);

    const existing = rsvps.find(
      (r) => normalizeName(r.player_name) === normalizeName(playerName)
    );

    if (existing) {
      const { error } = await supabase
        .from('asado_rsvp')
        .update({ attending: false, declined: true })
        .eq('id', existing.id);

      if (error) { alert(`Error: ${error.message}`); setSaving(null); return; }
    } else {
      const { error } = await supabase
        .from('asado_rsvp')
        .insert({ player_name: playerName.trim(), attending: false, declined: true, guests: 0, kids: 0 });

      if (error) { alert(`Error: ${error.message}`); setSaving(null); return; }
    }

    setSaving(null);
    await loadData();
  }

  async function handleWithdraw(playerName: string) {
    setSaving(playerName);

    const existing = rsvps.find(
      (r) => normalizeName(r.player_name) === normalizeName(playerName)
    );

    if (existing) {
      const { error } = await supabase
        .from('asado_rsvp')
        .update({ attending: false, declined: false })
        .eq('id', existing.id);

      if (error) { alert(`Error: ${error.message}`); setSaving(null); return; }
    }

    setSaving(null);
    await loadData();
  }

  async function handleUpdateGuests(playerName: string, guests: number) {
    setSaving(playerName);

    const existing = rsvps.find(
      (r) => normalizeName(r.player_name) === normalizeName(playerName)
    );

    if (existing) {
      const { error } = await supabase
        .from('asado_rsvp')
        .update({ guests: Math.max(0, guests) })
        .eq('id', existing.id);

      if (error) { alert(`Error: ${error.message}`); setSaving(null); return; }
    }

    setSaving(null);
    await loadData();
  }

  async function handleUpdateKids(playerName: string, kids: number) {
    setSaving(playerName);

    const existing = rsvps.find(
      (r) => normalizeName(r.player_name) === normalizeName(playerName)
    );

    if (existing) {
      const { error } = await supabase
        .from('asado_rsvp')
        .update({ kids: Math.max(0, kids) })
        .eq('id', existing.id);

      if (error) { alert(`Error: ${error.message}`); setSaving(null); return; }
    }

    setSaving(null);
    await loadData();
  }

  const playersWithRsvp = rankingPlayers
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((p) => {
      const rsvp = rsvps.find(
        (r) => normalizeName(r.player_name) === normalizeName(p.name)
      );
      return {
        name: p.name,
        attending: rsvp?.attending ?? false,
        declined: rsvp?.declined ?? false,
        guests: rsvp?.guests ?? 0,
        kids: rsvp?.kids ?? 0,
        rsvpId: rsvp?.id ?? null,
      };
    });

  const attending = playersWithRsvp.filter((p) => p.attending);
  const declined = playersWithRsvp.filter((p) => p.declined);
  const pending = playersWithRsvp.filter((p) => !p.attending && !p.declined);

  const totalAdults = attending.reduce((sum, p) => sum + 1 + p.guests, 0);
  const totalKids = attending.reduce((sum, p) => sum + p.kids, 0);
  const totalPeople = totalAdults + totalKids;

  const isMe = (name: string) =>
    !!myPlayerName && normalizeName(name) === normalizeName(myPlayerName);

  return (
    <div style={{ display: 'grid', gap: 16 }}>

      {/* Header */}
      <div style={{ background: 'white', borderRadius: 20, padding: 20, border: '1px solid #e5e7eb' }}>
        <h2 style={{ marginTop: 0, marginBottom: 4 }}>🥩 Asado — 16 de mayo</h2>
        <p style={{ color: '#64748b', marginBottom: 0 }}>
          Confirmá si venís y cuántos traés. Menores de 14 van aparte.
        </p>
      </div>

      {/* Resumen */}
      {(attending.length > 0 || declined.length > 0) && (
        <div style={{ background: 'white', borderRadius: 20, padding: 20, border: '1px solid #e5e7eb' }}>
          <h3 style={{ marginTop: 0, marginBottom: 12 }}>Resumen</h3>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 12, padding: '10px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#166534' }}>{attending.length}</div>
              <div style={{ fontSize: 12, color: '#166534', fontWeight: 700 }}>Jugadores</div>
            </div>
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: '10px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#1e40af' }}>{totalAdults}</div>
              <div style={{ fontSize: 12, color: '#1e40af', fontWeight: 700 }}>Adultos (14+)</div>
            </div>
            <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 12, padding: '10px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#9a3412' }}>{totalKids}</div>
              <div style={{ fontSize: 12, color: '#9a3412', fontWeight: 700 }}>Menores de 14</div>
            </div>
            <div style={{ background: '#111827', border: '1px solid #111827', borderRadius: 12, padding: '10px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'white' }}>{totalPeople}</div>
              <div style={{ fontSize: 12, color: '#9ca3af', fontWeight: 700 }}>Total</div>
            </div>
            <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 12, padding: '10px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#991b1b' }}>{declined.length}</div>
              <div style={{ fontSize: 12, color: '#991b1b', fontWeight: 700 }}>No van</div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmados */}
      <div style={{ background: 'white', borderRadius: 20, padding: 20, border: '1px solid #e5e7eb' }}>
        <h3 style={{ marginTop: 0, marginBottom: 12 }}>
          Confirmados ({attending.length})
        </h3>

        {loading ? (
          <div style={{ color: '#64748b' }}>Cargando...</div>
        ) : attending.length === 0 ? (
          <div style={{ color: '#64748b', marginBottom: 8 }}>Todavía nadie confirmó.</div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {attending.map((p) => (
              <div key={p.name} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
                borderRadius: 12, flexWrap: 'wrap',
                background: isMe(p.name) ? '#f0fdf4' : '#f8fafc',
                border: isMe(p.name) ? '1px solid #86efac' : '1px solid #e5e7eb',
              }}>
                <span style={{ fontWeight: isMe(p.name) ? 800 : 600, fontSize: 14, flex: 1 }}>
                  ✅ {p.name}
                  {isMe(p.name) && (
                    <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: '#166534', background: '#dcfce7', border: '1px solid #86efac', borderRadius: 999, padding: '2px 8px' }}>
                      Vos
                    </span>
                  )}
                </span>

                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>
                    👥 <span style={{ fontWeight: 700 }}>{1 + p.guests}</span> adulto{1 + p.guests !== 1 ? 's' : ''}
                    {p.kids > 0 && <span> · 👦 <span style={{ fontWeight: 700 }}>{p.kids}</span> menor{p.kids !== 1 ? 'es' : ''}</span>}
                  </div>

                  {(adminUnlocked || isMe(p.name)) && (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 700 }}>Adultos extra</div>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <button onClick={() => handleUpdateGuests(p.name, p.guests - 1)}
                            disabled={p.guests === 0 || saving === p.name}
                            style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid #d1d5db', background: 'white', cursor: p.guests === 0 ? 'default' : 'pointer', fontWeight: 700, opacity: p.guests === 0 ? 0.4 : 1 }}>-</button>
                          <span style={{ minWidth: 20, textAlign: 'center', fontWeight: 700 }}>{p.guests}</span>
                          <button onClick={() => handleUpdateGuests(p.name, p.guests + 1)}
                            disabled={saving === p.name}
                            style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid #d1d5db', background: 'white', cursor: 'pointer', fontWeight: 700 }}>+</button>
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 700 }}>Menores</div>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <button onClick={() => handleUpdateKids(p.name, p.kids - 1)}
                            disabled={p.kids === 0 || saving === p.name}
                            style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid #d1d5db', background: 'white', cursor: p.kids === 0 ? 'default' : 'pointer', fontWeight: 700, opacity: p.kids === 0 ? 0.4 : 1 }}>-</button>
                          <span style={{ minWidth: 20, textAlign: 'center', fontWeight: 700 }}>{p.kids}</span>
                          <button onClick={() => handleUpdateKids(p.name, p.kids + 1)}
                            disabled={saving === p.name}
                            style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid #d1d5db', background: 'white', cursor: 'pointer', fontWeight: 700 }}>+</button>
                        </div>
                      </div>

                      <button onClick={() => handleWithdraw(p.name)} disabled={saving === p.name}
                        style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #fca5a5', background: 'white', color: '#991b1b', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
                        No viene
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* No van */}
      {declined.length > 0 && (
        <div style={{ background: 'white', borderRadius: 20, padding: 20, border: '1px solid #e5e7eb' }}>
          <h3 style={{ marginTop: 0, marginBottom: 12, color: '#991b1b' }}>
            No van ({declined.length})
          </h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {declined.map((p) => (
              <div key={p.name} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                borderRadius: 12,
                background: isMe(p.name) ? '#fef2f2' : '#f8fafc',
                border: isMe(p.name) ? '1px solid #fca5a5' : '1px solid #e5e7eb',
              }}>
                <span style={{ fontWeight: isMe(p.name) ? 800 : 400, fontSize: 14, color: '#991b1b', flex: 1 }}>
                  ❌ {p.name}
                  {isMe(p.name) && (
                    <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: '#991b1b', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 999, padding: '2px 8px' }}>
                      Vos
                    </span>
                  )}
                </span>
                {(adminUnlocked || isMe(p.name)) && (
                  <button onClick={() => handleConfirm(p.name)} disabled={saving === p.name}
                    style={{ padding: '6px 10px', borderRadius: 8, border: 'none', background: '#111827', color: 'white', cursor: saving === p.name ? 'default' : 'pointer', fontWeight: 700, fontSize: 12, opacity: saving === p.name ? 0.7 : 1 }}>
                    Me anoto
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sin confirmar */}
      <div style={{ background: 'white', borderRadius: 20, padding: 20, border: '1px solid #e5e7eb' }}>
        <h3 style={{ marginTop: 0, marginBottom: 12, color: '#6b7280' }}>
          Sin confirmar ({pending.length})
        </h3>
        <div style={{ display: 'grid', gap: 8 }}>
          {pending.map((p) => (
            <div key={p.name} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
              borderRadius: 12,
              background: isMe(p.name) ? '#fffbeb' : '#f8fafc',
              border: isMe(p.name) ? '1px solid #fde68a' : '1px solid #e5e7eb',
            }}>
              <span style={{ fontWeight: isMe(p.name) ? 800 : 400, fontSize: 14, color: '#6b7280', flex: 1 }}>
                {p.name}
                {isMe(p.name) && (
                  <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: '#92400e', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 999, padding: '2px 8px' }}>
                    Vos
                  </span>
                )}
              </span>

              {(adminUnlocked || isMe(p.name)) && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => handleConfirm(p.name)} disabled={saving === p.name}
                    style={{ padding: '6px 10px', borderRadius: 8, border: 'none', background: '#111827', color: 'white', cursor: saving === p.name ? 'default' : 'pointer', fontWeight: 700, fontSize: 12, opacity: saving === p.name ? 0.7 : 1 }}>
                    {saving === p.name ? '...' : 'Voy'}
                  </button>
                  <button onClick={() => handleDecline(p.name)} disabled={saving === p.name}
                    style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #fca5a5', background: 'white', color: '#991b1b', cursor: saving === p.name ? 'default' : 'pointer', fontWeight: 700, fontSize: 12, opacity: saving === p.name ? 0.7 : 1 }}>
                    No voy
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
