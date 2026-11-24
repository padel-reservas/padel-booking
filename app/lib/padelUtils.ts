import type {
  ChartPoint,
  Match,
  RankedPlayer,
  RankingPlayer,
  ResultFormState,
  SlotPlayer,
} from './padelTypes';

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

// Reglas del ranking oficial. El ELO interno no se toca: esto solo cambia
// qué se muestra y en qué orden.
export const RANKING_RULES = {
  officialMinMatches: 12, // partidos mínimos en la ventana para estar arriba de la línea
  windowDays: 365, // ventana móvil de 12 meses
  inactivityGraceDays: 60, // 2 meses sin jugar antes de empezar a perder puntos
  inactivityPtsPerMonth: 15, // puntos que se pierden por mes completo de inactividad
  inactivityFloor: 1500, // la penalización nunca baja a nadie de este valor
};

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetweenISO(fromISO: string, toISO: string) {
  return Math.round((Date.parse(toISO) - Date.parse(fromISO)) / DAY_MS);
}

function compareRanked(a: RankedPlayer, b: RankedPlayer) {
  if (b.ranking_points !== a.ranking_points) return b.ranking_points - a.ranking_points;
  if (b.elo_rating !== a.elo_rating) return b.elo_rating - a.elo_rating;
  return a.name.localeCompare(b.name);
}

export function buildOfficialRanking(
  rankingPlayers: RankingPlayer[],
  matches: Match[],
  today: string = todayISO()
) {
  const rules = RANKING_RULES;
  const windowStart = new Date(Date.parse(today) - rules.windowDays * DAY_MS)
    .toISOString()
    .slice(0, 10);

  const windowCount = new Map<number, number>();
  const lastPlayed = new Map<number, string>();

  for (const m of matches) {
    if (!m.winner_team || !m.match_date) continue;
    const ids = [
      m.team_a_player_1_id,
      m.team_a_player_2_id,
      m.team_b_player_1_id,
      m.team_b_player_2_id,
    ];
    for (const id of ids) {
      if (id == null) continue;
      if (m.match_date >= windowStart) windowCount.set(id, (windowCount.get(id) || 0) + 1);
      const prev = lastPlayed.get(id);
      if (!prev || m.match_date > prev) lastPlayed.set(id, m.match_date);
    }
  }

  const rows: RankedPlayer[] = rankingPlayers
    .filter((p) => (p.matches_played || 0) > 0)
    .map((p) => {
      const display = Number(p.display_rating);
      const last = lastPlayed.get(p.id) || null;
      const daysInactive = last ? daysBetweenISO(last, today) : 0;
      const inactiveMonths = Math.floor(
        Math.max(0, daysInactive - rules.inactivityGraceDays) / 30
      );
      const points =
        display > rules.inactivityFloor
          ? Math.max(rules.inactivityFloor, display - inactiveMonths * rules.inactivityPtsPerMonth)
          : display;
      const matchesWindow = windowCount.get(p.id) || 0;

      return {
        ...p,
        ranking_points: points,
        inactivity_penalty: display - points,
        inactive_months: inactiveMonths,
        matches_window: matchesWindow,
        last_played: last,
        is_official: matchesWindow >= rules.officialMinMatches,
        official_position: null,
      };
    });

  const official = rows.filter((r) => r.is_official).sort(compareRanked);
  official.forEach((r, idx) => {
    r.official_position = idx + 1;
  });

  // Debajo de la línea: primero los que están más cerca de entrar.
  const below = rows
    .filter((r) => !r.is_official)
    .sort((a, b) => b.matches_window - a.matches_window || compareRanked(a, b));

  return { official, below, all: [...official, ...below] };
}

export function statsMap(rankedPlayers: RankedPlayer[]) {
  const map = new Map<
    string,
    { position: number | null; display: number; winPct: number; provisional: boolean }
  >();

  rankedPlayers.forEach((p) => {
    map.set(p.name.trim().toLowerCase(), {
      position: p.official_position,
      display: p.ranking_points,
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
