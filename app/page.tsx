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
import { APP_VERSION } from './lib/appVersion';

import type {
  ActivityMatch,
  H2HMatch,
  Match,
  PartnershipMatch,
  PlayerRatingHistoryPoint,
  RankingPlayer,
  ResultFormState,
  Slot,
  SlotPlayer,
  SlotPlayerWithPaymentUI,
  TabKey,
  Payment,
  PaymentAllocationWithPayment,
  ReportPaymentFormState,
  Suggestion,
} from './lib/padelTypes';

import {
  buildPointsChartGeometry,
  computeWinnerTeam,
  parseSetValue,
  playerNameById,
  rankingPlayerIdFromSlotPlayerId,
  sortPlayers,
  statsMap,
  todayISO,
} from './lib/padelUtils';

const MAX_PLAYERS = 4;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type SlotWithPlayers = Slot & {
  allPlayers: SlotPlayerWithPaymentUI[];
  activePlayers: SlotPlayerWithPaymentUI[];
  waitlistPlayers: SlotPlayerWithPaymentUI[];
  match: Match | null;
};

function getLatestPaymentByStatus(
  player: SlotPlayer,
  status: 'reported' | 'verified'
): Payment | null {
  const allocations = player.payment_allocations || [];

  const payments = allocations
    .map((allocation) => allocation.payment || null)
    .filter((payment): payment is Payment => Boolean(payment))
    .filter((payment) => payment.status === status)
    .sort((a, b) => {
      const aTime =
        status === 'verified'
          ? new Date(a.verified_at || a.reported_at).getTime()
          : new Date(a.reported_at).getTime();
      const bTime =
        status === 'verified'
          ? new Date(b.verified_at || b.reported_at).getTime()
          : new Date(b.reported_at).getTime();
      return bTime - aTime;
    });

  return payments[0] || null;
}

function enrichPlayerPaymentUI(
  player: SlotPlayer,
  allPlayers: SlotPlayer[]
): SlotPlayerWithPaymentUI {
  const latestVerifiedPayment = getLatestPaymentByStatus(player, 'verified');
  const latestReportedPayment = getLatestPaymentByStatus(player, 'reported');

  const paymentVisualStatus = player.paid
    ? 'paid'
    : latestReportedPayment
      ? 'reported'
      : 'unpaid';

  const sourcePayment = latestVerifiedPayment || latestReportedPayment || null;
  const paidByPlayerId = sourcePayment?.payer_player_id ?? null;
  const paidByPlayerName =
    paidByPlayerId != null
      ? allPlayers.find((p) => p.id === paidByPlayerId)?.name || null
      : null;

  return {
    ...player,
    paymentVisualStatus,
    latestReportedPayment,
    latestVerifiedPayment,
    paidByPlayerId,
    paidByPlayerName,
  };
}

