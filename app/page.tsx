'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const MAX_PLAYERS = 4;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Slot = {
  id: number;
  date: string;
  time: string;
};

type SlotPlayer = {
  id: number;
  slot_id: number;
  name: string;
  paid: boolean;
  created_at?: string;
};

type RankingPlayer = {
  id: number;
  name: string;
  elo_rating: number;
  display_rating: number;
  matches_played: number;
  wins: number;
  losses: number;
  win_pct: number;
  sets_won: number;
  sets_lost: number;
  provisional: boolean;
  current_win_streak: number;
  best_win_streak: number;
};

type Match = {
  id: number;
  match_date: string;
  match_time: string | null;
  slot_id: number | null;
  team_a_player_1_id: number;
  team_a_player_2_id: number;
  team_b_player_1_id: number;
  team_b_player_2_id: number;
  set1_a: number | null;
  set1_b: number | null;
  set2_a: number | null;
  set2_b: number | null;
  set3_a: number | null;
  set3_b: number | null;
  winner_team: 'A' | 'B' | null;
  source: string | null;
  notes: string | null;
  created_at?: string;
};

type PlayerRatingHistoryPoint = {
  player_id: number;
  player_name: string;
  match_id: number;
  match_date: string;
  match_time: string | null;
  pre_rating: number;
  post_rating: number;
  delta: number;
};

type TabKey = 'turnos' | 'ranking' | 'historial';

type ResultFormState = {
  slotId: number;
  editingMatchId: number | null;
  teamA1: number | '';
  teamA2: number | '';
  teamB1: number | '';
  teamB2: number | '';
  set1A: string;
  set1B: string;
  set2A: string;
  set2B: string;
  set3A: string;
  set3B: string;
  notes: string;
};

type ChartPoint = {
  x: number;
  y: number;
  value: number;
  changeDirection: 'up' | 'down' | 'flat';
};

type H2HMatch = Match & {
  sideOfPlayerA: 'A' | 'B';
  winnerLabel: 'A' | 'B';
};

type PartnershipMatch = Match & {
  teamTogether: 'A' | 'B';
  resultLabel: 'W' | 'L';
};

function todayISO() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDate(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString('es-AR', {
    weekday: 'short',
    day: 'numeric',
    month: 'numeric',
  });
}

function sortPlayers(players: SlotPlayer[]) {
  return [...players].sort((a, b) => {
    const aTime = a.created_at || '';
    const bTime = b.created_at || '';
    return aTime.localeCompare(bTime);
  });
}

function scoreText(m: Match) {
  const sets: string[] = [];
  if (m.set1_a != null && m.set1_b != null) sets.push(`${m.set1_a}-${m.set1_b}`);
  if (m.set2_a != null && m.set2_b != null) sets.push(`${m.set2_a}-${m.set2_b}`);
  if (m.set3_a != null && m.set3_b != null) sets.push(`${m.set3_a}-${m.set3_b}`);
  return sets.join(' / ');
}

function playerNameById(players: RankingPlayer[], id: number) {
  return players.find((p) => p.id === id)?.name || `Jugador ${id}`;
}

function statsMap(rankingPlayers: RankingPlayer[]) {
  const map = new Map<
    string,
    { position: number; display: number; winPct: number; provisional: boolean }
  >();

  const sorted = [...rankingPlayers].sort((a, b) => {
    if (b.display_rating !== a.display_rating) return b.display_rating - a.display_rating;
    if (b.elo_rating !== a.elo_rating) return b.elo_rating - a.elo_rating;
    return a.name.localeCompare(b.name);
  });

  sorted.forEach((p, idx) => {
    map.set(p.name.trim().toLowerCase(), {
      position: idx + 1,
      display: p.display_rating,
      winPct: p.win_pct,
      provisional: p.provisional,
    });
  });

  return map;
}

function parseSetValue(v: string): number | null {
  const t = v.trim();
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return n;
}

function computeWinnerTeam(form: ResultFormState): 'A' | 'B' | null {
  const sets = [
    [parseSetValue(form.set1A), parseSetValue(form.set1B)],
    [parseSetValue(form.set2A), parseSetValue(form.set2B)],
    [parseSetValue(form.set3A), parseSetValue(form.set3B)],
  ];

  let aWins = 0;
  let bWins = 0;

  for (const [a, b] of sets) {
    if (a == null || b == null) continue;
    if (a > b) aWins += 1;
    if (b > a) bWins += 1;
  }

  if (aWins === 0 && bWins === 0) return null;
  if (aWins > bWins) return 'A';
  if (bWins > aWins) return 'B';
  return null;
}

function rankingPlayerIdFromSlotPlayerId(
  slotPlayerId: number,
  slotPlayers: SlotPlayer[],
  rankingPlayers: RankingPlayer[]
) {
  const slotPlayer = slotPlayers.find((p) => p.id === slotPlayerId);
  if (!slotPlayer) return null;

  const rankingPlayer = rankingPlayers.find(
    (p) => p.name.trim().toLowerCase() === slotPlayer.name.trim().toLowerCase()
  );

  return rankingPlayer?.id ?? null;
}

