import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const db = vi.hoisted(() => {
  const zeile = { data: null as unknown, error: null as unknown };
  const protokoll = { eingefuegt: [] as unknown[], geloescht: [] as Record<string, string>[], gesucht: [] as Record<string, string>[] };
  const from = () => ({
    select: () => { const f: Record<string, string> = {}; protokoll.gesucht.push(f); const k = { eq: (s: string, w: string) => { f[s] = w; return k; }, maybeSingle: async () => ({ data: zeile.data, error: zeile.error }) }; return k; },
    insert: async (w: unknown) => { protokoll.eingefuegt.push(w); return { error: zeile.error }; },
    delete: () => { const f: Record<string, string> = {}; protokoll.geloescht.push(f); const k: { eq: (s: string, w: string) => typeof k; then: (r: (v: unknown) => unknown) => unknown } = { eq: (s, w) => { f[s] = w; return k; }, then: (r) => Promise.resolve({ error: null }).then(r) }; return k; },
  });
  return { zeile, protokoll, from };
});
vi.mock('../lib/supabase', () => ({ supabase: { from: db.from }, konfiguriert: true }));

const SCHLUESSEL = 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8';

interface Abo { endpoint: string; toJSON: () => unknown; unsubscribe: () => Promise<boolean> }
function browser(opt: { erlaubnis?: NotificationPermission; frage?: NotificationPermission; vorhanden?: Abo | null; ohneSchluessel?: boolean } = {}) {
  const log = { unsubscribe: 0, subscribeArgs: [] as unknown[], registriert: [] as string[], frage: 0 };
  const neuesAbo: Abo = {
    endpoint: 'https://push.example/neu',
    toJSON: () => (opt.ohneSchluessel ? { endpoint: 'https://push.example/neu' } : { endpoint: 'https://push.example/neu', keys: { p256dh: 'pk', auth: 'ak' } }),
    unsubscribe: async () => { log.unsubscribe++; return true; },
  };
  let aktuell: Abo | null = opt.vorhanden ?? null;
  const pushManager = {
    getSubscription: async () => aktuell,
    subscribe: async (a: unknown) => { log.subscribeArgs.push(a); aktuell = neuesAbo; return neuesAbo; },
  };
  const reg = { pushManager };
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { getRegistration: async () => (aktuell || opt.vorhanden !== undefined ? reg : undefined), register: async (p: string) => { log.registriert.push(p); return reg; }, ready: Promise.resolve(reg) },
  });
  (window as unknown as Record<string, unknown>).PushManager = class {};
  (globalThis as unknown as Record<string, unknown>).Notification = Object.assign(function () {}, {
    permission: opt.erlaubnis ?? 'default',
    requestPermission: async () => { log.frage++; return opt.frage ?? 'granted'; },
  });
  return { log, neuesAbo };
}

const laden = async (schluessel = SCHLUESSEL) => {
  vi.resetModules();
  vi.stubEnv('VITE_VAPID_PUBLIC_KEY', schluessel);
  return import('./geraet');
};

beforeEach(() => { db.zeile.data = null; db.zeile.error = null; db.protokoll.eingefuegt = []; db.protokoll.geloescht = []; db.protokoll.gesucht = []; });
afterEach(() => {
  vi.unstubAllEnvs();
  Reflect.deleteProperty(navigator, 'serviceWorker');
  Reflect.deleteProperty(window, 'PushManager');
  Reflect.deleteProperty(globalThis, 'Notification');
});

describe('base64urlZuBytes', () => {
  it('wandelt den öffentlichen Schlüssel in 65 Byte um', async () => {
    const { base64urlZuBytes } = await laden();
    const b = base64urlZuBytes(SCHLUESSEL);
    expect(b).toHaveLength(65);
    expect(b[0]).toBe(4);
  });
});

describe('pruefeStatus', () => {
  it('ohne Browser-Unterstützung', async () => {
    const { pruefeStatus } = await laden();
    expect(await pruefeStatus('ich')).toBe('nicht_unterstuetzt');
  });

  it('ohne VAPID-Schlüssel: nicht eingerichtet', async () => {
    browser();
    const { pruefeStatus } = await laden('');
    expect(await pruefeStatus('ich')).toBe('nicht_eingerichtet');
  });

  it('Erlaubnis verweigert', async () => {
    browser({ erlaubnis: 'denied' });
    const { pruefeStatus } = await laden();
    expect(await pruefeStatus('ich')).toBe('verweigert');
  });

  it('noch kein Abonnement: aus', async () => {
    browser({ erlaubnis: 'granted' });
    const { pruefeStatus } = await laden();
    expect(await pruefeStatus('ich')).toBe('aus');
  });

  it('Abonnement und Eintrag in der Datenbank: an (Suche nach Person und Geräteadresse)', async () => {
    browser({ erlaubnis: 'granted', vorhanden: { endpoint: 'https://push.example/alt', toJSON: () => ({}), unsubscribe: async () => true } });
    db.zeile.data = { id: 'x' };
    const { pruefeStatus } = await laden();
    expect(await pruefeStatus('ich')).toBe('an');
    expect(db.protokoll.gesucht[0]).toEqual({ person_id: 'ich', endpoint: 'https://push.example/alt' });
  });

  it('Abonnement im Browser, aber der Datenbank unbekannt (z. B. früher entfernt): aus', async () => {
    browser({ erlaubnis: 'granted', vorhanden: { endpoint: 'https://push.example/alt', toJSON: () => ({}), unsubscribe: async () => true } });
    db.zeile.data = null;
    const { pruefeStatus } = await laden();
    expect(await pruefeStatus('ich')).toBe('aus');
  });

  it('Datenbankfehler zählt nicht als „an“', async () => {
    browser({ erlaubnis: 'granted', vorhanden: { endpoint: 'https://push.example/alt', toJSON: () => ({}), unsubscribe: async () => true } });
    db.zeile.data = { id: 'x' }; db.zeile.error = { message: 'kaputt' };
    const { pruefeStatus } = await laden();
    expect(await pruefeStatus('ich')).toBe('aus');
  });
});

