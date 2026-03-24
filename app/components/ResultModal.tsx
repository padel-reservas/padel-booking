'use client';

import React from 'react';
import type { RankingPlayer, ResultFormState, SlotPlayer } from '../lib/padelTypes';
import { formatDate } from '../lib/padelUtils';

type SlotForModal = {
  id: number;
  date: string;
  time: string;
  activePlayers: SlotPlayer[];
};

type Props = {
  resultModalOpen: boolean;
  resultForm: ResultFormState | null;
  savingResult: boolean;
  slotsWithPlayers: SlotForModal[];
  slotPlayers: SlotPlayer[];
  rankingPlayers: RankingPlayer[];
  manualPlayerOptions: RankingPlayer[];
  rankingPlayerIdFromSlotPlayerId: (
    slotPlayerId: number,
    slotPlayers: SlotPlayer[],
    rankingPlayers: RankingPlayer[]
  ) => number | null;
  setResultForm: React.Dispatch<React.SetStateAction<ResultFormState | null>>;
  closeResultModal: () => void;
  saveResult: () => Promise<void>;
};

export default function ResultModal({
  resultModalOpen,
  resultForm,
  savingResult,
  slotsWithPlayers,
  slotPlayers,
  rankingPlayers,
  manualPlayerOptions,
  rankingPlayerIdFromSlotPlayerId,
  setResultForm,
  closeResultModal,
  saveResult,
}: Props) {
  if (!resultModalOpen || !resultForm) return null;

  const slot =
    resultForm.mode === 'slot'
      ? slotsWithPlayers.find((s) => s.id === resultForm.slotId)
      : null;

  const slotModePlayers = slot?.activePlayers || [];
  const manualPlayers = manualPlayerOptions;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        zIndex: 1000,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 720,
          background: 'white',
          borderRadius: 20,
          padding: 20,
          border: '1px solid #e5e7eb',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        <h3 style={{ marginTop: 0, marginBottom: 12 }}>
          {resultForm.editingMatchId
            ? 'Editar resultado'
            : resultForm.mode === 'manual'
            ? 'Subir resultado manual'
            : 'Subir resultado'}
        </h3>

        <div style={{ color: '#64748b', marginBottom: 14 }}>
          {resultForm.mode === 'manual'
            ? 'Partido manual sin turno asociado'
            : `Turno ${slot?.time} · ${slot ? formatDate(slot.date) : ''}`}
        </div>

        <div style={{ display: 'grid', gap: 14 }}>
          {resultForm.mode === 'manual' && (
            <div
              style={{
                display: 'grid',
                gap: 12,
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              }}
            >
              <div>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Fecha</div>
                <input
                  type="date"
                  value={resultForm.manualDate}
                  onChange={(e) =>
                    setResultForm((prev) =>
                      prev ? { ...prev, manualDate: e.target.value } : prev
                    )
                  }
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 12,
                    border: '1px solid #d1d5db',
                  }}
                />
              </div>

              <div>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Hora</div>
                <input
                  type="time"
                  value={resultForm.manualTime}
                  onChange={(e) =>
                    setResultForm((prev) =>
                      prev ? { ...prev, manualTime: e.target.value } : prev
                    )
                  }
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 12,
                    border: '1px solid #d1d5db',
                  }}
                />
              </div>
            </div>
          )}

          {!resultForm.editingMatchId && resultForm.mode === 'slot' && (
            <div>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>
                Quién carga el resultado
              </div>
              <select
                value={resultForm.submittedByPlayerId}
                onChange={(e) =>
                  setResultForm((prev) =>
                    prev
                      ? {
                          ...prev,
                          submittedByPlayerId:
                            e.target.value === '' ? '' : Number(e.target.value),
                        }
                      : prev
                  )
                }
                style={{
                  padding: '10px 12px',
                  borderRadius: 12,
                  border: '1px solid #d1d5db',
                  width: '100%',
                }}
              >
                <option value="">Elegir jugador</option>
                {slotModePlayers.map((p) => {
                  const rankingId = rankingPlayerIdFromSlotPlayerId(
                    p.id,
                    slotPlayers,
                    rankingPlayers
                  );
                  if (!rankingId) return null;
                  return (
                    <option key={p.id} value={rankingId}>
                      {p.name}
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          <div>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Pareja A</div>
            <div style={{ display: 'grid', gap: 8 }}>
              <select
                value={resultForm.teamA1}
                onChange={(e) =>
                  setResultForm((prev) =>
                    prev
                      ? { ...prev, teamA1: e.target.value === '' ? '' : Number(e.target.value) }
                      : prev
                  )
                }
                style={{
                  padding: '10px 12px',
                  borderRadius: 12,
                  border: '1px solid #d1d5db',
                }}
              >
                <option value="">Elegir jugador</option>
                {(resultForm.mode === 'manual' ? manualPlayers : slotModePlayers).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>

              <select
                value={resultForm.teamA2}
                onChange={(e) =>
                  setResultForm((prev) =>
                    prev
                      ? { ...prev, teamA2: e.target.value === '' ? '' : Number(e.target.value) }
                      : prev
                  )
                }
                style={{
                  padding: '10px 12px',
                  borderRadius: 12,
                  border: '1px solid #d1d5db',
                }}
              >
                <option value="">Elegir jugador</option>
                {(resultForm.mode === 'manual' ? manualPlayers : slotModePlayers).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Pareja B</div>
            <div style={{ display: 'grid', gap: 8 }}>
              <select
                value={resultForm.teamB1}
                onChange={(e) =>
                  setResultForm((prev) =>
                    prev
                      ? { ...prev, teamB1: e.target.value === '' ? '' : Number(e.target.value) }
                      : prev
                  )
                }
                style={{
                  padding: '10px 12px',
                  borderRadius: 12,
                  border: '1px solid #d1d5db',
                }}
              >
                <option value="">Elegir jugador</option>
                {(resultForm.mode === 'manual' ? manualPlayers : slotModePlayers).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>

              <select
                value={resultForm.teamB2}
                onChange={(e) =>
                  setResultForm((prev) =>
                    prev
                      ? { ...prev, teamB2: e.target.value === '' ? '' : Number(e.target.value) }
                      : prev
                  )
                }
                style={{
                  padding: '10px 12px',
                  borderRadius: 12,
                  border: '1px solid #d1d5db',
                }}
              >
                <option value="">Elegir jugador</option>
                {(resultForm.mode === 'manual' ? manualPlayers : slotModePlayers).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Resultado por sets</div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 80px 80px',
                gap: 8,
                alignItems: 'center',
              }}
            >
              <div>Set 1</div>
              <input
                value={resultForm.set1A}
                onChange={(e) =>
                  setResultForm((prev) => (prev ? { ...prev, set1A: e.target.value } : prev))
                }
                placeholder="A"
                style={{
                  padding: '10px 12px',
                  borderRadius: 12,
                  border: '1px solid #d1d5db',
                }}
              />
              <input
                value={resultForm.set1B}
                onChange={(e) =>
                  setResultForm((prev) => (prev ? { ...prev, set1B: e.target.value } : prev))
                }
                placeholder="B"
                style={{
                  padding: '10px 12px',
                  borderRadius: 12,
                  border: '1px solid #d1d5db',
                }}
              />

              <div>Set 2</div>
              <input
                value={resultForm.set2A}
                onChange={(e) =>
                  setResultForm((prev) => (prev ? { ...prev, set2A: e.target.value } : prev))
                }
                placeholder="A"
                style={{
                  padding: '10px 12px',
                  borderRadius: 12,
                  border: '1px solid #d1d5db',
                }}
              />
              <input
                value={resultForm.set2B}
                onChange={(e) =>
                  setResultForm((prev) => (prev ? { ...prev, set2B: e.target.value } : prev))
                }
                placeholder="B"
                style={{
                  padding: '10px 12px',
                  borderRadius: 12,
                  border: '1px solid #d1d5db',
                }}
              />

              <div>Set 3</div>
              <input
                value={resultForm.set3A}
                onChange={(e) =>
                  setResultForm((prev) => (prev ? { ...prev, set3A: e.target.value } : prev))
                }
                placeholder="A"
                style={{
                  padding: '10px 12px',
                  borderRadius: 12,
                  border: '1px solid #d1d5db',
                }}
              />
              <input
                value={resultForm.set3B}
                onChange={(e) =>
                  setResultForm((prev) => (prev ? { ...prev, set3B: e.target.value } : prev))
                }
                placeholder="B"
                style={{
                  padding: '10px 12px',
                  borderRadius: 12,
                  border: '1px solid #d1d5db',
                }}
              />
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Notas</div>
            <textarea
              value={resultForm.notes}
              onChange={(e) =>
                setResultForm((prev) => (prev ? { ...prev, notes: e.target.value } : prev))
              }
              rows={3}
              placeholder="Opcional"
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 12,
                border: '1px solid #d1d5db',
                resize: 'vertical',
              }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
          <button
            onClick={closeResultModal}
            disabled={savingResult}
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              border: '1px solid #d1d5db',
              background: 'white',
              cursor: savingResult ? 'not-allowed' : 'pointer',
            }}
          >
            Cancelar
          </button>

          <button
            onClick={saveResult}
            disabled={savingResult}
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              border: 'none',
              background: '#111827',
              color: 'white',
              cursor: savingResult ? 'not-allowed' : 'pointer',
              fontWeight: 700,
            }}
          >
            {savingResult
              ? 'Guardando...'
              : resultForm.editingMatchId
              ? 'Guardar cambios'
              : 'Guardar resultado'}
          </button>
        </div>
      </div>
    </div>
  );
}
