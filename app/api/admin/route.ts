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

const MAX_PLAYERS = 4;
const SUGGESTION_TYPES = ['availability', 'need_players', 'replacement_needed'];

function cleanName(raw: unknown) {
  return String(raw || '').trim().slice(0, 60);
}

function sameName(a: unknown, b: unknown) {
  const x = String(a || '').trim().toLowerCase();
  const y = String(b || '').trim().toLowerCase();
  return !!x && x === y;
}

function cleanTime(raw: unknown) {
  const value = String(raw || '').trim();
  const match = value.match(/^(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : '';
}

function cleanDate(raw: unknown) {
  const value = String(raw || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
}

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

// Crea un turno con jugadores y marca la sugerencia como resuelta (lo usan "Turno sacado" y "crear desde alternativa")
async function createSlotForSuggestion(
  slotDate: string,
  slotTime: string,
  names: string[],
  suggestionId: number,
  suggestionPatch: Record<string, unknown>
) {
  const { data: existingSlot, error: existingSlotError } = await supabase
    .from('slots')
    .select('id')
    .eq('date', slotDate)
    .eq('time', slotTime)
    .maybeSingle();

  if (existingSlotError) return bad(`No se pudo validar si el turno ya existía: ${existingSlotError.message}`);
  if (existingSlot) return bad('Ya existe un turno con esa fecha y hora en la app.');

  const { data: createdSlot, error: createSlotError } = await supabase
    .from('slots')
    .insert({ date: slotDate, time: slotTime })
    .select()
    .single();

  if (createSlotError || !createdSlot) {
    return bad(`No se pudo crear el turno: ${createSlotError?.message || 'error desconocido'}`);
  }

  const uniqueNames: string[] = [];
  for (const raw of names) {
    const name = cleanName(raw);
    if (name && !uniqueNames.some((n) => sameName(n, name))) uniqueNames.push(name);
  }

  const playersToInsert = uniqueNames.slice(0, MAX_PLAYERS);
  if (playersToInsert.length > 0) {
    const { error: insertPlayersError } = await supabase
      .from('players')
      .insert(playersToInsert.map((name) => ({ slot_id: createdSlot.id, name, paid: false })));

    if (insertPlayersError) {
      return bad(`Se creó el turno, pero no se pudieron agregar los jugadores: ${insertPlayersError.message}`);
    }
  }

  const { error: updateSuggestionError } = await supabase
    .from('suggestions')
    .update(suggestionPatch)
    .eq('id', suggestionId);

  if (updateSuggestionError) {
    return bad(`Se creó el turno, pero no se pudo actualizar la sugerencia: ${updateSuggestionError.message}`);
  }

  return NextResponse.json({ ok: true, slotId: createdSlot.id });
}

// ===== Cuadro eliminación simple =====
// Pasa al ganador a la ronda siguiente (o lo saca, si winnerPairId es null)
async function koSetNextSlot(match: { tournament_key: string; round: number; slot: number }, winnerPairId: number | null) {
  if (match.round >= 4) return null;
  const field = match.slot % 2 === 0 ? 'pair1_id' : 'pair2_id';
  const { error } = await supabase
    .from('ko_matches')
    .update({ [field]: winnerPairId, updated_at: new Date().toISOString() })
    .eq('tournament_key', match.tournament_key)
    .eq('round', match.round + 1)
    .eq('slot', Math.floor(match.slot / 2));
  return error;
}

async function koNextMatchPlayed(match: { tournament_key: string; round: number; slot: number }) {
  if (match.round >= 4) return false;
  const { data } = await supabase
    .from('ko_matches')
    .select('status')
    .eq('tournament_key', match.tournament_key)
    .eq('round', match.round + 1)
    .eq('slot', Math.floor(match.slot / 2))
    .maybeSingle();
  return data?.status === 'played';
}

function normalizePaymentMethod(raw: unknown): 'venmo' | 'zelle' | null {
  const value = String(raw || '')
    .trim()
    .toLowerCase();

  if (value === 'venmo' || value === 'zelle') {
    return value;
  }

  return null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { pin, action } = body;

    // ===== Acciones públicas (sin PIN) con validación en el servidor =====

    if (action === 'reportPayment') {
      const payerPlayerId = Number(body.payerPlayerId);
      const coveredPlayerIds: number[] = Array.isArray(body.coveredPlayerIds)
        ? body.coveredPlayerIds.map((id: unknown) => Number(id)).filter((id: number) => Number.isFinite(id))
        : [];
      const paymentMethod = normalizePaymentMethod(body.paymentMethod);
      const notes = String(body.notes || '').trim() || null;

      let amount: number | null = null;
      if (body.amount !== null && body.amount !== undefined && body.amount !== '') {
        amount = Number(body.amount);
        if (!Number.isFinite(amount) || amount <= 0 || amount > 10000) {
          return NextResponse.json({ error: 'Monto inválido' }, { status: 400 });
        }
      }

      if (!payerPlayerId || coveredPlayerIds.length === 0 || !paymentMethod) {
        return NextResponse.json({ error: 'Faltan datos del pago' }, { status: 400 });
      }

      // Todos (el que paga y los cubiertos) tienen que ser del mismo turno
      const allIds = Array.from(new Set([payerPlayerId, ...coveredPlayerIds]));
      const { data: playersRows, error: playersError } = await supabase
        .from('players')
        .select('id, slot_id')
        .in('id', allIds);

      if (playersError) {
        return NextResponse.json({ error: playersError.message }, { status: 400 });
      }

      const slotIds = new Set((playersRows || []).map((p) => p.slot_id));
      if ((playersRows || []).length !== allIds.length || slotIds.size !== 1) {
        return NextResponse.json(
          { error: 'Los jugadores del pago tienen que pertenecer al mismo turno.' },
          { status: 400 }
        );
      }

      const { data: paymentInsert, error: paymentError } = await supabase
        .from('payments')
        .insert({
          payer_player_id: payerPlayerId,
          payment_method: paymentMethod,
          status: 'reported',
          amount,
          notes,
        })
        .select('id')
        .single();

      if (paymentError || !paymentInsert) {
        return NextResponse.json(
          { error: `No se pudo guardar el pago: ${paymentError?.message || 'error desconocido'}` },
          { status: 400 }
        );
      }

      const { error: allocationsError } = await supabase.from('payment_allocations').insert(
        Array.from(new Set(coveredPlayerIds)).map((playerId) => ({
          payment_id: paymentInsert.id,
          player_id: playerId,
        }))
      );

      if (allocationsError) {
        await supabase.from('payments').delete().eq('id', paymentInsert.id);
        return NextResponse.json(
          { error: `No se pudieron guardar los jugadores cubiertos: ${allocationsError.message}` },
          { status: 400 }
        );
      }

      return NextResponse.json({ ok: true, mode: 'payment-reported' });
    }

    if (action === 'recordPaymentReminders') {
      const playerIds: number[] = Array.isArray(body.playerIds)
        ? body.playerIds.map((id: unknown) => Number(id)).filter((id: number) => Number.isFinite(id))
        : [];

      if (playerIds.length === 0 || playerIds.length > 8) {
        return NextResponse.json({ error: 'Lista de jugadores inválida' }, { status: 400 });
      }

      for (const playerId of playerIds) {
        const { error } = await supabase.rpc('record_player_payment_reminder', {
          p_player_id: playerId,
        });
        if (error) {
          return NextResponse.json({ error: error.message }, { status: 400 });
        }
      }

      return NextResponse.json({ ok: true, mode: 'reminders-recorded' });
    }

    if (action === 'submitTournamentResult') {
      const matchId = Number(body.matchId);
      const submittedBy = String(body.submittedByName || '').trim().toLowerCase();
      const isAdmin = !!pin && pin === adminPin;

      const toInt = (v: unknown) => (v === null || v === undefined || v === '' ? NaN : parseInt(String(v), 10));
      const s1p1 = toInt(body.set1p1);
      const s1p2 = toInt(body.set1p2);
      const s2p1 = toInt(body.set2p1);
      const s2p2 = toInt(body.set2p2);
      let s3p1: number | null = toInt(body.set3p1);
      let s3p2: number | null = toInt(body.set3p2);

      const validSet = (n: number) => Number.isInteger(n) && n >= 0 && n <= 99;
      if (!matchId || ![s1p1, s1p2, s2p1, s2p2].every(validSet)) {
        return NextResponse.json({ error: 'Cargá al menos los primeros 2 sets.' }, { status: 400 });
      }

      const { data: match, error: matchReadError } = await supabase
        .from('tournament_matches')
        .select('id, pair1_id, pair2_id, round, group_name, status')
        .eq('id', matchId)
        .maybeSingle();

      if (matchReadError || !match) {
        return NextResponse.json({ error: 'No se encontró el partido.' }, { status: 400 });
      }

      if (match.status === 'played') {
        return NextResponse.json({ error: 'Este partido ya tiene resultado.' }, { status: 400 });
      }

      const { data: pairs, error: pairsError } = await supabase
        .from('tournament_pairs')
        .select('id, player1_name, player2_name')
        .in('id', [match.pair1_id, match.pair2_id]);

      const pair1 = (pairs || []).find((p) => p.id === match.pair1_id);
      const pair2 = (pairs || []).find((p) => p.id === match.pair2_id);

      if (pairsError || !pair1 || !pair2) {
        return NextResponse.json({ error: 'No se encontraron las parejas.' }, { status: 400 });
      }

      const matchPlayerNames = [pair1.player1_name, pair1.player2_name, pair2.player1_name, pair2.player2_name]
        .map((n) => String(n || '').trim());

      if (!isAdmin && !matchPlayerNames.some((n) => n.toLowerCase() === submittedBy)) {
        return NextResponse.json(
          { error: 'Solo los jugadores del partido o el admin pueden cargar el resultado.' },
          { status: 403 }
        );
      }

      let setsP1 = 0;
      let setsP2 = 0;
      if (s1p1 > s1p2) setsP1++; else setsP2++;
      if (s2p1 > s2p2) setsP1++; else setsP2++;

      if (setsP1 === 1 && setsP2 === 1) {
        if (!validSet(s3p1) || !validSet(s3p2)) {
          return NextResponse.json({ error: 'Hay empate en sets, cargá el 3er set.' }, { status: 400 });
        }
        if (s3p1 > s3p2) setsP1++; else setsP2++;
      } else {
        s3p1 = null;
        s3p2 = null;
      }

      const winnerPairId = setsP1 > setsP2 ? match.pair1_id : match.pair2_id;

      const { error: tournamentError } = await supabase
        .from('tournament_matches')
        .update({
          set1_pair1: s1p1, set1_pair2: s1p2,
          set2_pair1: s2p1, set2_pair2: s2p2,
          set3_pair1: s3p1, set3_pair2: s3p2,
          winner_pair_id: winnerPairId,
          status: 'played',
          played_at: new Date().toISOString(),
        })
        .eq('id', matchId);

      if (tournamentError) {
        return NextResponse.json(
          { error: `No se pudo guardar el resultado: ${tournamentError.message}` },
          { status: 400 }
        );
      }

      const { data: rankingData, error: rankingError } = await supabase
        .from('ranking_players')
        .select('id, name')
        .in('name', matchPlayerNames);

      if (rankingError || !rankingData) {
        return NextResponse.json(
          { error: `No se pudieron obtener los jugadores del ranking: ${rankingError?.message}` },
          { status: 400 }
        );
      }

      const findId = (name: string) =>
        rankingData.find((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase())?.id;

      const a1Id = findId(matchPlayerNames[0]);
      const a2Id = findId(matchPlayerNames[1]);
      const b1Id = findId(matchPlayerNames[2]);
      const b2Id = findId(matchPlayerNames[3]);

      if (!a1Id || !a2Id || !b1Id || !b2Id) {
        return NextResponse.json(
          { error: 'Resultado del torneo guardado, pero no se encontraron todos los jugadores en el ranking.' },
          { status: 400 }
        );
      }

      const multiplierMap: Record<string, number> = {
        groups: 1.5,
        quarters: 2.0,
        semis: 2.5,
        final: 3.0,
        third_place: 2.5,
      };

      const { error: matchError } = await supabase.from('matches').insert({
        match_date: new Date().toISOString().slice(0, 10),
        match_time: null,
        slot_id: null,
        team_a_player_1_id: a1Id,
        team_a_player_2_id: a2Id,
        team_b_player_1_id: b1Id,
        team_b_player_2_id: b2Id,
        set1_a: s1p1, set1_b: s1p2,
        set2_a: s2p1, set2_b: s2p2,
        set3_a: s3p1, set3_b: s3p2,
        winner_team: winnerPairId === match.pair1_id ? 'A' : 'B',
        source: 'torneo',
        tournament_multiplier: multiplierMap[match.round] ?? 1.5,
        notes: `Torneo ${match.round} — Grupo ${match.group_name || ''}`.trim(),
      });

      if (matchError) {
        return NextResponse.json(
          { error: `Se guardó el resultado del torneo pero no se pudo actualizar el ranking: ${matchError.message}` },
          { status: 400 }
        );
      }

      await runRecalculateRankings();
      return NextResponse.json({ ok: true, mode: 'tournament-result-saved' });
    }

    // ===== Turnos y sugerencias (públicas, con validación) =====

    if (action === 'joinSlot') {
      const slotId = Number(body.slotId);
      const name = cleanName(body.name);
      if (!slotId || !name) return bad('Poné tu nombre');

      const { data: slot } = await supabase.from('slots').select('id').eq('id', slotId).maybeSingle();
      if (!slot) return bad('No se encontró el turno.');

      const { data: current, error: currentError } = await supabase
        .from('players')
        .select('name')
        .eq('slot_id', slotId);
      if (currentError) return bad(currentError.message);
      if ((current || []).some((p) => sameName(p.name, name))) {
        return bad('Ese nombre ya está anotado en este turno');
      }

      const { error } = await supabase.from('players').insert({ slot_id: slotId, name, paid: false });
      if (error) return bad(`No se pudo anotar: ${error.message}`);
      return NextResponse.json({ ok: true });
    }

    if (action === 'leaveSlot') {
      const playerId = Number(body.playerId);
      const isAdmin = !!pin && pin === adminPin;
      if (!playerId) return bad('Falta playerId');

      const { data: player, error: playerError } = await supabase
        .from('players')
        .select('id, name, slot_id')
        .eq('id', playerId)
        .maybeSingle();
      if (playerError || !player) return bad('No se encontró el jugador.');

      const identities: unknown[] = Array.isArray(body.names) ? body.names : [];
      if (!isAdmin && !identities.some((n) => sameName(n, player.name))) {
        return bad('Solo podés borrarte a vos mismo.', 403);
      }

      const { data: slot } = await supabase
        .from('slots')
        .select('id, date, time')
        .eq('id', player.slot_id)
        .maybeSingle();
      const { count: playersBefore } = await supabase
        .from('players')
        .select('id', { count: 'exact', head: true })
        .eq('slot_id', player.slot_id);

      const { error } = await supabase.from('players').delete().eq('id', playerId);
      if (error) return bad(`No se pudo borrar: ${error.message}`);

      // Si el turno estaba justo completo (4 y sin espera), avisamos que falta 1
      if (slot && playersBefore === MAX_PLAYERS) {
        const { error: suggestionError } = await supabase.from('suggestions').insert({
          author_name: 'Sistema',
          type: 'replacement_needed',
          message: `${player.name} se bajó del turno del ${slot.date} a las ${slot.time}. Falta 1 jugador.`,
          slot_id: slot.id,
          suggested_date: slot.date,
          suggested_time: slot.time,
          is_urgent: true,
          status: 'open',
          is_booking_request: false,
          booking_status: 'open',
        });
        if (suggestionError) {
          return bad(`Se borró el jugador, pero no se pudo crear la sugerencia: ${suggestionError.message}`);
        }
      }

      return NextResponse.json({ ok: true });
    }

    if (action === 'createSuggestion') {
      const author = cleanName(body.author);
      const isBooking = body.isBooking === true;
      const type = SUGGESTION_TYPES.includes(body.type) ? body.type : 'availability';
      const date = cleanDate(body.date);
      const time = cleanTime(body.time);
      const rawMessage = String(body.message || '').trim().slice(0, 1000);

      if (!author) return bad('Elegí tu jugador en Ranking o escribí tu nombre.');
      if (isBooking && (!date || !time)) return bad('Para sacar turno, elegí fecha y hora.');
      if (!isBooking && !rawMessage) return bad('Escribí una sugerencia.');

      const { error } = await supabase.from('suggestions').insert({
        author_name: author,
        type,
        message: isBooking ? rawMessage || `Sacar turno ${date} ${time}` : rawMessage,
        suggested_date: date || null,
        suggested_time: time || null,
        is_urgent: false,
        status: 'open',
        is_booking_request: isBooking,
        booking_status: 'open',
      });
      if (error) return bad(`No se pudo guardar la sugerencia: ${error.message}`);
      return NextResponse.json({ ok: true });
    }

    if (action === 'editSuggestion') {
      const suggestionId = Number(body.suggestionId);
      const isAdmin = !!pin && pin === adminPin;
      const { data: sug, error: sugError } = await supabase
        .from('suggestions')
        .select('*')
        .eq('id', suggestionId)
        .maybeSingle();
      if (sugError || !sug) return bad('No se encontró la sugerencia.');

      if (sug.status !== 'open' || (sug.is_booking_request && sug.booking_status !== 'open')) {
        return bad('La sugerencia ya no se puede editar.');
      }
      if (!isAdmin && !sameName(body.editorName, sug.author_name)) {
        return bad('Solo el autor puede editar la sugerencia.', 403);
      }

      const date = cleanDate(body.date);
      const time = cleanTime(body.time);
      const message = String(body.message || '').trim().slice(0, 1000);
      if (sug.is_booking_request && (!date || !time)) return bad('Para sacar turno, elegí fecha y hora.');
      if (!message) return bad('La sugerencia no puede quedar vacía.');

      const { error } = await supabase
        .from('suggestions')
        .update({ message, suggested_date: date || null, suggested_time: time || null })
        .eq('id', suggestionId);
      if (error) return bad(`No se pudo editar la sugerencia: ${error.message}`);
      return NextResponse.json({ ok: true });
    }

    if (action === 'joinSuggestion' || action === 'leaveSuggestion') {
      const suggestionId = Number(body.suggestionId);
      const name = cleanName(body.name);
      if (!suggestionId || !name) return bad('Elegí tu jugador en Ranking o escribí tu nombre.');

      if (action === 'joinSuggestion') {
        const { data: sug } = await supabase.from('suggestions').select('id, status').eq('id', suggestionId).maybeSingle();
        if (!sug || sug.status !== 'open') return bad('La sugerencia ya no está abierta.');

        const { error } = await supabase
          .from('suggestion_responses')
          .insert({ suggestion_id: suggestionId, responder_name: name });
        if (error) {
          const msg = (error.message || '').toLowerCase();
          return bad(msg.includes('duplicate') || msg.includes('unique')
            ? 'Ese nombre ya se sumó a esta sugerencia.'
            : `No se pudo sumar: ${error.message}`);
        }
      } else {
        const { error } = await supabase
          .from('suggestion_responses')
          .delete()
          .eq('suggestion_id', suggestionId)
          .ilike('responder_name', name);
        if (error) return bad(`No se pudo salir: ${error.message}`);
      }
      return NextResponse.json({ ok: true });
    }

    if (action === 'joinAlternative' || action === 'leaveAlternative') {
      const alternativeId = Number(body.alternativeId);
      const name = cleanName(body.name);
      if (!alternativeId || !name) return bad('Elegí tu jugador en Ranking o escribí tu nombre.');

      if (action === 'joinAlternative') {
        const { data: alt } = await supabase
          .from('suggestion_alternatives')
          .select('id')
          .eq('id', alternativeId)
          .maybeSingle();
        if (!alt) return bad('No se encontró la opción.');

        const { error } = await supabase
          .from('suggestion_alternative_joiners')
          .insert({ alternative_id: alternativeId, responder_name: name });
        if (error) {
          const msg = (error.message || '').toLowerCase();
          return bad(msg.includes('duplicate') || msg.includes('unique')
            ? 'Ese nombre ya se sumó a esta opción.'
            : `No se pudo sumar a la opción: ${error.message}`);
        }
      } else {
        const { error } = await supabase
          .from('suggestion_alternative_joiners')
          .delete()
          .eq('alternative_id', alternativeId)
          .ilike('responder_name', name);
        if (error) return bad(`No se pudo salir de la opción: ${error.message}`);
      }
      return NextResponse.json({ ok: true });
    }

    if (action === 'submitKoResult') {
      const matchId = Number(body.matchId);
      const isAdmin = !!pin && pin === adminPin;

      const { data: match } = await supabase.from('ko_matches').select('*').eq('id', matchId).maybeSingle();
      if (!match) return bad('No se encontró el partido.');
      if (match.status !== 'pending') return bad('Este partido ya tiene resultado.');
      if (!match.pair1_id || !match.pair2_id) return bad('Todavía no están definidas las dos parejas.');

      const { data: pairs } = await supabase
        .from('ko_pairs')
        .select('id, player1_name, player2_name')
        .in('id', [match.pair1_id, match.pair2_id]);
      const names = (pairs || []).flatMap((p) => [p.player1_name, p.player2_name]);
      if (!isAdmin && !names.some((n) => sameName(n, body.submittedByName))) {
        return bad('Solo los jugadores del partido o el admin pueden cargar el resultado.', 403);
      }

      const toInt = (v: unknown) => (v === null || v === undefined || v === '' ? NaN : parseInt(String(v), 10));
      const validSet = (n: number) => Number.isInteger(n) && n >= 0 && n <= 99;
      const s1p1 = toInt(body.set1p1), s1p2 = toInt(body.set1p2);
      const s2p1 = toInt(body.set2p1), s2p2 = toInt(body.set2p2);
      let s3p1: number | null = toInt(body.set3p1), s3p2: number | null = toInt(body.set3p2);

      if (![s1p1, s1p2, s2p1, s2p2].every(validSet)) return bad('Cargá al menos los primeros 2 sets.');
      if (s1p1 === s1p2 || s2p1 === s2p2) return bad('Un set no puede terminar empatado.');

      let w1 = 0, w2 = 0;
      if (s1p1 > s1p2) w1++; else w2++;
      if (s2p1 > s2p2) w1++; else w2++;
      if (w1 === 1 && w2 === 1) {
        if (!validSet(s3p1) || !validSet(s3p2) || s3p1 === s3p2) return bad('Hay empate en sets, cargá el 3er set.');
        if (s3p1 > s3p2) w1++; else w2++;
      } else {
        s3p1 = null;
        s3p2 = null;
      }

      const winnerPairId = w1 > w2 ? match.pair1_id : match.pair2_id;
      const { error } = await supabase
        .from('ko_matches')
        .update({
          set1_pair1: s1p1, set1_pair2: s1p2,
          set2_pair1: s2p1, set2_pair2: s2p2,
          set3_pair1: s3p1, set3_pair2: s3p2,
          winner_pair_id: winnerPairId,
          walkover: false,
          status: 'played',
          played_at: new Date().toISOString(),
          submitted_by: isAdmin ? 'admin' : cleanName(body.submittedByName),
          updated_at: new Date().toISOString(),
        })
        .eq('id', matchId)
        .eq('status', 'pending');
      if (error) return bad(`No se pudo guardar el resultado: ${error.message}`);

      const advanceError = await koSetNextSlot(match, winnerPairId);
      if (advanceError) return bad(`Se guardó el resultado pero no se pudo avanzar al ganador: ${advanceError.message}`);
      return NextResponse.json({ ok: true });
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

      // Detectar multiplicador según tournament_group del slot
      const { data: slotData } = await supabase
        .from('slots')
        .select('tournament_group')
        .eq('id', slot_id)
        .maybeSingle();

      const tournamentGroup = slotData?.tournament_group ?? null;

      const multiplierMap: Record<string, number> = {
        QF: 2.0,
        SF: 2.5,
        F: 3.0,
        FIN: 3.0,
        TP: 2.0,
        A: 1.5,
        B: 1.5,
        C: 1.5,
        D: 1.5,
      };

      const tournamentMultiplier = tournamentGroup ? (multiplierMap[tournamentGroup] ?? 1.0) : 1.0;
      const matchSource = tournamentGroup ? 'torneo' : (source || 'slot');

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
        source: matchSource,
        notes: notes || null,
        submitted_by_player_id,
        submitted_at: new Date().toISOString(),
        tournament_multiplier: tournamentMultiplier,
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

    if (action === 'selfTogglePaid') {
      const { playerId, paid } = body;

      if (!playerId || typeof paid !== 'boolean') {
        return NextResponse.json({ error: 'Faltan datos para actualizar pago' }, { status: 400 });
      }

      const { error } = await supabase.from('players').update({ paid }).eq('id', playerId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json({ ok: true, mode: 'self-paid-updated' });
    }

    if (action === 'approvePayment' || action === 'rejectPayment') {
      const paymentId = String(body.paymentId || '');
      if (!paymentId) {
        return NextResponse.json({ error: 'Falta paymentId' }, { status: 400 });
      }

      const { error } =
        action === 'approvePayment'
          ? await supabase.rpc('approve_payment', { p_payment_id: paymentId, p_verified_by: 'admin' })
          : await supabase.rpc('reject_payment', { p_payment_id: paymentId });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json({ ok: true });
    }

    if (action === 'generateGroupMatches') {
      const tournamentId = Number(body.tournamentId);
      if (!tournamentId) {
        return NextResponse.json({ error: 'Falta tournamentId' }, { status: 400 });
      }

      const { error } = await supabase.rpc('generate_group_matches', { p_tournament_id: tournamentId });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json({ ok: true });
    }

    if (action === 'closeSuggestion') {
      const { error } = await supabase
        .from('suggestions')
        .update({ status: 'resolved' })
        .eq('id', Number(body.suggestionId));
      if (error) return bad(`No se pudo cerrar la sugerencia: ${error.message}`);
      return NextResponse.json({ ok: true });
    }

    if (action === 'markSuggestionNotAvailable') {
      const { error } = await supabase
        .from('suggestions')
        .update({
          booking_status: 'not_available',
          admin_response_type: 'not_available',
          admin_response_message: null,
          admin_responded_at: new Date().toISOString(),
        })
        .eq('id', Number(body.suggestionId));
      if (error) return bad(`No se pudo actualizar la sugerencia: ${error.message}`);
      return NextResponse.json({ ok: true });
    }

    if (action === 'saveSuggestionAlternatives') {
      const suggestionId = Number(body.suggestionId);
      const options: { date: string; time: string; label: string }[] = (Array.isArray(body.options) ? body.options : [])
        .map((o: any) => ({
          date: cleanDate(o?.date),
          time: cleanTime(o?.time),
          label: String(o?.label || '').trim().slice(0, 100),
        }))
        .filter((o: { date: string; time: string }) => o.date && o.time);

      if (!suggestionId) return bad('Falta suggestionId');
      if (options.length === 0) return bad('Cargá al menos una alternativa con fecha y hora.');

      const { error: updateError } = await supabase
        .from('suggestions')
        .update({
          admin_response_type: 'alternative_offered',
          admin_response_message: String(body.message || '').trim().slice(0, 1000) || null,
          admin_responded_at: new Date().toISOString(),
          booking_status: 'open',
        })
        .eq('id', suggestionId);
      if (updateError) return bad(`No se pudo guardar la respuesta admin: ${updateError.message}`);

      const { error: deleteError } = await supabase
        .from('suggestion_alternatives')
        .delete()
        .eq('suggestion_id', suggestionId);
      if (deleteError) return bad(`No se pudieron actualizar las alternativas: ${deleteError.message}`);

      const { error: insertError } = await supabase.from('suggestion_alternatives').insert(
        options.map((o) => ({
          suggestion_id: suggestionId,
          alt_date: o.date,
          alt_time: o.time,
          alt_label: o.label || null,
        }))
      );
      if (insertError) return bad(`No se pudieron guardar las alternativas: ${insertError.message}`);
      return NextResponse.json({ ok: true });
    }

    if (action === 'clearSuggestionAlternatives') {
      const suggestionId = Number(body.suggestionId);
      const { error: deleteError } = await supabase
        .from('suggestion_alternatives')
        .delete()
        .eq('suggestion_id', suggestionId);
      if (deleteError) return bad(`No se pudieron borrar las alternativas: ${deleteError.message}`);

      const { error } = await supabase
        .from('suggestions')
        .update({ admin_response_type: null, admin_response_message: null, admin_responded_at: null })
        .eq('id', suggestionId);
      if (error) return bad(`No se pudo limpiar la respuesta admin: ${error.message}`);
      return NextResponse.json({ ok: true });
    }

    if (action === 'bookSuggestion') {
      const suggestionId = Number(body.suggestionId);
      const { data: sug, error: sugError } = await supabase
        .from('suggestions')
        .select('*')
        .eq('id', suggestionId)
        .maybeSingle();
      if (sugError || !sug) return bad(`No se pudo leer la sugerencia: ${sugError?.message || 'no existe'}`);
      if (!sug.is_booking_request) return bad('Esta acción es solo para sugerencias de sacar turno.');

      const slotDate = cleanDate(sug.suggested_date);
      const slotTime = cleanTime(sug.suggested_time);
      if (!slotDate || !slotTime) return bad('La sugerencia no tiene fecha u hora válidas.');

      const { data: responses, error: responsesError } = await supabase
        .from('suggestion_responses')
        .select('responder_name, created_at')
        .eq('suggestion_id', suggestionId)
        .order('created_at', { ascending: true });
      if (responsesError) return bad(`No se pudieron leer los jugadores sumados: ${responsesError.message}`);

      return await createSlotForSuggestion(
        slotDate,
        slotTime,
        [sug.author_name, ...(responses || []).map((r) => r.responder_name)],
        suggestionId,
        {
          booking_status: 'booked',
          status: 'resolved',
          admin_response_type: 'accepted',
          admin_responded_at: new Date().toISOString(),
        }
      );
    }

    if (action === 'createSlotFromAlternative') {
      const suggestionId = Number(body.suggestionId);
      const alternativeId = Number(body.alternativeId);

      const { data: sug } = await supabase.from('suggestions').select('*').eq('id', suggestionId).maybeSingle();
      const { data: alt } = await supabase
        .from('suggestion_alternatives')
        .select('*')
        .eq('id', alternativeId)
        .eq('suggestion_id', suggestionId)
        .maybeSingle();
      if (!sug || !alt) return bad('No se encontró la sugerencia o la alternativa.');

      const slotDate = cleanDate(alt.alt_date);
      const slotTime = cleanTime(alt.alt_time);
      if (!slotDate || !slotTime) return bad('La alternativa no tiene fecha u hora válidas.');

      const { data: joiners, error: joinersError } = await supabase
        .from('suggestion_alternative_joiners')
        .select('responder_name, created_at')
        .eq('alternative_id', alternativeId)
        .order('created_at', { ascending: true });
      if (joinersError) return bad(`No se pudieron leer los sumados: ${joinersError.message}`);

      const altText = String(body.alternativeText || `${slotDate} ${slotTime}`).slice(0, 200);
      const base = String(sug.admin_response_message || '').trim();

      return await createSlotForSuggestion(
        slotDate,
        slotTime,
        [sug.author_name, ...(joiners || []).map((j) => j.responder_name)],
        suggestionId,
        {
          booking_status: 'booked',
          status: 'resolved',
          admin_response_type: 'accepted',
          admin_response_message: base
            ? `${base}\n\n✅ Se creó turno desde alternativa: ${altText}`
            : `✅ Se creó turno desde alternativa: ${altText}`,
          admin_responded_at: new Date().toISOString(),
        }
      );
    }

    if (action === 'koWalkover') {
      const matchId = Number(body.matchId);
      const winnerPairId = Number(body.winnerPairId);
      const { data: match } = await supabase.from('ko_matches').select('*').eq('id', matchId).maybeSingle();
      if (!match) return bad('No se encontró el partido.');
      if (match.status !== 'pending') return bad('Este partido ya tiene resultado. Borralo primero.');
      if (![match.pair1_id, match.pair2_id].includes(winnerPairId)) return bad('La pareja ganadora no juega este partido.');

      const { error } = await supabase
        .from('ko_matches')
        .update({
          set1_pair1: null, set1_pair2: null, set2_pair1: null, set2_pair2: null, set3_pair1: null, set3_pair2: null,
          winner_pair_id: winnerPairId,
          walkover: true,
          status: 'played',
          played_at: new Date().toISOString(),
          submitted_by: 'admin',
          updated_at: new Date().toISOString(),
        })
        .eq('id', matchId);
      if (error) return bad(error.message);

      const advanceError = await koSetNextSlot(match, winnerPairId);
      if (advanceError) return bad(advanceError.message);
      return NextResponse.json({ ok: true });
    }

    if (action === 'koClearResult') {
      const matchId = Number(body.matchId);
      const { data: match } = await supabase.from('ko_matches').select('*').eq('id', matchId).maybeSingle();
      if (!match) return bad('No se encontró el partido.');
      if (match.status !== 'played') return bad('Este partido no tiene resultado.');
      if (await koNextMatchPlayed(match)) {
        return bad('El partido siguiente ya se jugó. Borrá primero ese resultado.');
      }

      const { error } = await supabase
        .from('ko_matches')
        .update({
          set1_pair1: null, set1_pair2: null, set2_pair1: null, set2_pair2: null, set3_pair1: null, set3_pair2: null,
          winner_pair_id: null,
          walkover: false,
          status: 'pending',
          played_at: null,
          submitted_by: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', matchId);
      if (error) return bad(error.message);

      const advanceError = await koSetNextSlot(match, null);
      if (advanceError) return bad(advanceError.message);
      return NextResponse.json({ ok: true });
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
      const { playerId } = body;

      if (!playerId) {
        return NextResponse.json(
          { error: 'Falta playerId para marcar pago directo' },
          { status: 400 }
        );
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

    if (action === 'updateSlotAmount') {
      const { slotId, amount } = body;

      if (!slotId || amount == null) {
        return NextResponse.json({ error: 'Faltan datos' }, { status: 400 });
      }

      const { error } = await supabase
        .from('slots')
        .update({ amount })
        .eq('id', Number(slotId));

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json({ ok: true });
    }

    if (action === 'updateSlotTournament') {
      const { slotId, tournament_group } = body;

      if (!slotId) {
        return NextResponse.json({ error: 'Falta slotId' }, { status: 400 });
      }

      const { error } = await supabase
        .from('slots')
        .update({ tournament_group: tournament_group || null })
        .eq('id', Number(slotId));

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Acción inválida' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Error interno' },
      { status: 500 }
    );
  }
}
