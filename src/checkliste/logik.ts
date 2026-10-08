import { tageZwischen } from '../freizeiten/logik';
import { addTage } from '../treffs/dienstplan';

/**
 * Checkliste zur Vorbereitung einer Freizeit (Migration 0029): Standardpunkte der Freizeitenkoordination und eigene Punkte der Leitung.
 * Ein Punkt ist erfüllt, wenn er abgehakt ist oder – solange er nicht „nicht relevant“ ist – automatisch erkannt wird
 * (z. B. „Wochenplan steht“). Reine Fachlogik ohne Datenbank und Oberfläche.
 */

export type PunktStatus = 'offen' | 'erledigt' | 'nicht_relevant';
export type Ziel = 'team' | 'plan' | 'hinweise' | 'lebensmittel' | 'teamermappe' | 'quiz' | 'formulare';
export type Automatik = 'leitung' | 'team' | 'bewerbungen' | 'wochenplan' | 'hinweis' | 'hinweise_gesehen' | 'lebensmittel' | 'termin';
/** Fälligkeit relativ zu Beginn oder Ende der Freizeit oder zum Ferienbeginn (Montag der Ferienwoche 1, seit 0031). */
export type Bezug = 'start' | 'ende' | 'ferien';
/** Mit wem ein Termin vereinbart wird: Hinweis für das Team oder Absprache mit der Freizeitenkoordination (seit 0031). */
export type TerminArt = 'hinweis' | 'absprache';

export interface Punkt {
  freizeit_id: string;
  /** Standardpunkt aus der Vorlage oder eigener Punkt der Leitung. */
  art: 'vorlage' | 'eigen';
  id: string;
  titel: string;
  beschreibung: string;
  faellig: string | null;
  ziel: Ziel | null;
  automatik: Automatik | null;
  auto_erfuellt: boolean;
  status: PunktStatus;
  notiz: string;
  geaendert_von: string | null;
  geaendert_am: string | null;
  /** Punkte mit Termin (Vortreffen, Vorgespräch): Art und eingetragener Termin (ISO-Zeitpunkt). */
  termin_art?: TerminArt | null;
  termin?: string | null;
  /** Themen, die bei diesem Punkt besprochen werden, und die je Freizeit abgehakten (1-basiert). */
  themen?: string[];
  themen_erledigt?: number[];
}

export interface VorlagePunkt {
  id: string;
  titel: string;
  beschreibung: string;
  bezug: Bezug;
  tage: number;
  ziel: Ziel | null;
  automatik: Automatik | null;
  position: number;
  aktiv: boolean;
  termin_art: TerminArt | null;
  themen: string[];
}

/** Wohin ein Punkt führt: dort lässt er sich direkt erledigen. */
export const ZIELE: Record<Ziel, { name: string; label: string; pfad: (freizeitId: string) => string }> = {
  team: { name: 'Team', label: 'Zum Team', pfad: (f) => `/freizeiten/${f}/team` },
  plan: { name: 'Wochenplan', label: 'Zum Wochenplan', pfad: (f) => `/freizeiten/${f}/plan` },
  hinweise: { name: 'Hinweise', label: 'Zu den Hinweisen', pfad: (f) => `/freizeiten/${f}/hinweise` },
  lebensmittel: { name: 'Lebensmittel', label: 'Zu den Lebensmitteln', pfad: (f) => `/freizeiten/${f}/lebensmittel` },
  teamermappe: { name: 'Teamermappe', label: 'Zur Teamermappe', pfad: () => '/teamermappe' },
  quiz: { name: 'Quiz', label: 'Zum Quiz', pfad: () => '/quiz' },
  formulare: { name: 'Formulare', label: 'Zu den Formularen', pfad: () => '/formulare' },
};

/** Was die App automatisch erkennt (für Hinweise und die Auswahl in der Vorlage). */
export const AUTOMATIK: Record<Automatik, string> = {
  leitung: 'eine Leitung ist zugeordnet',
  team: 'mindestens eine TeamerIn ist zugeordnet',
  bewerbungen: 'keine Bewerbung ist mehr offen',
  wochenplan: 'jeder Tag hat einen Eintrag im Wochenplan',
  hinweis: 'mindestens ein Hinweis ist eingetragen',
  hinweise_gesehen: 'alle TeamerInnen haben alle Hinweise gesehen',
  lebensmittel: 'ein Lebensmittel-Eingang am Ort ist erfasst',
  termin: 'der eingetragene Termin hat stattgefunden',
};

/** Was beim Eintragen eines Termins entsteht. */
export const TERMIN_ART: Record<TerminArt, { mit: string; folge: string; push: 'hinweis' | 'absprache_freizeit' }> = {
  hinweis: { mit: 'Team (als Hinweis)', folge: 'Das Team bekommt einen Hinweis mit Termin und Themen.', push: 'hinweis' },
  absprache: { mit: 'Freizeitenkoordination (als Absprache)', folge: 'Die Freizeitenkoordination bekommt eine Absprache mit dem Termin.', push: 'absprache_freizeit' },
};

