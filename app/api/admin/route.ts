import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const adminPin = process.env.ADMIN_PIN!;

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function runRecalculateRankings() {
  const { error } = await supabase.rpc('recalculate_rankings_v2');

  if (error) {
    throw new Error(`No se pudo recalcular rankings: ${error.message}`);
  }
}

async function validateSubmitterForSlot(slotId: number, submittedByPlayerId: number) {
  const { data: slotPlayers, error } = await supabase
    .from('players')
    .select('id, name, created_at')
    .eq('slot_id', slotId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`No se pudieron leer los jugadores del turno: ${error.message}`);
  }

  const firstFour = (slotPlayers || []).slice(0, 4);

  if (firstFour.length !== 4) {
    throw new Error('El turno debe tener exactamente 4 jugadores para cargar resultado.');
  }

  const slotNames = firstFour.map((p) => String(p.name).trim().toLowerCase());

  const { data: rankingPlayers, error: rankingError } = await supabase
    .from('ranking_players')
    .select('id, name');

  if (rankingError) {
    throw new Error(`No se pudieron validar los jugadores del ranking: ${rankingError.message}`);
  }

  const allowedRankingIds = (rankingPlayers || [])
    .filter((p) => slotNames.includes(String(p.name).trim().toLowerCase()))
    .map((p) => p.id);

  if (!allowedRankingIds.includes(submittedByPlayerId)) {
    throw new Error('Solo uno de los 4 jugadores del turno puede cargar el resultado.');
  }
}

