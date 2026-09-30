// Edge Function: Zugang einrichten bzw. Passwort zurücksetzen (nur Koordination).
//
// Es wird KEINE Mail verschickt. Die Funktion erzeugt ein Startpasswort, setzt es für das Konto der Person
// (legt das Konto bei Bedarf an) und gibt es EINMAL an die Koordination zurück, die es selbst weitergibt.
// Die Person muss es bei der ersten Anmeldung ändern (user_metadata.muss_passwort_aendern).
// Das Passwort wird weder gespeichert noch protokolliert.
//
// Die Datei ist bewusst in sich geschlossen (kein Import aus _shared), damit sie sich auch einzeln im
// Supabase-Dashboard einfügen lässt.
//
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (werden von Supabase automatisch gesetzt).
import { createClient } from 'npm:@supabase/supabase-js@2';

// >>> passwort (identisch mit _shared/passwort.ts – wird durch tests/functions geprüft)
// Ohne leicht verwechselbare Zeichen (0/O, 1/l/I) – die Koordination gibt das Passwort mündlich/per Nachricht weiter.
export const PASSWORT_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
export const GRUPPEN = 3;
export const GRUPPENLAENGE = 4;

/** Zufälliger Index in [0, n) ohne Modulo-Verzerrung (Rejection Sampling). */
function zufallsIndex(n: number, zufall: (b: Uint8Array) => Uint8Array): number {
  const grenze = 256 - (256 % n);
  for (;;) {
    const b = zufall(new Uint8Array(1))[0]!;
    if (b < grenze) return b % n;
  }
}

/** Z. B. "Xk7m-Qp4s-Rt9w": 12 Zeichen aus 57 möglichen ≈ 70 Bit Zufall. */
export function erzeugePasswort(
  zufall: (b: Uint8Array) => Uint8Array = (b) => { crypto.getRandomValues(b as Uint8Array<ArrayBuffer>); return b; },
): string {
  const gruppen: string[] = [];
  for (let g = 0; g < GRUPPEN; g++) {
    let s = '';
    for (let i = 0; i < GRUPPENLAENGE; i++) s += PASSWORT_ALPHABET[zufallsIndex(PASSWORT_ALPHABET.length, zufall)];
    gruppen.push(s);
  }
  return gruppen.join('-');
}
// <<< passwort

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function antwort(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return antwort({ fehler: 'Nur POST erlaubt' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // 1. Wer ruft auf? Rolle kommt aus der Datenbank (JWT der aufrufenden Person), nie aus dem Request-Body.
  const aufrufer = createClient(url, anon, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: istKoord, error: rollenFehler } = await aufrufer.rpc('ist_koord');
  if (rollenFehler || istKoord !== true) return antwort({ fehler: 'Nur die Koordination darf Zugänge einrichten.' }, 403);

  // 2. Eingabe prüfen
  let personId: unknown;
  try { personId = (await req.json()).person_id; } catch { /* leer */ }
  if (typeof personId !== 'string' || !/^[0-9a-f-]{36}$/i.test(personId)) {
    return antwort({ fehler: 'person_id fehlt oder ist ungültig.' }, 400);
  }

  // 3. Person laden
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { data: person, error: ladeFehler } = await admin
    .from('personen').select('id, mail, aktiv, auth_user_id').eq('id', personId).maybeSingle();
  if (ladeFehler || !person) return antwort({ fehler: 'Person nicht gefunden.' }, 404);
  if (!person.aktiv) return antwort({ fehler: 'Die Person ist deaktiviert.' }, 409);

  // 4. Passwort setzen (Konto anlegen oder zurücksetzen)
  const passwort = erzeugePasswort();
  const meta = { muss_passwort_aendern: true };
  let neu = false;

  if (person.auth_user_id) {
    const { error } = await admin.auth.admin.updateUserById(person.auth_user_id, { password: passwort, user_metadata: meta });
    if (error) return antwort({ fehler: `Passwort konnte nicht gesetzt werden: ${error.message}` }, 502);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: person.mail, password: passwort, email_confirm: true, user_metadata: meta,
    });
    if (error || !data.user) {
      const schonDa = /already|registered|exists/i.test(error?.message ?? '');
      return antwort({
        fehler: schonDa
          ? 'Für diese Mail-Adresse gibt es bereits ein Konto, das keiner Person zugeordnet ist. Bitte das Konto im Supabase-Dashboard löschen und erneut versuchen.'
          : `Konto konnte nicht angelegt werden: ${error?.message ?? 'unbekannter Fehler'}`,
      }, schonDa ? 409 : 502);
    }
    neu = true;
    // Der Datenbank-Trigger verknüpft Konto und Person über die Mail; zur Sicherheit ausdrücklich nachziehen.
    await admin.from('personen').update({ auth_user_id: data.user.id }).eq('id', person.id).is('auth_user_id', null);
  }

  await admin.from('personen').update({ eingeladen_am: new Date().toISOString() }).eq('id', person.id);
  return antwort({ ok: true, neu, passwort });
});
