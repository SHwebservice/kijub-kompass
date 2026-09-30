// Prüfung der veröffentlichten Seite (Cloudflare Pages) von außen. Verändert nichts.
// Die eigentliche Prüfung steckt in pruefeSeite() und ist mit einer Attrappe für fetch testbar.

/**
 * @param {typeof fetch} holen  fetch oder eine Attrappe
 * @param {string} adresse      z. B. https://kompass.example.org
 * @returns {Promise<{ name: string, ok: boolean, detail: string }[]>}
 */
export async function pruefeSeite(holen, adresse) {
  const basis = adresse.replace(/\/+$/, '');
  const ergebnis = [];
  const zeile = (name, ok, detail = '') => ergebnis.push({ name, ok: Boolean(ok), detail });
  const hole = async (pfad) => {
    try { return await holen(`${basis}${pfad}`, { redirect: 'manual' }); } catch (e) { return { fehler: e instanceof Error ? e.message : String(e) }; }
  };
  const kopf = (r, name) => (r.headers?.get(name) ?? '').toLowerCase();
  const istHtml = (r) => kopf(r, 'content-type').includes('text/html');

  const start = await hole('/');
  if (start.fehler) {
    zeile('Startseite erreichbar', false, start.fehler);
    return ergebnis;
  }
  const html = await start.text();
  zeile('Startseite erreichbar (200, HTML)', start.status === 200 && istHtml(start), `Status ${start.status}`);
  zeile('Startseite enthält die App', html.includes('id="root"'));
  zeile('Seite wird nur über HTTPS ausgeliefert', basis.startsWith('https://'), basis);

  const csp = kopf(start, 'content-security-policy');
  zeile('Content-Security-Policy gesetzt', csp !== '');
  zeile('  … Skripte nur von der eigenen Seite, ohne „unsafe-inline“', /script-src 'self'(;|$)/.test(csp) && !/script-src[^;]*unsafe/.test(csp), csp ? '' : 'fehlt');
  zeile('  … Einbetten in fremde Seiten verboten', csp.includes("frame-ancestors 'none'"));
  zeile('  … Verbindungen nur zu Supabase', /connect-src 'self' https:\/\/\*\.supabase\.co/.test(csp));
  zeile('X-Content-Type-Options: nosniff', kopf(start, 'x-content-type-options') === 'nosniff');
  zeile('Referrer-Policy gesetzt', kopf(start, 'referrer-policy') !== '');
  zeile('Strict-Transport-Security gesetzt', kopf(start, 'strict-transport-security').includes('max-age='));
  zeile('Startseite wird nicht lange zwischengespeichert', !/max-age=\d{4,}/.test(kopf(start, 'cache-control')) || kopf(start, 'cache-control').includes('no-cache'), kopf(start, 'cache-control'));

  // Tiefe Adressen müssen die App liefern (SPA-Fallback), sonst führen Lesezeichen und „Neu laden“ ins Leere.
  const tief = await hole('/freizeiten/gibt-es-nicht');
  zeile('Tiefe Adressen liefern die App (SPA-Fallback)', !tief.fehler && tief.status === 200 && istHtml(tief), tief.fehler ?? `Status ${tief.status}`);

  const manifest = await hole('/manifest.webmanifest');
  let manifestOk = false;
  if (!manifest.fehler && manifest.status === 200) { try { manifestOk = JSON.parse(await manifest.text()).short_name === 'Kompass'; } catch { manifestOk = false; } }
  zeile('Web-App-Beschreibung (Manifest) vorhanden', manifestOk);

  const icon = await hole('/icon-192.png');
  zeile('App-Symbol vorhanden', !icon.fehler && icon.status === 200 && kopf(icon, 'content-type').includes('image/png'));

  const pdf = await hole('/formulare/Tagesbericht.pdf');
  zeile('Formular-PDFs vorhanden', !pdf.fehler && pdf.status === 200 && kopf(pdf, 'content-type').includes('pdf'));

  // Die Programmdatei: lange zwischenspeichern (Hash im Namen), und keine Source-Map ausliefern
  const skript = /<script[^>]+src="(\/assets\/[^"]+\.js)"/.exec(html)?.[1];
  zeile('Programmdatei ist in der Startseite verlinkt', Boolean(skript));
  if (skript) {
    const js = await hole(skript);
    zeile('Programmdatei wird lange zwischengespeichert', !js.fehler && /max-age=\d{7,}/.test(kopf(js, 'cache-control')) && kopf(js, 'cache-control').includes('immutable'), js.fehler ?? kopf(js, 'cache-control'));
    const karte = await hole(`${skript}.map`);
    const istEchteKarte = !karte.fehler && karte.status === 200 && !istHtml(karte);
    zeile('Keine Source-Map öffentlich erreichbar', !istEchteKarte, istEchteKarte ? 'Source-Map ist abrufbar' : '');
  }
  return ergebnis;
}
