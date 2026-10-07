import { supabase } from '../lib/supabase';
import { ApiFehler } from '../lib/fehler';
import type { Aufgabe, AufgabeArt, AufgabeEingabe, Protokoll, ProtokollEingabe, Vorlage, Zahlen } from './logik';

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

/** Das Protokoll wurde inzwischen von jemand anderem geändert (oder angelegt bzw. gelöscht). `aktuell` ist der jetzige Stand, null = gelöscht. */
export class ProtokollKonflikt extends Error {
  aktuell: Protokoll | null;
  constructor(aktuell: Protokoll | null) { super('Das Protokoll wurde inzwischen geändert'); this.name = 'ProtokollKonflikt'; this.aktuell = aktuell; }
}

export async function holeProtokollDesTages(treffId: string, datum: string): Promise<Protokoll | null> {
  return pruefe(await supabase.from('treff_protokolle').select(PROTOKOLL).eq('treff_id', treffId).eq('datum', datum).maybeSingle()) as Protokoll | null;
}

/** Prüfung gegen gleichzeitiges Bearbeiten: `erwartet` ist der Änderungszeitpunkt, den man beim Öffnen gesehen hat (null = es gab noch kein Protokoll). */
export interface Pruefung { erwartet: string | null }

/**
 * Legt das Protokoll eines Tages an oder ändert es (je Treff und Tag gibt es nur eines).
 * Mit `pruefung`: nur, wenn niemand es inzwischen geändert hat – sonst ProtokollKonflikt mit dem jetzigen Stand.
 * Ohne `pruefung`: überschreibt (z. B. nach „Trotzdem speichern“).
 */
export async function speichereProtokoll(treffId: string, datum: string, e: ProtokollEingabe, pruefung?: Pruefung): Promise<void> {
  const werte = { anz_m: e.anz_m, anz_w: e.anz_w, anz_d: e.anz_d, verlauf: e.verlauf.trim(), vorkommnisse: e.vorkommnisse.trim() };
  if (!pruefung) {
    pruefe(await supabase.from('treff_protokolle').upsert({ treff_id: treffId, datum, ...werte }, { onConflict: 'treff_id,datum' }));
    return;
  }
  if (pruefung.erwartet === null) {
    const r = await supabase.from('treff_protokolle').insert({ treff_id: treffId, datum, ...werte });
    if (r.error?.code === '23505') throw new ProtokollKonflikt(await holeProtokollDesTages(treffId, datum));
    if (r.error) throw new ApiFehler(r.error);
    return;
  }
  const r = pruefe(await supabase.from('treff_protokolle').update(werte).eq('treff_id', treffId).eq('datum', datum).eq('updated_at', pruefung.erwartet).select('id')) as { id: string }[];
  if (r.length === 0) throw new ProtokollKonflikt(await holeProtokollDesTages(treffId, datum));
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

/* ───── Vorlagen je Wochentag (Migration 0028) ───── */

export async function listeVorlagen(treffId: string): Promise<Vorlage[]> {
  return pruefe(await supabase.from('treff_protokoll_vorlagen').select('treff_id, wochentag, text').eq('treff_id', treffId).order('wochentag')) as Vorlage[];
}

/** Speichert die Vorlage eines Wochentags; ein leerer Text löscht sie. */
export async function speichereVorlage(treffId: string, wochentag: number, text: string): Promise<void> {
  if (!text.trim()) {
    pruefe(await supabase.from('treff_protokoll_vorlagen').delete().eq('treff_id', treffId).eq('wochentag', wochentag));
    return;
  }
  pruefe(await supabase.from('treff_protokoll_vorlagen').upsert({ treff_id: treffId, wochentag, text: text.replace(/\s+$/, '') }, { onConflict: 'treff_id,wochentag' }));
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
