import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const code = readFileSync(join(__dirname, '../../public/sw.js'), 'utf8');
const HERKUNFT = 'https://kompass.example.org';

interface Ereignis { waitUntil: (p: Promise<unknown>) => void; [k: string]: unknown }
type Handler = (e: Ereignis) => void;

/** Führt sw.js in einer nachgebauten Service-Worker-Umgebung aus. */
function aufbau(offeneFenster: { url: string; navigate?: (u: string) => void; focus?: () => Promise<void> }[] = []) {
  const handler: Record<string, Handler> = {};
  const log = { benachrichtigungen: [] as { titel: string; optionen: Record<string, unknown> }[], geoeffnet: [] as string[], navigiert: [] as string[], fokus: 0, geschlossen: 0, skipWaiting: 0, claim: 0 };
  const fenster = offeneFenster.map((f) => ({ url: f.url, ...(f.navigate ? { navigate: (u: string) => { log.navigiert.push(u); } } : {}), focus: async () => { log.fokus++; } }));
  const self = {
    location: { origin: HERKUNFT },
    addEventListener: (name: string, fn: Handler) => { handler[name] = fn; },
    skipWaiting: () => { log.skipWaiting++; },
    registration: { showNotification: async (titel: string, optionen: Record<string, unknown>) => { log.benachrichtigungen.push({ titel, optionen }); } },
    clients: {
      claim: async () => { log.claim++; },
      matchAll: async () => fenster,
      openWindow: async (u: string) => { log.geoeffnet.push(u); },
    },
  };
  vm.runInNewContext(code, { self, URL, console });
  const feuere = async (name: string, e: Partial<Ereignis>) => {
    const erwartet: Promise<unknown>[] = [];
    handler[name]!({ waitUntil: (p: Promise<unknown>) => { erwartet.push(p); }, ...e } as Ereignis);
    await Promise.all(erwartet);
  };
  return { feuere, log, handler };
}

const pushMit = (daten: unknown) => ({ data: { json: () => { if (daten === 'kaputt') throw new Error('kein JSON'); return daten; } } });

describe('Service Worker: Mitteilung anzeigen', () => {
  let s: ReturnType<typeof aufbau>;
  beforeEach(() => { s = aufbau(); });

  it('zeigt Titel und Text, mit App-Symbol und Zieladresse', async () => {
    await s.feuere('push', pushMit({ titel: 'Neuer Hinweis · Sommer-Sause', text: 'Bitte Sonnencreme mitbringen', url: '/freizeiten/f1/hinweise' }));
    expect(s.log.benachrichtigungen).toHaveLength(1);
    const b = s.log.benachrichtigungen[0]!;
    expect(b.titel).toBe('Neuer Hinweis · Sommer-Sause');
    expect(b.optionen).toMatchObject({ body: 'Bitte Sonnencreme mitbringen', icon: '/icon-192.png', data: { url: '/freizeiten/f1/hinweise' } });
  });

  it('ohne oder mit kaputter Nutzlast gibt es trotzdem eine sinnvolle Mitteilung', async () => {
    await s.feuere('push', { data: null });
    await s.feuere('push', pushMit('kaputt'));
    await s.feuere('push', pushMit({}));
    expect(s.log.benachrichtigungen.map((b) => b.titel)).toEqual(['KiJuB-Kompass', 'KiJuB-Kompass', 'KiJuB-Kompass']);
    expect(s.log.benachrichtigungen[0]!.optionen).toMatchObject({ body: '', data: { url: '/' } });
  });

  it('kürzt übergroße Texte und ignoriert falsche Typen', async () => {
    await s.feuere('push', pushMit({ titel: 'T'.repeat(300), text: 'x'.repeat(1000) }));
    await s.feuere('push', pushMit({ titel: 5, text: { a: 1 }, url: 7 }));
    expect(s.log.benachrichtigungen[0]!.titel).toHaveLength(100);
    expect((s.log.benachrichtigungen[0]!.optionen.body as string)).toHaveLength(300);
    expect(s.log.benachrichtigungen[1]!.titel).toBe('KiJuB-Kompass');
    expect(s.log.benachrichtigungen[1]!.optionen).toMatchObject({ body: '', data: { url: '/' } });
  });

  it('fremde oder gefährliche Adressen führen nur zur Startseite', async () => {
    for (const url of ['https://boese.example/', '//boese.example/x', 'javascript:alert(1)', '\\boese', 'freizeiten', '/x\\y']) {
      await s.feuere('push', pushMit({ titel: 'T', text: 't', url }));
    }
    expect(s.log.benachrichtigungen.every((b) => (b.optionen.data as { url: string }).url === '/')).toBe(true);
  });

  it('übernimmt sofort die Kontrolle, speichert aber nichts zwischen und fängt keine Anfragen ab', async () => {
    await s.feuere('install', {});
    await s.feuere('activate', {});
    expect(s.log.skipWaiting).toBe(1);
    expect(s.log.claim).toBe(1);
    expect(s.handler.fetch).toBeUndefined();
    expect(code).not.toMatch(/caches\./);
  });
});

describe('Service Worker: Antippen', () => {
  const tippe = (s: ReturnType<typeof aufbau>, url?: unknown) => {
    const e = { notification: { close: () => { s.log.geschlossen++; }, data: url === undefined ? undefined : { url } } };
    return s.feuere('notificationclick', e);
  };

  it('schließt die Mitteilung und öffnet ohne offenes Fenster ein neues bei der Zieladresse', async () => {
    const s = aufbau();
    await tippe(s, '/treffs/t1/dienstplan');
    expect(s.log.geschlossen).toBe(1);
    expect(s.log.geoeffnet).toEqual([`${HERKUNFT}/treffs/t1/dienstplan`]);
  });

  it('nutzt ein offenes App-Fenster: dorthin navigieren und in den Vordergrund holen', async () => {
    const s = aufbau([{ url: `${HERKUNFT}/mehr`, navigate: () => undefined }]);
    await tippe(s, '/bewerbungen');
    expect(s.log.navigiert).toEqual([`${HERKUNFT}/bewerbungen`]);
    expect(s.log.fokus).toBe(1);
    expect(s.log.geoeffnet).toEqual([]);
  });

  it('Fenster fremder Herkunft werden nicht benutzt', async () => {
    const s = aufbau([{ url: 'https://andere.example/', navigate: () => undefined }]);
    await tippe(s, '/');
    expect(s.log.geoeffnet).toEqual([`${HERKUNFT}/`]);
    expect(s.log.fokus).toBe(0);
  });

  it('ohne Adresse oder mit fremder Adresse: Startseite', async () => {
    const s = aufbau();
    await tippe(s);
    await tippe(s, 'https://boese.example/');
    expect(s.log.geoeffnet).toEqual([`${HERKUNFT}/`, `${HERKUNFT}/`]);
  });

  it('ein Fenster ohne navigate() wird trotzdem in den Vordergrund geholt', async () => {
    const s = aufbau([{ url: `${HERKUNFT}/` }]);
    await tippe(s, '/katalog');
    expect(s.log.fokus).toBe(1);
    expect(s.log.navigiert).toEqual([]);
  });
});
