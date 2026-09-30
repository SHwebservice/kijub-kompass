import type { Rollen } from '../../lib/rollen';

export interface MenueEintrag { pfad: string; icon: string; label: string; text: string }
export interface MenueGruppe { id: string; titel: string; eintraege: MenueEintrag[] }

const e = (pfad: string, icon: string, label: string, text: string): MenueEintrag => ({ pfad, icon, label, text });

/**
 * Was unter „Mehr“ steht: alles, was nicht schon in der unteren Navigation ist, nach Themen geordnet.
 * Die Verwaltung der Koordination ist in kleine Gruppen unterteilt.
 */
export function baueMenue(r: Rollen | null): MenueGruppe[] {
  const gruppen: MenueGruppe[] = [{
    id: 'wissen', titel: 'Wissen & Material',
    eintraege: [
      e('/teamermappe', '🗂️', 'Teamermappe', 'Handbuch und Regeln für Freizeiten'),
      ...(r?.darfTreffmappe ? [e('/treffmappe', '📒', 'Treffmappe', 'Handbuch und Regeln für die Treffs')] : []),
      e('/formulare', '📝', 'Formulare', 'Zum Ausfüllen, Speichern und Drucken'),
      e('/quiz', '❓', 'Quiz', 'Das eigene Wissen testen'),
      ...(r && !r.koordination ? [e('/katalog/vorschlagen', '💡', 'Programmpunkt vorschlagen', 'Eine Idee für den Katalog einreichen')] : []),
    ],
  }];

  if (r?.koordination) {
    gruppen.push(
      { id: 'personen', titel: 'Personen', eintraege: [
        e('/bewerbungen', '📥', 'Bewerbungen', 'Bewerbungen auf Freizeiten annehmen oder ablehnen'),
        e('/personen', '🪪', 'Personen & Zugänge', 'Personen anlegen, Zugänge und Zuordnungen verwalten'),
      ] },
      { id: 'planung', titel: 'Planung', eintraege: [
        e('/freizeiten/neu', '➕', 'Neue Freizeit', 'Eine Freizeit anlegen'),
        e('/treffs/neu', '🏗️', 'Neuer Treff', 'Einen Treff mit Öffnungszeiten anlegen'),
        e('/orte', '📍', 'Orte', 'Orte und Adressen pflegen'),
      ] },
      { id: 'inhalte', titel: 'Inhalte', eintraege: [
        e('/katalog/vorschlaege', '💡', 'Katalog-Vorschläge', 'Eingereichte Ideen prüfen'),
        e('/katalog/import', '📦', 'Katalog importieren', 'Programmpunkte aus Word oder JSON übernehmen'),
        e('/quiz/verwalten', '🧠', 'Quiz-Fragen', 'Fragen anlegen und ändern'),
      ] },
      { id: 'kommunikation', titel: 'Mitteilungen & Daten', eintraege: [
        e('/mitteilungen', '📢', 'Mitteilung senden', 'An alle oder an eine Gruppe'),
        e('/import', '🔄', 'KiJuKo-Import', 'Daten aus KiJuKo übernehmen'),
      ] },
    );
  }
  return gruppen;
}

/** Initialen für das Profilbild („Anna Adler“ → „AA“). */
export const initialen = (vorname?: string, nachname?: string) => `${vorname?.[0] ?? ''}${nachname?.[0] ?? ''}`.toUpperCase() || '?';
