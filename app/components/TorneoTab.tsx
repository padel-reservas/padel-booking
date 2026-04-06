'use client';

import React from 'react';
import type { RankingPlayer, Slot, SlotPlayer, SlotPlayerWithPaymentUI } from '../lib/padelTypes';

const MIN_MATCHES = 5;

type Props = {
  rankingPlayers: RankingPlayer[];
  slots: Slot[];
  slotPlayers: (SlotPlayer | SlotPlayerWithPaymentUI)[];
  myPlayerName: string;
};

export default function TorneoTab({ myPlayerName }: Props) {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ background: 'white', borderRadius: 20, padding: 20, border: '1px solid #e5e7eb' }}>
        <h2 style={{ marginTop: 0, marginBottom: 4 }}>🏆 Torneo Greenwich Padel</h2>
        <p>myPlayerName: {myPlayerName || '(vacío)'}</p>
        <p>Sin query a Supabase — ¿se queda?</p>
      </div>
    </div>
  );
}