export default function Page() {
  const [activeTab, setActiveTab] = useState<TabKey>('turnos');

  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotPlayers, setSlotPlayers] = useState<SlotPlayer[]>([]);
  const [rankingPlayers, setRankingPlayers] = useState<RankingPlayer[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [ratingHistory, setRatingHistory] = useState<PlayerRatingHistoryPoint[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  const [selectedChartPlayer, setSelectedChartPlayer] = useState<string>('');
  const [selectedActivityPlayer, setSelectedActivityPlayer] = useState<string>('');
  const [duelPlayerA, setDuelPlayerA] = useState<string>('');
  const [duelPlayerB, setDuelPlayerB] = useState<string>('');

  const [nameInput, setNameInput] = useState<Record<number, string>>({});
  const [showAdmin, setShowAdmin] = useState(false);
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [pin, setPin] = useState('');
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState('09:00');
  const [newRankingPlayerName, setNewRankingPlayerName] = useState('');
  const [loading, setLoading] = useState(true);

  const [resultModalOpen, setResultModalOpen] = useState(false);
  const [resultForm, setResultForm] = useState<ResultFormState | null>(null);
  const [savingResult, setSavingResult] = useState(false);

  const [reportPaymentModalOpen, setReportPaymentModalOpen] = useState(false);
  const [reportPaymentForm, setReportPaymentForm] =
    useState<ReportPaymentFormState | null>(null);
  const [savingPayment, setSavingPayment] = useState(false);
  const [selectedPaymentSlotId, setSelectedPaymentSlotId] = useState<number | null>(null);

  const [whatsAppReminderModalOpen, setWhatsAppReminderModalOpen] = useState(false);
  const [whatsAppReminderMessage, setWhatsAppReminderMessage] = useState('');
  const [whatsAppReminderCopied, setWhatsAppReminderCopied] = useState(false);

  const [myPlayerName, setMyPlayerName] = useState<string>('');
  const [showVersionBanner, setShowVersionBanner] = useState(false);
  const [dismissedVersion, setDismissedVersion] = useState('');

  const [newSuggestionAuthor, setNewSuggestionAuthor] = useState('');
  const [newSuggestionType, setNewSuggestionType] = useState<
    'availability' | 'need_players' | 'replacement_needed'
  >('availability');
  const [newSuggestionMessage, setNewSuggestionMessage] = useState('');
  const [newSuggestionDate, setNewSuggestionDate] = useState('');
  const [newSuggestionTime, setNewSuggestionTime] = useState('');
  const [newSuggestionIsBooking, setNewSuggestionIsBooking] = useState(false);
  const [savingSuggestion, setSavingSuggestion] = useState(false);

  const canSeeAdmin = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return params.get('admin') === '1';
  }, []);

  async function loadData() {
    setLoading(true);

    const [
      { data: slotsData, error: slotsError },
      { data: slotPlayersData, error: slotPlayersError },
      { data: rankingPlayersData, error: rankingPlayersError },
      { data: matchesData, error: matchesError },
      { data: ratingHistoryData, error: ratingHistoryError },
      { data: suggestionsData, error: suggestionsError },
    ] = await Promise.all([
      supabase.from('slots').select('*').order('date').order('time'),
      supabase
        .from('players')
        .select(
          `
            *,
            payment_allocations (
              id,
              payment_id,
              player_id,
              created_at,
              payment:payments (
                id,
                payer_player_id,
                payment_method,
                status,
                amount,
                notes,
                reported_at,
                verified_at,
                verified_by,
                created_at,
                updated_at
              )
            )
          `
        )
        .order('created_at', { ascending: true }),
      supabase
        .from('ranking_players')
        .select('*')
        .order('display_rating', { ascending: false })
        .order('elo_rating', { ascending: false })
        .order('name', { ascending: true }),
      supabase
        .from('matches')
        .select('*')
        .order('match_date', { ascending: false })
        .order('id', { ascending: false }),
      supabase
        .from('player_rating_history')
        .select('*')
        .order('match_date', { ascending: true })
        .order('match_id', { ascending: true }),
      supabase
        .from('suggestions')
        .select('*')
        .order('is_urgent', { ascending: false })
        .order('created_at', { ascending: false }),
    ]);

    const firstError =
      slotsError ||
      slotPlayersError ||
      rankingPlayersError ||
      matchesError ||
      ratingHistoryError ||
      suggestionsError;

    if (firstError) {
      alert(`Error cargando datos: ${firstError.message}`);
      setLoading(false);
      return;
    }

    const rankingData = (rankingPlayersData || []) as RankingPlayer[];

    const playersWithPayments = ((slotPlayersData || []) as SlotPlayer[]).map((player) => ({
      ...player,
      payment_allocations: (player.payment_allocations || []) as PaymentAllocationWithPayment[],
    }));

    setSlots((slotsData || []) as Slot[]);
    setSlotPlayers(playersWithPayments);
    setRankingPlayers(rankingData);
    setMatches((matchesData || []) as Match[]);
    setRatingHistory((ratingHistoryData || []) as PlayerRatingHistoryPoint[]);
    setSuggestions((suggestionsData || []) as Suggestion[]);

    setSelectedChartPlayer((prev) => {
      if (prev) return prev;
      if (myPlayerName) return myPlayerName;
      return rankingData[0]?.name || '';
    });

    setSelectedActivityPlayer((prev) => {
      if (prev) return prev;
      if (myPlayerName) return myPlayerName;
      return rankingData[0]?.name || '';
    });

    setDuelPlayerA((prev) => prev || myPlayerName || rankingData[0]?.name || '');
    setDuelPlayerB((prev) => {
      if (prev) return prev;
      const fallbackA = myPlayerName || rankingData[0]?.name || '';
      const another = rankingData.find((p) => p.name !== fallbackA)?.name || '';
      return another;
    });

    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem('myPlayerName');
    if (saved) {
      setMyPlayerName(saved);
      setSelectedChartPlayer(saved);
      setSelectedActivityPlayer(saved);
      setDuelPlayerA(saved);
    }
  }, []);

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

  function handleSelectMyPlayer(name: string) {
    setMyPlayerName(name);
    setSelectedChartPlayer(name);
    setSelectedActivityPlayer(name);
    setDuelPlayerA(name);
    window.localStorage.setItem('myPlayerName', name);
  }

  function clearMyPlayer() {
    setMyPlayerName('');
    window.localStorage.removeItem('myPlayerName');
  }

  function dismissVersionBanner() {
    setShowVersionBanner(false);
    setDismissedVersion(APP_VERSION);
    window.localStorage.setItem('appVersionDismissed', APP_VERSION);
  }

  const rankingStats = useMemo(() => statsMap(rankingPlayers), [rankingPlayers]);

  const myRankingSummary = useMemo(() => {
    if (!myPlayerName) return null;

    const sorted = [...rankingPlayers].sort((a, b) => {
      if (b.display_rating !== a.display_rating) return b.display_rating - a.display_rating;
      if (b.elo_rating !== a.elo_rating) return b.elo_rating - a.elo_rating;
      return a.name.localeCompare(b.name);
    });

    const idx = sorted.findIndex(
      (p) => p.name.trim().toLowerCase() === myPlayerName.trim().toLowerCase()
    );

    if (idx === -1) return null;

    const player = sorted[idx];
    return {
      position: idx + 1,
      player,
    };
  }, [rankingPlayers, myPlayerName]);

  const chartPlayerName = selectedChartPlayer || myPlayerName || rankingPlayers[0]?.name || '';

  const selectedPlayerHistory = useMemo(() => {
    const rows = ratingHistory.filter(
      (r) => r.player_name.trim().toLowerCase() === chartPlayerName.trim().toLowerCase()
    );

    const currentPlayer = rankingPlayers.find(
      (p) => p.name.trim().toLowerCase() === chartPlayerName.trim().toLowerCase()
    );

    const points = rows.map((r) => Number(r.post_rating));

    if (currentPlayer) {
      const currentValue = Number(currentPlayer.display_rating);
      if (
        points.length === 0 ||
        Math.round(points[points.length - 1] * 100) / 100 !==
          Math.round(currentValue * 100) / 100
      ) {
        points.push(currentValue);
      }
    }

    return points;
  }, [ratingHistory, rankingPlayers, chartPlayerName]);

  const chartStats = useMemo(() => {
    if (selectedPlayerHistory.length === 0) return null;

    const first = selectedPlayerHistory[0];
    const last = selectedPlayerHistory[selectedPlayerHistory.length - 1];
    const min = Math.min(...selectedPlayerHistory);
    const max = Math.max(...selectedPlayerHistory);

    return {
      first,
      last,
      min,
      max,
      change: last - first,
    };
  }, [selectedPlayerHistory]);

  const chartGeometry = useMemo(() => {
    return buildPointsChartGeometry(selectedPlayerHistory);
  }, [selectedPlayerHistory]);

  const h2hData = useMemo(() => {
    if (!duelPlayerA || !duelPlayerB || duelPlayerA === duelPlayerB) {
      return {
        matches: [] as H2HMatch[],
        winsA: 0,
        winsB: 0,
        total: 0,
        winPctA: 0,
        currentStreakText: '',
      };
    }

    const playerA = rankingPlayers.find(
      (p) => p.name.trim().toLowerCase() === duelPlayerA.trim().toLowerCase()
    );
    const playerB = rankingPlayers.find(
      (p) => p.name.trim().toLowerCase() === duelPlayerB.trim().toLowerCase()
    );

    if (!playerA || !playerB) {
      return {
        matches: [] as H2HMatch[],
        winsA: 0,
        winsB: 0,
        total: 0,
        winPctA: 0,
        currentStreakText: '',
      };
    }

    const filtered = matches
      .filter((m) => {
        const aInTeamA =
          m.team_a_player_1_id === playerA.id || m.team_a_player_2_id === playerA.id;
        const aInTeamB =
          m.team_b_player_1_id === playerA.id || m.team_b_player_2_id === playerA.id;
        const bInTeamA =
          m.team_a_player_1_id === playerB.id || m.team_a_player_2_id === playerB.id;
        const bInTeamB =
          m.team_b_player_1_id === playerB.id || m.team_b_player_2_id === playerB.id;

        return (aInTeamA && bInTeamB) || (aInTeamB && bInTeamA);
      })
      .map((m) => {
        const aInTeamA =
          m.team_a_player_1_id === playerA.id || m.team_a_player_2_id === playerA.id;
        const sideOfPlayerA: 'A' | 'B' = aInTeamA ? 'A' : 'B';
        const winnerLabel: 'A' | 'B' = m.winner_team === sideOfPlayerA ? 'A' : 'B';
        return {
          ...m,
          sideOfPlayerA,
          winnerLabel,
        };
      });

    const winsA = filtered.filter((m) => m.winnerLabel === 'A').length;
    const winsB = filtered.filter((m) => m.winnerLabel === 'B').length;
    const total = filtered.length;
    const winPctA = total > 0 ? (winsA * 100) / total : 0;

    let currentStreakText = '';
    if (filtered.length > 0) {
      let streakCount = 0;
      const latestWinner = filtered[0].winnerLabel;
      for (const m of filtered) {
        if (m.winnerLabel === latestWinner) streakCount += 1;
        else break;
      }
      currentStreakText =
        latestWinner === 'A'
          ? `${duelPlayerA} lleva ${streakCount}`
          : `${duelPlayerB} lleva ${streakCount}`;
    }

    return {
      matches: filtered,
      winsA,
      winsB,
      total,
      winPctA,
      currentStreakText,
    };
  }, [matches, rankingPlayers, duelPlayerA, duelPlayerB]);

  const activityData = useMemo(() => {
    if (!selectedActivityPlayer) return [];

    const player = rankingPlayers.find(
      (p) => p.name.trim().toLowerCase() === selectedActivityPlayer.trim().toLowerCase()
    );

    if (!player) return [];

    return matches
      .filter((m) => {
        return (
          m.team_a_player_1_id === player.id ||
          m.team_a_player_2_id === player.id ||
          m.team_b_player_1_id === player.id ||
          m.team_b_player_2_id === player.id
        );
      })
      .map((m) => {
        const inTeamA =
          m.team_a_player_1_id === player.id || m.team_a_player_2_id === player.id;

        const partnerId = inTeamA
          ? m.team_a_player_1_id === player.id
            ? m.team_a_player_2_id
            : m.team_a_player_1_id
          : m.team_b_player_1_id === player.id
            ? m.team_b_player_2_id
            : m.team_b_player_1_id;

        const opponent1Id = inTeamA ? m.team_b_player_1_id : m.team_a_player_1_id;
        const opponent2Id = inTeamA ? m.team_b_player_2_id : m.team_a_player_2_id;

        const didWin =
          (inTeamA && m.winner_team === 'A') || (!inTeamA && m.winner_team === 'B');

        return {
          ...m,
          didWin,
          partnerName: playerNameById(rankingPlayers, partnerId),
          opponent1Name: playerNameById(rankingPlayers, opponent1Id),
          opponent2Name: playerNameById(rankingPlayers, opponent2Id),
        } as ActivityMatch;
      });
  }, [matches, rankingPlayers, selectedActivityPlayer]);

  const partnershipData = useMemo(() => {
    if (!duelPlayerA || !duelPlayerB || duelPlayerA === duelPlayerB) {
      return {
        matches: [] as PartnershipMatch[],
        wins: 0,
        losses: 0,
        total: 0,
        winPct: 0,
        currentStreakText: '',
      };
    }

    const playerA = rankingPlayers.find(
      (p) => p.name.trim().toLowerCase() === duelPlayerA.trim().toLowerCase()
    );
    const playerB = rankingPlayers.find(
      (p) => p.name.trim().toLowerCase() === duelPlayerB.trim().toLowerCase()
    );

    if (!playerA || !playerB) {
      return {
        matches: [] as PartnershipMatch[],
        wins: 0,
        losses: 0,
        total: 0,
        winPct: 0,
        currentStreakText: '',
      };
    }

    const filtered = matches
      .filter((m) => {
        const bothInTeamA =
          (m.team_a_player_1_id === playerA.id || m.team_a_player_2_id === playerA.id) &&
          (m.team_a_player_1_id === playerB.id || m.team_a_player_2_id === playerB.id);

        const bothInTeamB =
          (m.team_b_player_1_id === playerA.id || m.team_b_player_2_id === playerA.id) &&
          (m.team_b_player_1_id === playerB.id || m.team_b_player_2_id === playerB.id);

        return bothInTeamA || bothInTeamB;
      })
      .map((m) => {
        const bothInTeamA =
          (m.team_a_player_1_id === playerA.id || m.team_a_player_2_id === playerA.id) &&
          (m.team_a_player_1_id === playerB.id || m.team_a_player_2_id === playerB.id);

        const teamTogether: 'A' | 'B' = bothInTeamA ? 'A' : 'B';
        const resultLabel: 'W' | 'L' = m.winner_team === teamTogether ? 'W' : 'L';

        return {
          ...m,
          teamTogether,
          resultLabel,
        };
      });

    const wins = filtered.filter((m) => m.resultLabel === 'W').length;
    const losses = filtered.filter((m) => m.resultLabel === 'L').length;
    const total = filtered.length;
    const winPct = total > 0 ? (wins * 100) / total : 0;

    let currentStreakText = '';
    if (filtered.length > 0) {
      let streakCount = 0;
      const latestResult = filtered[0].resultLabel;
      for (const m of filtered) {
        if (m.resultLabel === latestResult) streakCount += 1;
        else break;
      }
      currentStreakText =
        latestResult === 'W'
          ? `Juntos llevan ${streakCount} ganados`
          : `Juntos llevan ${streakCount} perdidos`;
    }

    return {
      matches: filtered,
      wins,
      losses,
      total,
      winPct,
      currentStreakText,
    };
  }, [matches, rankingPlayers, duelPlayerA, duelPlayerB]);

  const slotMatchMap = useMemo(() => {
    const map = new Map<number, Match>();
    for (const m of matches) {
      if (m.slot_id != null && !map.has(m.slot_id)) {
        map.set(m.slot_id, m);
      }
    }
    return map;
  }, [matches]);

  const slotsWithPlayers = useMemo<SlotWithPlayers[]>(() => {
    return slots.map((s) => {
      const basePlayers = sortPlayers(slotPlayers.filter((p) => p.slot_id === s.id));
      const enrichedPlayers = basePlayers.map((player) =>
        enrichPlayerPaymentUI(player, basePlayers)
      );
      const match = slotMatchMap.get(s.id) || null;

      return {
        ...s,
        allPlayers: enrichedPlayers,
        activePlayers: enrichedPlayers.slice(0, MAX_PLAYERS),
        waitlistPlayers: enrichedPlayers.slice(MAX_PLAYERS),
        match,
      };
    });
  }, [slots, slotPlayers, slotMatchMap]);

  const groupedSlots = useMemo(() => {
    const grouped: Record<string, SlotWithPlayers[]> = {};
    for (const slot of slotsWithPlayers) {
      if (!grouped[slot.date]) grouped[slot.date] = [];
      grouped[slot.date].push(slot);
    }
    return grouped;
  }, [slotsWithPlayers]);

  const selectedPaymentSlot = useMemo(() => {
    if (selectedPaymentSlotId == null) return null;
    return slotsWithPlayers.find((slot) => slot.id === selectedPaymentSlotId) || null;
  }, [selectedPaymentSlotId, slotsWithPlayers]);

  const openSuggestions = useMemo(
    () => suggestions.filter((s) => s.status === 'open'),
    [suggestions]
  );

  const urgentSuggestions = useMemo(
    () => openSuggestions.filter((s) => s.is_urgent),
    [openSuggestions]
  );

  const regularSuggestions = useMemo(
    () => openSuggestions.filter((s) => !s.is_urgent),
    [openSuggestions]
  );

  async function addPlayer(slotId: number) {
    const rawName = (nameInput[slotId] || '').trim();

    if (!rawName) {
      alert('Poné tu nombre');
      return;
    }

    const slot = slotsWithPlayers.find((s) => s.id === slotId);
    if (!slot) return;

    const alreadyThere = slot.allPlayers.some(
      (p) => p.name.trim().toLowerCase() === rawName.toLowerCase()
    );

    if (alreadyThere) {
      alert('Ese nombre ya está anotado en este turno');
      return;
    }

    const { error } = await supabase.from('players').insert({
      slot_id: slotId,
      name: rawName,
      paid: false,
    });

    if (error) {
      alert(`No se pudo anotar: ${error.message}`);
      return;
    }

    setNameInput((v) => ({ ...v, [slotId]: '' }));
    loadData();
  }

  async function removePlayer(playerId: number) {
    const player = slotPlayers.find((p) => p.id === playerId);
    if (!player) return;

    const slot = slotsWithPlayers.find((s) => s.id === player.slot_id);

    const shouldCreateUrgentSuggestion =
      !!slot && slot.activePlayers.length === 4 && slot.waitlistPlayers.length === 0;

    const removedPlayerName = player.name;

    const { error } = await supabase.from('players').delete().eq('id', playerId);

    if (error) {
      alert(`No se pudo borrar: ${error.message}`);
      return;
    }

    if (shouldCreateUrgentSuggestion && slot) {
      const message = `${removedPlayerName} se bajó del turno del ${slot.date} a las ${slot.time}. Falta 1 jugador.`;

      const { error: suggestionError } = await supabase.from('suggestions').insert({
        author_name: 'Sistema',
        type: 'replacement_needed',
        message,
        slot_id: slot.id,
        suggested_date: slot.date,
        suggested_time: slot.time,
        is_urgent: true,
        status: 'open',
        is_booking_request: false,
        booking_status: 'open',
      });

      if (suggestionError) {
        alert(`Se borró el jugador, pero no se pudo crear la sugerencia: ${suggestionError.message}`);
      }
    }

    await loadData();
  }

  async function adminAction(action: any) {
    const payload =
      action.action === 'submitMatch' || action.action === 'selfTogglePaid'
        ? action
        : { ...action, pin };

    const res = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      return { ok: true, data };
    }

    alert(data.error || `Error (${res.status})`);
    return { ok: false, data };
  }

  async function unlockAdmin() {
    const res = await adminAction({ action: 'noop' });
    if (res.ok) setAdminUnlocked(true);
  }

  async function createSuggestion() {
    const author = newSuggestionAuthor.trim();
    const message = newSuggestionMessage.trim();

    if (!author) {
      alert('Poné tu nombre.');
      return;
    }

    if (!message) {
      alert('Escribí una sugerencia.');
      return;
    }

    setSavingSuggestion(true);

    const { error } = await supabase.from('suggestions').insert({
      author_name: author,
      type: newSuggestionType,
      message,
      suggested_date: newSuggestionDate || null,
      suggested_time: newSuggestionTime || null,
      is_urgent: false,
      status: 'open',
      is_booking_request: newSuggestionIsBooking,
      booking_status: 'open',
    });

    setSavingSuggestion(false);

    if (error) {
      alert(`No se pudo guardar la sugerencia: ${error.message}`);
      return;
    }

    setNewSuggestionAuthor('');
    setNewSuggestionType('availability');
    setNewSuggestionMessage('');
    setNewSuggestionDate('');
    setNewSuggestionTime('');
    setNewSuggestionIsBooking(false);

    await loadData();
  }

  async function closeSuggestion(suggestionId: number) {
    if (!adminUnlocked) {
      alert('Primero tenés que entrar como admin.');
      return;
    }

    const { error } = await supabase
      .from('suggestions')
      .update({ status: 'resolved' })
      .eq('id', suggestionId);

    if (error) {
      alert(`No se pudo cerrar la sugerencia: ${error.message}`);
      return;
    }

    await loadData();
  }

  async function markSuggestionNotAvailable(suggestionId: number) {
    if (!adminUnlocked) {
      alert('Primero tenés que entrar como admin.');
      return;
    }

    const { error } = await supabase
      .from('suggestions')
      .update({ booking_status: 'not_available' })
      .eq('id', suggestionId);

    if (error) {
      alert(`No se pudo actualizar la sugerencia: ${error.message}`);
      return;
    }

    await loadData();
  }

  async function markSuggestionBooked(suggestionId: number) {
    if (!adminUnlocked) {
      alert('Primero tenés que entrar como admin.');
      return;
    }

    const { error } = await supabase
      .from('suggestions')
      .update({ booking_status: 'booked' })
      .eq('id', suggestionId);

    if (error) {
      alert(`No se pudo actualizar la sugerencia: ${error.message}`);
      return;
    }

    await loadData();
  }

  async function copySuggestionMessage(message: string) {
    try {
      await navigator.clipboard.writeText(message);
      alert('Mensaje copiado');
    } catch {
      alert('No se pudo copiar automáticamente. Copialo manualmente.');
    }
  }

  function openNewResultModal(slotId: number) {
    const slot = slotsWithPlayers.find((s) => s.id === slotId);
    if (!slot) return;

    if (slot.activePlayers.length !== 4) {
      alert('Para cargar resultado el turno debe tener exactamente 4 jugadores.');
      return;
    }

    const p1 = slot.activePlayers[0]?.id ?? '';
    const p2 = slot.activePlayers[1]?.id ?? '';
    const p3 = slot.activePlayers[2]?.id ?? '';
    const p4 = slot.activePlayers[3]?.id ?? '';

    setResultForm({
      mode: 'slot',
      slotId,
      editingMatchId: null,
      submittedByPlayerId: '',
      manualDate: slot.date,
      manualTime: slot.time,
      teamA1: p1,
      teamA2: p2,
      teamB1: p3,
      teamB2: p4,
      set1A: '',
      set1B: '',
      set2A: '',
      set2B: '',
      set3A: '',
      set3B: '',
      notes: '',
    });

    setResultModalOpen(true);
  }

  function openEditResultModal(slotId: number) {
    const slot = slotsWithPlayers.find((s) => s.id === slotId);
    if (!slot || !slot.match) return;

    const m = slot.match;

    const slotPlayerIdByRankingId = (rankingId: number): number | '' => {
      const rankingName = rankingPlayers.find((p) => p.id === rankingId)?.name?.trim().toLowerCase();
      if (!rankingName) return '';
      const slotPlayer = slot.activePlayers.find(
        (p) => p.name.trim().toLowerCase() === rankingName
      );
      return slotPlayer?.id ?? '';
    };

    setResultForm({
      mode: 'slot',
      slotId,
      editingMatchId: m.id,
      submittedByPlayerId: '',
      manualDate: m.match_date,
      manualTime: m.match_time || '',
      teamA1: slotPlayerIdByRankingId(m.team_a_player_1_id),
      teamA2: slotPlayerIdByRankingId(m.team_a_player_2_id),
      teamB1: slotPlayerIdByRankingId(m.team_b_player_1_id),
      teamB2: slotPlayerIdByRankingId(m.team_b_player_2_id),
      set1A: m.set1_a != null ? String(m.set1_a) : '',
      set1B: m.set1_b != null ? String(m.set1_b) : '',
      set2A: m.set2_a != null ? String(m.set2_a) : '',
      set2B: m.set2_b != null ? String(m.set2_b) : '',
      set3A: m.set3_a != null ? String(m.set3_a) : '',
      set3B: m.set3_b != null ? String(m.set3_b) : '',
      notes: m.notes || '',
    });

    setResultModalOpen(true);
  }

  function openManualHistoryResultModal() {
    if (!adminUnlocked) {
      alert('Primero tenés que entrar como admin.');
      return;
    }

    setResultForm({
      mode: 'manual',
      slotId: null,
      editingMatchId: null,
      submittedByPlayerId: '',
      manualDate: todayISO(),
      manualTime: '',
      teamA1: '',
      teamA2: '',
      teamB1: '',
      teamB2: '',
      set1A: '',
      set1B: '',
      set2A: '',
      set2B: '',
      set3A: '',
      set3B: '',
      notes: '',
    });

    setResultModalOpen(true);
  }

  function closeResultModal() {
    setResultModalOpen(false);
    setResultForm(null);
  }

  function openReportPaymentModal(slotId: number, defaultPayerPlayerId?: number) {
    const slot = slotsWithPlayers.find((s) => s.id === slotId);
    if (!slot) return;

    setSelectedPaymentSlotId(slotId);
    setReportPaymentForm({
      payerPlayerId: defaultPayerPlayerId ?? '',
      paymentMethod: '',
      coveredPlayerIds: defaultPayerPlayerId ? [defaultPayerPlayerId] : [],
      amount: '',
      notes: '',
    });
    setReportPaymentModalOpen(true);
  }

  function closeReportPaymentModal() {
    setReportPaymentModalOpen(false);
    setReportPaymentForm(null);
    setSelectedPaymentSlotId(null);
  }

  async function saveReportedPayment() {
    if (!reportPaymentForm || !selectedPaymentSlot) return;

    if (reportPaymentForm.payerPlayerId === '') {
      alert('Elegí quién pagó.');
      return;
    }

    if (!reportPaymentForm.paymentMethod) {
      alert('Elegí el método de pago.');
      return;
    }

    if (reportPaymentForm.coveredPlayerIds.length === 0) {
      alert('Elegí al menos un jugador cubierto por este pago.');
      return;
    }

    const validPlayerIds = new Set(selectedPaymentSlot.allPlayers.map((p) => p.id));
    const invalidCovered = reportPaymentForm.coveredPlayerIds.some((id) => !validPlayerIds.has(id));

    if (invalidCovered) {
      alert('Hay jugadores seleccionados que no pertenecen a este turno.');
      return;
    }

    if (!validPlayerIds.has(reportPaymentForm.payerPlayerId)) {
      alert('El jugador que paga no pertenece a este turno.');
      return;
    }

    let amountValue: number | null = null;
    const rawAmount = reportPaymentForm.amount.trim();

    if (rawAmount) {
      const parsed = Number(rawAmount.replace(',', '.'));
      if (Number.isNaN(parsed) || parsed <= 0) {
        alert('El monto debe ser un número válido mayor a 0.');
        return;
      }
      amountValue = parsed;
    }

    setSavingPayment(true);

    const { data: paymentInsert, error: paymentError } = await supabase
      .from('payments')
      .insert({
        payer_player_id: reportPaymentForm.payerPlayerId,
        payment_method: reportPaymentForm.paymentMethod,
        status: 'reported',
        amount: amountValue,
        notes: reportPaymentForm.notes.trim() || null,
      })
      .select('id')
      .single();

    if (paymentError || !paymentInsert) {
      setSavingPayment(false);
      alert(`No se pudo guardar el payment: ${paymentError?.message || 'error desconocido'}`);
      return;
    }

    const allocationsPayload = reportPaymentForm.coveredPlayerIds.map((playerId) => ({
      payment_id: paymentInsert.id,
      player_id: playerId,
    }));

    const { error: allocationsError } = await supabase
      .from('payment_allocations')
      .insert(allocationsPayload);

    if (allocationsError) {
      await supabase.from('payments').delete().eq('id', paymentInsert.id);
      setSavingPayment(false);
      alert(`No se pudieron guardar las allocations: ${allocationsError.message}`);
      return;
    }

    setSavingPayment(false);
    closeReportPaymentModal();
    await loadData();
  }

  async function approvePayment(paymentId: string) {
    if (!adminUnlocked) {
      alert('Primero tenés que entrar como admin.');
      return;
    }

    const { error } = await supabase.rpc('approve_payment', {
      p_payment_id: paymentId,
      p_verified_by: 'admin',
    });

    if (error) {
      alert(`No se pudo aprobar el payment: ${error.message}`);
      return;
    }

    await loadData();
  }

  async function rejectPayment(paymentId: string) {
    if (!adminUnlocked) {
      alert('Primero tenés que entrar como admin.');
      return;
    }

    const ok = window.confirm('¿Seguro que querés rechazar este payment reportado?');
    if (!ok) return;

    const { error } = await supabase.rpc('reject_payment', {
      p_payment_id: paymentId,
    });

    if (error) {
      alert(`No se pudo rechazar el payment: ${error.message}`);
      return;
    }

    await loadData();
  }

  async function sendWhatsAppReminder(slotId: number) {
    const slot = slotsWithPlayers.find((s) => s.id === slotId);
    if (!slot) return;

    const unpaidPlayers = slot.allPlayers.filter((p) => p.paymentVisualStatus === 'unpaid');

    if (unpaidPlayers.length === 0) {
      alert('No hay jugadores unpaid para recordar en este turno.');
      return;
    }

    const pendingNames = unpaidPlayers.map((p) => p.name).join(', ');
    const message =
      `Chicos, recordatorio de pago del turno de pádel del ${slot.date} a las ${slot.time}. ` +
      `Pendientes: ${pendingNames}. ` +
      `Por favor envíenlo por Venmo o Zelle. Gracias.`;

    for (const player of unpaidPlayers) {
      const { error } = await supabase.rpc('record_player_payment_reminder', {
        p_player_id: player.id,
      });

      if (error) {
        alert(`No se pudo registrar el reminder para ${player.name}: ${error.message}`);
        return;
      }
    }

    setWhatsAppReminderMessage(message);
    setWhatsAppReminderCopied(false);
    setWhatsAppReminderModalOpen(true);

    await loadData();
  }

  async function copyWhatsAppReminderMessage() {
    try {
      await navigator.clipboard.writeText(whatsAppReminderMessage);
      setWhatsAppReminderCopied(true);
    } catch {
      alert('No se pudo copiar automáticamente. Copialo manualmente.');
    }
  }

  function closeWhatsAppReminderModal() {
    setWhatsAppReminderModalOpen(false);
    setWhatsAppReminderMessage('');
    setWhatsAppReminderCopied(false);
  }

  async function saveResult() {
    if (!resultForm) return;

    const isManual = resultForm.mode === 'manual';
    const slot = !isManual
      ? slotsWithPlayers.find((s) => s.id === resultForm.slotId)
      : null;

    if (!isManual && !slot) {
      alert('No se encontró el turno.');
      return;
    }

    const selectedIds = [
      resultForm.teamA1,
      resultForm.teamA2,
      resultForm.teamB1,
      resultForm.teamB2,
    ];

    if (selectedIds.some((id) => id === '')) {
      alert('Tenés que elegir los 4 jugadores.');
      return;
    }

    const uniqueIds = new Set(selectedIds as number[]);

    if (uniqueIds.size !== 4) {
      alert('No podés repetir jugadores en las parejas.');
      return;
    }

    let rankingIdA1: number | null = null;
    let rankingIdA2: number | null = null;
    let rankingIdB1: number | null = null;
    let rankingIdB2: number | null = null;

    if (isManual) {
      rankingIdA1 = resultForm.teamA1 as number;
      rankingIdA2 = resultForm.teamA2 as number;
      rankingIdB1 = resultForm.teamB1 as number;
      rankingIdB2 = resultForm.teamB2 as number;
    } else {
      const slotPlayerIds = selectedIds as number[];
      const validSlotPlayerIds = new Set(slot!.activePlayers.map((p) => p.id));
      const allValid = slotPlayerIds.every((id) => validSlotPlayerIds.has(id));

      if (!allValid) {
        alert('Solo podés usar los 4 jugadores de ese turno.');
        return;
      }

      rankingIdA1 = rankingPlayerIdFromSlotPlayerId(
        resultForm.teamA1 as number,
        slotPlayers,
        rankingPlayers
      );
      rankingIdA2 = rankingPlayerIdFromSlotPlayerId(
        resultForm.teamA2 as number,
        slotPlayers,
        rankingPlayers
      );
      rankingIdB1 = rankingPlayerIdFromSlotPlayerId(
        resultForm.teamB1 as number,
        slotPlayers,
        rankingPlayers
      );
      rankingIdB2 = rankingPlayerIdFromSlotPlayerId(
        resultForm.teamB2 as number,
        slotPlayers,
        rankingPlayers
      );
    }

    if (!rankingIdA1 || !rankingIdA2 || !rankingIdB1 || !rankingIdB2) {
      alert(
        'Uno o más jugadores del turno no existen en ranking_players. Revisá que los nombres coincidan exactamente con los del ranking.'
      );
      return;
    }

    const winnerTeam = computeWinnerTeam(resultForm);
    if (!winnerTeam) {
      alert('Cargá al menos un resultado válido para determinar ganador.');
      return;
    }

    if (!resultForm.editingMatchId && !adminUnlocked && !resultForm.submittedByPlayerId) {
      alert('Elegí quién está cargando el resultado.');
      return;
    }

    if (resultForm.editingMatchId && !adminUnlocked) {
      alert('Solo el admin puede editar resultados.');
      return;
    }

    if (isManual && !adminUnlocked) {
      alert('Solo el admin puede cargar resultados manuales desde historial.');
      return;
    }

    setSavingResult(true);

    const matchDate = isManual ? resultForm.manualDate : slot!.date;
    const matchTime = isManual ? resultForm.manualTime || null : slot!.time;
    const slotId = isManual ? null : slot!.id;

    const actionPayload =
      adminUnlocked || resultForm.editingMatchId
        ? {
            action: 'saveMatch',
            matchId: resultForm.editingMatchId,
            match_date: matchDate,
            match_time: matchTime,
            slot_id: slotId,
            team_a_player_1_id: rankingIdA1,
            team_a_player_2_id: rankingIdA2,
            team_b_player_1_id: rankingIdB1,
            team_b_player_2_id: rankingIdB2,
            set1_a: parseSetValue(resultForm.set1A),
            set1_b: parseSetValue(resultForm.set1B),
            set2_a: parseSetValue(resultForm.set2A),
            set2_b: parseSetValue(resultForm.set2B),
            set3_a: parseSetValue(resultForm.set3A),
            set3_b: parseSetValue(resultForm.set3B),
            winner_team: winnerTeam,
            source: isManual ? 'manual' : 'slot',
            notes: resultForm.notes.trim() || null,
            submitted_by_player_id: resultForm.submittedByPlayerId || null,
            submitted_at: resultForm.submittedByPlayerId ? new Date().toISOString() : null,
          }
        : {
            action: 'submitMatch',
            match_date: matchDate,
            match_time: matchTime,
            slot_id: slotId,
            team_a_player_1_id: rankingIdA1,
            team_a_player_2_id: rankingIdA2,
            team_b_player_1_id: rankingIdB1,
            team_b_player_2_id: rankingIdB2,
            set1_a: parseSetValue(resultForm.set1A),
            set1_b: parseSetValue(resultForm.set1B),
            set2_a: parseSetValue(resultForm.set2A),
            set2_b: parseSetValue(resultForm.set2B),
            set3_a: parseSetValue(resultForm.set3A),
            set3_b: parseSetValue(resultForm.set3B),
            winner_team: winnerTeam,
            source: isManual ? 'manual' : 'slot',
            notes: resultForm.notes.trim() || null,
            submitted_by_player_id: resultForm.submittedByPlayerId,
          };

    const res = await adminAction(actionPayload);

    setSavingResult(false);

    if (!res.ok) return;

    closeResultModal();
    await loadData();
  }

  async function deleteResult(slotId: number) {
    if (!adminUnlocked) {
      alert('Primero tenés que entrar como admin para borrar resultados.');
      return;
    }

    const slot = slotsWithPlayers.find((s) => s.id === slotId);
    if (!slot || !slot.match) {
      alert('No se encontró el resultado asociado a ese turno.');
      return;
    }

    const ok = window.confirm('¿Seguro que querés borrar este resultado?');
    if (!ok) return;

    const res = await adminAction({
      action: 'deleteMatch',
      matchId: slot.match.id,
    });

    if (!res.ok) return;

    await loadData();
  }

  async function deleteMatchById(matchId: number) {
    if (!adminUnlocked) {
      alert('Primero tenés que entrar como admin para borrar resultados.');
      return;
    }

    const ok = window.confirm('¿Seguro que querés borrar este resultado?');
    if (!ok) return;

    const res = await adminAction({
      action: 'deleteMatch',
      matchId,
    });

    if (!res.ok) return;

    await loadData();
  }

  function tabButton(label: string, key: TabKey) {
    const active = activeTab === key;
    return (
      <button
        onClick={() => setActiveTab(key)}
        style={{
          padding: '10px 14px',
          borderRadius: 12,
          border: active ? 'none' : '1px solid #d1d5db',
          background: active ? '#111827' : 'white',
          color: active ? 'white' : '#111827',
          cursor: 'pointer',
          fontWeight: 700,
        }}
      >
        {label}
      </button>
    );
  }

  const manualPlayerOptions = [...rankingPlayers].sort((a, b) => a.name.localeCompare(b.name));

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

        <div
          style={{
            marginTop: 10,
            marginBottom: 6,
            padding: '8px 12px',
            borderRadius: 12,
            background: '#fef3c7',
            color: '#92400e',
            fontWeight: 800,
            display: 'inline-block',
          }}
        >
          PAGO PUBLICO ACTIVO
        </div>

        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            marginTop: 12,
          }}
        >
          <button
            onClick={loadData}
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              border: '1px solid #d1d5db',
              background: 'white',
              cursor: 'pointer',
            }}
          >
            Refrescar
          </button>

          {tabButton('Turnos', 'turnos')}
          {tabButton('Sugerencias', 'sugerencias')}
          {tabButton('Ranking', 'ranking')}
          {tabButton('Duelo', 'duelo')}
          {tabButton('Historial', 'historial')}
          {tabButton('Actividad', 'actividad')}

          {canSeeAdmin && activeTab === 'turnos' && (
            <button
              onClick={() => setShowAdmin(!showAdmin)}
              style={{
                padding: '10px 14px',
                borderRadius: 12,
                border: '1px solid #d1d5db',
                background: 'white',
                cursor: 'pointer',
              }}
            >
              Admin
            </button>
          )}
        </div>
      </div>

      {activeTab === 'turnos' && showAdmin && canSeeAdmin && (
        <div
          style={{
            background: 'white',
            borderRadius: 20,
            padding: 20,
            marginBottom: 16,
            border: '1px solid #e5e7eb',
          }}
        >
          {!adminUnlocked ? (
            <>
              <h3 style={{ marginTop: 0 }}>Ingresar PIN admin</h3>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input
                  type="password"
                  placeholder="PIN"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  autoComplete="new-password"
                  style={{
                    padding: '10px 12px',
                    borderRadius: 12,
                    border: '1px solid #d1d5db',
                  }}
                />
                <button
                  onClick={unlockAdmin}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 12,
                    border: 'none',
                    background: '#111827',
                    color: 'white',
                    cursor: 'pointer',
                  }}
                >
                  Entrar
                </button>
              </div>
            </>
          ) : (
            <>
              <h3 style={{ marginTop: 0 }}>Crear turno</h3>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
                <div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>Fecha</div>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 12,
                      border: '1px solid #d1d5db',
                    }}
                  />
                </div>

                <div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>Hora</div>
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 12,
                      border: '1px solid #d1d5db',
                    }}
                  />
                </div>

                <button
                  onClick={() =>
                    adminAction({
                      action: 'createSlot',
                      date,
                      time,
                    }).then(() => loadData())
                  }
                  style={{
                    padding: '10px 14px',
                    borderRadius: 12,
                    border: 'none',
                    background: '#111827',
                    color: 'white',
                    cursor: 'pointer',
                  }}
                >
                  Crear turno
                </button>
              </div>

              <div
                style={{
                  marginTop: 18,
                  paddingTop: 18,
                  borderTop: '1px solid #e5e7eb',
                }}
              >
                <h3 style={{ marginTop: 0 }}>Agregar jugador al ranking</h3>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
                  <div style={{ minWidth: 260 }}>
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>Nombre</div>
                    <input
                      type="text"
                      value={newRankingPlayerName}
                      onChange={(e) => setNewRankingPlayerName(e.target.value)}
                      placeholder="Nombre del jugador"
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: 12,
                        border: '1px solid #d1d5db',
                      }}
                    />
                  </div>

                  <button
                    onClick={async () => {
                      const name = newRankingPlayerName.trim();

                      if (!name) {
                        alert('Poné el nombre del jugador');
                        return;
                      }

                      const res = await adminAction({
                        action: 'addRankingPlayer',
                        name,
                      });

                      if (!res.ok) return;

                      setNewRankingPlayerName('');
                      await loadData();
                    }}
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
                    Agregar jugador
                  </button>
                </div>

                <div style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>
                  Se agrega con el rating inicial configurado en el sistema y como provisional.
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {loading && (
        <div
          style={{
            background: 'white',
            borderRadius: 20,
            padding: 20,
            border: '1px solid #e5e7eb',
          }}
        >
          Cargando...
        </div>
      )}

      {!loading && activeTab === 'turnos' && (
        <TurnosTab
          groupedSlots={groupedSlots}
          rankingPlayers={rankingPlayers}
          rankingStats={rankingStats}
          nameInput={nameInput}
          setNameInput={setNameInput}
          adminUnlocked={adminUnlocked}
          adminAction={adminAction}
          loadData={loadData}
          addPlayer={addPlayer}
          removePlayer={removePlayer}
          openNewResultModal={openNewResultModal}
          openEditResultModal={openEditResultModal}
          deleteResult={deleteResult}
          openReportPaymentModal={openReportPaymentModal}
          approvePayment={approvePayment}
          rejectPayment={rejectPayment}
          sendWhatsAppReminder={sendWhatsAppReminder}
        />
      )}

      {!loading && activeTab === 'sugerencias' && (
        <div
          style={{
            display: 'grid',
            gap: 16,
          }}
        >
          <div
            style={{
              background: 'white',
              borderRadius: 20,
              padding: 20,
              border: '1px solid #e5e7eb',
            }}
          >
            <h2 style={{ marginTop: 0 }}>Nueva sugerencia</h2>

            <div style={{ display: 'grid', gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>Nombre</div>
                <input
                  type="text"
                  value={newSuggestionAuthor}
                  onChange={(e) => setNewSuggestionAuthor(e.target.value)}
                  placeholder="Tu nombre"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 12,
                    border: '1px solid #d1d5db',
                  }}
                />
              </div>

              <div>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>Tipo</div>
                <select
                  value={newSuggestionType}
                  onChange={(e) =>
                    setNewSuggestionType(
                      e.target.value as 'availability' | 'need_players' | 'replacement_needed'
                    )
                  }
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 12,
                    border: '1px solid #d1d5db',
                    background: 'white',
                  }}
                >
                  <option value="availability">Quiero jugar</option>
                  <option value="need_players">Busco jugadores</option>
                  <option value="replacement_needed">Necesito reemplazo</option>
                </select>
              </div>

              <div>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>Mensaje</div>
                <textarea
                  value={newSuggestionMessage}
                  onChange={(e) => setNewSuggestionMessage(e.target.value)}
                  placeholder='Ej: Fernando para jugar mañana después de 6pm, ¿están?'
                  rows={4}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 12,
                    border: '1px solid #d1d5db',
                    resize: 'vertical',
                    fontFamily: 'Arial, sans-serif',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>
                    Fecha (opcional)
                  </div>
                  <input
                    type="date"
                    value={newSuggestionDate}
                    onChange={(e) => setNewSuggestionDate(e.target.value)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 12,
                      border: '1px solid #d1d5db',
                    }}
                  />
                </div>

                <div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>
                    Hora (opcional)
                  </div>
                  <input
                    type="time"
                    value={newSuggestionTime}
                    onChange={(e) => setNewSuggestionTime(e.target.value)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 12,
                      border: '1px solid #d1d5db',
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontWeight: 700 }}>
                  <input
                    type="checkbox"
                    checked={newSuggestionIsBooking}
                    onChange={(e) => setNewSuggestionIsBooking(e.target.checked)}
                    style={{ marginRight: 8 }}
                  />
                  Confirmar sacar turno
                </label>
              </div>

              <div>
                <button
                  onClick={createSuggestion}
                  disabled={savingSuggestion}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 12,
                    border: 'none',
                    background: '#111827',
                    color: 'white',
                    cursor: savingSuggestion ? 'default' : 'pointer',
                    fontWeight: 700,
                    opacity: savingSuggestion ? 0.7 : 1,
                  }}
                >
                  {savingSuggestion ? 'Guardando...' : 'Publicar sugerencia'}
                </button>
              </div>
            </div>
          </div>

          {urgentSuggestions.length > 0 && (
            <div
              style={{
                background: 'white',
                borderRadius: 20,
                padding: 20,
                border: '1px solid #fecaca',
              }}
            >
              <h2 style={{ marginTop: 0, color: '#991b1b' }}>Urgentes</h2>

              {urgentSuggestions.map((s) => (
                <div
                  key={s.id}
                  style={{
                    border: '1px solid #fecaca',
                    background: '#fef2f2',
                    borderRadius: 14,
                    padding: 14,
                    marginBottom: 12,
                  }}
                >
                  <div style={{ fontWeight: 800, color: '#991b1b' }}>🚨 Reemplazo necesario</div>
                  <div style={{ marginTop: 8, color: '#111827' }}>{s.message}</div>
                  <div style={{ marginTop: 8, fontSize: 12, color: '#6b7280' }}>
                    {s.author_name} • {new Date(s.created_at).toLocaleString()}
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                    <button
                      onClick={() => copySuggestionMessage(s.message)}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 10,
                        border: '1px solid #d1d5db',
                        background: 'white',
                        cursor: 'pointer',
                        fontWeight: 700,
                      }}
                    >
                      Copiar mensaje
                    </button>

                    {adminUnlocked && (
                      <button
                        onClick={() => closeSuggestion(s.id)}
                        style={{
                          padding: '10px 12px',
                          borderRadius: 10,
                          border: 'none',
                          background: '#111827',
                          color: 'white',
                          cursor: 'pointer',
                          fontWeight: 700,
                        }}
                      >
                        Cerrar
                      </button>
                    )}
                  </div>
                </div>
              ))}
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
            <h2 style={{ marginTop: 0 }}>Sugerencias</h2>

            {openSuggestions.length === 0 && (
              <div style={{ color: '#64748b' }}>No hay sugerencias abiertas todavía.</div>
            )}

            {regularSuggestions.map((s) => {
              const isBooking = s.is_booking_request;

              return (
                <div
                  key={s.id}
                  style={{
                    border: isBooking ? '2px solid #c2410c' : '1px solid #e5e7eb',
                    background: isBooking ? '#fff7ed' : '#f8fafc',
                    borderRadius: 14,
                    padding: 14,
                    marginBottom: 12,
                  }}
                >
                  {isBooking && (
                    <div style={{ fontWeight: 800, color: '#9a3412', marginBottom: 6 }}>
                      SACAR TURNO
                    </div>
                  )}

                  {s.booking_status === 'not_available' && (
                    <div style={{ fontWeight: 800, color: '#991b1b', marginBottom: 6 }}>
                      ❌ NO DISPONIBLE
                    </div>
                  )}

                  {s.booking_status === 'booked' && (
                    <div style={{ fontWeight: 800, color: '#065f46', marginBottom: 6 }}>
                      ✅ TURNO SACADO
                    </div>
                  )}

                  <div style={{ fontWeight: isBooking ? 800 : 700, color: '#111827' }}>
                    {s.message}
                  </div>

                  <div style={{ marginTop: 6, fontSize: 12, color: '#6b7280' }}>
                    {s.author_name} • {new Date(s.created_at).toLocaleString()}
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                    <button
                      onClick={() => copySuggestionMessage(s.message)}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 10,
                        border: '1px solid #d1d5db',
                        background: 'white',
                        cursor: 'pointer',
                        fontWeight: 700,
                      }}
                    >
                      Copiar
                    </button>

                    {adminUnlocked && isBooking && s.booking_status === 'open' && (
                      <>
                        <button
                          onClick={() => markSuggestionNotAvailable(s.id)}
                          style={{
                            padding: '10px 12px',
                            borderRadius: 10,
                            border: '1px solid #d1d5db',
                            background: 'white',
                            cursor: 'pointer',
                            fontWeight: 700,
                          }}
                        >
                          No disponible
                        </button>

                        <button
                          onClick={() => markSuggestionBooked(s.id)}
                          style={{
                            padding: '10px 12px',
                            borderRadius: 10,
                            border: 'none',
                            background: '#111827',
                            color: 'white',
                            cursor: 'pointer',
                            fontWeight: 700,
                          }}
                        >
                          Turno sacado
                        </button>
                      </>
                    )}

                    {adminUnlocked && (
                      <button
                        onClick={() => closeSuggestion(s.id)}
                        style={{
                          padding: '10px 12px',
                          borderRadius: 10,
                          border: '1px solid #d1d5db',
                          background: 'white',
                          cursor: 'pointer',
                          fontWeight: 700,
                        }}
                      >
                        Cerrar
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!loading && activeTab === 'ranking' && (
        <RankingTab
          rankingPlayers={rankingPlayers}
          myPlayerName={myPlayerName}
          handleSelectMyPlayer={handleSelectMyPlayer}
          clearMyPlayer={clearMyPlayer}
          myRankingSummary={myRankingSummary}
          chartPlayerName={chartPlayerName}
          setSelectedChartPlayer={setSelectedChartPlayer}
          chartStats={chartStats}
          chartGeometry={chartGeometry}
        />
      )}

      {!loading && activeTab === 'duelo' && (
        <DuelTab
          rankingPlayers={rankingPlayers}
          duelPlayerA={duelPlayerA}
          duelPlayerB={duelPlayerB}
          setDuelPlayerA={setDuelPlayerA}
          setDuelPlayerB={setDuelPlayerB}
          h2hData={h2hData}
          partnershipData={partnershipData}
        />
      )}

      {!loading && activeTab === 'historial' && (
        <HistoryTab
          matches={matches}
          rankingPlayers={rankingPlayers}
          adminUnlocked={adminUnlocked}
          openManualHistoryResultModal={openManualHistoryResultModal}
          deleteMatchById={deleteMatchById}
        />
      )}

      {!loading && activeTab === 'actividad' && (
        <ActivityTab
          rankingPlayers={rankingPlayers}
          selectedActivityPlayer={selectedActivityPlayer}
          setSelectedActivityPlayer={setSelectedActivityPlayer}
          activityData={activityData}
        />
      )}

      <ResultModal
        resultModalOpen={resultModalOpen}
        resultForm={resultForm}
        savingResult={savingResult}
        slotsWithPlayers={slotsWithPlayers}
        slotPlayers={slotPlayers}
        rankingPlayers={rankingPlayers}
        manualPlayerOptions={manualPlayerOptions}
        rankingPlayerIdFromSlotPlayerId={rankingPlayerIdFromSlotPlayerId}
        setResultForm={setResultForm}
        closeResultModal={closeResultModal}
        saveResult={saveResult}
      />

      <ReportPaymentModal
        reportPaymentModalOpen={reportPaymentModalOpen}
        reportPaymentForm={reportPaymentForm}
        savingPayment={savingPayment}
        slot={selectedPaymentSlot}
        setReportPaymentForm={setReportPaymentForm}
        closeReportPaymentModal={closeReportPaymentModal}
        saveReportedPayment={saveReportedPayment}
      />

      <WhatsAppReminderModal
        open={whatsAppReminderModalOpen}
        message={whatsAppReminderMessage}
        copied={whatsAppReminderCopied}
        onCopy={copyWhatsAppReminderMessage}
        onClose={closeWhatsAppReminderModal}
      />
    </div>
  );
}
