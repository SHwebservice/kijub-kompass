import { supabase } from '../lib/supabase';
import { ApiFehler } from '../lib/fehler';
import type { Teamprotokoll, TeamprotokollEingabe } from './logik';

/** Dünne Schicht über Supabase für die Teamprotokolle der Treffs (Migration 0035). Rechte entscheidet die Datenbank. */

function pruefe<T>(r: { data: T | null; error: { code?: string; message: string } | null }): T {
  if (r.error) throw new ApiFehler(r.error);
  return r.data as T;
}

const FELDER = 'id, treff_id, art, datum, titel, text, anwesend, erstellt_von, bearbeitet_von, created_at, updated_at, gelesen:treff_teamprotokoll_gelesen(person_id)';
type Roh = Omit<Teamprotokoll, 'gelesen'> & { gelesen: { person_id: string }[] | null };
const umwandeln = (r: Roh): Teamprotokoll => ({ ...r, anwesend: r.anwesend ?? [], gelesen: (r.gelesen ?? []).map((g) => g.person_id) });

export async function listeTeamprotokolle(treffId: string): Promise<Teamprotokoll[]> {
  const r = pruefe(await supabase.from('treff_teamprotokolle').select(FELDER).eq('treff_id', treffId)
    .order('datum', { ascending: false }).order('created_at', { ascending: false }).limit(300)) as Roh[];
  return r.map(umwandeln);
}

/** Für die Startseite: Protokolle der letzten 60 Tage in den angegebenen Treffs (samt „gelesen“). */
export async function listeNeueTeamprotokolle(treffIds: string[], ab: string): Promise<Teamprotokoll[]> {
  if (treffIds.length === 0) return [];
  const r = pruefe(await supabase.from('treff_teamprotokolle').select(FELDER).in('treff_id', treffIds).gte('datum', ab).limit(500)) as Roh[];
  return r.map(umwandeln);
}

/** Legt an (id = null) oder ändert; Ergebnis ist die ID (für die Mitteilung an das Team). */
export async function speichereTeamprotokoll(treffId: string, id: string | null, e: TeamprotokollEingabe): Promise<string> {
  const werte = { art: e.art, datum: e.datum, titel: e.titel.trim(), text: e.text.trim(), anwesend: e.anwesend };
  if (id) { pruefe(await supabase.from('treff_teamprotokolle').update(werte).eq('id', id)); return id; }
  return (pruefe(await supabase.from('treff_teamprotokolle').insert({ treff_id: treffId, ...werte }).select('id').single()) as { id: string }).id;
}

export async function loescheTeamprotokoll(id: string): Promise<void> {
  pruefe(await supabase.from('treff_teamprotokolle').delete().eq('id', id));
}

/** Vermerkt „gelesen“ für die angemeldete Person (mehrfaches Aufrufen schadet nicht). */
export async function vermerkeGelesen(protokollId: string, personId: string): Promise<void> {
  const r = await supabase.from('treff_teamprotokoll_gelesen').insert({ protokoll_id: protokollId, person_id: personId });
  if (r.error && r.error.code !== '23505') throw new ApiFehler(r.error);
}
