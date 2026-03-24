'use client';

import React from 'react';
import type { Match, RankingPlayer, SlotPlayer } from '../lib/padelTypes';
import { formatDate, playerNameById } from '../lib/padelUtils';

const MAX_PLAYERS = 4;

type SlotWithPlayers = {
  id: number;
  date: string;
  time: string;
  allPlayers: SlotPlayer[];
  activePlayers: SlotPlayer[];
  waitlistPlayers: SlotPlayer[];
  match: Match | null;
};

type RankingStat = {
  position: number;
  display: number;
  winPct: number;
  provisional: boolean;
};

type Props = {
  groupedSlots: Record<string, SlotWithPlayers[]>;
  rankingPlayers: RankingPlayer[];
  rankingStats: Map<string, RankingStat>;
  nameInput: Record<number, string>;
  setNameInput: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  adminUnlocked: boolean;
  adminAction: (action: any) => Promise<{ ok: boolean; data: any }>;
  loadData: () => Promise<void>;
  addPlayer: (slotId: number) => Promise<void>;
  removePlayer: (playerId: number) => Promise<void>;
  openNewResultModal: (slotId: number) => void;
  openEditResultModal: (slotId: number) => void;
  deleteResult: (slotId: number) => Promise<void>;
};

export default function TurnosTab({
  groupedSlots,
  rankingPlayers,
  rankingStats,
  nameInput,
  setNameInput,
  adminUnlocked,
  adminAction,
  loadData,
  addPlayer,
  removePlayer,
  openNewResultModal,
  openEditResultModal,
  deleteResult,
}: Props) {
  return (
    <>
      {Object.keys(groupedSlots).length === 0 && (
        <div
          style={{
            background: 'white',
            borderRadius: 20,
            padding: 20,
            border: '1px solid #e5e7eb',
          }}
        >
          No hay turnos cargados.
        </div>
      )}

      {Object.entries(groupedSlots).map(([dateKey, daySlots]) => (
        <div key={dateKey} style={{ marginBottom: 22 }}>
          <h2 style={{ marginBottom: 10, fontSize: 22 }}>{formatDate(dateKey)}</h2>

          <div style={{ display: 'grid', gap: 12 }}>
            {daySlots.map((slot) => {
              const isFull = slot.activePlayers.length >= MAX_PLAYERS;
              const hasMatch = !!slot.match;

              return (
                <div
                  key={slot.id}
                  style={{
                    background: 'white',
                    borderRadius: 18,
                    padding: 16,
                    border: '1px solid #e5e7eb',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 8,
                      alignItems: 'center',
                      flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ fontSize: 24, fontWeight: 700 }}>{slot.time}</div>

                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <div
                        style={{
                          padding: '6px 10px',
                          borderRadius: 999,
                          background: isFull ? '#111827' : '#e5e7eb',
                          color: isFull ? 'white' : '#111827',
                          fontWeight: 700,
                          fontSize: 12,
                        }}
                      >
                        {isFull ? 'COMPLETO' : `${slot.activePlayers.length}/${MAX_PLAYERS}`}
                      </div>

                      {slot.waitlistPlayers.length > 0 && (
                        <div
                          style={{
                            padding: '6px 10px',
                            borderRadius: 999,
                            background: '#f1f5f9',
                            color: '#111827',
                            fontWeight: 700,
                            fontSize: 12,
                            border: '1px solid #cbd5e1',
                          }}
                        >
                          Espera: {slot.waitlistPlayers.length}
                        </div>
                      )}

                      {hasMatch && (
                        <div
                          style={{
                            padding: '6px 10px',
                            borderRadius: 999,
                            background: '#dcfce7',
                            color: '#166534',
                            fontWeight: 700,
                            fontSize: 12,
                            border: '1px solid #bbf7d0',
                          }}
                        >
                          Resultado cargado
                        </div>
                      )}

                      {adminUnlocked && (
                        <button
                          onClick={() =>
                            adminAction({
                              action: 'deleteSlot',
                              slotId: slot.id,
                            }).then(() => loadData())
                          }
                          style={{
                            padding: '8px 10px',
                            borderRadius: 10,
                            border: '1px solid #d1d5db',
                            background: 'white',
                            cursor: 'pointer',
                          }}
                        >
                          Borrar turno
                        </button>
                      )}
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      gap: 8,
                      marginTop: 12,
                      marginBottom: 12,
                      flexWrap: 'wrap',
                    }}
                  >
                    <input
                      placeholder={isFull ? 'Anotate en lista de espera' : 'Tu nombre'}
                      value={nameInput[slot.id] || ''}
                      onChange={(e) =>
                        setNameInput((v) => ({ ...v, [slot.id]: e.target.value }))
                      }
                      autoComplete="new-password"
                      name={`slot-player-${slot.id}`}
                      data-form-type="other"
                      style={{
                        flex: 1,
                        minWidth: 180,
                        padding: '10px 12px',
                        borderRadius: 12,
                        border: '1px solid #d1d5db',
                      }}
                    />

                    <button
                      onClick={() => addPlayer(slot.id)}
                      style={{
                        padding: '10px 14px',
                        borderRadius: 12,
                        border: 'none',
                        background: '#111827',
                        color: 'white',
                        cursor: 'pointer',
                        fontWeight: 700,
                      }}
                    >
                      {isFull ? 'Lista de espera' : 'Anotar'}
                    </button>

                    {!hasMatch && slot.activePlayers.length === 4 && (
                      <button
                        onClick={() => openNewResultModal(slot.id)}
                        style={{
                          padding: '10px 14px',
                          borderRadius: 12,
                          border: 'none',
                          background: '#0f766e',
                          color: 'white',
                          cursor: 'pointer',
                          fontWeight: 700,
                        }}
                      >
                        {adminUnlocked ? 'Subir resultado' : 'Cargar resultado'}
                      </button>
                    )}

                    {hasMatch && (
                      <button
                        onClick={() => openEditResultModal(slot.id)}
                        style={{
                          padding: '10px 14px',
                          borderRadius: 12,
                          border: '1px solid #d1d5db',
                          background: 'white',
                          color: '#111827',
                          cursor: 'pointer',
                          fontWeight: 700,
                        }}
                      >
                        Ver resultado
                      </button>
                    )}

                    {hasMatch && adminUnlocked && (
                      <>
                        <button
                          onClick={() => openEditResultModal(slot.id)}
                          style={{
                            padding: '10px 14px',
                            borderRadius: 12,
                            border: 'none',
                            background: '#7c3aed',
                            color: 'white',
                            cursor: 'pointer',
                            fontWeight: 700,
                          }}
                        >
                          Editar resultado
                        </button>

                        <button
                          onClick={() => deleteResult(slot.id)}
                          style={{
                            padding: '10px 14px',
                            borderRadius: 12,
                            border: 'none',
                            background: '#b91c1c',
                            color: 'white',
                            cursor: 'pointer',
                            fontWeight: 700,
                          }}
                        >
                          Borrar resultado
                        </button>
                      </>
                    )}
                  </div>

                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontWeight: 700, marginBottom: 8 }}>Jugadores</div>

                    {slot.activePlayers.length === 0 ? (
                      <div style={{ color: '#64748b' }}>Todavía no hay jugadores anotados.</div>
                    ) : (
                      <div style={{ display: 'grid', gap: 8 }}>
                        {slot.activePlayers.map((p, index) => {
                          const stats = rankingStats.get(p.name.trim().toLowerCase());

                          return (
                            <div
                              key={p.id}
                              style={{
                                border: '1px solid #e5e7eb',
                                borderRadius: 14,
                                padding: 12,
                                display: 'flex',
                                justifyContent: 'space-between',
                                gap: 8,
                                alignItems: 'center',
                                flexWrap: 'wrap',
                                background: '#f8fafc',
                              }}
                            >
                              <div>
                                <div style={{ fontWeight: 700 }}>
                                  {index + 1}. {p.name}
                                </div>

                                <div style={{ fontSize: 13, color: '#64748b' }}>
                                  {stats
                                    ? `#${stats.position} · ${stats.winPct}% victorias${
                                        stats.provisional ? ' · Provisional' : ''
                                      } · ${p.paid ? 'Pagó' : 'No pagó'}`
                                    : p.paid
                                    ? 'Pago registrado'
                                    : 'Pendiente de pago'}
                                </div>
                              </div>

                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <button
                                  onClick={() =>
                                    adminAction({
                                      action: adminUnlocked ? 'togglePaid' : 'selfTogglePaid',
                                      playerId: p.id,
                                      paid: !p.paid,
                                    }).then(() => loadData())
                                  }
                                  style={{
                                    padding: '8px 10px',
                                    borderRadius: 10,
                                    border: '1px solid #d1d5db',
                                    background: 'white',
                                    cursor: 'pointer',
                                  }}
                                >
                                  {p.paid ? 'Desmarcar pago' : 'Marcar pago'}
                                </button>

                                <button
                                  onClick={() => removePlayer(p.id)}
                                  style={{
                                    padding: '8px 10px',
                                    borderRadius: 10,
                                    border: '1px solid #d1d5db',
                                    background: 'white',
                                    cursor: 'pointer',
                                  }}
                                >
                                  Borrarme
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {hasMatch && slot.match && (
                    <div
                      style={{
                        marginTop: 12,
                        borderTop: '1px solid #e5e7eb',
                        paddingTop: 12,
                        background: '#f8fafc',
                        borderRadius: 12,
                      }}
                    >
                      <div style={{ fontWeight: 700, marginBottom: 6 }}>Resultado</div>
                      <div style={{ color: '#334155', marginBottom: 4 }}>
                        A: {playerNameById(rankingPlayers, slot.match.team_a_player_1_id)} /{' '}
                        {playerNameById(rankingPlayers, slot.match.team_a_player_2_id)}
                      </div>
                      <div style={{ color: '#334155', marginBottom: 4 }}>
                        B: {playerNameById(rankingPlayers, slot.match.team_b_player_1_id)} /{' '}
                        {playerNameById(rankingPlayers, slot.match.team_b_player_2_id)}
                      </div>
                      <div style={{ fontWeight: 700 }}>
                        Score: {slot.match.set1_a != null || slot.match.set2_a != null || slot.match.set3_a != null
                          ? `${slot.match.set1_a != null && slot.match.set1_b != null ? `${slot.match.set1_a}-${slot.match.set1_b}` : ''}${
                              slot.match.set2_a != null && slot.match.set2_b != null
                                ? `${slot.match.set1_a != null && slot.match.set1_b != null ? ' / ' : ''}${slot.match.set2_a}-${slot.match.set2_b}`
                                : ''
                            }${
                              slot.match.set3_a != null && slot.match.set3_b != null
                                ? `${(slot.match.set1_a != null && slot.match.set1_b != null) || (slot.match.set2_a != null && slot.match.set2_b != null) ? ' / ' : ''}${slot.match.set3_a}-${slot.match.set3_b}`
                                : ''
                            }`
                          : ''}
                      </div>
                      {slot.match.submitted_by_player_id && (
                        <div style={{ marginTop: 6, color: '#64748b', fontSize: 13 }}>
                          Cargado por:{' '}
                          {playerNameById(rankingPlayers, slot.match.submitted_by_player_id)}
                        </div>
                      )}
                    </div>
                  )}

                  {slot.waitlistPlayers.length > 0 && (
                    <div style={{ marginTop: 14 }}>
                      <div style={{ fontWeight: 700, marginBottom: 8 }}>Lista de espera</div>
                      <div style={{ display: 'grid', gap: 8 }}>
                        {slot.waitlistPlayers.map((p, index) => {
                          const stats = rankingStats.get(p.name.trim().toLowerCase());

                          return (
                            <div
                              key={p.id}
                              style={{
                                border: '1px dashed #cbd5e1',
                                borderRadius: 14,
                                padding: 12,
                                display: 'flex',
                                justifyContent: 'space-between',
                                gap: 8,
                                alignItems: 'center',
                                flexWrap: 'wrap',
                                background: '#f8fafc',
                              }}
                            >
                              <div>
                                <div style={{ fontWeight: 700 }}>
                                  {MAX_PLAYERS + index + 1}. {p.name}
                                </div>

                                <div style={{ fontSize: 13, color: '#64748b' }}>
                                  {stats
                                    ? `En espera · #${stats.position} · ${stats.winPct}% victorias${
                                        stats.provisional ? ' · Provisional' : ''
                                      } · ${p.paid ? 'Pagó' : 'No pagó'}`
                                    : `En espera · ${p.paid ? 'Pagó' : 'No pagó'}`}
                                </div>
                              </div>

                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <button
                                  onClick={() =>
                                    adminAction({
                                      action: adminUnlocked ? 'togglePaid' : 'selfTogglePaid',
                                      playerId: p.id,
                                      paid: !p.paid,
                                    }).then(() => loadData())
                                  }
                                  style={{
                                    padding: '8px 10px',
                                    borderRadius: 10,
                                    border: '1px solid #d1d5db',
                                    background: 'white',
                                    cursor: 'pointer',
                                  }}
                                >
                                  {p.paid ? 'Desmarcar pago' : 'Marcar pago'}
                                </button>

                                <button
                                  onClick={() => removePlayer(p.id)}
                                  style={{
                                    padding: '8px 10px',
                                    borderRadius: 10,
                                    border: '1px solid #d1d5db',
                                    background: 'white',
                                    cursor: 'pointer',
                                  }}
                                >
                                  Borrarme
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}
