import { stunden } from './logik';
import { monatTage } from './dienstplan';
import type { RolleInTreff } from '../lib/rollen';

/**
 * Nachweis der Teilzeitkräfte (TZK): je Treff, Monat und Person eine Liste von Tagen mit Zeiten und Stunden.
 * Die Zeilen werden aus dem Dienstplan und den Abwesenheiten vorbefüllt und lassen sich frei ändern.
 * Reine Fachlogik ohne Datenbank und Oberfläche.
 */

export type NachweisStatus = 'entwurf' | 'eingereicht' | 'freigegeben';
export type ZeilenQuelle = 'dienst' | 'abwesenheit' | 'manuell';

export interface NachweisZeile { id: string; datum: string; zeiten: string | null; stunden: number | null; quelle: ZeilenQuelle }

export interface Nachweis {
  id: string;
  person_id: string;
  monat: string;
  status: NachweisStatus;
  unterschrift: string | null;
  freigegeben_von: string | null;
  zeilen: NachweisZeile[];
}

export const STATUS_LABEL: Record<NachweisStatus, string> = { entwurf: 'Entwurf', eingereicht: 'Eingereicht', freigegeben: 'Freigegeben' };

const QUELLE_RANG: Record<ZeilenQuelle, number> = { dienst: 0, manuell: 1, abwesenheit: 2 };

/** Nach Datum, dann Dienste vor manuellen Zeilen vor Abwesenheiten. */
export function sortiereZeilen<T extends Pick<NachweisZeile, 'datum' | 'quelle' | 'id'>>(z: T[]): T[] {
  return [...z].sort((a, b) => a.datum.localeCompare(b.datum) || QUELLE_RANG[a.quelle] - QUELLE_RANG[b.quelle] || a.id.localeCompare(b.id));
}

export const summe = (z: Pick<NachweisZeile, 'stunden'>[]) => Math.round(z.reduce((s, x) => s + (x.stunden ?? 0), 0) * 100) / 100;

const ZEITEN = /(\d{1,2}):(\d{2})\s*(?:-|–|bis)\s*(\d{1,2}):(\d{2})/;
const p2 = (n: string) => n.padStart(2, '0');

/** Liest "14:00 - 17:30" (auch mit Gedankenstrich oder „bis“) und rechnet die Stunden aus; null, wenn keine Zeit erkennbar ist. */
export function parseZeiten(text: string): { von: string; bis: string; stunden: number } | null {
  const m = ZEITEN.exec(text);
  if (!m) return null;
  const von = `${p2(m[1]!)}:${m[2]}`;
  const bis = `${p2(m[3]!)}:${m[4]}`;
  const h = stunden(von, bis);
  return h > 0 ? { von, bis, stunden: h } : null;
}

export interface ZeilenEingabe { datum: string; zeiten: string; stunden: string }

/** Prüft eine Zeile; der Tag muss im Monat des Nachweises liegen. */
export function validiereZeile(e: ZeilenEingabe, monat: string): { datum?: string; stunden?: string } {
  const f: { datum?: string; stunden?: string } = {};
  if (!e.datum) f.datum = 'Bitte einen Tag angeben.';
  else if (!monatTage(monat).includes(e.datum)) f.datum = 'Der Tag liegt nicht in diesem Monat.';
  if (e.stunden.trim() !== '') {
    const h = Number(e.stunden.replace(',', '.'));
    if (!Number.isFinite(h) || h < 0 || h > 24) f.stunden = 'Stunden von 0 bis 24 angeben.';
  }
  return f;
}

export const stundenWert = (text: string): number | null => (text.trim() === '' ? null : Math.round(Number(text.replace(',', '.')) * 100) / 100);

/** Dateiname für den PDF-Export: JJ_MM_Nachname_Vorname. */
export function dateiname(monat: string, vorname: string, nachname: string): string {
  const sauber = (t: string) => t.trim().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}-]/gu, '');
  return `${monat.slice(2, 4)}_${monat.slice(5, 7)}_${sauber(nachname)}_${sauber(vorname)}`;
}

/* ───── Rechte in der Oberfläche (gespiegelt aus den Datenbankregeln) ───── */

export const darfEigenenNachweisFuehren = (kategorie: string, rolle: RolleInTreff) =>
  kategorie === 'TZK' && (rolle === 'betreuerin' || rolle === 'treffleitung');

const verwaltet = (rolle: RolleInTreff) => rolle === 'treffleitung' || rolle === 'koordination';

/** Die Person bearbeitet nur im Entwurf; Treffleitung und Koordination bis zur Freigabe. */
export function darfZeilenBearbeiten(status: NachweisStatus, rolle: RolleInTreff, istEigener: boolean): boolean {
  if (status === 'freigegeben') return false;
  return verwaltet(rolle) || (istEigener && status === 'entwurf');
}

export const darfEinreichen = (status: NachweisStatus, istEigener: boolean) => istEigener && status === 'entwurf';
export const darfFreigeben = (status: NachweisStatus, rolle: RolleInTreff) => verwaltet(rolle) && status === 'eingereicht';
export const darfZurueckgeben = (status: NachweisStatus, rolle: RolleInTreff) => verwaltet(rolle) && status === 'eingereicht';
export const darfFreigabeAufheben = (status: NachweisStatus, rolle: RolleInTreff) => verwaltet(rolle) && status === 'freigegeben';

/** Löschen: die Person ihren Entwurf, die Koordination jeden Nachweis. */
export const darfNachweisLoeschen = (status: NachweisStatus, rolle: RolleInTreff, istEigener: boolean) =>
  rolle === 'koordination' || (istEigener && status === 'entwurf');
