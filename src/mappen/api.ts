import { supabase } from '../lib/supabase';
import { ApiFehler } from '../lib/fehler';
import { normalisiere } from './logik';
import type { MappeDaten, MappenSchluessel } from './standard';

function pruefe<T>(r: { data: T | null; error: { code?: string; message: string } | null }): T {
  if (r.error) throw new ApiFehler(r.error);
  return r.data as T;
}

export interface Mappe { daten: MappeDaten; aktualisiert: string | null }

/** Liest die Mappe; ohne gespeicherten Stand (oder ohne Leserecht) kommen die Standardtexte. */
export async function holeMappe(schluessel: MappenSchluessel): Promise<Mappe> {
  const r = pruefe(await supabase.from('inhalte').select('daten, updated_at').eq('schluessel', schluessel).maybeSingle()) as { daten: unknown; updated_at: string } | null;
  return { daten: normalisiere(r?.daten ?? null, schluessel), aktualisiert: r?.updated_at ?? null };
}

export async function speichereMappe(schluessel: MappenSchluessel, daten: MappeDaten, personId: string): Promise<void> {
  pruefe(await supabase.from('inhalte').upsert({ schluessel, daten, updated_by: personId, updated_at: new Date().toISOString() }));
}

/** Schlagworte aller Freizeiten, in denen die Person im Team ist (für das Zurückstufen der Kacheln). */
export async function schlagworteMeinerFreizeiten(freizeitIds: string[]): Promise<string[]> {
  if (!freizeitIds.length) return [];
  const r = pruefe(await supabase.from('freizeit_tags').select('tag').in('freizeit_id', freizeitIds)) as { tag: string }[];
  return [...new Set(r.map((x) => x.tag))].sort();
}