function normalizePaymentMethod(raw: unknown): 'venmo' | 'zelle' | 'cash' | null {
  const value = String(raw || '')
    .trim()
    .toLowerCase();

  if (value === 'venmo' || value === 'zelle' || value === 'cash') {
    return value;
  }

  return null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { pin, action } = body;

    if (action === 'selfTogglePaid') {
      const { playerId, paid } = body;

      if (!playerId || typeof paid !== 'boolean') {
        return NextResponse.json({ error: 'Faltan datos para actualizar pago' }, { status: 400 });
      }

      const { error } = await supabase
        .from('players')
        .update({ paid })
        .eq('id', playerId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json({ ok: true, mode: 'self-paid-updated' });
    }

    if (action === 'submitMatch') {
      const {
        match_date,
        match_time,
        slot_id,
        team_a_player_1_id,
        team_a_player_2_id,
        team_b_player_1_id,
        team_b_player_2_id,
        set1_a,
        set1_b,
        set2_a,
        set2_b,
        set3_a,
        set3_b,
        winner_team,
        source,
        notes,
        submitted_by_player_id,
      } = body;

      if (!slot_id) {
        return NextResponse.json({ error: 'Falta slot_id' }, { status: 400 });
      }

      if (!submitted_by_player_id) {
        return NextResponse.json({ error: 'Falta submitted_by_player_id' }, { status: 400 });
      }

      const { data: existingMatch, error: existingError } = await supabase
        .from('matches')
        .select('id')
        .eq('slot_id', slot_id)
        .maybeSingle();

      if (existingError) {
        return NextResponse.json({ error: existingError.message }, { status: 400 });
      }

      if (existingMatch) {
        return NextResponse.json(
          { error: 'Ese turno ya tiene resultado cargado.' },
          { status: 400 }
        );
      }

      await validateSubmitterForSlot(slot_id, submitted_by_player_id);

      const payload = {
        match_date,
        match_time,
        slot_id,
        team_a_player_1_id,
        team_a_player_2_id,
        team_b_player_1_id,
        team_b_player_2_id,
        set1_a,
        set1_b,
        set2_a,
        set2_b,
        set3_a,
        set3_b,
        winner_team,
        source: source || 'slot',
        notes: notes || null,
        submitted_by_player_id,
        submitted_at: new Date().toISOString(),
      };

      const { error } = await supabase.from('matches').insert(payload);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      await runRecalculateRankings();
      return NextResponse.json({ ok: true, mode: 'submitted' });
    }

    if (!pin || pin !== adminPin) {
      return NextResponse.json({ error: 'PIN inválido' }, { status: 401 });
    }

    if (action === 'noop') {
      return NextResponse.json({ ok: true });
    }

    if (action === 'createSlot') {
      const { date, time } = body;

      const { error } = await supabase.from('slots').insert({ date, time });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json({ ok: true });
    }

    if (action === 'deleteSlot') {
      const { slotId } = body;

      const { data: relatedMatches, error: relatedMatchesError } = await supabase
        .from('matches')
        .select('id')
        .eq('slot_id', slotId);

      if (relatedMatchesError) {
        return NextResponse.json({ error: relatedMatchesError.message }, { status: 400 });
      }

      if ((relatedMatches || []).length > 0) {
        const { error: detachError } = await supabase
          .from('matches')
          .update({ slot_id: null })
          .eq('slot_id', slotId);

        if (detachError) {
          return NextResponse.json({ error: detachError.message }, { status: 400 });
        }
      }

      const { error } = await supabase.from('slots').delete().eq('id', slotId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json({ ok: true, mode: 'slot-deleted-kept-matches' });
    }

    if (action === 'togglePaid') {
      const { playerId, paid } = body;

      const { error } = await supabase
        .from('players')
        .update({ paid })
        .eq('id', playerId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json({ ok: true });
    }

    if (action === 'markPaidDirect') {
      const { slotId, playerId, paymentMethod } = body;

      if (!slotId || !playerId) {
        return NextResponse.json(
          { error: 'Faltan slotId o playerId para marcar pago directo' },
          { status: 400 }
        );
      }

      const normalizedMethod = normalizePaymentMethod(paymentMethod);

      if (!normalizedMethod) {
        return NextResponse.json(
          { error: 'paymentMethod inválido. Debe ser venmo, zelle o cash' },
          { status: 400 }
        );
      }

      const now = new Date().toISOString();

      const { error: paymentError } = await supabase.from('payments').insert({
        slot_id: slotId,
        payer_player_id: playerId,
        payment_method: normalizedMethod,
        status: 'paid',
        reported_at: now,
        approved_at: now,
        notes: 'Marked paid by admin',
      });

      if (paymentError) {
        return NextResponse.json({ error: paymentError.message }, { status: 400 });
      }

      const { error: playerPaidError } = await supabase
        .from('players')
        .update({ paid: true })
        .eq('id', playerId);

      if (playerPaidError) {
        return NextResponse.json({ error: playerPaidError.message }, { status: 400 });
      }

      return NextResponse.json({ ok: true, mode: 'marked-paid-direct' });
    }

    if (action === 'addRankingPlayer') {
      const rawName = String(body.name || '').trim();

      if (!rawName) {
        return NextResponse.json({ error: 'Falta el nombre del jugador' }, { status: 400 });
      }

      const normalized = rawName.toLowerCase();

      const { data: existingPlayers, error: existingError } = await supabase
        .from('ranking_players')
        .select('id, name');

      if (existingError) {
        return NextResponse.json({ error: existingError.message }, { status: 400 });
      }

      const alreadyExists = (existingPlayers || []).some(
        (p) => String(p.name).trim().toLowerCase() === normalized
      );

      if (alreadyExists) {
        return NextResponse.json(
          { error: 'Ese jugador ya existe en ranking_players' },
          { status: 400 }
        );
      }

      const { data: configRow, error: configError } = await supabase
        .from('ranking_config')
        .select('initial_rating')
        .eq('id', 1)
        .single();

      if (configError) {
        return NextResponse.json(
          { error: `No se pudo leer ranking_config: ${configError.message}` },
          { status: 400 }
        );
      }

      const initialRating = Number(configRow?.initial_rating);

      if (!Number.isFinite(initialRating)) {
        return NextResponse.json(
          { error: 'initial_rating inválido en ranking_config' },
          { status: 400 }
        );
      }

      const { error } = await supabase.from('ranking_players').insert({
        name: rawName,
        elo_rating: initialRating,
        display_rating: initialRating,
        matches_played: 0,
        wins: 0,
        losses: 0,
        win_pct: 0,
        sets_won: 0,
        sets_lost: 0,
        provisional: true,
        current_win_streak: 0,
        best_win_streak: 0,
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json({ ok: true, mode: 'ranking-player-added' });
    }

    if (action === 'saveMatch') {
      const {
        matchId,
        match_date,
        match_time,
        slot_id,
        team_a_player_1_id,
        team_a_player_2_id,
        team_b_player_1_id,
        team_b_player_2_id,
        set1_a,
        set1_b,
        set2_a,
        set2_b,
        set3_a,
        set3_b,
        winner_team,
        source,
        notes,
        submitted_by_player_id,
        submitted_at,
      } = body;

      const payload = {
        match_date,
        match_time,
        slot_id: slot_id ?? null,
        team_a_player_1_id,
        team_a_player_2_id,
        team_b_player_1_id,
        team_b_player_2_id,
        set1_a,
        set1_b,
        set2_a,
        set2_b,
        set3_a,
        set3_b,
        winner_team,
        source: source || (slot_id ? 'slot' : 'manual'),
        notes: notes || null,
      };

      if (matchId) {
        const { error } = await supabase.from('matches').update(payload).eq('id', matchId);

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 400 });
        }

        await runRecalculateRankings();
        return NextResponse.json({ ok: true, mode: 'updated' });
      }

      const insertPayload = {
        ...payload,
        submitted_by_player_id: submitted_by_player_id || null,
        submitted_at: submitted_at || (submitted_by_player_id ? new Date().toISOString() : null),
      };

      const { error } = await supabase.from('matches').insert(insertPayload);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      await runRecalculateRankings();
      return NextResponse.json({ ok: true, mode: 'inserted' });
    }

    if (action === 'deleteMatch') {
      const { matchId } = body;

      if (!matchId) {
        return NextResponse.json({ error: 'Falta matchId' }, { status: 400 });
      }

      const { error } = await supabase.from('matches').delete().eq('id', matchId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      await runRecalculateRankings();
      return NextResponse.json({ ok: true, mode: 'deleted' });
    }

    return NextResponse.json({ error: 'Acción inválida' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Error interno' },
      { status: 500 }
    );
  }
}
