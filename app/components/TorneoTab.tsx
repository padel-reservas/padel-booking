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

  return (
    <div style={{ display: 'grid', gap: 16 }}>

      <div style={{ background: 'white', borderRadius: 20, padding: 20, border: '1px solid #e5e7eb' }}>
        <h2 style={{ marginTop: 0, marginBottom: 4 }}>🏆 Torneo Greenwich Padel</h2>
        <p style={{ color: '#64748b', marginBottom: 0 }}>
          Anotate si querés participar. Mínimo {MIN_MATCHES} partidos jugados para ser elegible.
        </p>
      </div>

      <div style={{ background: 'white', borderRadius: 20, padding: 20, border: '1px solid #e5e7eb' }}>
        <p>myPlayerName: {myPlayerName || '(vacío)'}</p>
        <p>loading: {String(loading)}</p>
        <p>confirmados: {tournamentPlayers.filter(tp => tp.status === 'confirmed').length}</p>
        <p>no juegan: {tournamentPlayers.filter(tp => tp.status === 'not_playing').length}</p>
      </div>

    </div>
  );
}
