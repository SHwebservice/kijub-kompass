import { stunden, WOCHENTAGE, type Oeffnungszeit } from './logik';
import type { RolleInTreff } from '../lib/rollen';

/**
 * Fachlogik des Dienstplans (ohne Datenbank und Oberfläche). Daten sind ISO-Texte "JJJJ-MM-TT", gerechnet wird in UTC.
 * Ein Dienst ist entweder der reguläre Dienst eines Öffnungstags oder ein Sonderdienst mit eigener Zeit und Bezeichnung.
 */

export type WunschStatus = 'offen' | 'bestaetigt' | 'abgelehnt';

export interface Dienst {
  id: string;
  datum: string;
  von: string | null;
  bis: string | null;
  ist_sonder: boolean;
  bezeichnung: string | null;
  /** Eingeteilte Personen (Person-IDs). */
  personen: string[];
  wuensche: { person_id: string; status: WunschStatus }[];
}

export interface Feiertag { id: string; treff_id: string | null; datum: string; bezeichnung: string }
/** Zeitraum, in dem ein Treff geschlossen ist (von und bis einschließlich). */
export interface Schliesszeit {
  id: string; treff_id: string; von: string; bis: string; grund: string;
  /** Aus einem Feiertag entstanden (seit 0027 schließen Feiertage den Treff); der Grund ist dann die Bezeichnung. */
  feiertag?: boolean;
}

/** Alle Tage, an denen der Treff zu ist: Schließzeiten und Feiertage (dieses Treffs oder aller Treffs). */
export function geschlosseneZeiten(schliesszeiten: Schliesszeit[], feiertage: Feiertag[], treffId: string): Schliesszeit[] {
  const aus = feiertage.filter((f) => f.treff_id === null || f.treff_id === treffId)
    .map((f): Schliesszeit => ({ id: `feiertag-${f.id}`, treff_id: treffId, von: f.datum, bis: f.datum, grund: f.bezeichnung, feiertag: true }));
  return [...schliesszeiten, ...aus];
}
export interface Abwesenheit { id: string; person_id: string; datum: string; typ: 'urlaub' | 'krank'; notiz: string | null }

/* ───── Kalender ───── */

const MS_TAG = 86_400_000;
const utc = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const addTage = (d: string, n: number) => iso(utc(d) + n * MS_TAG);

/** ISO-Wochentag: 1 = Montag … 7 = Sonntag. */
export const isoWochentag = (d: string) => new Date(utc(d)).getUTCDay() || 7;

export const montagVon = (d: string) => addTage(d, 1 - isoWochentag(d));

export const wochenTage = (montag: string) => Array.from({ length: 7 }, (_, i) => addTage(montag, i));

/** ISO-Kalenderwoche (Woche mit dem ersten Donnerstag des Jahres ist KW 1). */
export function kalenderwoche(d: string): number {
  const donnerstag = addTage(montagVon(d), 3);
  const jahrStart = `${donnerstag.slice(0, 4)}-01-01`;
  return Math.floor((utc(donnerstag) - utc(jahrStart)) / MS_TAG / 7) + 1;
}

const p2 = (n: number) => String(n).padStart(2, '0');
const tm = (d: string) => `${p2(+d.slice(8, 10))}.${p2(+d.slice(5, 7))}.`;

/** "KW 27 · 05.07.–11.07.2027" */
export function wochenText(montag: string): string {
  const sonntag = addTage(montag, 6);
  return `KW ${kalenderwoche(montag)} · ${tm(montag)}–${tm(sonntag)}${sonntag.slice(0, 4)}`;
}

export const monatErster = (d: string) => `${d.slice(0, 7)}-01`;

export function monatTage(monat: string): string[] {
  const erster = monatErster(monat);
  const naechster = Date.UTC(+erster.slice(0, 4), +erster.slice(5, 7), 1);
  const n = Math.round((naechster - utc(erster)) / MS_TAG);
  return Array.from({ length: n }, (_, i) => addTage(erster, i));
}

export function monatVersatz(monat: string, n: number): string {
  const erster = monatErster(monat);
  return iso(Date.UTC(+erster.slice(0, 4), +erster.slice(5, 7) - 1 + n, 1));
}

const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
export const monatText = (monat: string) => `${MONATE[+monat.slice(5, 7) - 1]} ${monat.slice(0, 4)}`;

/* ───── Tageskarten der Woche ───── */

export interface Tageskarte {
  datum: string;
  oeffnung: Oeffnungszeit | null;
  regulaer: Dienst | null;
  sonder: Dienst[];
  /** Schließzeit an diesem Tag (dann kein regulärer Dienst, kein Protokoll). */
  geschlossen?: Schliesszeit | null;
}

