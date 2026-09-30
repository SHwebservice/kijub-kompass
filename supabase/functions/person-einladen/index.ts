// Edge Function: Person per Mail einladen (nur Koordination).
//
// Ablauf: Die aufrufende Person wird über ihr JWT geprüft (ist_koord()). Erst danach wird mit dem
// Service-Schlüssel eine Supabase-Auth-Einladung verschickt. Der Datenbank-Trigger
// fn_auth_user_verknuepfen verknüpft das neue Konto über die Mail-Adresse mit der Person.
//
// Erforderliche Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (automatisch gesetzt)
// und APP_URL (z. B. https://kompass.example.org) als Ziel des Einladungslinks.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function antwort(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return antwort({ fehler: 'Nur POST erlaubt' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const appUrl = Deno.env.get('APP_URL');
  if (!appUrl) return antwort({ fehler: 'APP_URL ist nicht gesetzt' }, 500);

  // 1. Wer ruft auf? (Identität und Rolle kommen aus der Datenbank, nie aus dem Request-Body.)
  const aufrufer = createClient(url, anon, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: istKoord, error: rollenFehler } = await aufrufer.rpc('ist_koord');
  if (rollenFehler || istKoord !== true) return antwort({ fehler: 'Nur die Koordination darf einladen.' }, 403);

  // 2. Eingabe prüfen
  let personId: unknown;
  try { personId = (await req.json()).person_id; } catch { /* leer */ }
  if (typeof personId !== 'string' || !/^[0-9a-f-]{36}$/i.test(personId)) {
    return antwort({ fehler: 'person_id fehlt oder ist ungültig.' }, 400);
  }

  // 3. Person laden und einladen
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { data: person, error: ladeFehler } = await admin
    .from('personen').select('id, mail, aktiv, auth_user_id').eq('id', personId).maybeSingle();
  if (ladeFehler || !person) return antwort({ fehler: 'Person nicht gefunden.' }, 404);
  if (!person.aktiv) return antwort({ fehler: 'Die Person ist deaktiviert.' }, 409);
  if (person.auth_user_id) return antwort({ fehler: 'Die Person hat bereits ein Konto und kann sich per Code anmelden.' }, 409);

  const { error: einladeFehler } = await admin.auth.admin.inviteUserByEmail(person.mail, { redirectTo: appUrl });
  if (einladeFehler) return antwort({ fehler: `Einladung nicht möglich: ${einladeFehler.message}` }, 502);

  await admin.from('personen').update({ eingeladen_am: new Date().toISOString() }).eq('id', person.id);
  return antwort({ ok: true });
});
