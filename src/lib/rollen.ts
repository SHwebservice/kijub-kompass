/** Rollenlogik der Oberfläche. Maßgeblich bleiben die Datenbank-Regeln (docs/RECHTE.md);
 *  hier wird nur entschieden, was angezeigt wird. */

export type Kategorie =
  | 'TeamerIn' | 'Senior-TeamerIn' | 'FSJ' | 'TZK'
  | 'Praktikum bezahlt' | 'Praktikum unbezahlt' | 'Hauptamtliche*r';

export const KATEGORIEN: Kategorie[] = [
  'TeamerIn', 'Senior-TeamerIn', 'FSJ', 'TZK',
  'Praktikum bezahlt', 'Praktikum unbezahlt', 'Hauptamtliche*r',
];

export interface Ich {
  id: string;
  vorname: string;
  nachname: string;
  mail: string;
  kategorie: Kategorie;
  ist_koordination: boolean;
}

export interface FreizeitZuordnung { freizeit_id: string; rolle: 'teamer' | 'leitung' }
export interface TreffZuordnung { treff_id: string; rolle: 'betreuerin' | 'treffleitung' }

export interface Rollen {
  koordination: boolean;
  /** Bewerbende dürfen kommende Freizeiten sehen und sich bewerben (alle außer Hauptamtliche). */
  bewerbend: boolean;
  leitungFreizeiten: string[];
  teamerFreizeiten: string[];
  treffleitungen: string[];
  betreuerTreffs: string[];
  /** Treffmappe: Koordination, Treffleitung, BetreuerIn der Kategorie TZK */
  darfTreffmappe: boolean;
}

export function berechneRollen(
  ich: Ich,
  freizeiten: FreizeitZuordnung[],
  treffs: TreffZuordnung[],
): Rollen {
  const treffleitungen = treffs.filter((t) => t.rolle === 'treffleitung').map((t) => t.treff_id);
  return {
    koordination: ich.ist_koordination,
    bewerbend: ich.kategorie !== 'Hauptamtliche*r',
    leitungFreizeiten: freizeiten.filter((f) => f.rolle === 'leitung').map((f) => f.freizeit_id),
    teamerFreizeiten: freizeiten.filter((f) => f.rolle === 'teamer').map((f) => f.freizeit_id),
    treffleitungen,
    betreuerTreffs: treffs.filter((t) => t.rolle === 'betreuerin').map((t) => t.treff_id),
    darfTreffmappe:
      ich.ist_koordination || treffleitungen.length > 0 ||
      (ich.kategorie === 'TZK' && treffs.length > 0),
  };
}

export interface NavEintrag { pfad: string; label: string; icon: string }

/** Hauptnavigation (mobil: untere Leiste, höchstens 5 Einträge). */
export function navigation(r: Rollen): NavEintrag[] {
  const hatFreizeit = r.koordination || r.bewerbend ||
    r.leitungFreizeiten.length + r.teamerFreizeiten.length > 0;
  const hatTreff = r.koordination || r.treffleitungen.length + r.betreuerTreffs.length > 0;
  return [
    { pfad: '/', label: 'Heute', icon: '🧭' },
    ...(hatFreizeit ? [{ pfad: '/freizeiten', label: 'Freizeiten', icon: '⛺' }] : []),
    ...(hatTreff ? [{ pfad: '/treffs', label: 'Treffs', icon: '🏠' }] : []),
    { pfad: '/katalog', label: 'Katalog', icon: '📚' },
    { pfad: '/mehr', label: 'Mehr', icon: '☰' },
  ];
}

export function rollenBezeichnungen(r: Rollen): string[] {
  const out: string[] = [];
  if (r.koordination) out.push('Koordination');
  if (r.leitungFreizeiten.length) out.push('Freizeitleitung');
  if (r.teamerFreizeiten.length) out.push('TeamerIn');
  if (r.treffleitungen.length) out.push('Treffleitung');
  if (r.betreuerTreffs.length) out.push('BetreuerIn');
  return out;
}

export type RolleInFreizeit = 'koordination' | 'leitung' | 'teamer' | 'gast';

/** Welche Rolle hat die Person in genau dieser Freizeit? (Koordination gilt überall.) */
export function rolleInFreizeit(r: Rollen, freizeitId: string): RolleInFreizeit {
  if (r.koordination) return 'koordination';
  if (r.leitungFreizeiten.includes(freizeitId)) return 'leitung';
  if (r.teamerFreizeiten.includes(freizeitId)) return 'teamer';
  return 'gast';
}

/** Darf Hinweise, Absprachen, Lebensmittel und Kontaktdaten des Teams verwalten bzw. sehen. */
export const istLeitungOderKoordination = (rolle: RolleInFreizeit) => rolle === 'leitung' || rolle === 'koordination';

export type RolleInTreff = 'koordination' | 'treffleitung' | 'betreuerin' | 'gast';

/** Welche Rolle hat die Person in genau diesem Treff? (Koordination gilt überall.) */
export function rolleInTreff(r: Rollen, treffId: string): RolleInTreff {
  if (r.koordination) return 'koordination';
  if (r.treffleitungen.includes(treffId)) return 'treffleitung';
  if (r.betreuerTreffs.includes(treffId)) return 'betreuerin';
  return 'gast';
}
