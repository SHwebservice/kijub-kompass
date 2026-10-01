/**
 * Fachlogik der Freizeiten ohne Datenbank- und Oberflächenbezug (leicht testbar).
 * Alle Daten sind ISO-Texte "JJJJ-MM-TT"; gerechnet wird in UTC, damit Zeitzonen und Sommerzeit keine Rolle spielen.
 */

export type Ferienzeitraum = 'ostern' | 'sommer' | 'herbst';

export interface FreizeitKurz {
  id: string;
  name: string;
  start_datum: string;
  ende_datum: string;
  status: 'geplant' | 'abgesagt';
  ferienzeitraum: Ferienzeitraum | null;
  ferienwoche: number | null;
}

const MS_TAG = 86_400_000;
const utc = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Heutiges Datum (lokal) als ISO-Text. */
export function heuteIso(jetzt: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${jetzt.getFullYear()}-${p(jetzt.getMonth() + 1)}-${p(jetzt.getDate())}`;
}

export function tageZwischen(von: string, bis: string): number {
  return Math.round((utc(bis) - utc(von)) / MS_TAG);
}

/** Alle Tage von Start bis Ende einschließlich. */
export function tageVonBis(start: string, ende: string): string[] {
  const n = tageZwischen(start, ende);
  if (n < 0) return [];
  return Array.from({ length: n + 1 }, (_, i) => iso(utc(start) + i * MS_TAG));
}

const WOCHENTAGE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const WOCHENTAGE_LANG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

export const wochentagKurz = (d: string) => WOCHENTAGE[new Date(utc(d)).getUTCDay()]!;
export const wochentagLang = (d: string) => WOCHENTAGE_LANG[new Date(utc(d)).getUTCDay()]!;

/** "2027-07-05" → "05.07.2027" */
export const formatDatum = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;
/** "2027-07-05" → "05.07." */
export const formatTagMonat = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.`;
/** "2027-07-05" → "Mo 05.07." */
export const formatKurz = (d: string) => `${wochentagKurz(d)} ${formatTagMonat(d)}`;

const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
/** "2027-07-05" → "Mo., 5. Juli" */
export const formatTagLang = (d: string) => `${wochentagKurz(d)}., ${Number(d.slice(8, 10))}. ${MONATE[Number(d.slice(5, 7)) - 1]}`;

export function zeitraumText(start: string, ende: string): string {
  return start === ende ? formatDatum(start) : `${formatDatum(start)} – ${formatDatum(ende)}`;
}

export const FERIEN_LABEL: Record<Ferienzeitraum, string> = { ostern: 'Ostern', sommer: 'Sommer', herbst: 'Herbst' };
export const MAX_FERIENWOCHEN: Record<Ferienzeitraum, number> = { ostern: 2, sommer: 6, herbst: 2 };

export function ferienText(f: Pick<FreizeitKurz, 'ferienzeitraum' | 'ferienwoche'>): string {
  if (!f.ferienzeitraum) return '';
  const l = FERIEN_LABEL[f.ferienzeitraum];
  return f.ferienwoche ? `${l} · Woche ${f.ferienwoche}` : l;
}

export type Phase = 'kommend' | 'laufend' | 'vergangen';

export function phase(f: Pick<FreizeitKurz, 'start_datum' | 'ende_datum'>, heute: string): Phase {
  if (f.ende_datum < heute) return 'vergangen';
  if (f.start_datum > heute) return 'kommend';
  return 'laufend';
}

/** In wie vielen Tagen beginnt die Freizeit? (negativ = läuft oder ist vorbei) */
export const tageBisStart = (f: Pick<FreizeitKurz, 'start_datum'>, heute: string) => tageZwischen(heute, f.start_datum);

export const nachStart = (a: FreizeitKurz, b: FreizeitKurz) =>
  a.start_datum.localeCompare(b.start_datum) || a.name.localeCompare(b.name, 'de');

export interface Gruppe<T> { schluessel: string; label: string; eintraege: T[] }

/** Gruppiert nach Ferienzeit (Ostern, Sommer, Herbst, Sonstige), innerhalb der Gruppe nach Start sortiert. */
export function gruppiereNachFerien<T extends FreizeitKurz>(liste: T[]): Gruppe<T>[] {
  const reihenfolge: (Ferienzeitraum | 'sonstige')[] = ['ostern', 'sommer', 'herbst', 'sonstige'];
  const sortiert = [...liste].sort(nachStart);
  const gruppen = reihenfolge.map((k) => ({
    schluessel: k,
    label: k === 'sonstige' ? 'Weitere' : FERIEN_LABEL[k],
    eintraege: sortiert.filter((f) => (f.ferienzeitraum ?? 'sonstige') === k),
  }));
  return gruppen.filter((g) => g.eintraege.length > 0);
}

/** Bewerbungsfrist: frühester Start, für den man sich noch bewerben kann (heute + Vorlauftage). */
export function fruehesterBewerbungsstart(heute: string, vorlaufTage: number): string {
  return iso(utc(heute) + vorlaufTage * MS_TAG);
}

export const darfBeworbenWerden = (f: FreizeitKurz, heute: string, vorlaufTage: number) =>
  f.status === 'geplant' && f.start_datum >= fruehesterBewerbungsstart(heute, vorlaufTage);

/* ───── Lebensmittel ───── */

export type BestandStatus = 'ok' | 'knapp' | 'leer';

/** Restbestand und Ampel: leer ab 0, knapp bei höchstens 25 % des Erhaltenen. */
export function bestand(erhalten: number, verbraucht: number): { rest: number; status: BestandStatus; prozent: number } {
  const rest = Math.round((erhalten - verbraucht) * 1000) / 1000;
  const status: BestandStatus = rest <= 0 ? 'leer' : erhalten > 0 && rest <= erhalten * 0.25 ? 'knapp' : 'ok';
  const prozent = erhalten > 0 ? Math.max(0, Math.min(100, Math.round((rest / erhalten) * 100))) : 0;
  return { rest, status, prozent };
}

/**
 * Hochrechnung: Reicht der Rest für die übrigen Tage? Grundlage ist der Durchschnitt pro vergangenem Tag mit Verbrauch
 * (vom ersten Tag der Freizeit bis zum letzten Tag mit Verbrauch).
 */
export function hochrechnung(
  verbrauchProTag: { datum: string; menge: number }[],
  freizeitTage: string[],
  rest: number,
): { bedarf: number; resttage: number; reicht: boolean } | null {
  const mitVerbrauch = verbrauchProTag.filter((v) => v.menge > 0);
  if (!mitVerbrauch.length || !freizeitTage.length) return null;
  const letzter = mitVerbrauch.map((v) => v.datum).sort().at(-1)!;
  const vergangen = freizeitTage.filter((t) => t <= letzter).length;
  const resttage = freizeitTage.filter((t) => t > letzter).length;
  if (vergangen === 0 || resttage === 0) return null;
  const summe = mitVerbrauch.reduce((s, v) => s + v.menge, 0);
  const bedarf = Math.round((summe / vergangen) * resttage * 10) / 10;
  return { bedarf, resttage, reicht: bedarf <= rest };
}

/* ───── Team ───── */

export const ROLLEN_LABEL = { leitung: 'Leitung', teamer: 'TeamerIn' } as const;

/** Leitung zuerst, dann nach Nachname. */
export function sortiereTeam<T extends { rolle: 'leitung' | 'teamer'; nachname: string; vorname: string }>(team: T[]): T[] {
  return [...team].sort((a, b) =>
    (a.rolle === b.rolle ? 0 : a.rolle === 'leitung' ? -1 : 1) ||
    a.nachname.localeCompare(b.nachname, 'de') || a.vorname.localeCompare(b.vorname, 'de'));
}

/** Farbe einer Freizeit (stabil aus der ID abgeleitet). */
export function freizeitFarbe(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 55% 45%)`;
}
