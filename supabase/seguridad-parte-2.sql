-- Seguridad parte 2: turnos y sugerencias
-- NO APLICAR hasta que el código de la rama seguridad-parte-2 esté en producción.
-- Efecto: desde el navegador (clave anon) estas tablas quedan SOLO LECTURA.
-- Anotarse, bajarse, sugerencias, etc. pasan por /api/admin (service role, no lo afecta RLS).

-- 1) Turnos: se quitan los permisos de escritura públicos, queda solo lectura
drop policy if exists "admin can insert slots" on public.slots;
drop policy if exists "admin can update slots" on public.slots;
drop policy if exists "admin can delete slots" on public.slots;
drop policy if exists "public can insert players" on public.players;
drop policy if exists "public can delete players" on public.players;
drop policy if exists "admin can update players" on public.players;
-- (quedan "public can read slots" y "public can read players")

-- 2) Sugerencias: RLS + lectura pública
do $$
declare t text;
begin
  foreach t in array array[
    'suggestions',
    'suggestion_responses',
    'suggestion_alternatives',
    'suggestion_alternative_joiners'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "lectura publica" on public.%I', t);
    execute format('create policy "lectura publica" on public.%I for select to anon, authenticated using (true)', t);
  end loop;
end $$;

-- 3) Asado y Apuestas (ya no están en la app): solo lectura
do $$
declare t text;
begin
  foreach t in array array['asado_rsvp', 'tournament_predictions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "lectura publica" on public.%I', t);
    execute format('create policy "lectura publica" on public.%I for select to anon, authenticated using (true)', t);
  end loop;
end $$;

-- ===== Vuelta atrás (si algo se rompe) =====
-- create policy "admin can insert slots" on public.slots for insert to anon with check (true);
-- create policy "admin can update slots" on public.slots for update to anon using (true) with check (true);
-- create policy "admin can delete slots" on public.slots for delete to anon using (true);
-- create policy "public can insert players" on public.players for insert to anon with check (coalesce(paid, false) = false);
-- create policy "public can delete players" on public.players for delete to anon using (true);
-- alter table public.<tabla> disable row level security;   -- para cada tabla de sugerencias
