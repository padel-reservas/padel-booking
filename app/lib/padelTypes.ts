export type Slot = {
  id: number;
  date: string;
  time: string;
};

export type PaymentMethod = 'venmo' | 'zelle';
export type PaymentStatus = 'reported' | 'verified' | 'rejected';
export type PaymentVisualStatus = 'paid' | 'reported' | 'unpaid';

export type SuggestionType = 'availability' | 'need_players' | 'replacement_needed';
export type SuggestionStatus = 'open' | 'resolved' | 'cancelled';
export type BookingStatus = 'open' | 'not_available' | 'booked';

export type Suggestion = {
  id: number;
  author_name: string;
  type: SuggestionType;
  message: string;
  slot_id: number | null;
  suggested_date: string | null;
  suggested_time: string | null;
  is_urgent: boolean;
  status: SuggestionStatus;
  created_at: string;
  is_booking_request: boolean;
  booking_status: BookingStatus;
};

export type SuggestionResponse = {
  id: number;
  suggestion_id: number;
  responder_name: string;
  created_at: string;
};

export type NewSuggestionFormState = {
  authorName: string;
  type: SuggestionType;
  message: string;
  suggestedDate: string;
  suggestedTime: string;
};

export type SlotPlayer = {
  id: number;
  slot_id: number;
  name: string;
  paid: boolean;
  created_at?: string;

  paid_at?: string | null;
  payment_updated_at?: string | null;
  reminder_count?: number;
  last_reminder_at?: string | null;
  last_reminder_channel?: 'whatsapp' | null;

  payment_allocations?: PaymentAllocationWithPayment[];
};

export type Payment = {
  id: string;
  payer_player_id: number;
  payment_method: PaymentMethod;
  status: PaymentStatus;
  amount?: number | null;
  notes?: string | null;
  reported_at: string;
  verified_at?: string | null;
  verified_by?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type PaymentAllocation = {
  id: string;
  payment_id: string;
  player_id: number;
  created_at?: string;
};

export type PaymentAllocationWithPayment = PaymentAllocation & {
  payment?: Payment | null;
};

export type SlotPlayerWithPaymentUI = SlotPlayer & {
  paymentVisualStatus: PaymentVisualStatus;
  latestReportedPayment?: Payment | null;
  latestVerifiedPayment?: Payment | null;
  paidByPlayerId?: number | null;
  paidByPlayerName?: string | null;
};

export type ReportPaymentFormState = {
  payerPlayerId: number | '';
  paymentMethod: PaymentMethod | '';
  coveredPlayerIds: number[];
  amount: string;
  notes: string;
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

export type TabKey =
  | 'turnos'
  | 'sugerencias'
  | 'ranking'
  | 'duelo'
  | 'historial'
  | 'actividad';

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
