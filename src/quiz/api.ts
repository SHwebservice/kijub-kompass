import { supabase } from '../lib/supabase';
import { ApiFehler } from '../lib/fehler';
import { istNeuerBestwert, type Frage, type FrageInhalt } from './logik';
import { STANDARDFRAGEN } from './standardfragen';

function pruefe<T>(r: { data: T | null; error: { code?: string; message: string } | null }): T {
  if (r.error) throw new ApiFehler(r.error);
  return r.data as T;
}

export interface FragenStand { fragen: Frage[]; /** true = Datenbank ist leer, es gelten die Standardfragen. */ standard: boolean }

/** Die Fragen aus der Datenbank; ist sie leer, gelten die Standardfragen des alten Quiz. */
export async function listeFragen(): Promise<FragenStand> {
  const r = pruefe(await supabase.from('quiz_fragen').select('id, thema, frage, antworten, korrekt, erklaerung').order('thema')) as
    (Omit<Frage, 'erklaerung'> & { erklaerung: string | null })[];
  if (r.length === 0) return { fragen: STANDARDFRAGEN.map((f, i) => ({ ...f, id: `standard-${i}` })), standard: true };
  return { fragen: r.map((f) => ({ ...f, erklaerung: f.erklaerung ?? '' })), standard: false };
}

export async function speichereFrage(id: string | null, f: FrageInhalt): Promise<void> {
  const werte = { thema: f.thema, frage: f.frage, antworten: f.antworten, korrekt: f.korrekt, erklaerung: f.erklaerung || null };
  if (id) pruefe(await supabase.from('quiz_fragen').update(werte).eq('id', id));
  else pruefe(await supabase.from('quiz_fragen').insert(werte));
}

export async function loescheFrage(id: string): Promise<void> {
  pruefe(await supabase.from('quiz_fragen').delete().eq('id', id));
}

/** Übernimmt die Standardfragen in die Datenbank (nur sinnvoll, solange sie leer ist). */
export async function uebernimmStandardfragen(): Promise<void> {
  pruefe(await supabase.from('quiz_fragen').insert(STANDARDFRAGEN.map((f) => ({ ...f, erklaerung: f.erklaerung || null }))));
}

export interface Bestwert { thema: string; bester_wert: number; gesamt: number }

export async function meineBestwerte(personId: string): Promise<Bestwert[]> {
  return pruefe(await supabase.from('quiz_ergebnisse').select('thema, bester_wert, gesamt').eq('person_id', personId)) as Bestwert[];
}

/** Speichert das Ergebnis, wenn es besser ist als der bisherige Bestwert; gibt zurück, ob es ein neuer Bestwert war. */
export async function meldeErgebnis(personId: string, thema: string, richtig: number, gesamt: number, bisher: Bestwert | undefined): Promise<boolean> {
  if (!istNeuerBestwert({ richtig, gesamt }, bisher)) return false;
  pruefe(await supabase.from('quiz_ergebnisse').upsert({ person_id: personId, thema, bester_wert: richtig, gesamt }));
  return true;
}

export interface ErgebnisZeile extends Bestwert { person_id: string }

/** Koordination: Bestwerte aller Personen. */
export async function alleErgebnisse(): Promise<ErgebnisZeile[]> {
  return pruefe(await supabase.from('quiz_ergebnisse').select('person_id, thema, bester_wert, gesamt')) as ErgebnisZeile[];
}
