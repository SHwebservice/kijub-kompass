/** Empfängergruppen einer manuellen Mitteilung der Koordination (Entsprechung zu fn_push_ziel in der Datenbank). */

export type ZielArt = 'alle' | 'koordination' | 'leitungen' | 'teamer' | 'freizeit' | 'treff';

export const ZIEL_LABEL: Record<ZielArt, string> = {
  alle: 'Alle Personen',
  koordination: 'Koordination',
  leitungen: 'Alle Leitungen (Freizeiten und Treffs)',
  teamer: 'Alle TeamerInnen und BetreuerInnen',
  freizeit: 'Eine Freizeit',
  treff: 'Ein Treff',
};

export type FreizeitRolle = '' | 'leitung' | 'teamer';
export type TreffRolle = '' | 'treffleitung' | 'betreuerin';

export interface ZielEingabe { art: ZielArt; id: string; rolle: FreizeitRolle | TreffRolle }

/** Das Ziel im Format der Datenbankfunktion; null, solange etwas fehlt (z. B. keine Freizeit gewählt). */
export function zielJson(e: ZielEingabe): Record<string, string> | null {
  switch (e.art) {
    case 'alle': return { art: 'alle' };
    case 'koordination': return { art: 'koordination' };
    case 'leitungen': return { art: 'kategorie', kategorie: 'leitung' };
    case 'teamer': return { art: 'kategorie', kategorie: 'teamer' };
    case 'freizeit': return e.id ? { art: 'freizeit', id: e.id, ...(e.rolle ? { rolle: e.rolle } : {}) } : null;
    case 'treff': return e.id ? { art: 'treff', id: e.id, ...(e.rolle ? { rolle: e.rolle } : {}) } : null;
  }
}

export const MAX_TITEL = 80;
export const MAX_TEXT = 300;

export function validiereMitteilung(titel: string, text: string): { titel?: string; text?: string } {
  const f: { titel?: string; text?: string } = {};
  if (!titel.trim()) f.titel = 'Bitte einen Titel eingeben.';
  else if (titel.trim().length > MAX_TITEL) f.titel = `Der Titel darf höchstens ${MAX_TITEL} Zeichen lang sein.`;
  if (!text.trim()) f.text = 'Bitte einen Text eingeben.';
  else if (text.trim().length > MAX_TEXT) f.text = `Der Text darf höchstens ${MAX_TEXT} Zeichen lang sein.`;
  return f;
}

export interface Vorschau { anzahl: number; personen: { id: string; name: string }[]; mit_geraet: number }

/** Verständlicher Satz zur Reichweite, z. B. „12 Personen – 7 davon haben Mitteilungen eingeschaltet“. */
export function reichweiteText(v: Vorschau): string {
  if (v.anzahl === 0) return 'Diese Gruppe enthält niemanden (außer dir).';
  const personen = `${v.anzahl} ${v.anzahl === 1 ? 'Person' : 'Personen'}`;
  if (v.mit_geraet === 0) return `${personen} – aber niemand hat Mitteilungen eingeschaltet.`;
  if (v.mit_geraet === v.anzahl) return `${personen} – alle haben Mitteilungen eingeschaltet.`;
  return `${personen} – ${v.mit_geraet} davon ${v.mit_geraet === 1 ? 'hat' : 'haben'} Mitteilungen eingeschaltet.`;
}
