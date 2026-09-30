import { supabase } from '../lib/supabase';
import { ApiFehler } from '../lib/fehler';
import type { Aufgabe, AufgabeArt, AufgabeEingabe, Protokoll, ProtokollEingabe, Zahlen } from './logik';

/** Dünne Schicht über Supabase für Tagesprotokoll und Notizen der Treffs. Rechte entscheidet die Datenbank (RLS). */

function pruefe<T>(r: { data: T | null; error: { code?: string; message: string } | null }): T {
  if (r.error) throw new ApiFehler(r.error);
  return r.data as T;
}

const PROTOKOLL = 'id, treff_id, datum, anz_m, anz_w, anz_d, verlauf, vorkommnisse, erstellt_von, bearbeitet_von, updated_at';
const AUFGABE = 'id, treff_id, art, text, antwort, faellig_am, zustaendig, protokoll_datum, erledigt, erledigt_von, erledigt_am, erstellt_von, created_at';

/* ───── Protokolle ───── */

/** Die jüngsten Protokolle eines Treffs (neueste zuerst). */
export async function listeProtokolle(treffId: string, limit = 60): Promise<Protokoll[]> {
  return pruefe(await supabase.from('treff_protokolle').select(PROTOKOLL).eq('treff_id', treffId).order('datum', { ascending: false }).limit(limit)) as Protokoll[];
}

/** Nur Datum und Zahlen, für die Auswertung eines Zeitraums. */
export async function listeProtokollZahlen(treffId: string, von: string, bis: string): Promise<Zahlen[]> {
  return pruefe(await supabase.from('treff_protokolle').select('datum, anz_m, anz_w, anz_d')
    .eq('treff_id', treffId).gte('datum', von).lte('datum', bis).order('datum').limit(1000)) as Zahlen[];
}

/** Komplette Protokolle eines Zeitraums für den CSV-Export. */
export async function listeProtokolleImZeitraum(treffId: string, von: string, bis: string): Promise<Protokoll[]> {
  return pruefe(await supabase.from('treff_protokolle').select(PROTOKOLL)
    .eq('treff_id', treffId).gte('datum', von).lte('datum', bis).order('datum').limit(1000)) as Protokoll[];
}

/** Legt das Protokoll eines Tages an oder überschreibt es (je Treff und Tag gibt es nur eines). */
export async function speichereProtokoll(treffId: string, datum: string, e: ProtokollEingabe): Promise<void> {
  pruefe(await supabase.from('treff_protokolle').upsert(
    { treff_id: treffId, datum, anz_m: e.anz_m, anz_w: e.anz_w, anz_d: e.anz_d, verlauf: e.verlauf.trim(), vorkommnisse: e.vorkommnisse.trim() },
    { onConflict: 'treff_id,datum' }));
}

export async function loescheProtokoll(id: string): Promise<void> {
  pruefe(await supabase.from('treff_protokolle').delete().eq('id', id));
}

/** Für die Startseite: Treffs, die für `datum` schon ein Protokoll haben, und die Zahl offener Notizen je Treff. */
export async function listeProtokollStand(treffIds: string[], datum: string): Promise<{ protokolliert: string[]; offeneNotizen: Record<string, number> }> {
  if (!treffIds.length) return { protokolliert: [], offeneNotizen: {} };
  const p = pruefe(await supabase.from('treff_protokolle').select('treff_id').eq('datum', datum).in('treff_id', treffIds)) as { treff_id: string }[];
  const a = pruefe(await supabase.from('treff_aufgaben').select('treff_id').eq('erledigt', false).in('treff_id', treffIds).limit(2000)) as { treff_id: string }[];
  const offeneNotizen: Record<string, number> = {};
  for (const x of a) offeneNotizen[x.treff_id] = (offeneNotizen[x.treff_id] ?? 0) + 1;
  return { protokolliert: p.map((x) => x.treff_id), offeneNotizen };
}

/* ───── Notizen und Listen ───── */

export async function listeAufgaben(treffId: string): Promise<Aufgabe[]> {
  return pruefe(await supabase.from('treff_aufgaben').select(AUFGABE).eq('treff_id', treffId).order('created_at', { ascending: false }).limit(1000)) as Aufgabe[];
}

const leer = (v: string): string | null => (v.trim() === '' ? null : v.trim());

export async function legeAufgabeAn(treffId: string, e: AufgabeEingabe, protokollDatum: string | null = null): Promise<void> {
  pruefe(await supabase.from('treff_aufgaben').insert({
    treff_id: treffId, art: e.art, text: e.text.trim(), faellig_am: leer(e.faellig_am), zustaendig: leer(e.zustaendig), protokoll_datum: protokollDatum,
  }));
}

export async function aendereAufgabe(id: string, e: { art?: AufgabeArt; text?: string; faellig_am?: string; zustaendig?: string }): Promise<void> {
  const w: Record<string, unknown> = {};
  if (e.art !== undefined) w.art = e.art;
  if (e.text !== undefined) w.text = e.text.trim();
  if (e.faellig_am !== undefined) w.faellig_am = leer(e.faellig_am);
  if (e.zustaendig !== undefined) w.zustaendig = leer(e.zustaendig);
  pruefe(await supabase.from('treff_aufgaben').update(w).eq('id', id));
}

/** Erledigt (mit Antwort bei offenen Fragen) oder wieder öffnet eine Notiz; wer und wann trägt die Datenbank ein. */
export async function setzeErledigt(id: string, erledigt: boolean, antwort?: string): Promise<void> {
  pruefe(await supabase.from('treff_aufgaben').update({ erledigt, ...(antwort !== undefined ? { antwort: leer(antwort) } : {}) }).eq('id', id));
}

export async function loescheAufgabe(id: string): Promise<void> {
  pruefe(await supabase.from('treff_aufgaben').delete().eq('id', id));
}
