'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

import ActivityTab from './components/ActivityTab';
import HistoryTab from './components/HistoryTab';
import DuelTab from './components/DuelTab';
import RankingTab from './components/RankingTab';
import TurnosTab from './components/TurnosTab';
import ResultModal from './components/ResultModal';
import ReportPaymentModal from './components/ReportPaymentModal';
import WhatsAppReminderModal from './components/WhatsAppReminderModal';
import Image from 'next/image';
import logoDisplay from './logo-display.png';
import { APP_VERSION } from './lib/appVersion'; // 👈 NUEVO

// ... (TODO TU CÓDIGO ORIGINAL SIN CAMBIOS HASTA STATES)

export default function Page() {
  const [activeTab, setActiveTab] = useState<TabKey>('turnos');

  // ... (todos tus states originales)

  const [myPlayerName, setMyPlayerName] = useState<string>('');

  // ✅ NUEVO
  const [showVersionBanner, setShowVersionBanner] = useState(false);
  const [dismissedVersion, setDismissedVersion] = useState('');

  // ... (resto de tu código igual)

  useEffect(() => {
    const saved = window.localStorage.getItem('myPlayerName');
    if (saved) {
      setMyPlayerName(saved);
      setSelectedChartPlayer(saved);
      setSelectedActivityPlayer(saved);
      setDuelPlayerA(saved);
    }
  }, []);

  // ✅ NUEVO (detector de versión)
  useEffect(() => {
    const lastSeenVersion = window.localStorage.getItem('appVersionSeen') || '';
    const lastDismissedVersion = window.localStorage.getItem('appVersionDismissed') || '';

    setDismissedVersion(lastDismissedVersion);

    if (
      lastSeenVersion &&
      lastSeenVersion !== APP_VERSION &&
      lastDismissedVersion !== APP_VERSION
    ) {
      setShowVersionBanner(true);
    }

    window.localStorage.setItem('appVersionSeen', APP_VERSION);
  }, []);

  // ✅ NUEVO
  function dismissVersionBanner() {
    setShowVersionBanner(false);
    setDismissedVersion(APP_VERSION);
    window.localStorage.setItem('appVersionDismissed', APP_VERSION);
  }

  // ... (TODO tu código igual hasta el return)

  return (
    <div
      style={{
        padding: 16,
        fontFamily: 'Arial, sans-serif',
        maxWidth: 1080,
        margin: '0 auto',
        background: '#f8fafc',
        minHeight: '100vh',
      }}
    >
      {/* ✅ NUEVO BANNER */}
      {showVersionBanner && dismissedVersion !== APP_VERSION && (
        <div
          style={{
            background: '#fef3c7',
            color: '#92400e',
            border: '1px solid #fde68a',
            borderRadius: 16,
            padding: 14,
            marginBottom: 16,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ fontWeight: 700 }}>
            Nueva versión disponible ({APP_VERSION}). Si no ves los cambios, cerrá y abrí la app.
          </div>

          <button
            onClick={dismissVersionBanner}
            style={{
              padding: '8px 12px',
              borderRadius: 10,
              border: '1px solid #d1d5db',
              background: 'white',
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            Cerrar
          </button>
        </div>
      )}

      {/* HEADER */}
      <div
        style={{
          background: 'white',
          borderRadius: 20,
          padding: 20,
          marginBottom: 16,
          border: '1px solid #e5e7eb',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            flexWrap: 'wrap',
            marginBottom: 10,
          }}
        >
          <Image
            src={logoDisplay}
            alt="Greenwich Padel"
            width={64}
            height={64}
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              objectFit: 'cover',
              border: '1px solid #e5e7eb',
              background: '#111827',
            }}
          />

          <div>
            <h1
              style={{
                margin: 0,
                fontSize: 28,
                fontWeight: 800,
                color: '#0f172a',
              }}
            >
              Greenwich Padel
            </h1>

            <p style={{ marginTop: 6, marginBottom: 0, color: '#64748b' }}>
              Turnos, ranking e historial en una sola app.
            </p>

            {/* ✅ VERSION LABEL */}
            <div
              style={{
                marginTop: 8,
                fontSize: 12,
                fontWeight: 700,
                color: '#64748b',
                background: '#f8fafc',
                border: '1px solid #e5e7eb',
                borderRadius: 999,
                padding: '4px 10px',
                display: 'inline-block',
              }}
            >
              {APP_VERSION}
            </div>
          </div>
        </div>

        {/* resto del header SIN CAMBIOS */}
