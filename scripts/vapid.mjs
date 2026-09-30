// Erzeugt neue Schlüssel für die Mitteilungen und zeigt, wohin sie gehören.   npm run vapid
// Die Schlüssel werden NICHT gespeichert – bitte sofort eintragen. Ein neues Schlüsselpaar macht alle bisherigen Geräte-Anmeldungen
// ungültig (alle müssen die Mitteilungen in der App neu einschalten).
import { erzeugeVapid } from './vapid-erzeugen.mjs';

const { oeffentlich, privat } = await erzeugeVapid();
console.log(`
1) Supabase → Edge Functions → Secrets (oder "npx supabase secrets set …"):

   VAPID_PUBLIC_KEY  = ${oeffentlich}
   VAPID_PRIVATE_KEY = ${privat}
   VAPID_SUBJECT     = mailto:freizeiten@frankenthal.de      (eine Kontaktadresse, an die sich Push-Dienste bei Problemen wenden)

2) Cloudflare Pages → Settings → Environment variables (Production und Preview), danach neu bereitstellen:

   VITE_VAPID_PUBLIC_KEY = ${oeffentlich}

   (für die lokale Entwicklung dieselbe Zeile in die Datei .env)

Der PRIVATE Schlüssel gehört nur in die Supabase-Secrets – niemals in .env, ins Repository oder in Cloudflare.
`);
