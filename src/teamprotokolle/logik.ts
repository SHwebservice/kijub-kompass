/**
 * Teamprotokolle eines Treffs (Migrationen 0035, 0037): Teambesprechung, Information oder Sonstiges zum Nachlesen für das ganze Team.
 * Gegliedert in Abschnitte (Überschrift + Ergebnis), am Ende optional nächstes Treffen sowie Aufgaben und Ziele.
 * Reine Fachlogik ohne Datenbank und Oberfläche.
 */

export type TeamprotokollArt = 'teambesprechung' | 'information' | 'sonstiges';

export const ARTEN: Record<TeamprotokollArt, { label: string; icon: string }> = {
  teambesprechung: { label: 'Teambesprechung', icon: '👥' },
  information: { label: 'Information', icon: 'ℹ️' },
  sonstiges: { label: 'Sonstiges', icon: '📄' },
};

/** Ein Abschnitt: Überschrift (darf leer sein) und Ergebnis. */
export interface Abschnitt { titel: string; text: string }

export interface Teamprotokoll {
  id: string;
  treff_id: string;
  art: TeamprotokollArt;
  datum: string;
  titel: string;
  /** Reiner Text aus allem (setzt die Datenbank). */
  text: string;
  abschnitte: Abschnitt[];
  naechstes_datum: string | null;
  /** "HH:MM:SS" bzw. "HH:MM" */
  naechstes_zeit: string | null;
  aufgaben: string;
  anwesend: string[];
  /** Entwürfe sehen nur Treffleitung und Koordination; sie lösen keine Mitteilung aus. */
  entwurf: boolean;
  erstellt_von: string | null;
  bearbeitet_von: string | null;
  /** Wann und von wem das Protokoll zuletzt ans Team gemeldet wurde (veröffentlicht oder Änderung gemeldet). */
  gemeldet_am: string | null;
  gemeldet_von: string | null;
  created_at: string;
  updated_at: string;
  /** Für wen es als gelesen gilt (Personen-IDs, einschließlich „vor Eintritt“). */
  gelesen: string[];
  /** Wer erst nach dem Protokoll ins Team kam (gilt nicht als ungelesen, hat es aber nicht gelesen). */
  vorEintritt: string[];
}

export interface TeamprotokollEingabe {
  art: TeamprotokollArt;
  datum: string;
  titel: string;
  abschnitte: Abschnitt[];
  naechstes_datum: string;
  naechstes_zeit: string;
  aufgaben: string;
  anwesend: string[];
}

export const MAX_TEXT = 20000;
export const MAX_AUFGABEN = 5000;
export const MAX_ABSCHNITTE = 50;

export const leererAbschnitt = (): Abschnitt => ({ titel: '', text: '' });

export const leeresProtokoll = (heute: string): TeamprotokollEingabe => ({
  art: 'teambesprechung', datum: heute, titel: '', abschnitte: [leererAbschnitt()], naechstes_datum: '', naechstes_zeit: '', aufgaben: '', anwesend: [],
});

export const eingabeAus = (p: Teamprotokoll): TeamprotokollEingabe => ({
  art: p.art, datum: p.datum, titel: p.titel,
  abschnitte: p.abschnitte.length > 0 ? p.abschnitte.map((a) => ({ ...a })) : [leererAbschnitt()],
  naechstes_datum: p.naechstes_datum ?? '', naechstes_zeit: (p.naechstes_zeit ?? '').slice(0, 5), aufgaben: p.aufgaben, anwesend: [...p.anwesend],
});

/** Abschnitte ohne Überschrift und Text fallen weg. */
export const gefuellteAbschnitte = (l: Abschnitt[]) => l.map((a) => ({ titel: a.titel.trim(), text: a.text.trim() })).filter((a) => a.titel || a.text);

const umfang = (e: TeamprotokollEingabe) => gefuellteAbschnitte(e.abschnitte).reduce((s, a) => s + a.titel.length + a.text.length + 2, 0) + e.aufgaben.trim().length;

export type Fehler = { titel?: string; inhalt?: string; datum?: string; abschnitte?: Record<number, string>; aufgaben?: string };

