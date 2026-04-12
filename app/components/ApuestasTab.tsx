'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import type { RankingPlayer } from '../lib/padelTypes';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const TOURNAMENT_ID = 1;

type TournamentPair = {
  id: number;
  player1_name: string;
  player2_name: string;
  combined_rating: number;
  group_name: string | null;
};

type TournamentPrediction = {
  id: number;
  tournament_id: number;
  predictor_name: string;
  first_place_pair_id: number;
  second_place_pair_id: number;
  third_place_pair_id: number;
  paid: boolean;
  paid_at: string | null;
  points: number | null;
  created_at: string;
};

type Props = {
  rankingPlayers: RankingPlayer[];
  myPlayerName: string;
  adminUnlocked: boolean;
};

function normalizeName(name: string) {
  return name.trim().toLowerCase();
}

export default function ApuestasTab({ myPlayerName, adminUnlocked }: Props) {
  const [pairs, setPairs] = useState<TournamentPair[]>([]);
  const [predictions, setPredictions] = useState<TournamentPrediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingPrediction, setSavingPrediction] = useState(false);

  const [predictionName, setPredictionName] = useState('');
  const [predictionFirst, setPredictionFirst] = useState<number | ''>('');
  const [predictionSecond, setPredictionSecond] = useState<number | ''>('');
  const [predictionThird, setPredictionThird] = useState<number | ''>('');

  const loadData = useCallback(async () => {
    setLoading(true);

    const [
      { data: pairsData, error: pairsError },
      { data: predictionsData, error: predictionsError },
    ] = await Promise.all([
      supabase.from('tournament_pairs').select('*').eq('tournament_id', TOURNAMENT_ID).order('combined_rating', { ascending: false }),
      supabase.from('tournament_predictions').select('*').eq('tournament_id', TOURNAMENT_ID).order('created_at', { ascending: true }),
    ]);

    if (pairsError) { alert(`Error cargando parejas: ${pairsError.message}`); setLoading(false); return; }
    if (predictionsError) { alert(`Error cargando predicciones: ${predictionsError.message}`); setLoading(false); return; }

    setPairs((pairsData || []) as TournamentPair[]);
    setPredictions((predictionsData || []) as TournamentPrediction[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function getPairName(pairId: number) {
    const pair = pairs.find((p) => p.id === pairId);
    if (!pair) return '?';
    return `${pair.player1_name} / ${pair.player2_name}`;
  }

  const myPrediction = predictions.find(
    (p) => normalizeName(p.predictor_name) === normalizeName(myPlayerName || predictionName)
  );

  async function handleSavePrediction() {
    const name = (myPlayerName.trim() || predictionName.trim());

    if (!name) {
      alert('Escribí tu nombre para apostar.');
      return;
    }

    if (!predictionFirst || !predictionSecond || !predictionThird) {
      alert('Elegí las 3 parejas.');
      return;
    }

    if (predictionFirst === predictionSecond || predictionFirst === predictionThird || predictionSecond === predictionThird) {
      alert('No podés elegir la misma pareja dos veces.');
      return;
    }

    setSavingPrediction(true);

    const { error } = await supabase.from('tournament_predictions').upsert(
      {
        tournament_id: TOURNAMENT_ID,
        predictor_name: name,
        first_place_pair_id: predictionFirst,
        second_place_pair_id: predictionSecond,
        third_place_pair_id: predictionThird,
      },
      { onConflict: 'tournament_id,predictor_name' }
    );

    setSavingPrediction(false);

    if (error) {
      alert(`No se pudo guardar la predicción: ${error.message}`);
      return;
    }

    setPredictionName('');
    setPredictionFirst('');
    setPredictionSecond('');
    setPredictionThird('');
    await loadData();
  }

  async function handleMarkPaid(predictionId: number, paid: boolean) {
    if (!adminUnlocked) return;

    const { error } = await supabase
      .from('tournament_predictions')
      .update({
        paid,
        paid_at: paid ? new Date().toISOString() : null,
      })
      .eq('id', predictionId);

    if (error) {
      alert(`No se pudo actualizar el pago: ${error.message}`);
      return;
    }

    await loadData();
  }

  async function handleDeletePrediction(predictionId: number) {
    if (!adminUnlocked) return;

    const ok = window.confirm('¿Seguro que querés borrar esta predicción?');
    if (!ok) return;

    const { error } = await supabase
      .from('tournament_predictions')
      .delete()
      .eq('id', predictionId);

    if (error) {
      alert(`No se pudo borrar la predicción: ${error.message}`);
      return;
    }

    await loadData();
  }

  if (loading) {
    return (
      <div style={{ background: 'white', borderRadius: 20, padding: 20, border: '1px solid #e5e7eb' }}>
        Cargando...
      </div>
    );
  }

  if (pairs.length === 0) {
    return (
      <div style={{ background: 'white', borderRadius: 20, padding: 20, border: '1px solid #e5e7eb' }}>
        <h2 style={{ marginTop: 0 }}>🎯 Apuestas — Top 3</h2>
        <p style={{ color: '#64748b' }}>Las apuestas se habilitan cuando estén definidas las parejas del torneo.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>

      {/* Header */}
      <div style={{ background: 'white', borderRadius: 20, padding: 20, border: '1px solid #e5e7eb' }}>
        <h2 style={{ marginTop: 0, marginBottom: 4 }}>🎯 Apuestas — Top 3</h2>
        <p style={{ color: '#64748b', marginBottom: 0 }}>
          Elegí tu pareja campeona, finalista y 3er puesto. Puntos: 3 por el campeón, 2 por el finalista, 1 por el 3ro.
        </p>
      </div>

      {/* Mi predicción actual */}
      {myPrediction && (
        <div style={{ background: '#f0fdf4', borderRadius: 20, padding: 20, border: '1px solid #86efac' }}>
          <h3 style={{ marginTop: 0, marginBottom: 12, color: '#166534' }}>✅ Tu predicción</h3>
          <div style={{ display: 'grid', gap: 6, fontSize: 14 }}>
            <div>🥇 {getPairName(myPrediction.first_place_pair_id)}</div>
            <div>🥈 {getPairName(myPrediction.second_place_pair_id)}</div>
            <div>🥉 {getPairName(myPrediction.third_place_pair_id)}</div>
          </div>
          {myPrediction.points != null && (
            <div style={{ marginTop: 10, fontWeight: 800, color: '#166534' }}>
              Puntos: {myPrediction.points}
            </div>
          )}
          <div style={{ marginTop: 10, fontSize: 12, color: myPrediction.paid ? '#166534' : '#92400e', fontWeight: 700 }}>
            {myPrediction.paid ? '✅ Pago confirmado' : '⏳ Pago pendiente'}
          </div>
        </div>
      )}

      {/* Formulario */}
      {!myPrediction && (
        <div style={{ background: 'white', borderRadius: 20, padding: 20, border: '1px solid #e5e7eb' }}>
          <h3 style={{ marginTop: 0, marginBottom: 16 }}>Tu predicción</h3>

          <div style={{ display: 'grid', gap: 12 }}>
            {!myPlayerName && (
              <div>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Tu nombre</div>
                <input
                  type="text"
                  value={predictionName}
                  onChange={(e) => setPredictionName(e.target.value)}
                  placeholder="Tu nombre"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 12, border: '1px solid #d1d5db' }}
                />
              </div>
            )}

            {[
              { label: '🥇 Campeón (3 pts)', value: predictionFirst, setter: setPredictionFirst },
              { label: '🥈 Finalista (2 pts)', value: predictionSecond, setter: setPredictionSecond },
              { label: '🥉 3er puesto (1 pt)', value: predictionThird, setter: setPredictionThird },
            ].map(({ label, value, setter }) => (
              <div key={label}>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>{label}</div>
                <select
                  value={value}
                  onChange={(e) => setter(e.target.value ? Number(e.target.value) : '')}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 12, border: '1px solid #d1d5db', background: 'white' }}
                >
                  <option value="">Elegí una pareja...</option>
                  {pairs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.player1_name} / {p.player2_name}
                    </option>
                  ))}
                </select>
              </div>
            ))}

            <button
              onClick={handleSavePrediction}
              disabled={savingPrediction}
              style={{ padding: '12px 20px', borderRadius: 12, border: 'none', background: '#111827', color: 'white', cursor: savingPrediction ? 'default' : 'pointer', fontWeight: 700, fontSize: 15, opacity: savingPrediction ? 0.7 : 1 }}
            >
              {savingPrediction ? 'Guardando...' : '🎯 Enviar predicción'}
            </button>
          </div>
        </div>
      )}

      {/* Lista de predicciones — solo admin */}
      {adminUnlocked && (
        <div style={{ background: 'white', borderRadius: 20, padding: 20, border: '2px solid #111827' }}>
          <h3 style={{ marginTop: 0, marginBottom: 12 }}>
            Admin — Predicciones ({predictions.length}) — Pagaron: {predictions.filter(p => p.paid).length}
          </h3>

          {predictions.length === 0 ? (
            <div style={{ color: '#64748b', fontSize: 13 }}>Todavía no hay predicciones.</div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {predictions.map((pred, idx) => (
                <div key={pred.id} style={{
                  padding: '12px 14px', borderRadius: 12,
                  background: pred.paid ? '#f0fdf4' : '#f8fafc',
                  border: pred.paid ? '1px solid #86efac' : '1px solid #e5e7eb',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                    <div style={{ fontWeight: 800, fontSize: 14 }}>
                      {idx + 1}. {pred.predictor_name}
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {pred.points != null && (
                        <span style={{ fontSize: 12, fontWeight: 800, color: '#166534', background: '#dcfce7', border: '1px solid #86efac', borderRadius: 999, padding: '2px 8px' }}>
                          {pred.points} pts
                        </span>
                      )}
                      <span style={{
                        fontSize: 11, fontWeight: 700,
                        color: pred.paid ? '#166534' : '#92400e',
                        background: pred.paid ? '#dcfce7' : '#fef3c7',
                        border: `1px solid ${pred.paid ? '#86efac' : '#fde68a'}`,
                        borderRadius: 999, padding: '2px 8px'
                      }}>
                        {pred.paid ? '✅ Pagó' : '⏳ Pendiente'}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gap: 4, fontSize: 13, marginBottom: 10 }}>
                    <div>🥇 {getPairName(pred.first_place_pair_id)}</div>
                    <div>🥈 {getPairName(pred.second_place_pair_id)}</div>
                    <div>🥉 {getPairName(pred.third_place_pair_id)}</div>
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => handleMarkPaid(pred.id, !pred.paid)}
                      style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #d1d5db', background: 'white', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
                      {pred.paid ? 'Marcar no pagó' : 'Marcar pagó'}
                    </button>
                    <button
                      onClick={() => handleDeletePrediction(pred.id)}
                      style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #fca5a5', background: 'white', color: '#991b1b', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
                      Borrar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Lista pública — todos ven cuántos apostaron pero no qué apostaron */}
      {!adminUnlocked && predictions.length > 0 && (
        <div style={{ background: 'white', borderRadius: 20, padding: 20, border: '1px solid #e5e7eb' }}>
          <h3 style={{ marginTop: 0, marginBottom: 12 }}>
            Apostadores ({predictions.length}) — Pagaron: {predictions.filter(p => p.paid).length}
          </h3>
          <div style={{ display: 'grid', gap: 6 }}>
            {predictions.map((pred, idx) => (
              <div key={pred.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 12,
                background: pred.paid ? '#f0fdf4' : '#f8fafc',
                border: pred.paid ? '1px solid #86efac' : '1px solid #e5e7eb',
                fontWeight: normalizeName(pred.predictor_name) === normalizeName(myPlayerName) ? 800 : 600,
              }}>
                <span style={{ color: '#9ca3af', fontSize: 13, minWidth: 24 }}>{idx + 1}.</span>
                <span>{pred.predictor_name}</span>
                {pred.points != null && (
                  <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 800, color: '#166534', background: '#dcfce7', border: '1px solid #86efac', borderRadius: 999, padding: '2px 8px' }}>
                    {pred.points} pts
                  </span>
                )}
                <span style={{
                  fontSize: 11, fontWeight: 700,
                  color: pred.paid ? '#166534' : '#92400e',
                  background: pred.paid ? '#dcfce7' : '#fef3c7',
                  border: `1px solid ${pred.paid ? '#86efac' : '#fde68a'}`,
                  borderRadius: 999, padding: '2px 8px',
                  marginLeft: pred.points != null ? 0 : 'auto',
                }}>
                  {pred.paid ? '✅ Pagó' : '⏳ Pendiente'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