describe('schalteEin', () => {
  it('fragt um Erlaubnis, abonniert mit dem öffentlichen Schlüssel und speichert das Gerät', async () => {
    const b = browser();
    const { schalteEin } = await laden();
    await schalteEin('ich');
    expect(b.log.frage).toBe(1);
    expect(b.log.registriert).toEqual(['/sw.js']);
    const arg = b.log.subscribeArgs[0] as { userVisibleOnly: boolean; applicationServerKey: Uint8Array };
    expect(arg.userVisibleOnly).toBe(true);
    expect(arg.applicationServerKey).toHaveLength(65);
    expect(db.protokoll.eingefuegt).toEqual([expect.objectContaining({ person_id: 'ich', endpoint: 'https://push.example/neu', p256dh: 'pk', auth: 'ak' })]);
  });

  it('fragt nicht erneut, wenn die Erlaubnis schon erteilt ist', async () => {
    const b = browser({ erlaubnis: 'granted' });
    const { schalteEin } = await laden();
    await schalteEin('ich');
    expect(b.log.frage).toBe(0);
  });

  it('ein altes Abonnement wird vorher beendet (frische Geräteadresse für diese Person)', async () => {
    const alt: Abo = { endpoint: 'https://push.example/alt', toJSON: () => ({}), unsubscribe: async () => { b.log.unsubscribe++; return true; } };
    const b = browser({ erlaubnis: 'granted', vorhanden: alt });
    const { schalteEin } = await laden();
    await schalteEin('ich');
    expect(b.log.unsubscribe).toBe(1);
    expect(db.protokoll.eingefuegt[0]).toMatchObject({ endpoint: 'https://push.example/neu' });
  });

  it('ohne Erlaubnis: verständliche Meldung, nichts wird gespeichert', async () => {
    browser({ frage: 'denied' });
    const { schalteEin } = await laden();
    await expect(schalteEin('ich')).rejects.toThrow('Ohne Erlaubnis kann der Browser keine Mitteilungen anzeigen.');
    expect(db.protokoll.eingefuegt).toEqual([]);
  });

  it('ohne Unterstützung oder ohne Schlüssel', async () => {
    const { schalteEin } = await laden();
    await expect(schalteEin('ich')).rejects.toThrow('unterstützt keine Mitteilungen');
    browser();
    const { schalteEin: ohne } = await laden('');
    await expect(ohne('ich')).rejects.toThrow('noch nicht eingerichtet');
  });

  it('unvollständiges Abonnement wird verworfen', async () => {
    const b = browser({ ohneSchluessel: true });
    const { schalteEin } = await laden();
    await expect(schalteEin('ich')).rejects.toThrow('kein vollständiges Abonnement');
    expect(b.log.unsubscribe).toBe(1);
    expect(db.protokoll.eingefuegt).toEqual([]);
  });

  it('Speichern schlägt fehl: Abonnement wird zurückgenommen, damit nichts halb eingerichtet bleibt', async () => {
    const b = browser();
    db.zeile.error = { message: 'nein' };
    const { schalteEin } = await laden();
    await expect(schalteEin('ich')).rejects.toThrow('Das Gerät konnte nicht gespeichert werden.');
    expect(b.log.unsubscribe).toBe(1);
  });
});

describe('schalteAus', () => {
  it('löscht das Gerät in der Datenbank (nur eigene Zeile) und beendet das Abonnement', async () => {
    const b = browser({ erlaubnis: 'granted', vorhanden: { endpoint: 'https://push.example/alt', toJSON: () => ({}), unsubscribe: async () => { b.log.unsubscribe++; return true; } } });
    const { schalteAus } = await laden();
    await schalteAus('ich');
    expect(db.protokoll.geloescht).toEqual([{ person_id: 'ich', endpoint: 'https://push.example/alt' }]);
    expect(b.log.unsubscribe).toBe(1);
  });

  it('ohne Abonnement oder ohne Unterstützung passiert nichts', async () => {
    const { schalteAus } = await laden();
    await expect(schalteAus('ich')).resolves.toBeUndefined();
    browser({ erlaubnis: 'granted' });
    const { schalteAus: nochmal } = await laden();
    await nochmal('ich');
    expect(db.protokoll.geloescht).toEqual([]);
  });

  it('Fehler werden verschluckt (Abmelden darf nie daran scheitern)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    browser({ erlaubnis: 'granted', vorhanden: { endpoint: 'https://push.example/alt', toJSON: () => ({}), unsubscribe: async () => { throw new Error('kaputt'); } } });
    const { schalteAus } = await laden();
    await expect(schalteAus('ich')).resolves.toBeUndefined();
  });
});

describe('Geräteerkennung', () => {
  it('erkennt iPhone und iPad', async () => {
    const { istApple } = await laden();
    const alt = navigator.userAgent;
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' });
    expect(istApple()).toBe(true);
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: alt });
    expect(istApple()).toBe(false);
  });
});
