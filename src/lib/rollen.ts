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
  /** Koordination irgendeines Bereichs (abgeleitet aus den beiden folgenden). */
  ist_koordination: boolean;
  ist_freizeitkoordination: boolean;
  ist_treffkoordination: boolean;
}

export interface FreizeitZuordnung { freizeit_id: string; rolle: 'teamer' | 'leitung' }
export interface TreffZuordnung { treff_id: string; rolle: 'betreuerin' | 'treffleitung' }

export interface Rollen {
  /** Koordination irgendeines Bereichs: gemeinsame Verwaltung (Personen, Orte, Katalog, Quiz, Mitteilungen …). */
  koordination: boolean;
  /** Freizeitenkoordination: Freizeiten, Bewerbungen, Lebensmittel, KiJuKo-Import. */
  freizeitkoordination: boolean;
  /** Treffkoordination: Treffs, Dienstplan, Nachweise, Tagesprotokolle. */
  treffkoordination: boolean;
  /** Bewerbende dürfen kommende Freizeiten sehen und sich bewerben (alle außer Hauptamtliche). */
  bewerbend: boolean;
  leitungFreizeiten: string[];
  teamerFreizeiten: string[];
  treffleitungen: string[];
  betreuerTreffs: string[];
  /** Treffmappe: Treffkoordination, Treffleitung, BetreuerIn der Kategorie TZK */
  darfTreffmappe: boolean;
}

export function berechneRollen(
  ich: Ich,
  freizeiten: FreizeitZuordnung[],
  treffs: TreffZuordnung[],
): Rollen {
  const treffleitungen = treffs.filter((t) => t.rolle === 'treffleitung').map((t) => t.treff_id);
  return {
    koordination: ich.ist_freizeitkoordination || ich.ist_treffkoordination,
    freizeitkoordination: ich.ist_freizeitkoordination,
    treffkoordination: ich.ist_treffkoordination,
    bewerbend: ich.kategorie !== 'Hauptamtliche*r',
    leitungFreizeiten: freizeiten.filter((f) => f.rolle === 'leitung').map((f) => f.freizeit_id),
    teamerFreizeiten: freizeiten.filter((f) => f.rolle === 'teamer').map((f) => f.freizeit_id),
    treffleitungen,
    betreuerTreffs: treffs.filter((t) => t.rolle === 'betreuerin').map((t) => t.treff_id),
    darfTreffmappe:
      ich.ist_treffkoordination || treffleitungen.length > 0 ||
      (ich.kategorie === 'TZK' && treffs.length > 0),
  };
}

export interface NavEintrag { pfad: string; label: string; icon: string }

/** Hauptnavigation (mobil: untere Leiste, höchstens 5 Einträge). */
export function navigation(r: Rollen): NavEintrag[] {
  const hatFreizeit = r.freizeitkoordination || r.bewerbend ||
    r.leitungFreizeiten.length + r.teamerFreizeiten.length > 0;
  const hatTreff = r.treffkoordination || r.treffleitungen.length + r.betreuerTreffs.length > 0;
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
  if (r.freizeitkoordination && r.treffkoordination) out.push('Koordination (Freizeiten und Treffs)');
  else if (r.freizeitkoordination) out.push('Freizeitenkoordination');
  else if (r.treffkoordination) out.push('Treffkoordination');
  if (r.leitungFreizeiten.length) out.push('Freizeitleitung');
  if (r.teamerFreizeiten.length) out.push('TeamerIn');
  if (r.treffleitungen.length) out.push('Treffleitung');
  if (r.betreuerTreffs.length) out.push('BetreuerIn');
  return out;
}

export type RolleInFreizeit = 'koordination' | 'leitung' | 'teamer' | 'gast';

/** Welche Rolle hat die Person in genau dieser Freizeit? (Die Freizeitenkoordination gilt für alle Freizeiten.) */
export function rolleInFreizeit(r: Rollen, freizeitId: string): RolleInFreizeit {
  if (r.freizeitkoordination) return 'koordination';
  if (r.leitungFreizeiten.includes(freizeitId)) return 'leitung';
  if (r.teamerFreizeiten.includes(freizeitId)) return 'teamer';
  return 'gast';
}

/** Darf Hinweise, Absprachen, Lebensmittel und Kontaktdaten des Teams verwalten bzw. sehen. */
export const istLeitungOderKoordination = (rolle: RolleInFreizeit) => rolle === 'leitung' || rolle === 'koordination';

export type RolleInTreff = 'koordination' | 'treffleitung' | 'betreuerin' | 'gast';

/** Welche Rolle hat die Person in genau diesem Treff? (Die Treffkoordination gilt für alle Treffs.) */
export function rolleInTreff(r: Rollen, treffId: string): RolleInTreff {
  if (r.treffkoordination) return 'koordination';
  if (r.treffleitungen.includes(treffId)) return 'treffleitung';
  if (r.betreuerTreffs.includes(treffId)) return 'betreuerin';
  return 'gast';
}
