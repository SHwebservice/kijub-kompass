// Prüft ein echtes Supabase-Projekt von außen (nur mit dem öffentlichen anon-Schlüssel aus .env):
// Auth-Einstellungen, vorhandene Tabellen, anonyme Sperre, Ablehnung falscher Zugangsdaten.
// Verändert nichts und legt keine Konten an.   npm run check:live
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const wurzel = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = {};
readFileSync(join(wurzel, '.env'), 'utf8').split(/\r?\n/).forEach((l) => {
  const i = l.indexOf('=');
  if (i > 0 && !l.startsWith('#')) env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
});
const url = (env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
const key = env.VITE_SUPABASE_ANON_KEY ?? '';
if (!url || !key) { console.error('.env unvollständig'); process.exit(2); }
const sb = createClient(url, key, { auth: { persistSession: false } });

let fehler = 0;
const zeile = (name, ok, detail = '') => {
  if (!ok) fehler++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ' – ' + detail : ''}`);
};
const gesperrt = (e) => Boolean(e) && (e.code === '42501' || /permission denied/i.test(e.message));

const s = await (await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } })).json();
zeile('Registrierung ist deaktiviert', s.disable_signup === true, `disable_signup=${s.disable_signup}`);
zeile('E-Mail-Anmeldung aktiv', s.external?.email === true);
zeile('Mail-Bestätigung an (autoconfirm aus)', s.mailer_autoconfirm === false);

for (const t of ['personen', 'freizeiten', 'treffs', 'notizen', 'zeitnachweise', 'inhalte', 'angebote', 'import_laeufe']) {
  const { data, error } = await sb.from(t).select('*').limit(1);
  const fehlt = error && (error.code === 'PGRST205' || /does not exist|schema cache/i.test(error.message));
  zeile(`Tabelle ${t}: vorhanden und anonym gesperrt`, gesperrt(error) && !data?.length, fehlt ? 'TABELLE FEHLT' : (error?.code ?? `Daten sichtbar (${data?.length})`));
}
{
  const { error } = await sb.rpc('ist_koord');
  zeile('Funktionen anonym gesperrt', gesperrt(error), error?.code);
}
{
  // Falsche Zugangsdaten müssen abgelehnt werden – und zwar mit derselben Antwort, egal ob die Adresse existiert.
  const { data, error } = await sb.auth.signInWithPassword({ email: 'gibt-es-nicht-xyz@example.org', password: 'falsches-passwort-123' });
  zeile('Unbekannte Adresse wird abgelehnt', Boolean(error) && !data?.session, error ? `${error.status} ${error.code ?? ''}` : 'wurde akzeptiert!');
}
console.log(fehler ? `\n${fehler} Prüfung(en) fehlgeschlagen` : '\nAlles in Ordnung');
process.exit(fehler ? 1 : 0);
