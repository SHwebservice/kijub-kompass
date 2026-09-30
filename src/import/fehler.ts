/** Verständliche Meldungen für Fehler beim KiJuKo-Import – mit der technischen Angabe zum Weitergeben. */

export interface ImportMeldung { text: string; technisch: string }

type Roh = { code?: unknown; message?: unknown; name?: unknown; status?: unknown };

/**
 * Übersetzt den Fehler des Datenbankaufrufs (oder des Browsers) in einen Hinweis, was zu tun ist.
 * `schritt` bestimmt den Einleitungssatz; die technische Angabe (Code und Meldung) steht separat für die Fehlersuche.
 */
export function importMeldung(fehler: unknown, schritt: 'pruefen' | 'uebernehmen'): ImportMeldung {
  const f = (typeof fehler === 'object' && fehler !== null ? fehler : {}) as Roh;
  const code = typeof f.code === 'string' ? f.code : '';
  const msg = typeof f.message === 'string' ? f.message : typeof fehler === 'string' ? fehler : '';
  const technisch = [f.name && f.name !== 'Error' ? String(f.name) : '', code, msg].filter(Boolean).join(' · ') || 'keine Angabe';
  const einleitung = schritt === 'pruefen' ? 'Die Datei konnte nicht geprüft werden.' : 'Der Import ist fehlgeschlagen. Es wurde nichts verändert.';

  if (code === 'PGRST202' || /could not find the function|does not exist|schema cache/i.test(msg)) {
    return { text: `${einleitung} Die Import-Funktion fehlt in der Datenbank: Die Migration „0010_kijuko_import.sql“ wurde noch nicht eingespielt (siehe docs/SETUP.md).`, technisch };
  }
  if (code === '42501' || /permission denied|row-level security|nur die koordination/i.test(msg)) {
    return { text: `${einleitung} Dafür fehlt die Berechtigung – der Import ist der Koordination vorbehalten. Bitte mit einem Koordinations-Zugang anmelden.`, technisch };
  }
  if (code === '57014' || /statement timeout|canceling statement/i.test(msg)) {
    return { text: `${einleitung} Die Datenbank hat zu lange gebraucht und abgebrochen. Bitte in ein paar Minuten noch einmal versuchen.`, technisch };
  }
  if (code === 'PGRST301' || code === 'PGRST303' || f.status === 401 || /jwt/i.test(msg)) {
    return { text: `${einleitung} Die Anmeldung ist abgelaufen. Bitte abmelden, neu anmelden und noch einmal versuchen.`, technisch };
  }
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) {
    return { text: `${einleitung} Keine Verbindung zum Server. Bitte die Internetverbindung prüfen und noch einmal versuchen.`, technisch };
  }
  if (/subtle|crypto/i.test(msg)) {
    return { text: `${einleitung} Der Browser stellt hier keine Verschlüsselungsfunktionen bereit – das passiert, wenn die Seite ohne HTTPS über eine Netzwerkadresse geöffnet wird. Bitte über http://localhost:5173 oder die gehostete Adresse öffnen.`, technisch };
  }
  if (code === '23514' || code === 'P0001') {
    return { text: `${einleitung} Die Datenbank hat die Daten abgelehnt: ${msg || 'ungültige Angaben'}`, technisch };
  }
  return { text: `${einleitung} Bitte noch einmal versuchen. Wenn es nicht klappt, die technische Angabe unten an die Entwicklung weitergeben.`, technisch };
}
