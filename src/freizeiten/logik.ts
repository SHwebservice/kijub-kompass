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
  /** false = von der Freizeitenkoordination für Bewerbungen geschlossen (z. B. voll), Migration 0030. */
  bewerbung_offen?: boolean;
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

const MONATE_KURZ = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
/** "2027-07-05" → "Jul" */
export const formatMonatKurz = (d: string) => MONATE_KURZ[Number(d.slice(5, 7)) - 1]!;
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
  f.status === 'geplant' && f.bewerbung_offen !== false && f.start_datum >= fruehesterBewerbungsstart(heute, vorlaufTage);

/* ───── Bewerbung für eine Ferienzeit (Migration 0030) ───── */

export interface ZeitraumWahl { jahr: number; ferienzeitraum: Ferienzeitraum; wochen: number[] }

/** „Sommer 2027 · Woche 1, 3“ bzw. „Ostern 2027 · jede Woche“ */
export const zeitraumWahlText = (z: ZeitraumWahl) =>
  `${FERIEN_LABEL[z.ferienzeitraum]} ${z.jahr} · ${z.wochen.length ? `Woche ${[...z.wochen].sort((a, b) => a - b).join(', ')}` : 'jede Woche'}`;

/** Freizeiten, die zu einer Zeitraum-Bewerbung passen: geplant, gleiches Jahr und Ferienzeit, passende Woche (ohne Woche: alle). */
export function passendeFreizeiten<T extends FreizeitKurz>(z: ZeitraumWahl, freizeiten: T[]): T[] {
  return freizeiten
    .filter((f) => f.status === 'geplant' && f.ferienzeitraum === z.ferienzeitraum && Number(f.start_datum.slice(0, 4)) === z.jahr
      && (z.wochen.length === 0 || f.ferienwoche === null || z.wochen.includes(f.ferienwoche)))
    .sort((a, b) => a.start_datum.localeCompare(b.start_datum) || a.name.localeCompare(b.name, 'de'));
}

/** Für welche Jahre man sich bewerben kann: dieses und nächstes. */
export const bewerbungsJahre = (heute: string) => [Number(heute.slice(0, 4)), Number(heute.slice(0, 4)) + 1];

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

/**
 * Farbe je Freizeit: zur Wiedererkennung derselben Freizeit in Listen, auf der Startseite und in der Zuordnung (Streifen oder Punkt,
 * nie als Schriftfarbe). Feste Palette wie im alten Auftritt; die Freizeitenkoordination kann eine wählen (Migration 0026), sonst
 * wird sie stabil aus der ID abgeleitet.
 */
export const FREIZEIT_FARBEN = [
  { id: 'blau', label: 'Blau', wert: '#1B4B8A' },
  { id: 'orange', label: 'Orange', wert: '#E84520' },
  { id: 'gruen', label: 'Grün', wert: '#1D9E75' },
  { id: 'lila', label: 'Lila', wert: '#8E44AD' },
  { id: 'gold', label: 'Gold', wert: '#D4A017' },
  { id: 'petrol', label: 'Petrol', wert: '#2C7DA0' },
  { id: 'pink', label: 'Pink', wert: '#C2185B' },
  { id: 'oliv', label: 'Oliv', wert: '#5D8A3C' },
  { id: 'tuerkis', label: 'Türkis', wert: '#0E7C7B' },
  { id: 'rost', label: 'Rost', wert: '#B33F00' },
] as const;

export type FreizeitFarbeId = (typeof FREIZEIT_FARBEN)[number]['id'];

/** Die automatische Farbe aus der ID (ohne Wahl). */
export function automatischeFarbe(id: string): FreizeitFarbeId {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return FREIZEIT_FARBEN[h % FREIZEIT_FARBEN.length]!.id;
}

/** Farbwert einer Freizeit: die gewählte Farbe, sonst die automatische. */
export function freizeitFarbe(id: string, farbe?: string | null): string {
  const gewaehlt = FREIZEIT_FARBEN.find((f) => f.id === farbe);
  return (gewaehlt ?? FREIZEIT_FARBEN.find((f) => f.id === automatischeFarbe(id))!).wert;
}
