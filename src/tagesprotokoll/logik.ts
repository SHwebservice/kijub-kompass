import { addTage, isoWochentag, monatErster } from '../treffs/dienstplan';
import type { Oeffnungszeit } from '../treffs/logik';

/**
 * Fachlogik des Tagesprotokolls und der Notizen der Treffs, ohne Datenbank und Oberfläche.
 * Es werden nur Zahlen erfasst (m/w/d), keine Namen von Kindern.
 */

export const MAX_ANZAHL = 500;
export const MAX_TEXT = 5000;
export const MAX_NOTIZ = 1000;
export const MAX_ANTWORT = 2000;

/* ───── Protokoll ───── */

export interface Protokoll {
  id: string;
  treff_id: string;
  datum: string;
  anz_m: number;
  anz_w: number;
  anz_d: number;
  verlauf: string;
  vorkommnisse: string;
  erstellt_von: string | null;
  bearbeitet_von: string | null;
  updated_at: string;
}

export interface ProtokollEingabe { anz_m: number; anz_w: number; anz_d: number; verlauf: string; vorkommnisse: string }

export const leeresProtokoll = (): ProtokollEingabe => ({ anz_m: 0, anz_w: 0, anz_d: 0, verlauf: '', vorkommnisse: '' });

export const eingabeAus = (p: Protokoll): ProtokollEingabe => ({ anz_m: p.anz_m, anz_w: p.anz_w, anz_d: p.anz_d, verlauf: p.verlauf, vorkommnisse: p.vorkommnisse });

export const gesamt = (p: Pick<ProtokollEingabe, 'anz_m' | 'anz_w' | 'anz_d'>) => p.anz_m + p.anz_w + p.anz_d;

/** Zähler mit + und −: bleibt zwischen 0 und MAX_ANZAHL. */
export const aendereAnzahl = (n: number, delta: number) => Math.min(MAX_ANZAHL, Math.max(0, n + delta));

/** Liest eine getippte Zahl; ungültig oder negativ ergibt null, Nachkommastellen werden abgeschnitten. */
export function liesAnzahl(text: string): number | null {
  if (text.trim() === '') return 0;
  if (!/^\d{1,4}$/.test(text.trim())) return null;
  return Number(text.trim());
}

export function validiereProtokoll(e: ProtokollEingabe): { anzahl?: string; verlauf?: string; vorkommnisse?: string } {
  const f: { anzahl?: string; verlauf?: string; vorkommnisse?: string } = {};
  if ([e.anz_m, e.anz_w, e.anz_d].some((n) => !Number.isInteger(n) || n < 0 || n > MAX_ANZAHL)) f.anzahl = `Die Anzahlen müssen ganze Zahlen von 0 bis ${MAX_ANZAHL} sein.`;
  if (e.verlauf.length > MAX_TEXT) f.verlauf = `Höchstens ${MAX_TEXT} Zeichen.`;
  if (e.vorkommnisse.length > MAX_TEXT) f.vorkommnisse = `Höchstens ${MAX_TEXT} Zeichen.`;
  return f;
}

/** Ist ein Protokoll inhaltlich leer (keine Kinder, kein Text)? */
export const istLeer = (e: ProtokollEingabe) => gesamt(e) === 0 && !e.verlauf.trim() && !e.vorkommnisse.trim();

export const hatOeffnung = (datum: string, zeiten: Oeffnungszeit[]) => zeiten.some((o) => o.wochentag === isoWochentag(datum));

/** Hat der Treff an diesem Tag geöffnet und hat die Öffnung zur Uhrzeit ("HH:MM") schon begonnen? Dann ist das Protokoll des Tages fällig. */
export function protokollFaellig(zeiten: Oeffnungszeit[], datum: string, uhrzeit: string): boolean {
  const o = zeiten.find((x) => x.wochentag === isoWochentag(datum));
  return !!o && uhrzeit >= o.von.slice(0, 5);
}

/** Öffnungstage im Zeitraum (einschließlich), jüngster zuerst. */
export function oeffnungstage(zeiten: Oeffnungszeit[], von: string, bis: string): string[] {
  const tage: string[] = [];
  for (let d = bis; d >= von; d = addTage(d, -1)) if (hatOeffnung(d, zeiten)) tage.push(d);
  return tage;
}