function buildPointsChartGeometry(values: number[]) {
  const width = 760;
  const height = 280;
  const paddingLeft = 40;
  const paddingRight = 20;
  const paddingTop = 24;
  const paddingBottom = 28;

  if (values.length === 0) {
    return {
      width,
      height,
      points: [] as ChartPoint[],
      path: '',
      gridYs: [] as number[],
    };
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const usableWidth = width - paddingLeft - paddingRight;
  const usableHeight = height - paddingTop - paddingBottom;

  const points = values.map((value, i) => {
    const x =
      values.length === 1
        ? paddingLeft + usableWidth / 2
        : paddingLeft + (i / (values.length - 1)) * usableWidth;

    const y = paddingTop + ((max - value) / range) * usableHeight;

    let changeDirection: 'up' | 'down' | 'flat' = 'flat';
    if (i > 0) {
      if (value > values[i - 1]) changeDirection = 'up';
      else if (value < values[i - 1]) changeDirection = 'down';
    }

    return {
      x,
      y,
      value,
      changeDirection,
    };
  });

  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(' ');

  const gridYs = [0, 1, 2, 3].map((i) => paddingTop + (i / 3) * usableHeight);

  return { width, height, points, path, gridYs };
}

export default function Page() {
  const [activeTab, setActiveTab] = useState<TabKey>('turnos');

  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotPlayers, setSlotPlayers] = useState<SlotPlayer[]>([]);
  const [rankingPlayers, setRankingPlayers] = useState<RankingPlayer[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [ratingHistory, setRatingHistory] = useState<PlayerRatingHistoryPoint[]>([]);

  const [selectedChartPlayer, setSelectedChartPlayer] = useState<string>('');
  const [h2hPlayerA, setH2hPlayerA] = useState<string>('');
  const [h2hPlayerB, setH2hPlayerB] = useState<string>('');

  const [nameInput, setNameInput] = useState<Record<number, string>>({});
  const [showAdmin, setShowAdmin] = useState(false);
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [pin, setPin] = useState('');
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState('09:00');
  const [loading, setLoading] = useState(true);

  const [resultModalOpen, setResultModalOpen] = useState(false);
  const [resultForm, setResultForm] = useState<ResultFormState | null>(null);
  const [savingResult, setSavingResult] = useState(false);

  const [myPlayerName, setMyPlayerName] = useState<string>('');

  const canSeeAdmin = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return params.get('admin') === '1';
  }, []);

  async function loadData() {
    setLoading(true);

    const [
      { data: slotsData },
      { data: slotPlayersData },
      { data: rankingPlayersData },
      { data: matchesData },
      { data: ratingHistoryData },
    ] = await Promise.all([
      supabase.from('slots').select('*').order('date').order('time'),
      supabase.from('players').select('*').order('created_at', { ascending: true }),
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
    ]);

    const rankingData = (rankingPlayersData || []) as RankingPlayer[];

    setSlots((slotsData || []) as Slot[]);
    setSlotPlayers((slotPlayersData || []) as SlotPlayer[]);
    setRankingPlayers(rankingData);
    setMatches((matchesData || []) as Match[]);
    setRatingHistory((ratingHistoryData || []) as PlayerRatingHistoryPoint[]);

    setSelectedChartPlayer((prev) => {
      if (prev) return prev;
      if (myPlayerName) return myPlayerName;
      return rankingData[0]?.name || '';
    });

    setH2hPlayerA((prev) => prev || myPlayerName || rankingData[0]?.name || '');
    setH2hPlayerB((prev) => {
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
      setH2hPlayerA(saved);
    }
  }, []);

  function handleSelectMyPlayer(name: string) {
    setMyPlayerName(name);
    setSelectedChartPlayer(name);
    setH2hPlayerA(name);
    window.localStorage.setItem('myPlayerName', name);
  }

  function clearMyPlayer() {
    setMyPlayerName('');
    window.localStorage.removeItem('myPlayerName');
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
    if (!h2hPlayerA || !h2hPlayerB || h2hPlayerA === h2hPlayerB) {
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
      (p) => p.name.trim().toLowerCase() === h2hPlayerA.trim().toLowerCase()
    );
    const playerB = rankingPlayers.find(
      (p) => p.name.trim().toLowerCase() === h2hPlayerB.trim().toLowerCase()
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
          ? `${h2hPlayerA} lleva ${streakCount}`
          : `${h2hPlayerB} lleva ${streakCount}`;
    }

    return {
      matches: filtered,
      winsA,
      winsB,
      total,
      winPctA,
      currentStreakText,
    };
  }, [matches, rankingPlayers, h2hPlayerA, h2hPlayerB]);

  const partnershipData = useMemo(() => {
    if (!h2hPlayerA || !h2hPlayerB || h2hPlayerA === h2hPlayerB) {
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
      (p) => p.name.trim().toLowerCase() === h2hPlayerA.trim().toLowerCase()
    );
    const playerB = rankingPlayers.find(
      (p) => p.name.trim().toLowerCase() === h2hPlayerB.trim().toLowerCase()
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
  }, [matches, rankingPlayers, h2hPlayerA, h2hPlayerB]);

  const slotMatchMap = useMemo(() => {
    const map = new Map<number, Match>();
    for (const m of matches) {
      if (m.slot_id != null && !map.has(m.slot_id)) {
        map.set(m.slot_id, m);
      }
    }
    return map;
  }, [matches]);

  const slotsWithPlayers = useMemo(() => {
    return slots.map((s) => {
      const allPlayers = sortPlayers(slotPlayers.filter((p) => p.slot_id === s.id));
      const match = slotMatchMap.get(s.id) || null;

      return {
        ...s,
        allPlayers,
        activePlayers: allPlayers.slice(0, MAX_PLAYERS),
        waitlistPlayers: allPlayers.slice(MAX_PLAYERS),
        match,
      };
    });
  }, [slots, slotPlayers, slotMatchMap]);

  const groupedSlots = useMemo(() => {
    const grouped: Record<string, typeof slotsWithPlayers> = {};
    for (const slot of slotsWithPlayers) {
      if (!grouped[slot.date]) grouped[slot.date] = [];
      grouped[slot.date].push(slot);
    }
    return grouped;
  }, [slotsWithPlayers]);

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
    const { error } = await supabase.from('players').delete().eq('id', playerId);

    if (error) {
      alert(`No se pudo borrar: ${error.message}`);
      return;
    }

    loadData();
  }

  async function adminAction(action: any) {
    const res = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...action, pin }),
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      return { ok: true, data };
    }

    alert(data.error || `Error admin (${res.status})`);
    return { ok: false, data };
  }

  async function unlockAdmin() {
    const res = await adminAction({ action: 'noop' });
    if (res.ok) setAdminUnlocked(true);
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
      slotId,
      editingMatchId: null,
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
      slotId,
      editingMatchId: m.id,
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

  function closeResultModal() {
    setResultModalOpen(false);
    setResultForm(null);
  }

  async function saveResult() {
    if (!resultForm) return;
    if (!adminUnlocked) {
      alert('Primero tenés que entrar como admin para guardar o editar resultados.');
      return;
    }

    const slot = slotsWithPlayers.find((s) => s.id === resultForm.slotId);
    if (!slot) {
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

    const slotPlayerIds = selectedIds as number[];
    const uniqueIds = new Set(slotPlayerIds);

    if (uniqueIds.size !== 4) {
      alert('No podés repetir jugadores en las parejas.');
      return;
    }

    const validSlotPlayerIds = new Set(slot.activePlayers.map((p) => p.id));
    const allValid = slotPlayerIds.every((id) => validSlotPlayerIds.has(id));

    if (!allValid) {
      alert('Solo podés usar los 4 jugadores de ese turno.');
      return;
    }

    const rankingIdA1 = rankingPlayerIdFromSlotPlayerId(
      resultForm.teamA1 as number,
      slotPlayers,
      rankingPlayers
    );
    const rankingIdA2 = rankingPlayerIdFromSlotPlayerId(
      resultForm.teamA2 as number,
      slotPlayers,
      rankingPlayers
    );
    const rankingIdB1 = rankingPlayerIdFromSlotPlayerId(
      resultForm.teamB1 as number,
      slotPlayers,
      rankingPlayers
    );
    const rankingIdB2 = rankingPlayerIdFromSlotPlayerId(
      resultForm.teamB2 as number,
      slotPlayers,
      rankingPlayers
    );

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

    setSavingResult(true);

    const res = await adminAction({
      action: 'saveMatch',
      matchId: resultForm.editingMatchId,
      match_date: slot.date,
      match_time: slot.time,
      slot_id: slot.id,
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
      source: 'slot',
      notes: resultForm.notes.trim() || null,
    });

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
    if (!slot || !slot.match) return;

    const ok = window.confirm('¿Seguro que querés borrar este resultado?');
    if (!ok) return;

    const res = await adminAction({
      action: 'deleteMatch',
      matchId: slot.match.id,
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
      <div
        style={{
          background: 'white',
          borderRadius: 20,
          padding: 20,
          marginBottom: 16,
          border: '1px solid #e5e7eb',
        }}
      >
        <h1 style={{ margin: 0, fontSize: 30 }}>Reservas de Pádel</h1>
        <p style={{ marginTop: 8, color: '#64748b' }}>
          Turnos, ranking e historial en una sola app.
        </p>

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
          {tabButton('Ranking', 'ranking')}
          {tabButton('Historial', 'historial')}

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

                        {!hasMatch && slot.activePlayers.length === 4 && adminUnlocked && (
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
                            Subir resultado
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
                                          }`
                                        : p.paid
                                        ? 'Pago registrado'
                                        : 'Pendiente de pago'}
                                    </div>
                                  </div>

                                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    {adminUnlocked && (
                                      <button
                                        onClick={() =>
                                          adminAction({
                                            action: 'togglePaid',
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
                                    )}

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
                          <div style={{ fontWeight: 700 }}>Score: {scoreText(slot.match)}</div>
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
                                          }`
                                        : 'En espera'}
                                    </div>
                                  </div>

                                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    {adminUnlocked && (
                                      <button
                                        onClick={() =>
                                          adminAction({
                                            action: 'togglePaid',
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
                                    )}

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
      )}

      {!loading && activeTab === 'ranking' && (
        <div
          style={{
            background: 'white',
            borderRadius: 24,
            padding: 24,
            border: '1px solid #e5e7eb',
            overflowX: 'auto',
            boxShadow: '0 8px 24px rgba(15, 23, 42, 0.04)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
              marginBottom: 18,
            }}
          >
            <div>
              <h2 style={{ margin: 0, fontSize: 24 }}>Ranking</h2>
              <div style={{ marginTop: 6, color: '#64748b', fontSize: 14 }}>
                Puntos = ranking del sistema
              </div>
            </div>

            <div
              style={{
                padding: '8px 12px',
                borderRadius: 999,
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                color: '#334155',
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              {rankingPlayers.length} jugadores
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              gap: 12,
              flexWrap: 'wrap',
              alignItems: 'center',
              marginBottom: 18,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: '#334155' }}>¿Quién sos?</div>

            <select
              value={myPlayerName}
              onChange={(e) => handleSelectMyPlayer(e.target.value)}
              style={{
                padding: '10px 12px',
                borderRadius: 12,
                border: '1px solid #d1d5db',
                background: 'white',
                minWidth: 220,
              }}
            >
              <option value="">Elegir jugador</option>
              {[...rankingPlayers]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((p) => (
                  <option key={p.id} value={p.name}>
                    {p.name}
                  </option>
                ))}
            </select>

            {myPlayerName && (
              <button
                onClick={clearMyPlayer}
                style={{
                  padding: '10px 14px',
                  borderRadius: 12,
                  border: '1px solid #d1d5db',
                  background: 'white',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                Cambiar
              </button>
            )}
          </div>

          {myRankingSummary && (
            <div
              style={{
                marginBottom: 18,
                padding: 16,
                borderRadius: 18,
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                display: 'flex',
                flexWrap: 'wrap',
                gap: 12,
                alignItems: 'center',
              }}
            >
              <div style={{ fontWeight: 800, color: '#1e3a8a' }}>
                Vos estás #{myRankingSummary.position}
              </div>
              <div
                style={{
                  padding: '6px 10px',
                  borderRadius: 999,
                  background: '#1d4ed8',
                  color: 'white',
                  fontWeight: 800,
                  fontSize: 13,
                }}
              >
                {Math.round(Number(myRankingSummary.player.display_rating))} pts
              </div>
              <div style={{ color: '#334155', fontWeight: 700 }}>
                {myRankingSummary.player.wins}G - {myRankingSummary.player.losses}P
              </div>
              <div style={{ color: '#334155', fontWeight: 700 }}>
                {Number(myRankingSummary.player.win_pct).toFixed(2)}%
              </div>
              <div
                style={{
                  padding: '5px 10px',
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 800,
                  background:
                    myRankingSummary.player.current_win_streak > 0 ? '#fff7ed' : '#f8fafc',
                  color:
                    myRankingSummary.player.current_win_streak > 0 ? '#c2410c' : '#64748b',
                  border: `1px solid ${
                    myRankingSummary.player.current_win_streak > 0 ? '#fdba74' : '#e2e8f0'
                  }`,
                }}
              >
                {myRankingSummary.player.current_win_streak > 0
                  ? `🔥 ${myRankingSummary.player.current_win_streak}`
                  : 'Racha 0'}
              </div>
            </div>
          )}

          <div
            style={{
              marginBottom: 18,
              background: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: 20,
              padding: 18,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap',
                marginBottom: 14,
              }}
            >
              <div>
                <div style={{ fontWeight: 800, fontSize: 18, color: '#0f172a' }}>
                  Evolución de puntos
                </div>
                <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
                  Jugador: {chartPlayerName || '—'}
                </div>
              </div>

              <select
                value={chartPlayerName}
                onChange={(e) => setSelectedChartPlayer(e.target.value)}
                style={{
                  padding: '10px 12px',
                  borderRadius: 12,
                  border: '1px solid #d1d5db',
                  background: 'white',
                  minWidth: 220,
                }}
              >
                {[...rankingPlayers]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((p) => (
                    <option key={p.id} value={p.name}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </div>

            {chartStats && (
              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  flexWrap: 'wrap',
                  marginBottom: 14,
                }}
              >
                <div
                  style={{
                    padding: '6px 10px',
                    borderRadius: 999,
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    fontSize: 13,
                    fontWeight: 700,
                    color: '#334155',
                  }}
                >
                  Inicio: {Math.round(chartStats.first)}
                </div>
                <div
                  style={{
                    padding: '6px 10px',
                    borderRadius: 999,
                    background: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    fontSize: 13,
                    fontWeight: 700,
                    color: '#1d4ed8',
                  }}
                >
                  Actual: {Math.round(chartStats.last)}
                </div>
                <div
                  style={{
                    padding: '6px 10px',
                    borderRadius: 999,
                    background: chartStats.change >= 0 ? '#ecfdf5' : '#fef2f2',
                    border: `1px solid ${chartStats.change >= 0 ? '#bbf7d0' : '#fecaca'}`,
                    fontSize: 13,
                    fontWeight: 700,
                    color: chartStats.change >= 0 ? '#166534' : '#b91c1c',
                  }}
                >
                  {chartStats.change >= 0 ? '+' : ''}
                  {chartStats.change.toFixed(2)} pts
                </div>
              </div>
            )}

            {chartGeometry.points.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <svg
                  width={chartGeometry.width}
                  height={chartGeometry.height}
                  viewBox={`0 0 ${chartGeometry.width} ${chartGeometry.height}`}
                  style={{
                    width: '100%',
                    maxWidth: chartGeometry.width,
                    height: 'auto',
                    display: 'block',
                    background: '#f8fafc',
                    borderRadius: 16,
                    border: '1px solid #e2e8f0',
                  }}
                >
                  {chartGeometry.gridYs.map((y, i) => (
                    <line
                      key={i}
                      x1="40"
                      x2={chartGeometry.width - 20}
                      y1={y}
                      y2={y}
                      stroke="#e2e8f0"
                      strokeWidth="1"
                    />
                  ))}

                  <path
                    d={chartGeometry.path}
                    fill="none"
                    stroke="#2563eb"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {chartGeometry.points.map((p, i) => {
                    const fill =
                      p.changeDirection === 'up'
                        ? '#16a34a'
                        : p.changeDirection === 'down'
                        ? '#dc2626'
                        : '#64748b';

                    return <circle key={i} cx={p.x} cy={p.y} r="5" fill={fill} />;
                  })}

                  {chartGeometry.points.length > 0 && (
                    <text
                      x={chartGeometry.points[chartGeometry.points.length - 1].x}
                      y={chartGeometry.points[chartGeometry.points.length - 1].y - 10}
                      textAnchor="middle"
                      fontSize="12"
                      fontWeight="700"
                      fill="#1d4ed8"
                    >
                      {Math.round(chartGeometry.points[chartGeometry.points.length - 1].value)}
                    </text>
                  )}
                </svg>
              </div>
            ) : (
              <div
                style={{
                  padding: 20,
                  borderRadius: 16,
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  color: '#64748b',
                }}
              >
                No hay historial suficiente para mostrar el gráfico.
              </div>
            )}
          </div>

          <div
            style={{
              marginBottom: 18,
              background: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: 20,
              padding: 18,
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 18, color: '#0f172a', marginBottom: 14 }}>
              Head-to-head / Como pareja
            </div>

            <div
              style={{
                display: 'flex',
                gap: 10,
                flexWrap: 'wrap',
                alignItems: 'center',
                marginBottom: 14,
              }}
            >
              <select
                value={h2hPlayerA}
                onChange={(e) => setH2hPlayerA(e.target.value)}
                style={{
                  padding: '10px 12px',
                  borderRadius: 12,
                  border: '1px solid #d1d5db',
                  background: 'white',
                  minWidth: 220,
                }}
              >
                <option value="">Jugador A</option>
                {[...rankingPlayers]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((p) => (
                    <option key={p.id} value={p.name}>
                      {p.name}
                    </option>
                  ))}
              </select>

              <div style={{ fontWeight: 800, color: '#64748b' }}>y</div>

              <select
                value={h2hPlayerB}
                onChange={(e) => setH2hPlayerB(e.target.value)}
                style={{
                  padding: '10px 12px',
                  borderRadius: 12,
                  border: '1px solid #d1d5db',
                  background: 'white',
                  minWidth: 220,
                }}
              >
                <option value="">Jugador B</option>
                {[...rankingPlayers]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((p) => (
                    <option key={p.id} value={p.name}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </div>

            {h2hPlayerA && h2hPlayerB && h2hPlayerA === h2hPlayerB ? (
              <div
                style={{
                  padding: 14,
                  borderRadius: 14,
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  color: '#64748b',
                }}
              >
                Elegí dos jugadores distintos.
              </div>
            ) : (
              <>
                <div
                  style={{
                    display: 'grid',
                    gap: 18,
                    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                  }}
                >
                  <div
                    style={{
                      border: '1px solid #e5e7eb',
                      borderRadius: 18,
                      padding: 16,
                      background: '#fcfcfd',
                    }}
                  >
                    <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 12 }}>
                      Head-to-head
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        gap: 10,
                        flexWrap: 'wrap',
                        marginBottom: 14,
                      }}
                    >
                      <div
                        style={{
                          padding: '10px 12px',
                          borderRadius: 14,
                          background: '#eff6ff',
                          border: '1px solid #bfdbfe',
                          color: '#1d4ed8',
                          fontWeight: 800,
                        }}
                      >
                        {h2hPlayerA || 'Jugador A'} {h2hData.winsA} - {h2hData.winsB} {h2hPlayerB || 'Jugador B'}
                      </div>

                      <div
                        style={{
                          padding: '10px 12px',
                          borderRadius: 14,
                          background: '#f8fafc',
                          border: '1px solid #e2e8f0',
                          color: '#334155',
                          fontWeight: 700,
                        }}
                      >
                        Partidos: {h2hData.total}
                      </div>

                      <div
                        style={{
                          padding: '10px 12px',
                          borderRadius: 14,
                          background: '#f8fafc',
                          border: '1px solid #e2e8f0',
                          color: '#334155',
                          fontWeight: 700,
                        }}
                      >
                        Win % {h2hPlayerA || 'A'}: {h2hData.winPctA.toFixed(1)}%
                      </div>

                      {h2hData.currentStreakText && (
                        <div
                          style={{
                            padding: '10px 12px',
                            borderRadius: 14,
                            background: '#fff7ed',
                            border: '1px solid #fdba74',
                            color: '#c2410c',
                            fontWeight: 800,
                          }}
                        >
                          {h2hData.currentStreakText}
                        </div>
                      )}
                    </div>

                    {h2hData.matches.length === 0 ? (
                      <div
                        style={{
                          padding: 14,
                          borderRadius: 14,
                          background: '#f8fafc',
                          border: '1px solid #e2e8f0',
                          color: '#64748b',
                        }}
                      >
                        No hay cruces cargados entre esos dos jugadores.
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gap: 10 }}>
                        {h2hData.matches.map((m) => {
                          const teamA = `${playerNameById(rankingPlayers, m.team_a_player_1_id)} / ${playerNameById(
                            rankingPlayers,
                            m.team_a_player_2_id
                          )}`;
                          const teamB = `${playerNameById(rankingPlayers, m.team_b_player_1_id)} / ${playerNameById(
                            rankingPlayers,
                            m.team_b_player_2_id
                          )}`;

                          return (
                            <div
                              key={`h2h-${m.id}`}
                              style={{
                                border: '1px solid #e5e7eb',
                                borderRadius: 14,
                                padding: 14,
                                background: 'white',
                              }}
                            >
                              <div
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  gap: 8,
                                  flexWrap: 'wrap',
                                  marginBottom: 8,
                                }}
                              >
                                <div style={{ fontWeight: 800 }}>
                                  {formatDate(m.match_date)}
                                  {m.match_time ? ` · ${m.match_time}` : ''}
                                </div>

                                <div
                                  style={{
                                    padding: '6px 10px',
                                    borderRadius: 999,
                                    background: m.winnerLabel === 'A' ? '#ecfdf5' : '#fef2f2',
                                    border: `1px solid ${m.winnerLabel === 'A' ? '#bbf7d0' : '#fecaca'}`,
                                    color: m.winnerLabel === 'A' ? '#166534' : '#b91c1c',
                                    fontWeight: 800,
                                    fontSize: 12,
                                  }}
                                >
                                  Ganó {m.winnerLabel === 'A' ? h2hPlayerA : h2hPlayerB}
                                </div>
                              </div>

                              <div style={{ color: '#334155', marginBottom: 4 }}>Team A: {teamA}</div>
                              <div style={{ color: '#334155', marginBottom: 6 }}>Team B: {teamB}</div>
                              <div style={{ fontWeight: 800 }}>Score: {scoreText(m)}</div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      border: '1px solid #e5e7eb',
                      borderRadius: 18,
                      padding: 16,
                      background: '#fcfcfd',
                    }}
                  >
                    <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 12 }}>
                      Como pareja
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        gap: 10,
                        flexWrap: 'wrap',
                        marginBottom: 14,
                      }}
                    >
                      <div
                        style={{
                          padding: '10px 12px',
                          borderRadius: 14,
                          background: '#eefbf3',
                          border: '1px solid #bbf7d0',
                          color: '#166534',
                          fontWeight: 800,
                        }}
                      >
                        {h2hPlayerA || 'Jugador A'} + {h2hPlayerB || 'Jugador B'}: {partnershipData.wins} - {partnershipData.losses}
                      </div>

                      <div
                        style={{
                          padding: '10px 12px',
                          borderRadius: 14,
                          background: '#f8fafc',
                          border: '1px solid #e2e8f0',
                          color: '#334155',
                          fontWeight: 700,
                        }}
                      >
                        Juntos: {partnershipData.total}
                      </div>

                      <div
                        style={{
                          padding: '10px 12px',
                          borderRadius: 14,
                          background: '#f8fafc',
                          border: '1px solid #e2e8f0',
                          color: '#334155',
                          fontWeight: 700,
                        }}
                      >
                        Win % juntos: {partnershipData.winPct.toFixed(1)}%
                      </div>

                      {partnershipData.currentStreakText && (
                        <div
                          style={{
                            padding: '10px 12px',
                            borderRadius: 14,
                            background: '#fff7ed',
                            border: '1px solid #fdba74',
                            color: '#c2410c',
                            fontWeight: 800,
                          }}
                        >
                          {partnershipData.currentStreakText}
                        </div>
                      )}
                    </div>

                    {partnershipData.matches.length === 0 ? (
                      <div
                        style={{
                          padding: 14,
                          borderRadius: 14,
                          background: '#f8fafc',
                          border: '1px solid #e2e8f0',
                          color: '#64748b',
                        }}
                      >
                        No hay partidos cargados donde hayan jugado juntos.
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gap: 10 }}>
                        {partnershipData.matches.map((m) => {
                          const teamA = `${playerNameById(rankingPlayers, m.team_a_player_1_id)} / ${playerNameById(
                            rankingPlayers,
                            m.team_a_player_2_id
                          )}`;
                          const teamB = `${playerNameById(rankingPlayers, m.team_b_player_1_id)} / ${playerNameById(
                            rankingPlayers,
                            m.team_b_player_2_id
                          )}`;

                          return (
                            <div
                              key={`pair-${m.id}`}
                              style={{
                                border: '1px solid #e5e7eb',
                                borderRadius: 14,
                                padding: 14,
                                background: 'white',
                              }}
                            >
                              <div
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  gap: 8,
                                  flexWrap: 'wrap',
                                  marginBottom: 8,
                                }}
                              >
                                <div style={{ fontWeight: 800 }}>
                                  {formatDate(m.match_date)}
                                  {m.match_time ? ` · ${m.match_time}` : ''}
                                </div>

                                <div
                                  style={{
                                    padding: '6px 10px',
                                    borderRadius: 999,
                                    background: m.resultLabel === 'W' ? '#ecfdf5' : '#fef2f2',
                                    border: `1px solid ${m.resultLabel === 'W' ? '#bbf7d0' : '#fecaca'}`,
                                    color: m.resultLabel === 'W' ? '#166534' : '#b91c1c',
                                    fontWeight: 800,
                                    fontSize: 12,
                                  }}
                                >
                                  {m.resultLabel === 'W' ? 'Ganaron juntos' : 'Perdieron juntos'}
                                </div>
                              </div>

                              <div style={{ color: '#334155', marginBottom: 4 }}>Team A: {teamA}</div>
                              <div style={{ color: '#334155', marginBottom: 6 }}>Team B: {teamB}</div>
                              <div style={{ fontWeight: 800 }}>Score: {scoreText(m)}</div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 980 }}>
            <thead>
              <tr>
                {['#', 'Jugador', 'Puntos', 'PJ', 'G', 'P', '%', 'Prov.', 'Racha', 'Mejor'].map((label) => (
                  <th
                    key={label}
                    style={{
                      textAlign: 'left',
                      padding: '14px 12px',
                      fontSize: 13,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      color: '#475569',
                      background: '#f8fafc',
                      borderTop: '1px solid #e5e7eb',
                      borderBottom: '1px solid #e5e7eb',
                    }}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {[...rankingPlayers]
                .sort((a, b) => {
                  if (b.display_rating !== a.display_rating) return b.display_rating - a.display_rating;
                  if (b.elo_rating !== a.elo_rating) return b.elo_rating - a.elo_rating;
                  return a.name.localeCompare(b.name);
                })
                .map((p, idx) => {
                  const isTop3 = idx < 3;
                  const isMe =
                    myPlayerName &&
                    p.name.trim().toLowerCase() === myPlayerName.trim().toLowerCase();
                  const isChartPlayer =
                    chartPlayerName &&
                    p.name.trim().toLowerCase() === chartPlayerName.trim().toLowerCase();

                  const rowBg = isMe
                    ? '#eff6ff'
                    : idx === 0
                    ? '#fffbea'
                    : idx === 1
                    ? '#f8fafc'
                    : idx === 2
                    ? '#fff7ed'
                    : idx % 2 === 0
                    ? 'white'
                    : '#fcfcfd';

                  return (
                    <tr
                      key={p.id}
                      onClick={() => setSelectedChartPlayer(p.name)}
                      style={{
                        background: rowBg,
                        cursor: 'pointer',
                        boxShadow: isChartPlayer ? 'inset 0 0 0 2px #93c5fd' : undefined,
                      }}
                    >
                      <td
                        style={{
                          padding: '14px 12px',
                          borderBottom: '1px solid #eef2f7',
                          fontWeight: 800,
                        }}
                      >
                        {idx + 1}
                      </td>

                      <td
                        style={{
                          padding: '14px 12px',
                          borderBottom: '1px solid #eef2f7',
                        }}
                      >
                        <div style={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span>{p.name}</span>
                          {isMe && (
                            <span
                              style={{
                                padding: '4px 8px',
                                borderRadius: 999,
                                fontSize: 11,
                                fontWeight: 800,
                                background: '#1d4ed8',
                                color: 'white',
                              }}
                            >
                              Vos
                            </span>
                          )}
                        </div>
                      </td>

                      <td
                        style={{
                          padding: '14px 12px',
                          borderBottom: '1px solid #eef2f7',
                        }}
                      >
                        <div
                          style={{
                            display: 'inline-flex',
                            padding: '6px 10px',
                            borderRadius: 999,
                            background: isTop3 ? '#111827' : '#eff6ff',
                            color: isTop3 ? 'white' : '#1d4ed8',
                            fontWeight: 800,
                          }}
                        >
                          {Math.round(Number(p.display_rating))}
                        </div>
                      </td>

                      <td style={{ padding: '14px 12px', borderBottom: '1px solid #eef2f7' }}>
                        {p.matches_played}
                      </td>

                      <td
                        style={{
                          padding: '14px 12px',
                          borderBottom: '1px solid #eef2f7',
                          color: '#166534',
                          fontWeight: 700,
                        }}
                      >
                        {p.wins}
                      </td>

                      <td
                        style={{
                          padding: '14px 12px',
                          borderBottom: '1px solid #eef2f7',
                          color: '#b91c1c',
                          fontWeight: 700,
                        }}
                      >
                        {p.losses}
                      </td>

                      <td style={{ padding: '14px 12px', borderBottom: '1px solid #eef2f7' }}>
                        {Number(p.win_pct).toFixed(2)}%
                      </td>

                      <td style={{ padding: '14px 12px', borderBottom: '1px solid #eef2f7' }}>
                        <span
                          style={{
                            padding: '5px 10px',
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: 700,
                            background: p.provisional ? '#fef2f2' : '#ecfdf5',
                            color: p.provisional ? '#b91c1c' : '#166534',
                          }}
                        >
                          {p.provisional ? 'Sí' : 'No'}
                        </span>
                      </td>

                      <td style={{ padding: '14px 12px', borderBottom: '1px solid #eef2f7' }}>
                        <span
                          style={{
                            padding: '5px 10px',
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: 800,
                            background: p.current_win_streak > 0 ? '#fff7ed' : '#f8fafc',
                            color: p.current_win_streak > 0 ? '#c2410c' : '#64748b',
                          }}
                        >
                          {p.current_win_streak > 0 ? `🔥 ${p.current_win_streak}` : '0'}
                        </span>
                      </td>

                      <td style={{ padding: '14px 12px', borderBottom: '1px solid #eef2f7' }}>
                        {p.best_win_streak}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && activeTab === 'historial' && (
        <div style={{ display: 'grid', gap: 12 }}>
          {matches.length === 0 && (
            <div
              style={{
                background: 'white',
                borderRadius: 20,
                padding: 20,
                border: '1px solid #e5e7eb',
              }}
            >
              No hay partidos cargados todavía.
            </div>
          )}

          {matches.map((m) => {
            const teamA = `${playerNameById(rankingPlayers, m.team_a_player_1_id)} / ${playerNameById(
              rankingPlayers,
              m.team_a_player_2_id
            )}`;
            const teamB = `${playerNameById(rankingPlayers, m.team_b_player_1_id)} / ${playerNameById(
              rankingPlayers,
              m.team_b_player_2_id
            )}`;

            return (
              <div
                key={m.id}
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
                    marginBottom: 10,
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 18 }}>
                    {formatDate(m.match_date)}
                    {m.match_time ? ` · ${m.match_time}` : ''}
                  </div>

                  <div
                    style={{
                      padding: '6px 10px',
                      borderRadius: 999,
                      background: '#f1f5f9',
                      border: '1px solid #cbd5e1',
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {m.source || 'match'}
                  </div>
                </div>

                <div style={{ display: 'grid', gap: 6 }}>
                  <div style={{ fontWeight: m.winner_team === 'A' ? 700 : 500 }}>
                    Team A: {teamA}
                  </div>
                  <div style={{ fontWeight: m.winner_team === 'B' ? 700 : 500 }}>
                    Team B: {teamB}
                  </div>
                </div>

                <div style={{ marginTop: 10, color: '#334155', fontWeight: 700 }}>
                  Resultado: {scoreText(m)}
                </div>

                {m.winner_team && (
                  <div style={{ marginTop: 6, color: '#64748b', fontSize: 14 }}>
                    Ganador: {m.winner_team === 'A' ? 'Team A' : 'Team B'}
                  </div>
                )}

                {m.notes && (
                  <div style={{ marginTop: 6, color: '#64748b', fontSize: 13 }}>
                    {m.notes}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {resultModalOpen && resultForm && (
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
              {resultForm.editingMatchId ? 'Editar resultado' : 'Subir resultado'}
            </h3>

            {(() => {
              const slot = slotsWithPlayers.find((s) => s.id === resultForm.slotId);
              const players = slot?.activePlayers || [];

              return (
                <>
                  <div style={{ color: '#64748b', marginBottom: 14 }}>
                    Turno {slot?.time} · {slot ? formatDate(slot.date) : ''}
                  </div>

                  <div style={{ display: 'grid', gap: 14 }}>
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
                          {players.map((p) => (
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
                          {players.map((p) => (
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
                          {players.map((p) => (
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
                          {players.map((p) => (
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
                </>
              );
            })()}

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
      )}
    </div>
  );
}
