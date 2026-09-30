/** Übersetzt technische Auth-Fehler in verständliche Hinweise. */
export function authFehlerText(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('signups not allowed') || m.includes('user not found'))
    return 'Für diese Mail-Adresse gibt es keinen Zugang. Bitte an die Koordination wenden.';
  if (m.includes('rate') || m.includes('seconds'))
    return 'Zu viele Versuche. Bitte kurz warten und erneut probieren.';
  if (m.includes('expired') || m.includes('invalid'))
    return 'Der Code ist ungültig oder abgelaufen. Bitte neu anfordern.';
  return 'Anmeldung nicht möglich. Bitte erneut versuchen.';
}
