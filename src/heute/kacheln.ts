/**
 * Schnellzugriff der Startseite: welche Kacheln jemand abhängig von ALLEN seinen Rollen sieht.
 * Reine Fachlogik – die Datenbank schützt die Inhalte ohnehin; die Kacheln zeigen nur, was zur Rolle gehört.
 */

export interface Ziel { label: string; pfad: string }

export interface Kachel {
  id: string;
  label: string;
  icon: string;
  /** Direkter Link; bei mehreren Zielen der Sammelseite (die Auswahl steht in `ziele`). */
  pfad: string;
  /** Mehr als ein Ziel (z. B. mehrere aktuelle Freizeiten): die Kachel klappt eine Auswahl auf. */
  ziele?: Ziel[];
  /** Zahl der Dinge, die Aufmerksamkeit brauchen. */
  badge?: number;
}

export type GruppenId = 'freizeiten' | 'treffs' | 'wissen' | 'verwaltung';
export interface KachelGruppe { id: GruppenId; titel: string; kacheln: Kachel[] }

export interface Zaehler {
  hinweise: number;
  treffAbsprachen: number;
  knapp: number;
  wuensche: number;
  bewerbungen: number;
  vorschlaege: number;
  nachweise: number;
  diensteHeute: number;
  /** Treffs, die heute geöffnet haben und für die noch kein Tagesprotokoll geschrieben wurde. */
  protokollFehlt: number;
  /** Offene Notizen und Listen in den Treffs. */
  offeneNotizen: number;
  /** Offene Fehlermeldungen der App (nur Koordination). */
  fehler: number;
}

export const KEINE_ZAEHLER: Zaehler = { hinweise: 0, treffAbsprachen: 0, knapp: 0, wuensche: 0, bewerbungen: 0, vorschlaege: 0, nachweise: 0, diensteHeute: 0, protokollFehlt: 0, offeneNotizen: 0, fehler: 0 };

export interface KachelKontext {
  /** Freizeitenkoordination: alle Freizeiten, Bewerbungen, Lebensmittel, KiJuKo-Import. */
  freizeitkoordination: boolean;
  /** Treffkoordination: alle Treffs, Dienstplan, Nachweise, Tagesprotokolle. */
  treffkoordination: boolean;
  bewerbend: boolean;
  darfTreffmappe: boolean;
  /** Ist in mindestens einer Freizeit Leitung. */
  leitung: boolean;
  /** Ist in mindestens einem Treff Treffleitung. */
  treffleitung: boolean;
  /** Ist in mindestens einer Freizeit im Team (TeamerIn oder Leitung). */
  freizeitTeam: boolean;
  /** Ist in mindestens einem Treff im Team. */
  treffTeam: boolean;
  kategorie: string;
  /** Aktuelle bzw. nächste Freizeiten der Person (Freizeitenkoordination: alle aktuellen), in zeitlicher Reihenfolge. */
  freizeiten: { id: string; name: string }[];
  /** Treffs der Person (Treffkoordination: alle). */
  treffs: { id: string; name: string }[];
  zaehler: Zaehler;
}

/** Höchstens so viele Ziele in der aufklappbaren Auswahl einer Kachel. */
export const MAX_ZIELE = 8;

const kachel = (id: string, label: string, icon: string, pfad: string, badge = 0): Kachel => ({ id, label, icon, pfad, ...(badge > 0 ? { badge } : {}) });

/** Eine Kachel pro Zielart: ein Ziel → direkter Link; mehrere → Auswahl; keins → Sammelseite. */
function mitZielen(id: string, label: string, icon: string, sammel: string, ziele: { id: string; name: string }[], unterseite: string, badge = 0): Kachel {
  const z = ziele.slice(0, MAX_ZIELE).map((x) => ({ label: x.name, pfad: `${sammel}/${x.id}/${unterseite}` }));
  if (z.length === 1) return kachel(id, label, icon, z[0]!.pfad, badge);
  if (z.length === 0) return kachel(id, label, icon, sammel, badge);
  return { ...kachel(id, label, icon, sammel, badge), ziele: z };
}