/** Öffnungstage der letzten `tage` Tage bis einschließlich heute, für die es noch kein Protokoll gibt (Feiertage ausgenommen). */
export function fehlendeTage(zeiten: Oeffnungszeit[], protokolle: Pick<Protokoll, 'datum'>[], heute: string, tage = 14, feiertage: string[] = []): string[] {
  const da = new Set(protokolle.map((p) => p.datum));
  return oeffnungstage(zeiten, addTage(heute, -(tage - 1)), heute).filter((d) => !da.has(d) && !feiertage.includes(d));
}

/* ───── Vorlagen je Wochentag (Migration 0028) ───── */

/** Text, mit dem „Was war los?“ eines neuen Protokolls an diesem Wochentag vorbelegt wird. */
export interface Vorlage { treff_id: string; wochentag: number; text: string }

export const MAX_VORLAGE = 2000;

/** Die Vorlage für den Wochentag des Datums, sonst ''. */
export const vorlageFuer = (datum: string, vorlagen: Pick<Vorlage, 'wochentag' | 'text'>[]) =>
  vorlagen.find((v) => v.wochentag === isoWochentag(datum))?.text ?? '';

/**
 * Wechselt man bei einem neuen Protokoll den Tag, kommt die Vorlage des neuen Wochentags – aber nur, wenn das Feld noch leer ist
 * oder unverändert die Vorlage des bisherigen Tages enthält. Was jemand schon geschrieben hat, bleibt.
 */
export function verlaufBeiTagwechsel(verlauf: string, alterTag: string, neuerTag: string, vorlagen: Pick<Vorlage, 'wochentag' | 'text'>[]): string {
  const unveraendert = verlauf.trim() === '' || verlauf === vorlageFuer(alterTag, vorlagen);
  return unveraendert ? vorlageFuer(neuerTag, vorlagen) : verlauf;
}

/** Wählbare Tage für ein neues Protokoll: die jüngsten Tage, für die es noch keines gibt, heute zuerst. */
export function waehlbareTage(protokolle: Pick<Protokoll, 'datum'>[], heute: string, tage = 30): string[] {
  const da = new Set(protokolle.map((p) => p.datum));
  return Array.from({ length: tage }, (_, i) => addTage(heute, -i)).filter((d) => !da.has(d));
}

/* ───── Auswertung ───── */

export interface Zahlen { datum: string; anz_m: number; anz_w: number; anz_d: number }

export interface MonatsZeile { monat: string; tage: number; m: number; w: number; d: number; gesamt: number; schnitt: number }

const runde1 = (x: number) => Math.round(x * 10) / 10;

function zeile(monat: string, l: Zahlen[]): MonatsZeile {
  const m = l.reduce((s, x) => s + x.anz_m, 0); const w = l.reduce((s, x) => s + x.anz_w, 0); const d = l.reduce((s, x) => s + x.anz_d, 0);
  return { monat, tage: l.length, m, w, d, gesamt: m + w + d, schnitt: l.length ? runde1((m + w + d) / l.length) : 0 };
}

/** Eine Zeile je Monat mit Protokollen (aufsteigend), Durchschnitt = Kinder je protokolliertem Tag. */
export function auswertungNachMonat(l: Zahlen[]): MonatsZeile[] {
  const je = new Map<string, Zahlen[]>();
  for (const x of l) { const k = monatErster(x.datum); je.set(k, [...(je.get(k) ?? []), x]); }
  return [...je.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => zeile(k, v));
}

export const summeAuswertung = (l: Zahlen[]): MonatsZeile => zeile('', l);

/** Anteil in Prozent (ganzzahlig gerundet); 0, wenn es keine Kinder gab. */
export const anteil = (teil: number, ganz: number) => (ganz === 0 ? 0 : Math.round((teil / ganz) * 100));

/* ───── CSV ───── */

