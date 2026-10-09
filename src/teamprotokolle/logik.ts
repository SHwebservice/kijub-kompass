/**
 * Teamprotokolle eines Treffs (Migration 0035): Teambesprechung, Information oder Sonstiges zum Nachlesen für das ganze Team.
 * Reine Fachlogik ohne Datenbank und Oberfläche.
 */

export type TeamprotokollArt = 'teambesprechung' | 'information' | 'sonstiges';

export const ARTEN: Record<TeamprotokollArt, { label: string; icon: string }> = {
  teambesprechung: { label: 'Teambesprechung', icon: '👥' },
  information: { label: 'Information', icon: 'ℹ️' },
  sonstiges: { label: 'Sonstiges', icon: '📄' },
};

export interface Teamprotokoll {
  id: string;
  treff_id: string;
  art: TeamprotokollArt;
  datum: string;
  titel: string;
  text: string;
  anwesend: string[];
  erstellt_von: string | null;
  bearbeitet_von: string | null;
  created_at: string;
  updated_at: string;
  /** Wer es gelesen hat (Personen-IDs). */
  gelesen: string[];
}

export interface TeamprotokollEingabe { art: TeamprotokollArt; datum: string; titel: string; text: string; anwesend: string[] }

export const MAX_TEXT = 20000;

export const leeresProtokoll = (heute: string): TeamprotokollEingabe => ({ art: 'teambesprechung', datum: heute, titel: '', text: '', anwesend: [] });

export const eingabeAus = (p: Teamprotokoll): TeamprotokollEingabe => ({ art: p.art, datum: p.datum, titel: p.titel, text: p.text, anwesend: [...p.anwesend] });

export function validiere(e: TeamprotokollEingabe): { titel?: string; text?: string; datum?: string } {
  const f: { titel?: string; text?: string; datum?: string } = {};
  if (!e.titel.trim()) f.titel = 'Bitte einen Titel eingeben.';
  else if (e.titel.trim().length > 200) f.titel = 'Höchstens 200 Zeichen.';
  if (!e.text.trim()) f.text = 'Bitte den Inhalt eintragen.';
  else if (e.text.length > MAX_TEXT) f.text = `Höchstens ${MAX_TEXT} Zeichen.`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.datum)) f.datum = 'Bitte ein Datum angeben.';
  return f;
}

export const istGelesen = (p: Pick<Teamprotokoll, 'gelesen'>, personId: string) => p.gelesen.includes(personId);

/** Wer aus dem Team es noch nicht gelesen hat (ohne die verfassende Person). */
export function nochNichtGelesen(p: Pick<Teamprotokoll, 'gelesen' | 'erstellt_von'>, team: string[]): string[] {
  return team.filter((id) => id !== p.erstellt_von && !p.gelesen.includes(id));
}

/** Ungelesene Protokolle je Treff für die Startseite (eigene zählen nicht). */
export function ungeleseneJeTreff(liste: Pick<Teamprotokoll, 'treff_id' | 'gelesen' | 'erstellt_von'>[], personId: string): Record<string, number> {
  const je: Record<string, number> = {};
  for (const p of liste) if (p.erstellt_von !== personId && !p.gelesen.includes(personId)) je[p.treff_id] = (je[p.treff_id] ?? 0) + 1;
  return je;
}
