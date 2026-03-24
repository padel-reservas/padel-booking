import type { ChartPoint, Match, RankingPlayer, ResultFormState, SlotPlayer } from './padelTypes';

export function todayISO() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDate(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString('es-AR', {
    weekday: 'short',
    day: 'numeric',
    month: 'numeric',
  });
}

export function sortPlayers(players: SlotPlayer[]) {
  return [...players].sort((a, b) => {
    const aTime = a.created_at || '';
    const bTime = b.created_at || '';
    return aTime.localeCompare(bTime);
  });
}

export function scoreText(m: Match) {
  const sets: string[] = [];
  if (m.set1_a != null && m.set1_b != null) sets.push(`${m.set1_a}-${m.set1_b}`);
  if (m.set2_a != null && m.set2_b != null) sets.push(`${m.set2_a}-${m.set2_b}`);
  if (m.set3_a != null && m.set3_b != null) sets.push(`${m.set3_a}-${m.set3_b}`);
  return sets.join(' / ');
}

export function playerNameById(players: RankingPlayer[], id: number) {
  return players.find((p) => p.id === id)?.name || `Jugador ${id}`;
}

export function statsMap(rankingPlayers: RankingPlayer[]) {
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

export function parseSetValue(v: string): number | null {
  const t = v.trim();
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return n;
}

export function computeWinnerTeam(form: ResultFormState): 'A' | 'B' | null {
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

export function rankingPlayerIdFromSlotPlayerId(
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

export function buildPointsChartGeometry(values: number[]) {
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