/** Schützt vor Formeln in Excel (=, +, -, @ am Anfang) und setzt Anführungszeichen, wenn nötig. */
export function csvFeld(wert: string | number): string {
  let s = String(wert);
  if (/^[=+\-@\t\r]/.test(s) && typeof wert === 'string') s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const BOM = String.fromCharCode(0xfeff);

const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const WT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const monatName = (monat: string) => `${MONATE[Number(monat.slice(5, 7)) - 1]} ${monat.slice(0, 4)}`;
/** "2027-03-01" → "01.03.2027" (deutsches Excel erkennt das als Datum) */
const datumDe = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;
/** Zahl mit Komma (deutsches Excel rechnet damit) */
const zahlDe = (x: number) => x.toLocaleString('de-DE', { maximumFractionDigits: 1, useGrouping: false });

export interface CsvOptionen {
  /** Überschrift, z. B. das Jahr („2026“) */
  zeitraum?: string;
  /** Zeitpunkt des Exports (für „Erstellt am“) */
  erstellt?: Date;
}

/**
 * Export der Tagesprotokolle als CSV für Excel (Semikolon, BOM, Zeilenende CRLF). Aufbau:
 * 1. Kopf mit Treff, Zeitraum und Erstellungsdatum.
 * 2. **Monatsübersicht:** je Monat Tage mit Protokoll, männlich, weiblich, divers, Kinder gesamt im Monat (Summe aller Tage),
 *    Ø Kinder je Tag und die höchste Zahl an einem Tag; darunter die Summe des Zeitraums und die Anteile m/w/d.
 * 3. **Tage im Einzelnen**, nach Monaten gegliedert, je Monat mit einer Summenzeile (gesamt und Ø je Tag).
 * Hinweis: „Kinder gesamt“ zählt Besuche – wer an drei Tagen kommt, zählt dreimal (es werden keine Namen erfasst).
 */
export function csvProtokolle(l: (Zahlen & { verlauf?: string; vorkommnisse?: string })[], treffName: string, opt: CsvOptionen = {}): string {
  const zeile = (felder: (string | number)[]) => felder.map(csvFeld).join(';');
  const sortiert = [...l].sort((a, b) => a.datum.localeCompare(b.datum));
  const monate = auswertungNachMonat(sortiert);
  const summe = summeAuswertung(sortiert);
  const hoechst = (liste: Zahlen[]) => liste.reduce((n, x) => Math.max(n, x.anz_m + x.anz_w + x.anz_d), 0);
  const imMonat = (monat: string) => sortiert.filter((x) => monatErster(x.datum) === monat);
  const leer = '';
  const z: string[] = [];

  z.push(zeile([`Tagesprotokolle ${treffName}${opt.zeitraum ? ` – ${opt.zeitraum}` : ''}`]));
  if (opt.erstellt) z.push(zeile([`Erstellt am ${opt.erstellt.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}`]));
  z.push(zeile(['„Kinder gesamt“ = Summe der Kinder aller Tage (Besuche); „Ø je Tag“ = Kinder gesamt geteilt durch die Tage mit Protokoll.']));
  z.push(leer);

  z.push(zeile(['Monatsübersicht']));
  z.push(zeile(['Monat', 'Tage mit Protokoll', 'männlich', 'weiblich', 'divers', 'Kinder gesamt', 'Ø Kinder je Tag', 'Höchste Zahl an einem Tag']));
  for (const m of monate) z.push(zeile([monatName(m.monat), m.tage, m.m, m.w, m.d, m.gesamt, zahlDe(m.schnitt), hoechst(imMonat(m.monat))]));
  z.push(zeile([`Summe${opt.zeitraum ? ` ${opt.zeitraum}` : ''}`, summe.tage, summe.m, summe.w, summe.d, summe.gesamt, zahlDe(summe.schnitt), hoechst(sortiert)]));
  if (summe.gesamt > 0) {
    z.push(zeile(['Anteile', leer, `${anteil(summe.m, summe.gesamt)} %`, `${anteil(summe.w, summe.gesamt)} %`, `${anteil(summe.d, summe.gesamt)} %`]));
  }
  z.push(leer);

  z.push(zeile(['Tage im Einzelnen']));
  z.push(zeile(['Monat', 'Datum', 'Wochentag', 'männlich', 'weiblich', 'divers', 'Gesamt', 'Verlauf', 'Vorkommnisse']));
  for (const m of monate) {
    for (const p of imMonat(m.monat)) {
      z.push(zeile([monatName(m.monat), datumDe(p.datum), WT[isoWochentag(p.datum) - 1]!, p.anz_m, p.anz_w, p.anz_d, p.anz_m + p.anz_w + p.anz_d, p.verlauf ?? '', p.vorkommnisse ?? '']));
    }
    z.push(zeile([`Summe ${monatName(m.monat)}`, `${m.tage} ${m.tage === 1 ? 'Tag' : 'Tage'}`, leer, m.m, m.w, m.d, m.gesamt, `Ø ${zahlDe(m.schnitt)} Kinder je Tag`]));
  }
  return `${BOM}${z.join('\r\n')}\r\n`;
}

/* ───── Notizen und Listen ───── */

export type AufgabeArt = 'todo' | 'einkauf' | 'frage' | 'sonstiges';

export const ARTEN: { art: AufgabeArt; label: string; mehrzahl: string; icon: string }[] = [
  { art: 'todo', label: 'To-do', mehrzahl: 'To-dos', icon: '✅' },
  { art: 'einkauf', label: 'Einkauf', mehrzahl: 'Einkaufsliste', icon: '🛒' },
  { art: 'frage', label: 'Offene Frage', mehrzahl: 'Offene Fragen', icon: '❓' },
  { art: 'sonstiges', label: 'Sonstiges', mehrzahl: 'Sonstiges', icon: '📝' },
];

export const artLabel = (a: AufgabeArt) => ARTEN.find((x) => x.art === a)?.label ?? a;

export interface Aufgabe {
  id: string;
  treff_id: string;
  art: AufgabeArt;
  text: string;
  antwort: string | null;
  faellig_am: string | null;
  zustaendig: string | null;
  protokoll_datum: string | null;
  erledigt: boolean;
  erledigt_von: string | null;
  erledigt_am: string | null;
  erstellt_von: string | null;
  created_at: string;
}

export interface AufgabeEingabe { art: AufgabeArt; text: string; faellig_am: string; zustaendig: string }

export const leereAufgabe = (art: AufgabeArt = 'todo'): AufgabeEingabe => ({ art, text: '', faellig_am: '', zustaendig: '' });

/** Einkauf kennt weder Fälligkeit noch Zuständigkeit, eine Frage keine Zuständigkeit. */
export const hatFaelligkeit = (art: AufgabeArt) => art === 'todo' || art === 'sonstiges';
export const hatZustaendig = (art: AufgabeArt) => art === 'todo' || art === 'sonstiges';

export function validiereAufgabe(e: AufgabeEingabe): { text?: string } {
  const t = e.text.trim();
  if (!t) return { text: 'Bitte einen Text eingeben.' };
  if (t.length > MAX_NOTIZ) return { text: `Höchstens ${MAX_NOTIZ} Zeichen.` };
  return {};
}

export const istUeberfaellig = (a: Pick<Aufgabe, 'erledigt' | 'faellig_am'>, heute: string) => !a.erledigt && !!a.faellig_am && a.faellig_am < heute;

/** Offene zuerst (überfällige vorn, dann nach Fälligkeit, ohne Datum zuletzt, neueste zuerst), Erledigte danach nach Erledigung. */
export function sortiereAufgaben<T extends Pick<Aufgabe, 'erledigt' | 'faellig_am' | 'created_at' | 'erledigt_am' | 'id'>>(l: T[]): T[] {
  return [...l].sort((a, b) => {
    if (a.erledigt !== b.erledigt) return a.erledigt ? 1 : -1;
    if (a.erledigt) return (b.erledigt_am ?? '').localeCompare(a.erledigt_am ?? '') || a.id.localeCompare(b.id);
    const fa = a.faellig_am ?? '9999-12-31'; const fb = b.faellig_am ?? '9999-12-31';
    return fa.localeCompare(fb) || b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id);
  });
}

