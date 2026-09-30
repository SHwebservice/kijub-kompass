/** Fehler aus der Datenbank-Schnittstelle, mit Code für verständliche Meldungen. */
export class ApiFehler extends Error {
  code: string | undefined;
  constructor(quelle: { code?: string; message: string }) {
    super(quelle.message);
    this.name = 'ApiFehler';
    this.code = quelle.code;
  }
}

/** Übersetzt technische Fehler in Hinweise für Nutzende (ohne SQL- oder Servertexte). */
export function fehlerText(e: unknown, standard = 'Das hat nicht geklappt. Bitte erneut versuchen.'): string {
  const code = e instanceof ApiFehler ? e.code : typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : undefined;
  const msg = e instanceof Error ? e.message : typeof e === 'object' && e !== null && 'message' in e ? String((e as { message: unknown }).message) : '';
  if (code === '42501' || /row-level security|permission denied/i.test(msg)) return 'Dafür fehlt die Berechtigung.';
  if (code === '23505') return 'Das gibt es schon.';
  if (code === '23503') return 'Das wird noch verwendet und kann deshalb nicht entfernt werden.';
  // Regeln, die unsere Datenbankfunktionen selbst melden (z. B. „Du bist an diesem Tag schon eingeteilt“), sind für Menschen geschrieben.
  // Technische Meldungen der Datenbank („violates check constraint …“) bleiben verborgen.
  if (code === '23514' && msg && !/violates|relation|constraint|violation/i.test(msg)) return msg;
  if (code === '23514' || code === '22007' || code === '22008') return 'Die Angaben sind nicht gültig. Bitte prüfen.';
  if (/failed to fetch|network|load failed/i.test(msg)) return 'Keine Verbindung zum Server. Bitte Internetverbindung prüfen.';
  return standard;
}
