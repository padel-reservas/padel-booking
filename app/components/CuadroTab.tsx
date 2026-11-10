'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  KO_ROUNDS,
  KO_TITLE,
  KO_TOURNAMENT_KEY,
  drawBracketImage,
  pairLabel,
  setsFor,
  type KoMatch,
  type KoPair,
} from '../lib/bracket';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Props = {
  myPlayerName: string;
  adminUnlocked: boolean;
  adminAction: (action: any) => Promise<{ ok: boolean; data: any }>;
};

type SetForm = { s1a: string; s1b: string; s2a: string; s2b: string; s3a: string; s3b: string };
const EMPTY_FORM: SetForm = { s1a: '', s1b: '', s2a: '', s2b: '', s3a: '', s3b: '' };

const card: React.CSSProperties = {
  background: 'white',
  borderRadius: 20,
  padding: 16,
  border: '1px solid #e5e7eb',
};

const btn: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 10,
  border: '1px solid #d1d5db',
  background: 'white',
  cursor: 'pointer',
  fontWeight: 700,
  fontSize: 13,
};

const btnDark: React.CSSProperties = { ...btn, background: '#111827', color: 'white', border: 'none' };

function sameName(a: string, b: string) {
  return !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
}

export default function CuadroTab({ myPlayerName, adminUnlocked, adminAction }: Props) {
  const [pairs, setPairs] = useState<KoPair[]>([]);
  const [matches, setMatches] = useState<KoMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openForm, setOpenForm] = useState<number | null>(null);
  const [form, setForm] = useState<SetForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [showImage, setShowImage] = useState(false);
  const [sharing, setSharing] = useState(false);
  const previewRef = useRef<HTMLCanvasElement | null>(null);

  const loadData = useCallback(async () => {
    const [pairsRes, matchesRes] = await Promise.all([
      supabase.from('ko_pairs').select('*').eq('tournament_key', KO_TOURNAMENT_KEY).order('seed'),
      supabase.from('ko_matches').select('*').eq('tournament_key', KO_TOURNAMENT_KEY).order('round').order('slot'),
    ]);
    if (pairsRes.error || matchesRes.error) {
      setLoadError(pairsRes.error?.message || matchesRes.error?.message || 'error');
      setLoading(false);
      return;
    }
    setLoadError(null);
    setPairs((pairsRes.data || []) as KoPair[]);
    setMatches((matchesRes.data || []) as KoMatch[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (showImage && previewRef.current) drawBracketImage(previewRef.current, { pairs, matches });
  }, [showImage, pairs, matches]);

  const pairById = useMemo(() => new Map(pairs.map((p) => [p.id, p])), [pairs]);

  const isMyPair = (pairId: number | null) => {
    if (!pairId || !myPlayerName) return false;
    const p = pairById.get(pairId);
    return !!p && (sameName(p.player1_name, myPlayerName) || sameName(p.player2_name, myPlayerName));
  };

  const myNextMatch = useMemo(
    () =>
      matches.find(
        (m) => m.status === 'pending' && m.pair1_id && m.pair2_id && (isMyPair(m.pair1_id) || isMyPair(m.pair2_id))
      ) || null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [matches, pairById, myPlayerName]
  );

  const champion = useMemo(() => {
    const final = matches.find((m) => m.round === 4);
    return final?.status === 'played' && final.winner_pair_id ? pairById.get(final.winner_pair_id) : null;
  }, [matches, pairById]);

  async function saveResult(m: KoMatch) {
    setSaving(true);
    const res = await adminAction({
      action: 'submitKoResult',
      matchId: m.id,
      set1p1: form.s1a, set1p2: form.s1b,
      set2p1: form.s2a, set2p2: form.s2b,
      set3p1: form.s3a, set3p2: form.s3b,
      submittedByName: myPlayerName,
    });
    setSaving(false);
    if (!res.ok) return;
    setOpenForm(null);
    setForm(EMPTY_FORM);
    await loadData();
  }

  async function walkover(m: KoMatch, winnerPairId: number) {
    const p = pairById.get(winnerPairId);
    if (!p || !window.confirm(`¿Dar el partido por W.O. a ${pairLabel(p)}?`)) return;
    const res = await adminAction({ action: 'koWalkover', matchId: m.id, winnerPairId });
    if (res.ok) await loadData();
  }

  async function clearResult(m: KoMatch) {
    if (!window.confirm('¿Borrar el resultado de este partido?')) return;
    const res = await adminAction({ action: 'koClearResult', matchId: m.id });
    if (res.ok) await loadData();
  }

  async function shareImage() {
    setSharing(true);
    try {
      const canvas = document.createElement('canvas');
      drawBracketImage(canvas, { pairs, matches });
      const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('No se pudo generar la imagen');
      const file = new File([blob], 'torneo-fall-26.png', { type: 'image/png' });
      const nav = navigator as Navigator & { canShare?: (data: any) => boolean };
      if (nav.share && nav.canShare && nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], title: KO_TITLE });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'torneo-fall-26.png';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') alert(`No se pudo compartir: ${e?.message || e}`);
    } finally {
      setSharing(false);
    }
  }

  function renderPairLine(m: KoMatch, side: 1 | 2) {
    const pairId = side === 1 ? m.pair1_id : m.pair2_id;
    const pair = pairId ? pairById.get(pairId) : null;
    const decided = m.status === 'played' && !!m.winner_pair_id;
    const isWinner = decided && pairId === m.winner_pair_id;
    const isLoser = decided && !!pairId && !isWinner;
    const mine = isMyPair(pairId);
    const score = m.status === 'played' ? (m.walkover ? (isWinner ? 'W.O.' : '') : setsFor(m, side).join('  ')) : '';

    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 10px',
          background: isWinner ? '#dcfce7' : 'transparent',
          color: isWinner ? '#166534' : isLoser ? '#94a3b8' : pair ? '#0f172a' : '#94a3b8',
          fontWeight: isWinner ? 800 : mine ? 700 : 500,
        }}
      >
        <span style={{ width: 20, fontSize: 12, color: '#64748b', fontWeight: 700 }}>{pair?.seed ?? ''}</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          {pair ? pairLabel(pair) : m.is_bye ? 'pasa directo' : 'Por definir'}
          {mine && <span style={{ color: '#2563eb', fontSize: 12 }}> (vos)</span>}
        </span>
        {score && <span style={{ fontWeight: 800, letterSpacing: 1 }}>{score}</span>}
      </div>
    );
  }

  function renderForm(m: KoMatch) {
    const p1 = m.pair1_id ? pairById.get(m.pair1_id) : null;
    const p2 = m.pair2_id ? pairById.get(m.pair2_id) : null;
    const input = (key: keyof SetForm) => (
      <input
        inputMode="numeric"
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value.replace(/\D/g, '').slice(0, 2) }))}
        style={{ width: 40, padding: '8px 4px', textAlign: 'center', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 16 }}
      />
    );
    return (
      <div style={{ padding: 12, background: '#f8fafc', borderTop: '1px solid #e5e7eb', display: 'grid', gap: 8 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr repeat(3, 44px)', gap: 6, alignItems: 'center', fontSize: 13 }}>
          <span />
          <span style={{ textAlign: 'center', color: '#64748b' }}>Set 1</span>
          <span style={{ textAlign: 'center', color: '#64748b' }}>Set 2</span>
          <span style={{ textAlign: 'center', color: '#64748b' }}>Set 3</span>
          <span style={{ fontWeight: 700 }}>{p1 ? pairLabel(p1) : ''}</span>
          {input('s1a')}{input('s2a')}{input('s3a')}
          <span style={{ fontWeight: 700 }}>{p2 ? pairLabel(p2) : ''}</span>
          {input('s1b')}{input('s2b')}{input('s3b')}
        </div>
        <div style={{ fontSize: 12, color: '#64748b' }}>El 3er set solo si quedaron 1 a 1.</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => saveResult(m)} disabled={saving} style={{ ...btnDark, opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Guardando…' : 'Guardar resultado'}
          </button>
          <button onClick={() => { setOpenForm(null); setForm(EMPTY_FORM); }} style={btn}>
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  function renderMatch(m: KoMatch) {
    const bothPairs = !!m.pair1_id && !!m.pair2_id;
    const canLoad = m.status === 'pending' && bothPairs && (adminUnlocked || isMyPair(m.pair1_id) || isMyPair(m.pair2_id));
    const highlight = isMyPair(m.pair1_id) || isMyPair(m.pair2_id);

    return (
      <div
        key={m.id}
        style={{
          border: highlight ? '2px solid #93c5fd' : '1px solid #e5e7eb',
          borderRadius: 12,
          overflow: 'hidden',
          background: 'white',
        }}
      >
        {renderPairLine(m, 1)}
        <div style={{ height: 1, background: '#f1f5f9' }} />
        {m.is_bye ? (
          <div style={{ padding: '8px 10px 8px 38px', color: '#64748b', fontSize: 14 }}>pasa directo</div>
        ) : (
          renderPairLine(m, 2)
        )}

        {!m.is_bye && (canLoad || (adminUnlocked && m.status === 'played')) && openForm !== m.id && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '8px 10px', borderTop: '1px solid #f1f5f9' }}>
            {canLoad && (
              <button onClick={() => { setOpenForm(m.id); setForm(EMPTY_FORM); }} style={btnDark}>
                Cargar resultado
              </button>
            )}
            {adminUnlocked && m.status === 'pending' && bothPairs && (
              <>
                <button onClick={() => walkover(m, m.pair1_id!)} style={btn}>W.O. arriba</button>
                <button onClick={() => walkover(m, m.pair2_id!)} style={btn}>W.O. abajo</button>
              </>
            )}
            {adminUnlocked && m.status === 'played' && (
              <button onClick={() => clearResult(m)} style={btn}>Borrar resultado</button>
            )}
          </div>
        )}
        {openForm === m.id && renderForm(m)}
      </div>
    );
  }

  if (loading) return <div style={card}>Cargando cuadro…</div>;
  if (loadError) return <div style={{ ...card, color: '#b45309' }}>No se pudo cargar el cuadro ({loadError}).</div>;

  return (
    <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <div style={{ ...card, minWidth: 0 }}>
        <h2 style={{ marginTop: 0, marginBottom: 4 }}>🏆 {KO_TITLE}</h2>
        <p style={{ color: '#64748b', margin: 0 }}>
          Eliminación simple · un partido por semana, de lunes a domingo. El resultado lo carga cualquiera de los 4 jugadores.
        </p>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <button onClick={shareImage} disabled={sharing || pairs.length === 0} style={btnDark}>
            {sharing ? 'Generando…' : '📤 Compartir cuadro'}
          </button>
          <button onClick={() => setShowImage((v) => !v)} style={btn}>
            {showImage ? 'Ocultar cuadro completo' : 'Ver cuadro completo'}
          </button>
        </div>
        {showImage && (
          <div style={{ marginTop: 12, overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 12 }}>
            <canvas ref={previewRef} style={{ width: 900, maxWidth: 'none', display: 'block' }} />
          </div>
        )}
      </div>

      {champion && (
        <div style={{ ...card, background: '#fef9c3', borderColor: '#eab308', textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: '#854d0e', fontWeight: 700 }}>CAMPEONES</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>🏆 {pairLabel(champion)}</div>
        </div>
      )}

      {myNextMatch && (
        <div style={{ ...card, borderColor: '#93c5fd', background: '#eff6ff' }}>
          <div style={{ fontWeight: 800, marginBottom: 4 }}>Tu próximo partido</div>
          <div>
            {pairLabel(pairById.get(myNextMatch.pair1_id!)!)} <b>vs</b> {pairLabel(pairById.get(myNextMatch.pair2_id!)!)}
          </div>
          <div style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>
            {KO_ROUNDS.find((r) => r.round === myNextMatch.round)?.name} ·{' '}
            {KO_ROUNDS.find((r) => r.round === myNextMatch.round)?.window}
          </div>
        </div>
      )}

      {KO_ROUNDS.map((r) => {
        const roundMatches = matches.filter((m) => m.round === r.round);
        const played = roundMatches.filter((m) => m.status === 'played').length;
        const total = roundMatches.filter((m) => !m.is_bye).length;
        return (
          <div key={r.round} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
              <h3 style={{ margin: 0 }}>{r.name}</h3>
              <span style={{ color: '#64748b', fontSize: 13 }}>
                {r.window} · {played}/{total} jugados
              </span>
            </div>
            <div style={{ display: 'grid', gap: 10 }}>{roundMatches.map(renderMatch)}</div>
          </div>
        );
      })}
    </div>
  );
}
