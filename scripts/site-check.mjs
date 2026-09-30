// Prüft die veröffentlichte Seite von außen (Erreichbarkeit, Sicherheitsköpfe, Fallback, Zwischenspeicher). Verändert nichts.
//   npm run check:site -- https://kompass.example.org
import { pruefeSeite } from './site-pruefung.mjs';

const adresse = process.argv[2] ?? process.env.SITE_URL;
if (!adresse || !/^https?:\/\//.test(adresse)) {
  console.error('Bitte die Adresse angeben:  npm run check:site -- https://deine-seite.pages.dev');
  process.exit(2);
}

const ergebnis = await pruefeSeite(fetch, adresse);
let fehler = 0;
for (const z of ergebnis) {
  if (!z.ok) fehler++;
  console.log(`${z.ok ? 'OK  ' : 'FAIL'} ${z.name}${z.detail ? ' – ' + z.detail : ''}`);
}
console.log(fehler ? `\n${fehler} Prüfung(en) fehlgeschlagen` : '\nAlles in Ordnung');
process.exit(fehler ? 1 : 0);
