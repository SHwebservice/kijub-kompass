// Edge Function: persönlicher Kalender-Abo-Link mit den eigenen Diensten (iCalendar).
//
//   GET …/functions/v1/kalender?t=<schlüssel>
//
// Kalender-Apps (Google, Apple, Outlook) rufen den Link ohne Anmeldung ab; deshalb läuft die Funktion mit „Verify JWT“ AUS.
// Der Schlüssel (64 Hex-Zeichen) steht nur im Link der Person; die Datenbank speichert nur seinen Hash (Migration 0036) und
// liefert den Kalender über fn_kalender_ics, die nur mit dem Service-Schlüssel ausführbar ist. Unbekannte Schlüssel ergeben 404.
// Die Datei ist bewusst in sich geschlossen (Einzelupload im Dashboard).
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (werden von Supabase automatisch gesetzt).
import { createClient } from 'npm:@supabase/supabase-js@2';

function text(body: string, status: number) {
  return new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
}

Deno.serve(async (req) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return text('Nur GET erlaubt', 405);

  // 1. Schlüssel prüfen, bevor die Datenbank gefragt wird
  const schluessel = new URL(req.url).searchParams.get('t') ?? '';
  if (!/^[0-9a-f]{64}$/.test(schluessel)) return text('Kalender nicht gefunden', 404);

  // 2. Kalender holen (die Datenbank prüft den Schlüssel gegen den gespeicherten Hash)
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data, error } = await admin.rpc('fn_kalender_ics', { p_token: schluessel });
  if (error) return text('Kalender gerade nicht verfügbar', 503);
  if (typeof data !== 'string') return text('Kalender nicht gefunden', 404);

  return new Response(req.method === 'HEAD' ? null : data, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="dienste.ics"',
      'Cache-Control': 'private, max-age=900',
    },
  });
});
