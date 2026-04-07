'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import type { RankingPlayer, Slot, SlotPlayer, SlotPlayerWithPaymentUI, TournamentPlayer } from '../lib/padelTypes';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const MIN_MATCHES = 5;

type Props = {
  rankingPlayers: RankingPlayer[];
  slots: Slot[];
  slotPlayers: (SlotPlayer | SlotPlayerWithPaymentUI)[];
  myPlayerName: string;
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

export default function TorneoTab({ rankingPlayers, slots, slotPlayers, myPlayerName }: Props) {
  const [tournamentPlayers, setTournamentPlayers] = useState<TournamentPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadTournamentPlayers = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('tournament_players')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      alert(`Error cargando inscriptos: ${error.message}`);
      setLoading(false);
      return;
    }

    setTournamentPlayers((data || []) as TournamentPlayer[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadTournamentPlayers();
  }, [loadTournamentPlayers]);

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

    await loadTournamentPlayers();
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

    await loadTournamentPlayers();
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div
        style={{
          background: 'white',
          borderRadius: 20,
          padding: 20,
          border: '1px solid #e5e7eb',
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: 4 }}>🏆 Torneo Greenwich Padel</h2>
        <p style={{ color: '#64748b', marginBottom: 0 }}>
          Anotate si querés participar. Mínimo {MIN_MATCHES} partidos jugados para ser elegible.
        </p>
      </div>

      {myPlayerName ? (
        <div
          style={{
            background: 'white',
            borderRadius: 20,
            padding: 20,
            border: '1px solid #e5e7eb',
          }}
        >
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
            <div
              style={{
                background: '#fef3c7',
                border: '1px solid #fde68a',
                borderRadius: 12,
                padding: '10px 14px',
                fontSize: 13,
                color: '#92400e',
                fontWeight: 700,
              }}
            >
              Necesitás al menos {MIN_MATCHES} partidos para anotarte.
            </div>
          )}

          {isEligible && !isConfirmed && (
            <button
              onClick={handleConfirm}
              disabled={saving}
              style={{
                padding: '12px 20px',
                borderRadius: 12,
                border: 'none',
                background: '#111827',
                color: 'white',
                cursor: saving ? 'default' : 'pointer',
                fontWeight: 700,
                fontSize: 15,
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? 'Guardando...' : '✅ Quiero jugar el torneo'}
            </button>
          )}

          {isConfirmed && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <div
                style={{
                  background: '#dcfce7',
                  border: '1px solid #86efac',
                  borderRadius: 12,
                  padding: '10px 16px',
                  fontWeight: 800,
                  color: '#166534',
                  fontSize: 14,
                }}
              >
                ✅ Confirmado para el torneo
              </div>

              <button
                onClick={handleWithdraw}
                disabled={saving}
                style={{
                  padding: '10px 14px',
                  borderRadius: 12,
                  border: '1px solid #d1d5db',
                  background: 'white',
                  cursor: saving ? 'default' : 'pointer',
                  fontWeight: 700,
                  fontSize: 13,
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? '...' : 'Me bajo'}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div
          style={{
            background: 'white',
            borderRadius: 20,
            padding: 20,
            border: '1px solid #e5e7eb',
            color: '#64748b',
          }}
        >
          Elegí tu jugador en la tab <strong>Ranking</strong> para ver tu estado y anotarte.
        </div>
      )}

      <div
        style={{
          background: 'white',
          borderRadius: 20,
          padding: 20,
          border: '1px solid #e5e7eb',
        }}
      >
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
              const isMe =
                !!myPlayerName &&
                normalizeName(tp.player_name) === normalizeName(myPlayerName);

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
                  <span style={{ color: '#9ca3af', fontSize: 13, minWidth: 24 }}>
                    {index + 1}.
                  </span>
                  <span>{tp.player_name}</span>
                  {isMe && (
                    <span
                      style={{
                        marginLeft: 'auto',
                        fontSize: 11,
                        fontWeight: 700,
                        color: '#166534',
                        background: '#dcfce7',
                        border: '1px solid #86efac',
                        borderRadius: 999,
                        padding: '2px 8px',
                      }}
                    >
                      Vos
                    </span>
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