export function baueKacheln(k: KachelKontext): KachelGruppe[] {
  const z = k.zaehler;
  const gruppen: KachelGruppe[] = [];
  /** Koordination irgendeines Bereichs: gemeinsame Verwaltung (Personen, Orte, Katalog, Quiz, Mitteilungen). */
  const koordination = k.freizeitkoordination || k.treffkoordination;

  /* ── Freizeiten ── */
  const freizeiten: Kachel[] = [];
  if (k.freizeitTeam || k.freizeitkoordination) {
    if (k.freizeiten.length > 0) {
      freizeiten.push(mitZielen('plan', 'Wochenplan', '📅', '/freizeiten', k.freizeiten, 'plan'));
      freizeiten.push(mitZielen('hinweise', 'Hinweise', '📣', '/freizeiten', k.freizeiten, 'hinweise', z.hinweise));
      if (k.leitung || k.freizeitkoordination) freizeiten.push(mitZielen('lebensmittel', 'Lebensmittel', '🥕', '/freizeiten', k.freizeiten, 'lebensmittel', z.knapp));
      freizeiten.push(mitZielen('team', 'Team', '👥', '/freizeiten', k.freizeiten, 'team'));
    }
  }
  if (k.freizeitTeam || k.freizeitkoordination || k.bewerbend) {
    freizeiten.push(kachel('freizeiten', k.freizeitTeam || k.freizeitkoordination ? 'Alle Freizeiten' : 'Freizeiten & Bewerben', '⛺', '/freizeiten'));
  }
  if (freizeiten.length) gruppen.push({ id: 'freizeiten', titel: 'Freizeiten', kacheln: freizeiten });

  /* ── Treffs ── */
  const treffs: Kachel[] = [];
  if (k.treffTeam || k.treffkoordination) {
    if (k.treffs.length > 0) {
      treffs.push(mitZielen('protokoll', 'Tagesprotokoll', '📝', '/treffs', k.treffs, 'protokoll', z.protokollFehlt));
      treffs.push(mitZielen('notizen', 'Notizen', '🗒️', '/treffs', k.treffs, 'notizen', z.offeneNotizen));
      treffs.push(mitZielen('dienstplan', 'Dienstplan', '🗓️', '/treffs', k.treffs, 'dienstplan', z.diensteHeute));
      treffs.push(mitZielen('treff-absprachen', 'Absprachen', '🤝', '/treffs', k.treffs, 'absprachen', z.treffAbsprachen));
      if (k.kategorie === 'TZK' || k.treffleitung || k.treffkoordination) treffs.push(mitZielen('nachweis', 'Stundennachweis', '🧾', '/treffs', k.treffs, 'nachweis', k.treffleitung || k.treffkoordination ? z.nachweise : 0));
      if (k.treffleitung || k.treffkoordination) {
        treffs.push(mitZielen('wuensche', 'Dienstwünsche', '✋', '/treffs', k.treffs, 'dienstplan', z.wuensche));
        treffs.push(mitZielen('monat', 'Monatsplan', '📆', '/treffs', k.treffs, 'dienstplan?ansicht=monat'));
        treffs.push(mitZielen('abwesenheit', 'Abwesenheit & Feiertage', '🏖️', '/treffs', k.treffs, 'verwaltung'));
      }
      treffs.push(mitZielen('treff-team', 'Team', '👥', '/treffs', k.treffs, 'team'));
    }
    treffs.push(kachel('treffs', 'Alle Treffs', '🏠', '/treffs'));
  }
  if (treffs.length) gruppen.push({ id: 'treffs', titel: 'Treffs', kacheln: treffs });

  /* ── Wissen und Konto (für alle) ── */
  const wissen: Kachel[] = [
    kachel('katalog', 'Katalog', '📚', '/katalog'),
    kachel('teamermappe', 'Teamermappe', '🗂️', '/teamermappe'),
    ...(k.darfTreffmappe ? [kachel('treffmappe', 'Treffmappe', '📒', '/treffmappe')] : []),
    kachel('formulare', 'Formulare', '📝', '/formulare'),
    kachel('quiz', 'Quiz', '❓', '/quiz'),
    ...(!koordination ? [kachel('vorschlagen', 'Programmpunkt vorschlagen', '💡', '/katalog/vorschlagen')] : []),
    kachel('konto', 'Mitteilungen & Konto', '🔔', '/mehr'),
  ];
  gruppen.push({ id: 'wissen', titel: 'Wissen & Konto', kacheln: wissen });

  /* ── Verwaltung (Koordination) ── */
  if (koordination) {
    const fk = k.freizeitkoordination; const tk = k.treffkoordination;
    gruppen.push({
      id: 'verwaltung', titel: 'Verwaltung',
      kacheln: [
        ...(fk ? [kachel('bewerbungen', 'Bewerbungen', '📥', '/bewerbungen', z.bewerbungen)] : []),
        kachel('vorschlaege', 'Katalog-Vorschläge', '💡', '/katalog/vorschlaege', z.vorschlaege),
        kachel('personen', 'Personen & Zugänge', '🪪', '/personen'),
        ...(fk ? [kachel('neue-freizeit', 'Neue Freizeit', '➕', '/freizeiten/neu')] : []),
        ...(tk ? [kachel('neuer-treff', 'Neuer Treff', '🏗️', '/treffs/neu')] : []),
        kachel('orte', 'Orte', '📍', '/orte'),
        kachel('mitteilung', 'Mitteilung senden', '📢', '/mitteilungen'),
        ...(fk ? [kachel('kijuko', 'KiJuKo-Import', '🔄', '/import')] : []),
        kachel('katalog-import', 'Katalog importieren', '📦', '/katalog/import'),
        kachel('quiz-fragen', 'Quiz-Fragen', '🧠', '/quiz/verwalten'),
        kachel('fehler', 'Fehlermeldungen', '🐞', '/fehler', z.fehler),
      ],
    });
  }
  return gruppen;
}

/** Summe aller Zahlen einer Gruppe (Anzeige an eingeklappten Gruppen). */
export const summeBadges = (g: KachelGruppe) => g.kacheln.reduce((s, x) => s + (x.badge ?? 0), 0);
