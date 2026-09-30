import { supabase } from '../lib/supabase';
import { ApiFehler } from '../lib/fehler';
import { ausDatenbankform, formularAus, inDatenbankform, type Angebot, type AngebotFormular } from './logik';

/** Dünne Schicht über Supabase für den Katalog. Rechte entscheidet die Datenbank (RLS), nicht diese Datei. */

function pruefe<T>(r: { data: T | null; error: { code?: string; message: string } | null }): T {
  if (r.error) throw new ApiFehler(r.error);
  return r.data as T;
}

const SPALTEN = 'id, name, kategorie, dauer, gruppe, personal, raum, alter_gruppen, wetter, material, vorbereitung, umsetzung, nachbereitung, autor';

/* ───── Programmpunkte ───── */

export async function listeKatalog(): Promise<Angebot[]> {
  const r = pruefe(await supabase.from('angebote').select(SPALTEN).order('name')) as Record<string, unknown>[];
  return r.map(ausDatenbankform);
}

export async function speichereAngebot(id: string | null, f: AngebotFormular): Promise<string> {
  const werte = inDatenbankform(f);
  if (id) { pruefe(await supabase.from('angebote').update(werte).eq('id', id)); return id; }
  return (pruefe(await supabase.from('angebote').insert(werte).select('id').single()) as { id: string }).id;
}

export async function loescheAngebot(id: string): Promise<void> {
  pruefe(await supabase.from('angebote').delete().eq('id', id));
}

/** Legt viele Programmpunkte auf einmal an (Import); gibt die Anzahl zurück. */
export async function importiereAngebote(liste: AngebotFormular[]): Promise<number> {
  if (liste.length === 0) return 0;
  pruefe(await supabase.from('angebote').insert(liste.map(inDatenbankform)));
  return liste.length;
}

/* ───── Bewertungen, Favoriten, Kommentare ───── */

export interface BewertungStand { durchschnitt: number; anzahl: number }

export async function holeBewertungen(): Promise<Record<string, BewertungStand>> {
  const r = pruefe(await supabase.from('v_angebot_bewertung').select('angebot_id, durchschnitt, anzahl')) as { angebot_id: string; durchschnitt: number | string; anzahl: number }[];
  return Object.fromEntries(r.map((b) => [b.angebot_id, { durchschnitt: Number(b.durchschnitt), anzahl: b.anzahl }]));
}

export async function meineBewertungen(personId: string): Promise<Record<string, number>> {
  const r = pruefe(await supabase.from('angebot_bewertungen').select('angebot_id, sterne').eq('person_id', personId)) as { angebot_id: string; sterne: number }[];
  return Object.fromEntries(r.map((b) => [b.angebot_id, b.sterne]));
}

export async function bewerte(angebotId: string, personId: string, sterne: number): Promise<void> {
  pruefe(await supabase.from('angebot_bewertungen').upsert({ angebot_id: angebotId, person_id: personId, sterne }));
}

export async function entferneBewertung(angebotId: string, personId: string): Promise<void> {
  pruefe(await supabase.from('angebot_bewertungen').delete().eq('angebot_id', angebotId).eq('person_id', personId));
}

export async function meineFavoriten(personId: string): Promise<string[]> {
  return (pruefe(await supabase.from('angebot_favoriten').select('angebot_id').eq('person_id', personId)) as { angebot_id: string }[]).map((f) => f.angebot_id);
}

export async function setzeFavorit(angebotId: string, personId: string, an: boolean): Promise<void> {
  if (an) pruefe(await supabase.from('angebot_favoriten').upsert({ person_id: personId, angebot_id: angebotId }));
  else pruefe(await supabase.from('angebot_favoriten').delete().eq('person_id', personId).eq('angebot_id', angebotId));
}

export interface AngebotKommentar { id: string; person_id: string; text: string; created_at: string; vorname: string; nachname: string }

export async function listeAngebotKommentare(angebotId: string): Promise<AngebotKommentar[]> {
  return pruefe(await supabase.from('v_angebot_kommentare').select('id, person_id, text, created_at, vorname, nachname')
    .eq('angebot_id', angebotId).order('created_at')) as AngebotKommentar[];
}

export async function kommentiereAngebot(angebotId: string, personId: string, text: string): Promise<void> {
  pruefe(await supabase.from('angebot_kommentare').insert({ angebot_id: angebotId, person_id: personId, text: text.trim() }));
}

export async function loescheAngebotKommentar(id: string): Promise<void> {
  pruefe(await supabase.from('angebot_kommentare').delete().eq('id', id));
}

/* ───── Vorschläge ───── */

export type VorschlagStatus = 'offen' | 'angenommen' | 'abgelehnt';

export interface Vorschlag {
  id: string;
  status: VorschlagStatus;
  created_at: string;
  eingereicht_von: string;
  einreicher: string;
  daten: AngebotFormular;
}

type VorschlagRoh = { id: string; status: VorschlagStatus; created_at: string; eingereicht_von: string; daten: Record<string, unknown>; person: { vorname: string; nachname: string } | null };

const vorschlag = (r: VorschlagRoh): Vorschlag => {
  const daten = formularAus(ausDatenbankform({ id: r.id, ...r.daten }));
  return { id: r.id, status: r.status, created_at: r.created_at, eingereicht_von: r.eingereicht_von, einreicher: r.person ? `${r.person.vorname} ${r.person.nachname}` : 'Jemand', daten };
};

const VORSCHLAG_SPALTEN = 'id, status, created_at, eingereicht_von, daten, person:personen!eingereicht_von(vorname, nachname)';

/** Koordination: alle; alle anderen sehen nur ihre eigenen Vorschläge (Regel der Datenbank). */
export async function listeVorschlaege(): Promise<Vorschlag[]> {
  const r = pruefe(await supabase.from('angebot_vorschlaege').select(VORSCHLAG_SPALTEN).order('created_at', { ascending: false })) as unknown as VorschlagRoh[];
  return r.map(vorschlag);
}

export async function reicheVorschlagEin(personId: string, f: AngebotFormular): Promise<void> {
  pruefe(await supabase.from('angebot_vorschlaege').insert({ eingereicht_von: personId, daten: inDatenbankform(f) }));
}

/** Koordination korrigiert die Angaben eines offenen Vorschlags, bevor er übernommen wird. */
export async function aendereVorschlag(id: string, f: AngebotFormular): Promise<void> {
  pruefe(await supabase.from('angebot_vorschlaege').update({ daten: inDatenbankform(f) }).eq('id', id).eq('status', 'offen'));
}

export async function uebernimmVorschlag(id: string): Promise<string> {
  return pruefe(await supabase.rpc('fn_vorschlag_uebernehmen', { p_id: id })) as string;
}

export async function lehneVorschlagAb(id: string): Promise<void> {
  pruefe(await supabase.rpc('fn_vorschlag_ablehnen', { p_id: id }));
}