const WOCHENTAGE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const p2 = (n: number) => String(n).padStart(2, '0');
/** „Mittwoch, 22.07.2027, 18:00 Uhr“ in Ortszeit des Geräts. */
export function terminText(iso: string): string {
  const d = new Date(iso);
  return `${WOCHENTAGE[d.getDay()]}, ${p2(d.getDate())}.${p2(d.getMonth() + 1)}.${d.getFullYear()}, ${p2(d.getHours())}:${p2(d.getMinutes())} Uhr`;
}
/** Datum und Uhrzeit aus den Eingabefeldern (Ortszeit) als ISO-Zeitpunkt; null bei fehlender Angabe. */
export function terminAusEingabe(datum: string, uhrzeit: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum) || !/^\d{2}:\d{2}$/.test(uhrzeit)) return null;
  const d = new Date(`${datum}T${uhrzeit}:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export const erfuellt = (p: Pick<Punkt, 'status' | 'auto_erfuellt'>) => p.status === 'erledigt' || (p.status === 'offen' && p.auto_erfuellt);
/** Noch zu tun: weder erfüllt noch „nicht relevant“. */
export const zuTun = (p: Pick<Punkt, 'status' | 'auto_erfuellt'>) => p.status === 'offen' && !p.auto_erfuellt;

export type Gruppe = 'ueberfaellig' | 'bald' | 'spaeter' | 'fertig';
export const BALD_TAGE = 7;

export function gruppeVon(p: Pick<Punkt, 'status' | 'auto_erfuellt' | 'faellig'>, heute: string): Gruppe {
  if (!zuTun(p)) return 'fertig';
  if (p.faellig && p.faellig < heute) return 'ueberfaellig';
  if (p.faellig && p.faellig <= addTage(heute, BALD_TAGE)) return 'bald';
  return 'spaeter';
}

export interface Stand { erledigt: number; gesamt: number; ueberfaellig: number; bald: number }

/** Stand einer Freizeit; „nicht relevant“ zählt nicht mit. */
export function standVon(punkte: Pick<Punkt, 'status' | 'auto_erfuellt' | 'faellig'>[], heute: string): Stand {
  const relevant = punkte.filter((p) => p.status !== 'nicht_relevant');
  return {
    erledigt: relevant.filter(erfuellt).length,
    gesamt: relevant.length,
    ueberfaellig: punkte.filter((p) => gruppeVon(p, heute) === 'ueberfaellig').length,
    bald: punkte.filter((p) => gruppeVon(p, heute) === 'bald').length,
  };
}

/** Stand je Freizeit aus der gemischten Liste. */
export function standJeFreizeit(punkte: Punkt[], heute: string): Record<string, Stand> {
  const je: Record<string, Punkt[]> = {};
  for (const p of punkte) (je[p.freizeit_id] ??= []).push(p);
  return Object.fromEntries(Object.entries(je).map(([id, l]) => [id, standVon(l, heute)]));
}

/** „in 3 Tagen“, „heute“, „seit 2 Tagen überfällig“ */
export function faelligRelativ(faellig: string, heute: string): string {
  const n = tageZwischen(heute, faellig);
  if (n === 0) return 'heute';
  if (n === 1) return 'morgen';
  if (n > 1) return `in ${n} Tagen`;
  return n === -1 ? 'seit gestern überfällig' : `seit ${-n} Tagen überfällig`;
}

/** Fälligkeit einer Vorlage in Worten: „6 Wochen vor Beginn“, „3 Tage nach Ende“, „am ersten Tag“. */
export function vorlageFaelligText(tage: number, bezug: Bezug): string {
  if (tage === 0) return bezug === 'start' ? 'am ersten Tag' : bezug === 'ende' ? 'am letzten Tag' : 'am ersten Ferientag';
  const n = Math.abs(tage);
  const menge = n % 7 === 0 ? `${n / 7} ${n === 7 ? 'Woche' : 'Wochen'}` : `${n} ${n === 1 ? 'Tag' : 'Tage'}`;
  return `${menge} ${tage < 0 ? 'vor' : 'nach'} ${bezug === 'start' ? 'Beginn' : bezug === 'ende' ? 'Ende' : 'Ferienbeginn'}`;
}

export interface VorlageEingabe {
  titel: string; beschreibung: string; bezug: Bezug; tage: number | ''; ziel: Ziel | ''; automatik: Automatik | '';
  termin_art?: TerminArt | '';
  /** Themen, eins je Zeile. */
  themen?: string;
}

/** Themen aus dem Textfeld: eins je Zeile, leere Zeilen fallen weg. */
export const themenAusText = (t: string | undefined) => (t ?? '').split('\n').map((x) => x.trim()).filter(Boolean);

export function validiereVorlage(e: VorlageEingabe): { titel?: string; tage?: string; automatik?: string; themen?: string } {
  const f: { titel?: string; tage?: string; automatik?: string; themen?: string } = {};
  if (e.automatik === 'termin' && !e.termin_art) f.automatik = 'Für „Termin hat stattgefunden“ bitte festlegen, mit wem der Termin vereinbart wird.';
  if (themenAusText(e.themen).length > 20) f.themen = 'Höchstens 20 Themen.';
  if (!e.titel.trim()) f.titel = 'Bitte einen Titel eingeben.';
  else if (e.titel.trim().length > 200) f.titel = 'Höchstens 200 Zeichen.';
  if (e.tage === '' || !Number.isInteger(e.tage) || Math.abs(e.tage) > 365) f.tage = 'Bitte eine ganze Zahl zwischen −365 und 365 angeben.';
  return f;
}

export interface EigenerEingabe { titel: string; beschreibung: string; faellig_am: string }

export function validiereEigenen(e: EigenerEingabe): { titel?: string } {
  if (!e.titel.trim()) return { titel: 'Bitte beschreiben, was zu tun ist.' };
  if (e.titel.trim().length > 200) return { titel: 'Höchstens 200 Zeichen.' };
  return {};
}
