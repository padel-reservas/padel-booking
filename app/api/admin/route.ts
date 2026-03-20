import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const adminPin = process.env.ADMIN_PIN!;

const supabase = createClient(supabaseUrl, serviceRoleKey);

type MatchPayloadInput = {
  match_date?: string | null;
  match_time?: string | null;
  slot_id?: number | null;
  team_a_player_1_id?: number | null;
  team_a_player_2_id?: number | null;
  team_b_player_1_id?: number | null;
  team_b_player_2_id?: number | null;
  set1_a?: number | null;
  set1_b?: number | null;
  set2_a?: number | null;
  set2_b?: number | null;
  set3_a?: number | null;
  set3_b?: number | null;
  winner_team?: string | null;
  source?: string | null;
  notes?: string | null;
  submitted_by_player_id?: number | null;
  submitted_at?: string | null;
};

function ok(data: Record<string, any> = {}, status = 200) {
  return NextResponse.json({ ok: true, ...data }, { status });
}

function fail(error: string, status = 400, extra: Record<string, any> = {}) {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

function normalizeName(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

function isPositiveInteger(value: unknown) {
  return Number.isInteger(value) && Number(value) > 0;
}

function isNonNegativeIntegerOrNull(value: unknown) {
  return value === null || value === undefined || (Number.isInteger(value) && Number(value) >= 0);
}

async function runRecalculateRankings() {
  const { error } = await supabase.rpc('recalculate_rankings_v2');

  if (error) {
    throw new Error(`No se pudo recalcular rankings: ${error.message}`);
  }
}

async function getSlotPlayers(slotId: number) {
  const { data, error } = await supabase
    .from('players')
    .select('id, name, created_at')
    .eq('slot_id', slotId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`No se pudieron leer los jugadores del turno: ${error.message}`);
  }

  return data || [];
}

async function ensureSlotExists(slotId: number) {
  const { data, error } = await supabase
    .from('slots')
    .select('id')
    .eq('id', slotId)
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo validar el turno: ${error.message}`);
  }

  if (!data) {
    throw new Error('El turno indicado no existe.');
  }
}

async function getRankingPlayersMap() {
  const { data, error } = await supabase
    .from('ranking_players')
    .select('id, name');

  if (error) {
    throw new Error(`No se pudieron leer los jugadores del ranking: ${error.message}`);
  }

  const byId = new Map<number, { id: number; name: string }>();
  const byNormalizedName = new Map<string, { id: number; name: string }>();

  for (const player of data || []) {
    byId.set(player.id, player);
    byNormalizedName.set(normalizeName(player.name), player);
  }

  return { byId, byNormalizedName, rows: data || [] };
}

async function validateSubmitterForSlot(slotId: number, submittedByPlayerId: number) {
  const slotPlayers = await getSlotPlayers(slotId);
  const firstFour = slotPlayers.slice(0, 4);

  if (firstFour.length !== 4) {
    throw new Error('El turno debe tener exactamente 4 jugadores para cargar resultado.');
  }

  const slotNames = firstFour.map((p) => normalizeName(p.name));
  const { rows: rankingPlayers } = await getRankingPlayersMap();

  const allowedRankingIds = rankingPlayers
    .filter((p) => slotNames.includes(normalizeName(p.name)))
    .map((p) => p.id);

  if (!allowedRankingIds.includes(submittedByPlayerId)) {
    throw new Error('Solo uno de los 4 jugadores del turno puede cargar el resultado.');
  }
}

function validateSetPair(a: unknown, b: unknown, label: string) {
  if (!isNonNegativeIntegerOrNull(a) || !isNonNegativeIntegerOrNull(b)) {
    throw new Error(`${label} tiene valores inválidos.`);
  }

  const bothNull = (a === null || a === undefined) && (b === null || b === undefined);
  const bothPresent = Number.isInteger(a) && Number.isInteger(b);

  if (!bothNull && !bothPresent) {
    throw new Error(`${label} debe tener ambos valores completos o ambos vacíos.`);
  }
}

function validateMatchPayload(input: MatchPayloadInput) {
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
  } = input;

  if (!match_date || typeof match_date !== 'string') {
    throw new Error('Falta match_date.');
  }

  if (!match_time || typeof match_time !== 'string') {
    throw new Error('Falta match_time.');
  }

  if (!isPositiveInteger(slot_id)) {
    throw new Error('Falta slot_id válido.');
  }

  const ids = [
    team_a_player_1_id,
    team_a_player_2_id,
    team_b_player_1_id,
    team_b_player_2_id,
  ];

  if (!ids.every(isPositiveInteger)) {
    throw new Error('Los 4 jugadores del partido son obligatorios.');
  }

  const uniqueIds = new Set(ids as number[]);
  if (uniqueIds.size !== 4) {
    throw new Error('No puede haber jugadores repetidos en un mismo partido.');
  }

  if (winner_team !== 'A' && winner_team !== 'B') {
    throw new Error('winner_team debe ser "A" o "B".');
  }

  validateSetPair(set1_a, set1_b, 'Set 1');
  validateSetPair(set2_a, set2_b, 'Set 2');
  validateSetPair(set3_a, set3_b, 'Set 3');

  const set1Present = Number.isInteger(set1_a) && Number.isInteger(set1_b);
  const set2Present = Number.isInteger(set2_a) && Number.isInteger(set2_b);

  if (!set1Present || !set2Present) {
    throw new Error('Set 1 y Set 2 son obligatorios.');
  }
}

async function ensureRankingPlayersExist(playerIds: number[]) {
  const uniqueIds = [...new Set(playerIds)];
  const { byId } = await getRankingPlayersMap();

  for (const id of uniqueIds) {
    if (!byId.has(id)) {
      throw new Error(`El jugador de ranking con id ${id} no existe.`);
    }
  }
}

async function ensureNoExistingMatchForSlot(slotId: number, excludedMatchId?: number) {
  let query = supabase
    .from('matches')
    .select('id, slot_id')
    .eq('slot_id', slotId);

  if (excludedMatchId) {
    query = query.neq('id', excludedMatchId);
  }

  const { data, error } = await query.limit(1);

  if (error) {
    throw new Error(`No se pudo validar si el turno ya tiene resultado: ${error.message}`);
  }

  if ((data || []).length > 0) {
    throw new Error('Ese turno ya tiene resultado cargado.');
  }
}

function buildMatchPayload(body: MatchPayloadInput) {
  return {
    match_date: body.match_date!,
    match_time: body.match_time!,
    slot_id: body.slot_id!,
    team_a_player_1_id: body.team_a_player_1_id!,
    team_a_player_2_id: body.team_a_player_2_id!,
    team_b_player_1_id: body.team_b_player_1_id!,
    team_b_player_2_id: body.team_b_player_2_id!,
    set1_a: body.set1_a ?? null,
    set1_b: body.set1_b ?? null,
    set2_a: body.set2_a ?? null,
    set2_b: body.set2_b ?? null,
    set3_a: body.set3_a ?? null,
    set3_b: body.set3_b ?? null,
    winner_team: body.winner_team!,
    source: body.source || 'slot',
    notes: body.notes?.trim() ? body.notes.trim() : null,
  };
}

async function ensurePlayerRegistrationExists(playerId: number) {
  const { data, error } = await supabase
    .from('players')
    .select('id')
    .eq('id', playerId)
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo validar el jugador del turno: ${error.message}`);
  }

  if (!data) {
    throw new Error('El jugador del turno no existe.');
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const action = String(body?.action || '').trim();
    const pin = body?.pin;

    if (!action) {
      return fail('Falta action.', 400);
    }

    if (action === 'selfTogglePaid') {
      const playerId = Number(body?.playerId);
      const paid = body?.paid;

      if (!isPositiveInteger(playerId) || typeof paid !== 'boolean') {
        return fail('Faltan datos válidos para actualizar pago.', 400);
      }

      await ensurePlayerRegistrationExists(playerId);

      const { error } = await supabase
        .from('players')
        .update({ paid })
        .eq('id', playerId);

      if (error) {
        return fail(error.message, 400);
      }

      return ok({ mode: 'self-paid-updated' });
    }

    if (action === 'submitMatch') {
      const submittedByPlayerId = Number(body?.submitted_by_player_id);

      if (!isPositiveInteger(submittedByPlayerId)) {
        return fail('Falta submitted_by_player_id válido.', 400);
      }

      try {
        validateMatchPayload(body);
        await ensureSlotExists(Number(body.slot_id));
        await ensureNoExistingMatchForSlot(Number(body.slot_id));
        await ensureRankingPlayersExist([
          Number(body.team_a_player_1_id),
          Number(body.team_a_player_2_id),
          Number(body.team_b_player_1_id),
          Number(body.team_b_player_2_id),
        ]);
        await validateSubmitterForSlot(Number(body.slot_id), submittedByPlayerId);
      } catch (validationError: any) {
        return fail(validationError?.message || 'Datos inválidos para submitMatch.', 400);
      }

      const payload = {
        ...buildMatchPayload(body),
        submitted_by_player_id: submittedByPlayerId,
        submitted_at: new Date().toISOString(),
      };

      const { error } = await supabase.from('matches').insert(payload);

      if (error) {
        return fail(error.message, 400);
      }

      await runRecalculateRankings();
      return ok({ mode: 'submitted' });
    }

    if (!pin || pin !== adminPin) {
      return fail('PIN inválido', 401);
    }

    if (action === 'noop') {
      return ok();
    }

    if (action === 'createSlot') {
      const date = String(body?.date || '').trim();
      const time = String(body?.time || '').trim();

      if (!date || !time) {
        return fail('Faltan date o time.', 400);
      }

      const { error } = await supabase.from('slots').insert({ date, time });

      if (error) {
        return fail(error.message, 400);
      }

      return ok();
    }

    if (action === 'deleteSlot') {
      const slotId = Number(body?.slotId);

      if (!isPositiveInteger(slotId)) {
        return fail('Falta slotId válido.', 400);
      }

      const { data: relatedMatches, error: relatedMatchesError } = await supabase
        .from('matches')
        .select('id')
        .eq('slot_id', slotId);

      if (relatedMatchesError) {
        return fail(
          `No se pudieron leer los partidos relacionados al turno: ${relatedMatchesError.message}`,
          400
        );
      }

      if ((relatedMatches || []).length > 0) {
        const matchIds = relatedMatches.map((m) => m.id);

        const { error: detachError } = await supabase
          .from('matches')
          .update({ slot_id: null })
          .in('id', matchIds);

        if (detachError) {
          return fail(
            `No se pudo desvincular el partido del turno antes de borrar: ${detachError.message}`,
            400
          );
        }
      }

      const { error } = await supabase.from('slots').delete().eq('id', slotId);

      if (error) {
        return fail(error.message, 400);
      }

      return ok({ mode: 'slot-deleted-kept-matches' });
    }

    if (action === 'togglePaid') {
      const playerId = Number(body?.playerId);
      const paid = body?.paid;

      if (!isPositiveInteger(playerId) || typeof paid !== 'boolean') {
        return fail('Faltan datos válidos para actualizar pago.', 400);
      }

      await ensurePlayerRegistrationExists(playerId);

      const { error } = await supabase
        .from('players')
        .update({ paid })
        .eq('id', playerId);

      if (error) {
        return fail(error.message, 400);
      }

      return ok();
    }

    if (action === 'addRankingPlayer') {
      const rawName = String(body?.name || '').trim();

      if (!rawName) {
        return fail('Falta el nombre del jugador.', 400);
      }

      const normalized = normalizeName(rawName);

      const { data: existingPlayers, error: existingError } = await supabase
        .from('ranking_players')
        .select('id, name');

      if (existingError) {
        return fail(existingError.message, 400);
      }

      const alreadyExists = (existingPlayers || []).some(
        (p) => normalizeName(p.name) === normalized
      );

      if (alreadyExists) {
        return fail('Ese jugador ya existe en ranking_players.', 400);
      }

      const { data: configRow, error: configError } = await supabase
        .from('ranking_config')
        .select('initial_rating')
        .eq('id', 1)
        .single();

      if (configError) {
        return fail(`No se pudo leer ranking_config: ${configError.message}`, 400);
      }

      const initialRating = Number(configRow?.initial_rating);

      if (!Number.isFinite(initialRating)) {
        return fail('initial_rating inválido en ranking_config.', 400);
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
        return fail(error.message, 400);
      }

      return ok({ mode: 'ranking-player-added' });
    }

    if (action === 'saveMatch') {
      const matchId = body?.matchId ? Number(body.matchId) : null;

      try {
        validateMatchPayload(body);
        await ensureSlotExists(Number(body.slot_id));
        await ensureRankingPlayersExist([
          Number(body.team_a_player_1_id),
          Number(body.team_a_player_2_id),
          Number(body.team_b_player_1_id),
          Number(body.team_b_player_2_id),
        ]);
        await ensureNoExistingMatchForSlot(Number(body.slot_id), matchId || undefined);
      } catch (validationError: any) {
        return fail(validationError?.message || 'Datos inválidos para saveMatch.', 400);
      }

      const payload = buildMatchPayload(body);

      if (matchId) {
        const { error } = await supabase
          .from('matches')
          .update(payload)
          .eq('id', matchId);

        if (error) {
          return fail(error.message, 400);
        }

        await runRecalculateRankings();
        return ok({ mode: 'updated' });
      }

      const submittedByPlayerIdRaw = body?.submitted_by_player_id;
      const submittedByPlayerId = submittedByPlayerIdRaw ? Number(submittedByPlayerIdRaw) : null;

      if (submittedByPlayerId !== null && !isPositiveInteger(submittedByPlayerId)) {
        return fail('submitted_by_player_id inválido.', 400);
      }

      const insertPayload = {
        ...payload,
        submitted_by_player_id: submittedByPlayerId,
        submitted_at:
          body?.submitted_at ||
          (submittedByPlayerId ? new Date().toISOString() : null),
      };

      const { error } = await supabase.from('matches').insert(insertPayload);

      if (error) {
        return fail(error.message, 400);
      }

      await runRecalculateRankings();
      return ok({ mode: 'inserted' });
    }

    if (action === 'deleteMatch') {
      const matchId = Number(body?.matchId);

      if (!isPositiveInteger(matchId)) {
        return fail('Falta matchId válido.', 400);
      }

      const { error } = await supabase.from('matches').delete().eq('id', matchId);

      if (error) {
        return fail(error.message, 400);
      }

      await runRecalculateRankings();
      return ok({ mode: 'deleted' });
    }

    return fail('Acción inválida.', 400);
  } catch (err: any) {
    return fail(err?.message || 'Error interno', 500);
  }
}
