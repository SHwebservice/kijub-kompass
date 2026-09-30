// Edge Function: Zugang entziehen oder Person endgültig löschen (nur Koordination).
//
//   modus "zugang": löscht nur das Login-Konto. Die Person und alle ihre Daten bleiben erhalten.
//   modus "person": löscht das Login-Konto UND die Person samt allem, was an ihr hängt
//                   (Zuordnungen, Bewerbungen, Dienste, Abwesenheiten, Nachweise, Favoriten …).
//                   Verfasste Hinweise/Absprachen bleiben ohne Namen erhalten.
//
// Schutz: Man kann sich nicht selbst entfernen, und die letzte Koordination mit Zugang bleibt immer erhalten
// (zusätzlich erzwingt die Datenbank, dass es stets eine aktive Koordination gibt).
// Die Datei ist bewusst in sich geschlossen (Einzelupload im Dashboard).
//
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (werden von Supabase automatisch gesetzt).
import { createClient } from 'npm:@supabase/supabase-js@2';

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

  // 1. Wer ruft auf? Rolle und Identität kommen aus der Datenbank (JWT der aufrufenden Person), nie aus dem Body.
  const aufrufer = createClient(url, anon, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: istKoord, error: rollenFehler } = await aufrufer.rpc('ist_koord');
  if (rollenFehler || istKoord !== true) return antwort({ fehler: 'Nur die Koordination darf Zugänge und Personen entfernen.' }, 403);
  const { data: eigeneId } = await aufrufer.rpc('meine_person_id');

  // 2. Eingabe prüfen
  let personId: unknown; let modus: unknown;
  try { ({ person_id: personId, modus } = await req.json()); } catch { /* leer */ }
  if (typeof personId !== 'string' || !/^[0-9a-f-]{36}$/i.test(personId)) {
    return antwort({ fehler: 'person_id fehlt oder ist ungültig.' }, 400);
  }
  if (modus !== 'zugang' && modus !== 'person') {
    return antwort({ fehler: 'modus muss "zugang" oder "person" sein.' }, 400);
  }

  // 3. Person laden und Schutzregeln prüfen
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { data: person, error: ladeFehler } = await admin
    .from('personen').select('id, auth_user_id, ist_koordination, aktiv').eq('id', personId).maybeSingle();
  if (ladeFehler || !person) return antwort({ fehler: 'Person nicht gefunden.' }, 404);

  if (person.id === eigeneId) {
    return antwort({ fehler: 'Du kannst dich nicht selbst entfernen. Bitte eine andere Koordination darum bitten.' }, 409);
  }
  if (person.ist_koordination) {
    const { count } = await admin.from('personen').select('id', { count: 'exact', head: true })
      .eq('ist_koordination', true).eq('aktiv', true).not('auth_user_id', 'is', null).neq('id', person.id);
    if (!count) {
      return antwort({ fehler: 'Die letzte Koordination mit Zugang kann nicht entfernt werden.' }, 409);
    }
  }
  if (modus === 'zugang' && !person.auth_user_id) {
    return antwort({ fehler: 'Die Person hat keinen Zugang.' }, 409);
  }

  // 4. Login-Konto löschen (die Verknüpfung in "personen" fällt dabei automatisch auf leer)
  if (person.auth_user_id) {
    const { error } = await admin.auth.admin.deleteUser(person.auth_user_id);
    if (error && !/not found/i.test(error.message)) {
      return antwort({ fehler: `Zugang konnte nicht entfernt werden: ${error.message}` }, 502);
    }
  }

  if (modus === 'zugang') {
    await admin.from('personen').update({ eingeladen_am: null }).eq('id', person.id);
    return antwort({ ok: true, modus });
  }

  // 5. Person endgültig löschen (Kaskade in der Datenbank)
  const { error: loeschFehler } = await admin.from('personen').delete().eq('id', person.id);
  if (loeschFehler) {
    return antwort({ fehler: `Person konnte nicht gelöscht werden: ${loeschFehler.message}` }, 409);
  }
  return antwort({ ok: true, modus });
});
