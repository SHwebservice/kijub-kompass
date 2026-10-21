import { supabase } from '../lib/supabase';
import { ApiFehler } from '../lib/fehler';
import { gefuellteAbschnitte, type Teamprotokoll, type TeamprotokollEingabe } from './logik';

/** Dünne Schicht über Supabase für die Teamprotokolle der Treffs (Migrationen 0035, 0037). Rechte entscheidet die Datenbank. */

function pruefe<T>(r: { data: T | null; error: { code?: string; message: string } | null }): T {
  if (r.error) throw new ApiFehler(r.error);
  return r.data as T;
}

const FELDER = 'id, treff_id, art, datum, titel, text, abschnitte, naechstes_datum, naechstes_zeit, aufgaben, anwesend, entwurf, erstellt_von, bearbeitet_von, gemeldet_am, gemeldet_von, created_at, updated_at, gelesen:treff_teamprotokoll_gelesen(person_id, vor_eintritt)';
type Roh = Omit<Teamprotokoll, 'gelesen' | 'vorEintritt'> & { gelesen: { person_id: string; vor_eintritt: boolean }[] | null };
const umwandeln = (r: Roh): Teamprotokoll => ({
  ...r, anwesend: r.anwesend ?? [], abschnitte: r.abschnitte ?? [], aufgaben: r.aufgaben ?? '', entwurf: !!r.entwurf,
  gelesen: (r.gelesen ?? []).map((g) => g.person_id), vorEintritt: (r.gelesen ?? []).filter((g) => g.vor_eintritt).map((g) => g.person_id),
});

export async function listeTeamprotokolle(treffId: string): Promise<Teamprotokoll[]> {
  const r = pruefe(await supabase.from('treff_teamprotokolle').select(FELDER).eq('treff_id', treffId)
    .order('datum', { ascending: false }).order('created_at', { ascending: false }).limit(300)) as Roh[];
  return r.map(umwandeln);
}

/** Für die Startseite: veröffentlichte Protokolle, die seit `ab` stattfanden oder gemeldet wurden (samt „gelesen“). */
export async function listeNeueTeamprotokolle(treffIds: string[], ab: string): Promise<Teamprotokoll[]> {
  if (treffIds.length === 0) return [];
  const r = pruefe(await supabase.from('treff_teamprotokolle').select(FELDER).in('treff_id', treffIds).eq('entwurf', false)
    .or(`datum.gte.${ab},gemeldet_am.gte.${ab}`).limit(500)) as Roh[];
  return r.map(umwandeln);
}

/** Legt an (id = null) oder ändert; Ergebnis ist die ID (für die Mitteilung an das Team). Mit entwurf = false wird ein Entwurf veröffentlicht. */
export async function speichereTeamprotokoll(treffId: string, id: string | null, e: TeamprotokollEingabe, entwurf = false): Promise<string> {
  const werte = {
    art: e.art, datum: e.datum, titel: e.titel.trim(), abschnitte: gefuellteAbschnitte(e.abschnitte), naechstes_datum: e.naechstes_datum || null,
    naechstes_zeit: e.naechstes_datum && e.naechstes_zeit ? e.naechstes_zeit : null, aufgaben: e.aufgaben.trim(), anwesend: e.anwesend, entwurf,
  };
  if (id) { pruefe(await supabase.from('treff_teamprotokolle').update(werte).eq('id', id)); return id; }
  return (pruefe(await supabase.from('treff_teamprotokolle').insert({ treff_id: treffId, ...werte }).select('id').single()) as { id: string }).id;
}

/** Meldet eine Änderung ans Team: alle lesen das Protokoll erneut (danach die Mitteilung 'teamprotokoll_geaendert'). */
export async function meldeAenderung(id: string): Promise<void> {
  pruefe(await supabase.rpc('fn_teamprotokoll_aenderung_melden', { p_id: id }));
}

export async function loescheTeamprotokoll(id: string): Promise<void> {
  pruefe(await supabase.from('treff_teamprotokolle').delete().eq('id', id));
}

/**
 * Vermerkt „gelesen“ für die angemeldete Person (mehrfaches Aufrufen schadet nicht).
 * vorEintritt = true: der Vermerk „vor Eintritt“ wird durch ein echtes „gelesen“ ersetzt.
 */
export async function vermerkeGelesen(protokollId: string, personId: string, vorEintritt = false): Promise<void> {
  if (vorEintritt) pruefe(await supabase.from('treff_teamprotokoll_gelesen').delete().eq('protokoll_id', protokollId).eq('person_id', personId));
  const r = await supabase.from('treff_teamprotokoll_gelesen').insert({ protokoll_id: protokollId, person_id: personId });
  if (r.error && r.error.code !== '23505') throw new ApiFehler(r.error);
}
