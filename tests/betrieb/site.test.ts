import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pruefeSeite } from '../../scripts/site-pruefung.mjs';

const wurzel = join(__dirname, '../..');
const lies = (p: string) => readFileSync(join(wurzel, p), 'utf8');

/** Liest public/_headers wie Cloudflare Pages: Pfadmuster, darunter eingerückte „Name: Wert“-Zeilen. */
function leseHeaders(text: string): { muster: string; header: Record<string, string> }[] {
  const regeln: { muster: string; header: Record<string, string> }[] = [];
  for (const roh of text.split(/\r?\n/)) {
    if (!roh.trim() || roh.trim().startsWith('#')) continue;
    if (!/^\s/.test(roh)) { regeln.push({ muster: roh.trim(), header: {} }); continue; }
    const i = roh.indexOf(':');
    regeln[regeln.length - 1]!.header[roh.slice(0, i).trim().toLowerCase()] = roh.slice(i + 1).trim();
  }
  return regeln;
}

const passt = (muster: string, pfad: string) => muster === pfad || (muster.endsWith('/*') && pfad.startsWith(muster.slice(0, -1)));

const INDEX_HTML = lies('index.html').replace('/src/main.tsx', '/assets/index-abc123.js');

/**
 * Eine nachgebaute Auslieferung mit den ECHTEN Dateien aus public/ (_headers, wrangler.jsonc, Manifest):
 * So prüft der Test, dass die Einstellungen im Repository die Anforderungen der Seitenprüfung erfüllen.
 */
function attrappe(opt: { ohneHeaders?: boolean; mitKarte?: boolean; ohneFallback?: boolean } = {}): typeof fetch {
  const regeln = opt.ohneHeaders ? [] : leseHeaders(lies('public/_headers'));
  const dateien: Record<string, { typ: string; text: string }> = {
    '/index.html': { typ: 'text/html; charset=utf-8', text: INDEX_HTML },
    '/manifest.webmanifest': { typ: 'application/manifest+json', text: lies('public/manifest.webmanifest') },
    '/icon-192.png': { typ: 'image/png', text: 'PNG' },
    '/formulare/Tagesbericht.pdf': { typ: 'application/pdf', text: '%PDF' },
    '/assets/index-abc123.js': { typ: 'text/javascript', text: 'console.log(1)' },
    ...(opt.mitKarte ? { '/assets/index-abc123.js.map': { typ: 'application/json', text: '{"version":3}' } } : {}),
  };
  const fallback = /"not_found_handling":\s*"single-page-application"/.test(lies('wrangler.jsonc')) && !opt.ohneFallback;
  return (async (eingabe: RequestInfo | URL) => {
    const pfad = new URL(String(eingabe)).pathname;
    const datei = pfad === '/' ? dateien['/index.html']! : dateien[pfad] ?? (fallback ? dateien['/index.html']! : undefined);
    if (!datei) return new Response('nicht gefunden', { status: 404, headers: { 'content-type': 'text/plain' } });
    const logisch = pfad === '/' || !dateien[pfad] ? '/index.html' : pfad;
    const header = new Headers({ 'content-type': datei.typ });
    for (const r of regeln) if (passt(r.muster, logisch) || passt(r.muster, pfad)) for (const [k, v] of Object.entries(r.header)) header.set(k, v);
    return new Response(datei.text, { status: 200, headers: header });
  }) as typeof fetch;
}

const fehlgeschlagen = (r: { ok: boolean; name: string }[]) => r.filter((x) => !x.ok).map((x) => x.name);

describe('Seitenprüfung gegen die echten Einstellungen aus public/', () => {
  it('alle Prüfungen bestehen mit den Dateien im Repository', async () => {
    const r = await pruefeSeite(attrappe(), 'https://kompass.example.org');
    expect(fehlgeschlagen(r)).toEqual([]);
    expect(r.length).toBeGreaterThanOrEqual(15);
  });

  it('ohne Sicherheitsköpfe schlagen die Kopf-Prüfungen fehl', async () => {
    const f = fehlgeschlagen(await pruefeSeite(attrappe({ ohneHeaders: true }), 'https://kompass.example.org'));
    expect(f).toEqual(expect.arrayContaining(['Content-Security-Policy gesetzt', 'X-Content-Type-Options: nosniff', 'Strict-Transport-Security gesetzt', 'Programmdatei wird lange zwischengespeichert']));
  });

  it('ohne SPA-Fallback erkennt die Prüfung tote Tiefenadressen', async () => {
    const f = fehlgeschlagen(await pruefeSeite(attrappe({ ohneFallback: true }), 'https://kompass.example.org'));
    expect(f).toContain('Tiefe Adressen liefern die App (SPA-Fallback)');
  });

  it('eine ausgelieferte Source-Map fällt auf', async () => {
    const f = fehlgeschlagen(await pruefeSeite(attrappe({ mitKarte: true }), 'https://kompass.example.org'));
    expect(f).toEqual(['Keine Source-Map öffentlich erreichbar']);
  });

  it('die HTML-Antwort des Fallbacks für „.map“ zählt nicht als Source-Map', async () => {
    const r = await pruefeSeite(attrappe(), 'https://kompass.example.org');
    expect(r.find((x) => x.name.startsWith('Keine Source-Map'))?.ok).toBe(true);
  });

  it('HTTP statt HTTPS wird beanstandet', async () => {
    const f = fehlgeschlagen(await pruefeSeite(attrappe(), 'http://kompass.example.org'));
    expect(f).toContain('Seite wird nur über HTTPS ausgeliefert');
  });

  it('eine nicht erreichbare Seite bricht sofort mit einer Meldung ab', async () => {
    const kaputt = (async () => { throw new Error('getaddrinfo ENOTFOUND'); }) as unknown as typeof fetch;
    const r = await pruefeSeite(kaputt, 'https://gibt-es-nicht.example');
    expect(r).toEqual([{ name: 'Startseite erreichbar', ok: false, detail: 'getaddrinfo ENOTFOUND' }]);
  });

  it('Schrägstriche am Ende der Adresse stören nicht', async () => {
    const r = await pruefeSeite(attrappe(), 'https://kompass.example.org///');
    expect(fehlgeschlagen(r)).toEqual([]);
  });
});
