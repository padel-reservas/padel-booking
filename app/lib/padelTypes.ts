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
