import type { Rollen } from '../../lib/rollen';

export interface MenueEintrag { pfad: string; icon: string; label: string; text: string }
export interface MenueGruppe { id: string; titel: string; eintraege: MenueEintrag[] }

const e = (pfad: string, icon: string, label: string, text: string): MenueEintrag => ({ pfad, icon, label, text });

/**
 * Was unter „Mehr“ steht: Nachschlagen, eigene Dienste und die Verwaltung der Koordination.
 * Was zu einem Bereich der Navigation gehört (Bewerbungen bei den Freizeiten, Vorschläge im Katalog), steht dort und nicht hier.
 */
export function baueMenue(r: Rollen | null): MenueGruppe[] {
  const gruppen: MenueGruppe[] = [{
    id: 'wissen', titel: 'Wissen & Material',
    eintraege: [
      e('/teamermappe', '🗂️', 'Teamermappe', 'Handbuch und Regeln für Freizeiten'),
      ...(r?.darfTreffmappe ? [e('/treffmappe', '📒', 'Treffmappe', 'Handbuch und Regeln für die Treffs')] : []),
      e('/formulare', '📝', 'Formulare', 'Zum Ausfüllen, Speichern und Drucken'),
      e('/quiz', '❓', 'Quiz', 'Das eigene Wissen testen'),
    ],
  }];

  // Wer in einem Treff Dienste hat, findet sie hier über alle Treffs hinweg (mit Kalender-Übernahme)
  if (r && r.treffleitungen.length + r.betreuerTreffs.length > 0) {
    gruppen.unshift({ id: 'dienste', titel: 'Meine Dienste', eintraege: [e('/dienste', '🗓️', 'Meine Dienste', 'Alle eigenen Dienste, Wünsche und Kalender-Abo')] });
  }

  if (r?.koordination) {
    const fk = r.freizeitkoordination; const tk = r.treffkoordination;
    gruppen.push(
      { id: 'personen', titel: 'Personen & Orte', eintraege: [
        e('/personen', '🪪', 'Personen & Zugänge', 'Personen anlegen, Zugänge und Zuordnungen verwalten'),
        e('/orte', '📍', 'Orte', 'Orte und Adressen pflegen'),
      ] },
      { id: 'planung', titel: 'Planung', eintraege: [
        ...(fk ? [e('/freizeiten/neu', '➕', 'Neue Freizeit', 'Eine Freizeit anlegen')] : []),
        ...(fk ? [e('/checkliste', '✅', 'Checkliste für Freizeiten', 'Standardpunkte der Vorbereitung pflegen')] : []),
        ...(tk ? [e('/treffs/neu', '🏗️', 'Neuer Treff', 'Einen Treff mit Öffnungszeiten anlegen')] : []),
      ] },
      { id: 'daten', titel: 'Mitteilungen & Daten', eintraege: [
        e('/mitteilungen', '📢', 'Mitteilung senden', 'An alle oder an eine Gruppe'),
        e('/quiz/verwalten', '🧠', 'Quiz-Fragen', 'Fragen anlegen und ändern'),
        ...(fk ? [e('/import', '🔄', 'KiJuKo-Import', 'Daten aus KiJuKo übernehmen')] : []),
        e('/fehler', '🐞', 'Fehlermeldungen', 'Was die App selbst als Fehler gemeldet hat'),
      ] },
    );
  }
  return gruppen;
}

/** Initialen für das Profilbild („Anna Adler“ → „AA“). */
export const initialen = (vorname?: string, nachname?: string) => `${vorname?.[0] ?? ''}${nachname?.[0] ?? ''}`.toUpperCase() || '?';
