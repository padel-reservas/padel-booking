'use client';

import React from 'react';
import type {
  ReportPaymentFormState,
  SlotPlayerWithPaymentUI,
} from '../lib/padelTypes';
import { formatDate } from '../lib/padelUtils';

type SlotForPaymentModal = {
  id: number;
  date: string;
  time: string;
  allPlayers: SlotPlayerWithPaymentUI[];
  activePlayers: SlotPlayerWithPaymentUI[];
  waitlistPlayers: SlotPlayerWithPaymentUI[];
};

type Props = {
  reportPaymentModalOpen: boolean;
  reportPaymentForm: ReportPaymentFormState | null;
  savingPayment: boolean;
  slot: SlotForPaymentModal | null;
  setReportPaymentForm: React.Dispatch<
    React.SetStateAction<ReportPaymentFormState | null>
  >;
  closeReportPaymentModal: () => void;
  saveReportedPayment: () => Promise<void>;
};

export default function ReportPaymentModal({
  reportPaymentModalOpen,
  reportPaymentForm,
  savingPayment,
  slot,
  setReportPaymentForm,
  closeReportPaymentModal,
  saveReportedPayment,
}: Props) {
  if (!reportPaymentModalOpen || !reportPaymentForm || !slot) return null;

  const allPlayers = slot.allPlayers;

  function toggleCoveredPlayer(playerId: number) {
    setReportPaymentForm((prev) => {
      if (!prev) return prev;

      const exists = prev.coveredPlayerIds.includes(playerId);

      return {
        ...prev,
        coveredPlayerIds: exists
          ? prev.coveredPlayerIds.filter((id) => id !== playerId)
          : [...prev.coveredPlayerIds, playerId],
      };
    });
  }

  const payerName =
    allPlayers.find((p) => p.id === reportPaymentForm.payerPlayerId)?.name || '';

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
        zIndex: 1100,
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
        <h3 style={{ marginTop: 0, marginBottom: 12 }}>Report Payment</h3>

        <div style={{ color: '#64748b', marginBottom: 14 }}>
          Turno {slot.time} · {formatDate(slot.date)}
        </div>

        <div style={{ display: 'grid', gap: 14 }}>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Quién pagó</div>
            <select
              value={reportPaymentForm.payerPlayerId}
              onChange={(e) =>
                setReportPaymentForm((prev) => {
                  if (!prev) return prev;

                  const nextPayerId =
                    e.target.value === '' ? '' : Number(e.target.value);

                  return {
                    ...prev,
                    payerPlayerId: nextPayerId,
                  };
                })
              }
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 12,
                border: '1px solid #d1d5db',
              }}
            >
              <option value="">Elegir jugador</option>
              {allPlayers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Método</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={() =>
                  setReportPaymentForm((prev) =>
                    prev ? { ...prev, paymentMethod: 'venmo' } : prev
                  )
                }
                style={{
                  padding: '10px 14px',
                  borderRadius: 12,
                  border:
                    reportPaymentForm.paymentMethod === 'venmo'
                      ? 'none'
                      : '1px solid #d1d5db',
                  background:
                    reportPaymentForm.paymentMethod === 'venmo'
                      ? '#111827'
                      : 'white',
                  color:
                    reportPaymentForm.paymentMethod === 'venmo'
                      ? 'white'
                      : '#111827',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                Venmo
              </button>

              <button
                onClick={() =>
                  setReportPaymentForm((prev) =>
                    prev ? { ...prev, paymentMethod: 'zelle' } : prev
                  )
                }
                style={{
                  padding: '10px 14px',
                  borderRadius: 12,
                  border:
                    reportPaymentForm.paymentMethod === 'zelle'
                      ? 'none'
                      : '1px solid #d1d5db',
                  background:
                    reportPaymentForm.paymentMethod === 'zelle'
                      ? '#111827'
                      : 'white',
                  color:
                    reportPaymentForm.paymentMethod === 'zelle'
                      ? 'white'
                      : '#111827',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                Zelle
              </button>
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>A quién cubre</div>

            <div style={{ display: 'grid', gap: 8 }}>
              {allPlayers.map((p) => {
                const checked = reportPaymentForm.coveredPlayerIds.includes(p.id);
                const isPayer = reportPaymentForm.payerPlayerId === p.id;

                return (
                  <label
                    key={p.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: 12,
                      borderRadius: 12,
                      border: checked
                        ? '1px solid #bbf7d0'
                        : '1px solid #e5e7eb',
                      background: checked ? '#f0fdf4' : '#f8fafc',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleCoveredPlayer(p.id)}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700 }}>
                        {p.name} {isPayer ? '· payer' : ''}
                      </div>
                      <div style={{ fontSize: 13, color: '#64748b' }}>
                        {p.paymentVisualStatus === 'paid'
                          ? 'Ya aparece como paid'
                          : p.paymentVisualStatus === 'reported'
                          ? 'Ya tiene un payment reportado'
                          : 'Pendiente'}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>

            {payerName && (
              <div style={{ marginTop: 8, fontSize: 13, color: '#64748b' }}>
                Tip: si {payerName} pagó por sí mismo, dejalo seleccionado también.
              </div>
            )}
          </div>

          <div
            style={{
              display: 'grid',
              gap: 12,
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            }}
          >
            <div>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Monto</div>
              <input
                value={reportPaymentForm.amount}
                onChange={(e) =>
                  setReportPaymentForm((prev) =>
                    prev ? { ...prev, amount: e.target.value } : prev
                  )
                }
                placeholder="Opcional"
                style={{
                  width: '100%',
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
              value={reportPaymentForm.notes}
              onChange={(e) =>
                setReportPaymentForm((prev) =>
                  prev ? { ...prev, notes: e.target.value } : prev
                )
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
            onClick={closeReportPaymentModal}
            disabled={savingPayment}
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              border: '1px solid #d1d5db',
              background: 'white',
              cursor: savingPayment ? 'not-allowed' : 'pointer',
            }}
          >
            Cancelar
          </button>

          <button
            onClick={saveReportedPayment}
            disabled={savingPayment}
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              border: 'none',
              background: '#111827',
              color: 'white',
              cursor: savingPayment ? 'not-allowed' : 'pointer',
              fontWeight: 700,
            }}
          >
            {savingPayment ? 'Guardando...' : 'Guardar payment reportado'}
          </button>
        </div>
      </div>
    </div>
  );
}
