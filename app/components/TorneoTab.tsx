'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import type { RankingPlayer, Slot, SlotPlayer, SlotPlayerWithPaymentUI } from '../lib/padelTypes';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Props = {
  rankingPlayers: RankingPlayer[];
  slots: Slot[];
  slotPlayers: (SlotPlayer | SlotPlayerWithPaymentUI)[];
  myPlayerName: string;
};

export default function TorneoTab({ myPlayerName }: Props) {
  const [status, setStatus] = useState('cargando...');
  const [count, setCount] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const { data, error } = await supabase
          .from('tournament_players')
          .select('*')
          .order('created_at', { ascending: true });

        if (error) {
          setStatus('error supabase');
          setErrorMsg(error.message);
          return;
        }

        setCount(data?.length ?? 0);
        setStatus('ok');
      } catch (e: any) {
        setStatus('excepcion');
        setErrorMsg(e?.message || 'error desconocido');
      }
    }

    load();
  }, []);

  return (
    <div style={{ background: 'white', borderRadius: 20, padding: 20, border: '1px solid #e5e7eb' }}>
      <h2>🏆 Torneo — Debug</h2>
      <p>myPlayerName: {myPlayerName || '(vacío)'}</p>
      <p>status: {status}</p>
      {count !== null && <p>registros: {count}</p>}
      {errorMsg && <p style={{ color: 'red' }}>error: {errorMsg}</p>}
    </div>
  );
}