/** Ein Entwurf darf noch ohne Inhalt sein; ein veröffentlichtes Protokoll nicht. */
export function validiere(e: TeamprotokollEingabe, entwurf = false): Fehler {
  const f: Fehler = {};
  if (!e.titel.trim()) f.titel = 'Bitte einen Titel eingeben.';
  else if (e.titel.trim().length > 200) f.titel = 'Höchstens 200 Zeichen.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.datum)) f.datum = 'Bitte ein Datum angeben.';
  const ab: Record<number, string> = {};
  e.abschnitte.forEach((a, i) => { if (a.titel.trim().length > 200) ab[i] = 'Die Überschrift darf höchstens 200 Zeichen lang sein.'; });
  if (Object.keys(ab).length) f.abschnitte = ab;
  if (e.aufgaben.length > MAX_AUFGABEN) f.aufgaben = `Höchstens ${MAX_AUFGABEN} Zeichen.`;
  const leer = gefuellteAbschnitte(e.abschnitte).length === 0 && !e.aufgaben.trim() && !e.naechstes_datum;
  if (!entwurf && leer) f.inhalt = 'Bitte mindestens einen Abschnitt ausfüllen.';
  else if (gefuellteAbschnitte(e.abschnitte).length > MAX_ABSCHNITTE) f.inhalt = `Höchstens ${MAX_ABSCHNITTE} Abschnitte.`;
  else if (umfang(e) > MAX_TEXT) f.inhalt = `Das Protokoll ist zu lang (höchstens ${MAX_TEXT} Zeichen).`;
  return f;
}

export const hatFehler = (f: Fehler) => Object.keys(f).length > 0;

/** Verschiebt einen Abschnitt um eine Stelle (richtung −1 = nach oben). */
export function verschiebe<T>(l: T[], i: number, richtung: -1 | 1): T[] {
  const j = i + richtung;
  if (j < 0 || j >= l.length) return l;
  const n = [...l];
  [n[i], n[j]] = [n[j]!, n[i]!];
  return n;
}

/** Wer ein Protokoll ans Team gemeldet hat, muss es nicht lesen. */
export const verfasser = (p: Pick<Teamprotokoll, 'gemeldet_von' | 'erstellt_von'>) => p.gemeldet_von ?? p.erstellt_von;

export const istGelesen = (p: Pick<Teamprotokoll, 'gelesen'>, personId: string) => p.gelesen.includes(personId);

/** Ungelesen für die Person: veröffentlicht, nicht selbst gemeldet und noch nicht gelesen. */
export const istUngelesen = (p: Pick<Teamprotokoll, 'entwurf' | 'gelesen' | 'gemeldet_von' | 'erstellt_von'>, personId: string) =>
  !p.entwurf && verfasser(p) !== personId && !p.gelesen.includes(personId);

/** Wer aus dem Team es noch nicht gelesen hat (ohne die meldende Person; Entwürfe liest niemand). */
export function nochNichtGelesen(p: Pick<Teamprotokoll, 'entwurf' | 'gelesen' | 'gemeldet_von' | 'erstellt_von'>, team: string[]): string[] {
  return p.entwurf ? [] : team.filter((id) => istUngelesen(p, id));
}

/** Wer es wirklich gelesen hat (ohne „vor Eintritt“). */
export const wirklichGelesen = (p: Pick<Teamprotokoll, 'gelesen' | 'vorEintritt'>) => p.gelesen.filter((id) => !p.vorEintritt.includes(id));

/** Ungelesene Protokolle je Treff für die Startseite (selbst gemeldete und Entwürfe zählen nicht). */
export function ungeleseneJeTreff(liste: Pick<Teamprotokoll, 'treff_id' | 'entwurf' | 'gelesen' | 'gemeldet_von' | 'erstellt_von'>[], personId: string): Record<string, number> {
  const je: Record<string, number> = {};
  for (const p of liste) if (istUngelesen(p, personId)) je[p.treff_id] = (je[p.treff_id] ?? 0) + 1;
  return je;
}

/** Wurde das Protokoll nach dem Anlegen noch geändert (mehr als eine Minute später)? */
export const wurdeGeaendert = (p: Pick<Teamprotokoll, 'created_at' | 'updated_at'>) => new Date(p.updated_at).getTime() - new Date(p.created_at).getTime() > 60_000;

/** Ein Textblock des Ergebnisses: Absatz oder Aufzählung (Zeilen mit „- “, „* “ oder „• “ am Anfang). */
export type Block = { art: 'absatz'; text: string } | { art: 'liste'; punkte: string[] };

export function bloecke(text: string): Block[] {
  const l: Block[] = [];
  const punkt = /^\s*[-*•]\s+/;
  let offen: Block | null = null;                              // eine Leerzeile beendet den laufenden Block
  for (const zeile of text.split(/\r?\n/)) {
    if (zeile.trim() === '') { offen = null; continue; }
    if (punkt.test(zeile)) {
      const p = zeile.replace(punkt, '');
      if (offen?.art === 'liste') offen.punkte.push(p); else { offen = { art: 'liste', punkte: [p] }; l.push(offen); }
    } else if (offen?.art === 'absatz') {
      offen.text += `\n${zeile}`;
    } else {
      offen = { art: 'absatz', text: zeile }; l.push(offen);
    }
  }
  return l;
}