export const offene = <T extends Pick<Aufgabe, 'erledigt'>>(l: T[]) => l.filter((a) => !a.erledigt);

/** Wie viele offene Notizen gibt es je Art? */
export function zaehleJeArt(l: Pick<Aufgabe, 'art' | 'erledigt'>[]): Record<AufgabeArt, number> {
  const z: Record<AufgabeArt, number> = { todo: 0, einkauf: 0, frage: 0, sonstiges: 0 };
  for (const a of l) if (!a.erledigt) z[a.art] += 1;
  return z;
}

/** Offene Notizen, die mir zugewiesen oder überfällig sind – für „Das wartet auf dich“. */
export const fuerMich = (l: Aufgabe[], ichId: string, heute: string) => l.filter((a) => !a.erledigt && (a.zustaendig === ichId || istUeberfaellig(a, heute)));

/** Erledigte Einträge älter als `tage` Tage verschwinden aus der Standardansicht (bleiben aber gespeichert). */
export function imArchiv(a: Pick<Aufgabe, 'erledigt' | 'erledigt_am'>, heute: string, tage = 30): boolean {
  return a.erledigt && !!a.erledigt_am && a.erledigt_am.slice(0, 10) < addTage(heute, -tage);
}

/** Zeitpunkt in Ortszeit für Anzeigen: „02.03.2027 um 11:30 Uhr“. */
export function ortszeit(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} um ${p(d.getHours())}:${p(d.getMinutes())} Uhr`;
}