/** Die Schließzeit, in die der Tag fällt, sonst null. */
export const geschlossenAm = (datum: string, schliesszeiten: Schliesszeit[]) => schliesszeiten.find((s) => s.von <= datum && datum <= s.bis) ?? null;

/** „Schließzeit: Sommerpause“ bzw. „Geschlossen“ ohne Grund. */
export const schliesszeitText = (s: Pick<Schliesszeit, 'grund' | 'feiertag'>) =>
  (s.feiertag ? `Feiertag: ${s.grund.trim()}` : s.grund.trim() ? `Geschlossen: ${s.grund.trim()}` : 'Geschlossen');

/** Karten für alle Tage, an denen der Treff öffnet oder ein Dienst existiert (auch Sonderdienste an Schließtagen). */
export function tageskarten(tage: string[], oeffnungszeiten: Oeffnungszeit[], dienste: Dienst[], schliesszeiten: Schliesszeit[] = []): Tageskarte[] {
  const karten: Tageskarte[] = [];
  for (const datum of tage) {
    const oeffnung = oeffnungszeiten.find((o) => o.wochentag === isoWochentag(datum)) ?? null;
    const heute = dienste.filter((d) => d.datum === datum);
    const regulaer = heute.find((d) => !d.ist_sonder) ?? null;
    const sonder = heute.filter((d) => d.ist_sonder).sort((a, b) => (a.von ?? '').localeCompare(b.von ?? '') || a.id.localeCompare(b.id));
    if (oeffnung || regulaer || sonder.length) karten.push({ datum, oeffnung, regulaer, sonder, geschlossen: geschlossenAm(datum, schliesszeiten) });
  }
  return karten;
}

/** Zeit eines Dienstes als "15:00–19:00"; bei fehlender Zeit der Text der Öffnungszeit. */
export function dienstZeit(d: Pick<Dienst, 'von' | 'bis'>): string {
  return d.von && d.bis ? `${d.von.slice(0, 5)}–${d.bis.slice(0, 5)}` : '';
}

export const dienstStunden = (d: Pick<Dienst, 'von' | 'bis'>) => (d.von && d.bis ? stunden(d.von, d.bis) : 0);

/* ───── Wünsche ───── */

export function eigenerWunsch(k: Tageskarte, ichId: string): WunschStatus | null {
  return k.regulaer?.wuensche.find((w) => w.person_id === ichId)?.status ?? null;
}

/** Offene Wünsche der ganzen Woche (für die Treffleitung), nach Datum sortiert. */
export function offeneWuensche(karten: Tageskarte[]): { datum: string; dienst: Dienst; person_id: string }[] {
  return karten.flatMap((k) => (k.regulaer?.wuensche ?? []).filter((w) => w.status === 'offen')
    .map((w) => ({ datum: k.datum, dienst: k.regulaer!, person_id: w.person_id })));
}

/** BetreuerInnen wünschen Öffnungstage, an denen sie (noch) nicht eingeteilt sind; ein offener oder bestätigter Wunsch zählt schon. */
export function darfWuenschen(rolle: RolleInTreff, k: Tageskarte, ichId: string, heute: string): boolean {
  if (rolle !== 'betreuerin' || !k.oeffnung || k.geschlossen || k.datum < heute) return false;
  if (k.regulaer?.personen.includes(ichId)) return false;
  const w = eigenerWunsch(k, ichId);
  return w === null || w === 'abgelehnt';
}

/* ───── Zuteilung ───── */

export function zuteilungsAenderung(alt: string[], neu: string[]): { hinzu: string[]; weg: string[] } {
  return { hinzu: neu.filter((p) => !alt.includes(p)), weg: alt.filter((p) => !neu.includes(p)) };
}

export const abwesendeAm = (datum: string, abwesenheiten: Abwesenheit[]) => abwesenheiten.filter((a) => a.datum === datum);

/** Feiertag eines Tages: ein Eintrag für genau diesen Treff geht dem für alle Treffs vor. */
export function feiertagAm(datum: string, feiertage: Feiertag[], treffId: string): Feiertag | null {
  const f = feiertage.filter((x) => x.datum === datum && (x.treff_id === treffId || x.treff_id === null));
  return f.find((x) => x.treff_id === treffId) ?? f[0] ?? null;
}

/* ───── Sonderdienst ───── */

export interface SonderEingabe { datum: string; von: string; bis: string; bezeichnung: string }

