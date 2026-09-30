import type { RolleInTreff } from '../lib/rollen';

/**
 * Fachlogik der Treffs ohne Datenbank- und Oberflächenbezug (leicht testbar).
 * Wochentage sind ISO-Zahlen (1 = Montag … 7 = Sonntag), Zeiten "HH:MM".
 */

export const WOCHENTAGE = [1, 2, 3, 4, 5, 6, 7] as const;
const NAMEN = ['', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const KURZ = ['', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

export const wochentagName = (n: number) => NAMEN[n] ?? '';
export const wochentagKuerzel = (n: number) => KURZ[n] ?? '';

export interface Oeffnungszeit { wochentag: number; von: string; bis: string }

/** Eingabe im Formular: je Wochentag an/aus mit Zeiten. */
export type TageEingabe = Record<number, { an: boolean; von: string; bis: string }>;

export const STANDARD_VON = '15:00';
export const STANDARD_BIS = '19:00';

export function leereTage(): TageEingabe {
  return Object.fromEntries(WOCHENTAGE.map((w) => [w, { an: false, von: STANDARD_VON, bis: STANDARD_BIS }]));
}

export function tageAusOeffnungszeiten(liste: Oeffnungszeit[]): TageEingabe {
  const t = leereTage();
  for (const o of liste) t[o.wochentag] = { an: true, von: o.von.slice(0, 5), bis: o.bis.slice(0, 5) };
  return t;
}

export function oeffnungszeitenAusTagen(t: TageEingabe): Oeffnungszeit[] {
  return WOCHENTAGE.filter((w) => t[w]?.an).map((w) => ({ wochentag: w, von: t[w]!.von, bis: t[w]!.bis }));
}

export const sortiereOeffnungszeiten = (l: Oeffnungszeit[]) => [...l].sort((a, b) => a.wochentag - b.wochentag);

export const oeffnungszeitText = (o: Pick<Oeffnungszeit, 'von' | 'bis'>) => `${o.von.slice(0, 5)}–${o.bis.slice(0, 5)} Uhr`;

const ZEIT = /^([01]\d|2[0-3]):[0-5]\d$/;
export const istZeit = (z: string) => ZEIT.test(z);

/** Minuten seit Mitternacht; null bei ungültiger Eingabe. */
export function minuten(z: string): number | null {
  const t = z.slice(0, 5);
  return istZeit(t) ? +t.slice(0, 2) * 60 + +t.slice(3, 5) : null;
}

/** Stunden zwischen zwei Uhrzeiten, auf zwei Stellen gerundet; 0 bei ungültiger oder umgekehrter Angabe. */
export function stunden(von: string, bis: string): number {
  const a = minuten(von); const b = minuten(bis);
  if (a === null || b === null || b <= a) return 0;
  return Math.round(((b - a) / 60) * 100) / 100;
}

export interface TreffEingabe { name: string; ort_id: string; adresse_abw: string; tage: TageEingabe }

/** Prüft die Eingabe; leeres Objekt = in Ordnung. */
export function validiereTreff(e: TreffEingabe): { name?: string; tage?: string } {
  const f: { name?: string; tage?: string } = {};
  if (!e.name.trim()) f.name = 'Bitte einen Namen eingeben.';
  const aktive = WOCHENTAGE.filter((w) => e.tage[w]?.an);
  const schlecht = aktive.find((w) => stunden(e.tage[w]!.von, e.tage[w]!.bis) <= 0);
  if (schlecht) f.tage = `${wochentagName(schlecht)}: Die Öffnungszeit braucht gültige Uhrzeiten, und „bis“ muss nach „von“ liegen.`;
  return f;
}

export const TREFF_ROLLEN_LABEL = { treffleitung: 'Treffleitung', betreuerin: 'BetreuerIn' } as const;

export interface TreffMitglied { person_id: string; rolle: 'treffleitung' | 'betreuerin'; vorname: string; nachname: string; kategorie: string }

/** Treffleitung zuerst, dann nach Nachname und Vorname. */
export function sortiereTreffTeam<T extends Pick<TreffMitglied, 'rolle' | 'vorname' | 'nachname'>>(l: T[]): T[] {
  const rang = (m: T) => (m.rolle === 'treffleitung' ? 0 : 1);
  return [...l].sort((a, b) => rang(a) - rang(b) || a.nachname.localeCompare(b.nachname, 'de') || a.vorname.localeCompare(b.vorname, 'de'));
}

/** Nur diese Kategorien dürfen einem Treff zugeordnet werden (Regel der Datenbank). */
export const TREFF_KATEGORIEN = ['TZK', 'FSJ', 'Praktikum unbezahlt', 'Hauptamtliche*r'];
export const darfInTreff = (kategorie: string) => TREFF_KATEGORIEN.includes(kategorie);

export interface WochenprogrammEintrag { wochentag: number; angebot_id: string | null; angebot_name: string | null; freitext: string | null; notiz: string | null }

export const programmTitel = (e: Pick<WochenprogrammEintrag, 'angebot_name' | 'freitext'>) => e.angebot_name ?? e.freitext ?? '';

/** Wochenprogramm, Dienstplan und Absprachen verwaltet die Treffleitung (und die Koordination). */
export const darfTreffVerwalten = (rolle: RolleInTreff) => rolle === 'treffleitung' || rolle === 'koordination';

/** Alle im Treff (und die Koordination) bestätigen Absprachen. */
export const darfTreffAbspracheBestaetigen = (rolle: RolleInTreff) => rolle !== 'gast';
