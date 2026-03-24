export type Slot = {
  id: number;
  date: string;
  time: string;
};

export type SlotPlayer = {
  id: number;
  slot_id: number;
  name: string;
  paid: boolean;
  created_at?: string;
};

export type RankingPlayer = {
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

export type Match = {
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
  submitted_by_player_id?: number | null;
  submitted_at?: string | null;
  created_at?: string;
};

export type PlayerRatingHistoryPoint = {
  player_id: number;
  player_name: string;
  match_id: number;
  match_date: string;
  match_time: string | null;
  pre_rating: number;
  post_rating: number;
  delta: number;
};

export type TabKey = 'turnos' | 'ranking' | 'duelo' | 'historial' | 'actividad';
export type ResultFormMode = 'slot' | 'manual';

export type ResultFormState = {
  mode: ResultFormMode;
  slotId: number | null;
  editingMatchId: number | null;
  submittedByPlayerId: number | '';
  manualDate: string;
  manualTime: string;
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

export type ChartPoint = {
  x: number;
  y: number;
  value: number;
  changeDirection: 'up' | 'down' | 'flat';
};

export type H2HMatch = Match & {
  sideOfPlayerA: 'A' | 'B';
  winnerLabel: 'A' | 'B';
};

export type PartnershipMatch = Match & {
  teamTogether: 'A' | 'B';
  resultLabel: 'W' | 'L';
};

export type ActivityMatch = Match & {
  didWin: boolean;
  partnerName: string;
  opponent1Name: string;
  opponent2Name: string;
};
