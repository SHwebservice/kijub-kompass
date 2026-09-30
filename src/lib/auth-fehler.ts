/** Mindestlänge für Passwörter (muss mit der Einstellung im Supabase-Dashboard übereinstimmen). */
export const MIN_PASSWORT = 10;

/** Übersetzt technische Auth-Fehler in verständliche Hinweise (ohne Technikdetails). */
export function authFehlerText(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('invalid login credentials'))
    return 'Mail-Adresse oder Passwort stimmt nicht. Bitte prüfen oder die Koordination um ein neues Passwort bitten.';
  if (m.includes('rate') || m.includes('seconds') || m.includes('too many'))
    return 'Zu viele Versuche. Bitte kurz warten und erneut probieren.';
  if (m.includes('different from the old') || m.includes('same_password'))
    return 'Das neue Passwort muss sich vom bisherigen unterscheiden.';
  if (m.includes('weak') || m.includes('at least') || m.includes('password should'))
    return `Das Passwort ist zu schwach. Bitte mindestens ${MIN_PASSWORT} Zeichen verwenden.`;
  if (m.includes('network') || m.includes('fetch'))
    return 'Keine Verbindung zum Server. Bitte Internetverbindung prüfen.';
  return 'Anmeldung nicht möglich. Bitte erneut versuchen.';
}

/** Prüft ein neues Passwort (Länge, Wiederholung). Liefert eine Fehlermeldung oder null. */
export function passwortProblem(neu: string, wiederholung: string): string | null {
  if (neu.length < MIN_PASSWORT) return `Das Passwort braucht mindestens ${MIN_PASSWORT} Zeichen.`;
  if (neu !== wiederholung) return 'Die beiden Eingaben stimmen nicht überein.';
  return null;
}
