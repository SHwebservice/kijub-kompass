/** Fachlogik des Quiz („Lernen“) ohne Datenbank und Oberfläche. */

export type ThemaId = 'aufsicht' | 'datenschutz' | 'tagesablauf' | 'regeln' | 'schwimmen' | 'gesundheit';

export interface Thema { id: ThemaId; label: string; emoji: string }

export const THEMEN: Thema[] = [
  { id: 'aufsicht', label: 'Aufsicht & Abholung', emoji: '🛡️' },
  { id: 'datenschutz', label: 'Datenschutz (DSGVO)', emoji: '🔒' },
  { id: 'tagesablauf', label: 'Tagesablauf', emoji: '🗺️' },
  { id: 'regeln', label: 'Kleidung, Verhalten & Regeln', emoji: '⚠️' },
  { id: 'schwimmen', label: 'Schwimmen & Wasser', emoji: '🏊' },
  { id: 'gesundheit', label: 'Gesundheit & Auffälligkeiten', emoji: '🩹' },
];

export const themaVon = (id: string) => THEMEN.find((t) => t.id === id);

export interface FrageInhalt { thema: ThemaId; frage: string; antworten: string[]; korrekt: number[]; erklaerung: string }
export interface Frage extends FrageInhalt { id: string }

/** Zufallszahl in [0, 1); austauschbar, damit Tests reproduzierbar sind. */
export type Zufall = () => number;

/** Fisher-Yates; verändert das Original nicht. */
export function mischen<T>(l: T[], zufall: Zufall = Math.random): T[] {
  const a = [...l];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(zufall() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export interface Antwort { text: string; korrekt: boolean }

/** Antworten in zufälliger Reihenfolge, die richtigen bleiben markiert. */
export function mischeAntworten(f: Pick<FrageInhalt, 'antworten' | 'korrekt'>, zufall: Zufall = Math.random): Antwort[] {
  return mischen(f.antworten.map((text, i) => ({ text, korrekt: f.korrekt.includes(i) })), zufall);
}

export const istMehrfach = (f: Pick<FrageInhalt, 'korrekt'>) => f.korrekt.length > 1;

/** Richtig ist nur, wer genau die richtigen Antworten gewählt hat – nicht mehr, nicht weniger. */
export function istRichtig(antworten: Antwort[], gewaehlt: number[]): boolean {
  const richtig = antworten.map((a, i) => (a.korrekt ? i : -1)).filter((i) => i >= 0);
  const eindeutig = [...new Set(gewaehlt)];
  return eindeutig.length === richtig.length && eindeutig.every((i) => richtig.includes(i));
}

export type Markierung = 'richtig' | 'falsch' | 'verpasst' | 'neutral';

/** Wie eine Antwort nach der Auswertung gezeigt wird. */
export function markierung(a: Antwort, gewaehlt: boolean): Markierung {
  if (gewaehlt) return a.korrekt ? 'richtig' : 'falsch';
  return a.korrekt ? 'verpasst' : 'neutral';
}

export interface Ergebnistext { emoji: string; titel: string; text: string }

export function ergebnisText(richtig: number, gesamt: number): Ergebnistext {
  const p = gesamt > 0 ? richtig / gesamt : 0;
  if (p === 1) return { emoji: '🏆', titel: 'Perfekt!', text: 'Alle Fragen richtig – du bist bestens vorbereitet!' };
  if (p >= 0.8) return { emoji: '🎉', titel: 'Sehr gut!', text: 'Du hast das Thema gut drauf. Eine kurze Wiederholung der Fehler lohnt sich.' };
  if (p >= 0.6) return { emoji: '👍', titel: 'Gut gemacht!', text: 'Schon gut, aber nochmal wiederholen festigt das Wissen.' };
  if (p >= 0.4) return { emoji: '📚', titel: 'Noch etwas üben', text: 'Lies die Erklärungen nochmal durch und starte dann einen neuen Versuch.' };
  return { emoji: '💪', titel: 'Weitermachen!', text: 'Das Thema braucht noch etwas Übung – einfach nochmal versuchen!' };
}

/** Ein neues Ergebnis ersetzt den Bestwert, wenn der Anteil höher ist (bei gleichem Anteil bleibt der alte). */
export function istNeuerBestwert(neu: { richtig: number; gesamt: number }, alt: { bester_wert: number; gesamt: number } | undefined): boolean {
  if (!alt) return true;
  if (neu.gesamt === 0) return false;
  return neu.richtig / neu.gesamt > (alt.gesamt === 0 ? -1 : alt.bester_wert / alt.gesamt);
}

export const prozent = (wert: number, gesamt: number) => (gesamt > 0 ? Math.round((wert / gesamt) * 100) : 0);

/* ───── Pflege der Fragen (Koordination) ───── */

export interface FrageEingabe { thema: ThemaId; frage: string; antworten: string[]; korrekt: number[]; erklaerung: string }

export const MIN_ANTWORTEN = 2;
export const MAX_ANTWORTEN = 6;

/** Entfernt leere Antworten und rechnet die Nummern der richtigen Antworten um. */
export function bereinigeFrage(e: FrageEingabe): FrageEingabe {
  const behalten = e.antworten.map((a, i) => ({ text: a.trim(), i })).filter((a) => a.text);
  return {
    thema: e.thema, frage: e.frage.trim(), erklaerung: e.erklaerung.trim(),
    antworten: behalten.map((a) => a.text),
    korrekt: behalten.map((a, neu) => (e.korrekt.includes(a.i) ? neu : -1)).filter((n) => n >= 0),
  };
}

/** Prüft eine bereinigte Frage; liefert eine Meldung oder null. */
export function validiereFrage(e: FrageEingabe): string | null {
  if (!e.frage) return 'Bitte eine Frage eingeben.';
  if (e.antworten.length < MIN_ANTWORTEN) return `Bitte mindestens ${MIN_ANTWORTEN} Antworten angeben.`;
  if (e.antworten.length > MAX_ANTWORTEN) return `Höchstens ${MAX_ANTWORTEN} Antworten.`;
  if (e.korrekt.length === 0) return 'Bitte mindestens eine richtige Antwort markieren.';
  if (e.korrekt.length === e.antworten.length) return 'Nicht alle Antworten können richtig sein.';
  return null;
}

/** Fragen eines Themas; ohne Thema alle. */
export const fragenZu = (fragen: Frage[], thema: string | null) => (thema ? fragen.filter((f) => f.thema === thema) : fragen);

export const anzahlJeThema = (fragen: Pick<Frage, 'thema'>[]): Record<string, number> => {
  const r: Record<string, number> = {};
  for (const f of fragen) r[f.thema] = (r[f.thema] ?? 0) + 1;
  return r;
};
