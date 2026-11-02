-- Seguridad parte 1: resultados, ranking y pagos
-- NO APLICAR hasta que el código de la rama seguridad-parte-1 esté en producción.
-- Efecto: desde el navegador (clave anon) estas tablas quedan SOLO LECTURA.
-- Las escrituras pasan por /api/admin, que usa la service role (no la afecta RLS).

begin;

-- 1) Tablas de resultados, ranking y pagos: RLS + lectura pública
do $$
declare t text;
begin
  foreach t in array array[
    'matches',
    'ranking_players',
    'ranking_player_aliases',
    'raw_matches_import',
    'ranking_config',
    'ranking_recalc_runs',
    'ranking_match_player_deltas',
    'ranking_snapshots',
    'payments',
    'payment_allocations'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "lectura publica" on public.%I', t);
    execute format('create policy "lectura publica" on public.%I for select to anon, authenticated using (true)', t);
  end loop;
end $$;

-- 2) players: la app ya no actualiza jugadores desde el navegador (pagos van por /api).
--    Se quita el UPDATE público y el alta solo puede entrar como "no pagado".
drop policy if exists "admin can update players" on public.players;
drop policy if exists "public can insert players" on public.players;
create policy "public can insert players" on public.players
  for insert to anon with check (coalesce(paid, false) = false);

-- 3) Funciones sensibles: solo el servidor (service_role) puede ejecutarlas
do $$
declare f text;
begin
  foreach f in array array[
    'approve_payment(uuid, text)',
    'reject_payment(uuid)',
    'delete_payment_and_resync(uuid)',
    'reset_payment_to_reported(uuid)',
    'rebuild_all_players_paid_status()',
    'sync_player_paid_status(bigint)',
    'record_player_payment_reminder(bigint)',
    'recalculate_rankings()',
    'recalculate_rankings_v2()',
    'save_ranking_snapshot(text, text)',
    'generate_group_matches(bigint)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

commit;

-- ===== Vuelta atrás (si algo se rompe) =====
-- alter table public.<tabla> disable row level security;   -- para cada tabla del punto 1
-- create policy "admin can update players" on public.players for update to anon using (true) with check (true);
-- drop policy "public can insert players" on public.players;
-- create policy "public can insert players" on public.players for insert to anon with check (true);
-- grant execute on function public.<funcion> to anon, authenticated;   -- para cada función del punto 3