export function validiereSonderdienst(e: SonderEingabe): { datum?: string; zeit?: string; bezeichnung?: string } {
  const f: { datum?: string; zeit?: string; bezeichnung?: string } = {};
  if (!e.datum) f.datum = 'Bitte ein Datum angeben.';
  if (!e.bezeichnung.trim()) f.bezeichnung = 'Bitte eine Bezeichnung angeben.';
  if (stunden(e.von, e.bis) <= 0) f.zeit = 'Bitte gültige Zeiten angeben – „bis“ muss nach „von“ liegen.';
  return f;
}

/* ───── Monatsmuster ───── */

/** Je ISO-Wochentag die Personen, die an allen passenden Öffnungstagen des Monats eingeteilt werden. */
export type Muster = Record<number, string[]>;

/** Wie viele Tage des Monats würde das Muster verändern? (nur Öffnungstage mit gewähltem Wochentag) */
export function musterTage(monat: string, oeffnungszeiten: Oeffnungszeit[], muster: Muster): string[] {
  const offen = new Set(oeffnungszeiten.map((o) => o.wochentag));
  const gewaehlt = WOCHENTAGE.filter((w) => w in muster && offen.has(w));
  return monatTage(monat).filter((d) => gewaehlt.includes(isoWochentag(d) as (typeof WOCHENTAGE)[number]));
}

/** JSON für fn_dienste_monatsmuster: Schlüssel = Wochentag (als Text). */
export const musterAlsJson = (m: Muster): Record<string, string[]> => Object.fromEntries(Object.entries(m).map(([k, v]) => [String(k), v]));

/* ───── Statistik ───── */

export interface StatistikZeile { person_id: string; dienste: number; stunden: number }

export const stundenText = (h: number) => `${h.toLocaleString('de-DE', { maximumFractionDigits: 2 })} h`;

/* ───── Abwesenheiten und Feiertage ───── */

export const MAX_ABWESENHEIT_TAGE = 366;

export interface AbwesenheitEingabe { person_id: string; von: string; bis: string }

/** Alle Tage von „von“ bis „bis“ einschließlich; leer bei umgekehrtem Zeitraum. */
export function tageImZeitraum(von: string, bis: string): string[] {
  if (!von || !bis || bis < von) return [];
  const n = Math.round((utc(bis) - utc(von)) / MS_TAG);
  return Array.from({ length: n + 1 }, (_, i) => addTage(von, i));
}

export function validiereAbwesenheit(e: AbwesenheitEingabe): { person?: string; zeitraum?: string } {
  const f: { person?: string; zeitraum?: string } = {};
  if (!e.person_id) f.person = 'Bitte eine Person wählen.';
  if (!e.von || !e.bis) f.zeitraum = 'Bitte Beginn und Ende angeben.';
  else if (e.bis < e.von) f.zeitraum = 'Das Ende darf nicht vor dem Beginn liegen.';
  else if (tageImZeitraum(e.von, e.bis).length > MAX_ABWESENHEIT_TAGE) f.zeitraum = `Höchstens ${MAX_ABWESENHEIT_TAGE} Tage auf einmal.`;
  return f;
}

/** Prüft eine Schließzeit; null = in Ordnung. Höchstens ein Jahr am Stück (Regel der Datenbank). */
export function validiereSchliesszeit(e: { von: string; bis: string }): string | null {
  if (!e.von || !e.bis) return 'Bitte Beginn und Ende angeben.';
  if (e.bis < e.von) return 'Das Ende darf nicht vor dem Beginn liegen.';
  if (tageImZeitraum(e.von, e.bis).length > 367) return 'Höchstens ein Jahr am Stück.';
  return null;
}

/** Zusammenhängende Abwesenheiten einer Person und Art werden zu einem Zeitraum gefasst: "05.07.–09.07.". */
export function abwesenheitsBloecke(liste: Abwesenheit[]): { person_id: string; typ: Abwesenheit['typ']; von: string; bis: string; ids: string[] }[] {
  const sortiert = [...liste].sort((a, b) => a.person_id.localeCompare(b.person_id) || a.typ.localeCompare(b.typ) || a.datum.localeCompare(b.datum));
  const out: { person_id: string; typ: Abwesenheit['typ']; von: string; bis: string; ids: string[] }[] = [];
  for (const a of sortiert) {
    const letzter = out[out.length - 1];
    if (letzter && letzter.person_id === a.person_id && letzter.typ === a.typ && addTage(letzter.bis, 1) === a.datum) {
      letzter.bis = a.datum; letzter.ids.push(a.id);
    } else out.push({ person_id: a.person_id, typ: a.typ, von: a.datum, bis: a.datum, ids: [a.id] });
  }
  return out.sort((a, b) => a.von.localeCompare(b.von) || a.person_id.localeCompare(b.person_id));
}
