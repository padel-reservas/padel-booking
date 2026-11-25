'use client';

// Historial de torneos: podios, palmarés por jugador y estado del torneo en curso.
// Los torneos ya cerrados se cargan acá a mano (una vez). Los torneos con cuadro
// de eliminación (ko_matches) calculan su podio solos a partir del cuadro.

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { KO_TOURNAMENT_KEY, isThirdPlace, koLoser, koMatchRoundName, type KoMatch, type KoPair } from './bracket';
import type { TabKey } from './padelTypes';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export type Pareja = [string, string];

export type Podio = {
  first: Pareja | null;
  second: Pareja | null;
  third: Pareja | null;
};

export type TorneoDef = {
  key: string;
  name: string;
  fecha: string;
  formato: string;
  view: TabKey; // pestaña con el detalle (cuadro / grupos)
  podio?: Podio; // torneos cerrados cargados a mano
  koKey?: string; // torneos con cuadro: el podio sale de ko_matches
  copaLeche?: { first: Pareja; second: Pareja | null; view: TabKey };
  inscripcionView?: TabKey;
};

// Del más reciente al más viejo
export const TORNEOS: TorneoDef[] = [
  {
    key: 'fall-26',
    name: "Torneo Fall '26",
    fecha: 'nov – dic 2026',
    formato: 'Eliminación simple',
    view: 'cuadro',
    koKey: KO_TOURNAMENT_KEY,
    inscripcionView: 'torneoInteres',
  },
  {
    key: 'spring-26',
    name: "Torneo Spring '26",
    fecha: 'abr – may 2026',
    formato: 'Grupos + eliminación',
    view: 'torneo',
    podio: {
      first: ['Guille E', 'Adrian'],
      second: ['Vicente', 'Eze'],
      third: ['Martin PI', 'Gaston R'],
    },
    copaLeche: { first: ['Jonas', 'Seba Z'], second: ['Gaby R', 'Pupi'], view: 'copadeLeche' },
  },
];

export type TorneoResumen = TorneoDef & {
  podioFinal: Podio;
  enCurso: boolean;
  estado: string; // "Semis en juego", "Finalizado", etc.
  parejas: number | null;
};

export type PalmaresRow = {
  name: string;
  titulos: number;
  finales: number;
  podios: number;
  copas: number;
};

const norm = (s: string) => s.trim().toLowerCase();

function podioFromKo(pairs: KoPair[], matches: KoMatch[]): { podio: Podio; enCurso: boolean; estado: string } {
  const pairById = new Map(pairs.map((p) => [p.id, p]));
  const asPareja = (id: number | null): Pareja | null => {
    const p = id ? pairById.get(id) : null;
    return p ? [p.player1_name, p.player2_name] : null;
  };
  const final = matches.find((m) => m.round === 4 && m.slot === 0) || null;
  const tp = matches.find((m) => isThirdPlace(m)) || null;
  const finalPlayed = final?.status === 'played' && !!final.winner_pair_id;

  const podio: Podio = {
    first: finalPlayed ? asPareja(final!.winner_pair_id) : null,
    second: finalPlayed ? asPareja(koLoser(final)) : null,
    third: tp?.status === 'played' && tp.winner_pair_id ? asPareja(tp.winner_pair_id) : null,
  };

  const pending = matches
    .filter((m) => m.status === 'pending' && !m.is_bye)
    .sort((a, b) => a.round - b.round || a.slot - b.slot);
  const enCurso = pending.length > 0 || !finalPlayed;
  const estado = !enCurso
    ? 'Finalizado'
    : pending[0]
    ? `${pending[0].round === 4 ? 'Final y 3er puesto' : koMatchRoundName(pending[0])} en juego`
    : 'En juego';

  return { podio, enCurso, estado };
}

export function useTorneosHistorial() {
  const [ko, setKo] = useState<Record<string, { pairs: KoPair[]; matches: KoMatch[] }>>({});

  useEffect(() => {
    const keys = TORNEOS.map((t) => t.koKey).filter((k): k is string => !!k);
    if (keys.length === 0) return;
    let cancelled = false;
    (async () => {
      const [pairsRes, matchesRes] = await Promise.all([
        supabase.from('ko_pairs').select('*').in('tournament_key', keys),
        supabase.from('ko_matches').select('*').in('tournament_key', keys),
      ]);
      if (cancelled || pairsRes.error || matchesRes.error) return;
      const next: Record<string, { pairs: KoPair[]; matches: KoMatch[] }> = {};
      for (const k of keys) {
        next[k] = {
          pairs: ((pairsRes.data || []) as (KoPair & { tournament_key: string })[]).filter((p) => p.tournament_key === k),
          matches: ((matchesRes.data || []) as KoMatch[]).filter((m) => m.tournament_key === k),
        };
      }
      setKo(next);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const torneos: TorneoResumen[] = useMemo(
    () =>
      TORNEOS.map((t) => {
        if (t.koKey) {
          const data = ko[t.koKey];
          if (!data) {
            return {
              ...t,
              podioFinal: { first: null, second: null, third: null },
              enCurso: true,
              estado: 'Cargando…',
              parejas: null,
            };
          }
          const { podio, enCurso, estado } = podioFromKo(data.pairs, data.matches);
          return { ...t, podioFinal: podio, enCurso, estado, parejas: data.pairs.length };
        }
        return {
          ...t,
          podioFinal: t.podio || { first: null, second: null, third: null },
          enCurso: false,
          estado: 'Finalizado',
          parejas: null,
        };
      }),
    [ko]
  );

  const palmares: PalmaresRow[] = useMemo(() => {
    const rows = new Map<string, PalmaresRow>();
    const row = (name: string) => {
      const k = norm(name);
      if (!rows.has(k)) rows.set(k, { name, titulos: 0, finales: 0, podios: 0, copas: 0 });
      return rows.get(k)!;
    };
    for (const t of torneos) {
      const { first, second, third } = t.podioFinal;
      first?.forEach((n) => {
        const r = row(n);
        r.titulos++;
        r.finales++;
        r.podios++;
      });
      second?.forEach((n) => {
        const r = row(n);
        r.finales++;
        r.podios++;
      });
      third?.forEach((n) => {
        row(n).podios++;
      });
      t.copaLeche?.first.forEach((n) => {
        row(n).copas++;
      });
    }
    return [...rows.values()].sort(
      (a, b) =>
        b.titulos - a.titulos ||
        b.finales - a.finales ||
        b.podios - a.podios ||
        b.copas - a.copas ||
        a.name.localeCompare(b.name)
    );
  }, [torneos]);

  // Títulos por jugador (para mostrar 🏆 en el ranking)
  const titulosPorJugador = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of palmares) if (r.titulos > 0) map.set(norm(r.name), r.titulos);
    return map;
  }, [palmares]);

  return { torneos, palmares, titulosPorJugador };
}
