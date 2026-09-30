import { describe, it, expect, beforeAll } from 'vitest';
import { behandle } from '../../supabase/functions/push-senden/index';
import { base64urlZuBytes, bytesZuBase64url } from '../../supabase/functions/_shared/webpush';

const ANON = 'anon-schluessel';
const SERVICE = 'service-schluessel';
const text = new TextDecoder();
const kodiere = new TextEncoder();

let vapid: Record<string, string>;
beforeAll(async () => {
  const paar = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  vapid = {
    VAPID_PUBLIC_KEY: bytesZuBase64url(new Uint8Array(await crypto.subtle.exportKey('raw', paar.publicKey))),
    VAPID_PRIVATE_KEY: (await crypto.subtle.exportKey('jwk', paar.privateKey)).d!,
    VAPID_SUBJECT: 'mailto:test@example.org',
  };
});

const umgebung = (extra: Record<string, string | undefined> = {}) => {
  const werte: Record<string, string | undefined> = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: ANON, SUPABASE_SERVICE_ROLE_KEY: SERVICE, ...vapid, ...extra };
  return { get: (n: string) => werte[n] };
};

interface Geraet { id: string; endpoint: string; p256dh: string; auth: string; privat: CryptoKey; authBytes: Uint8Array }
async function neuesGeraet(nr: number): Promise<Geraet> {
  const paar = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return { id: `abo-${nr}`, endpoint: `https://push.example/geraet/${nr}`, p256dh: bytesZuBase64url(new Uint8Array(await crypto.subtle.exportKey('raw', paar.publicKey))), auth: bytesZuBase64url(auth), privat: paar.privateKey, authBytes: auth };
}

/** Empfängerseite (RFC 8188) zum Prüfen, was tatsächlich verschickt wurde. */
async function lies(body: Uint8Array, g: Geraet): Promise<{ titel: string; text: string; url: string }> {
  const salz = body.slice(0, 16);
  const serverOeffentlich = body.slice(21, 21 + body[20]!);
  const geraetOeffentlich = base64urlZuBytes(g.p256dh);
  const geheim = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: await crypto.subtle.importKey('raw', serverOeffentlich as BufferSource, { name: 'ECDH', namedCurve: 'P-256' }, false, []) }, g.privat, 256));
  const hk = async (s: Uint8Array, ikm: Uint8Array, info: Uint8Array, bits: number) =>
    new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: s as BufferSource, info: info as BufferSource }, await crypto.subtle.importKey('raw', ikm as BufferSource, 'HKDF', false, ['deriveBits']), bits));
  const ikm = await hk(g.authBytes, geheim, new Uint8Array([...kodiere.encode('WebPush: info\0'), ...geraetOeffentlich, ...serverOeffentlich]), 256);
  const cek = await hk(salz, ikm, kodiere.encode('Content-Encoding: aes128gcm\0'), 128);
  const nonce = await hk(salz, ikm, kodiere.encode('Content-Encoding: nonce\0'), 96);
  const klar = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce as BufferSource }, await crypto.subtle.importKey('raw', cek as BufferSource, 'AES-GCM', false, ['decrypt']), body.slice(21 + body[20]!) as BufferSource));
  return JSON.parse(text.decode(klar.slice(0, -1)));
}

interface Aufbau {
  plan?: { empfaenger: string[]; titel: string; text: string; url: string };
  plaene?: { empfaenger: string[]; titel: string; text: string; url: string }[];
  rpcFehler?: { code?: string; message?: string };
  geraete?: Geraet[];
  status?: Record<string, number | 'netzwerkfehler'>;
  aboFehler?: boolean;
}

/** Nachgebauter Datenbank-Client und Netzwerk; protokolliert, wer was mit welchem Schlüssel getan hat. */
function attrappe(a: Aufbau) {
  const protokoll = { rpc: [] as { schluessel: string; auth: string | undefined; name: string; args: Record<string, unknown> }[], admin: [] as string[], geloescht: [] as string[], gesendet: [] as { endpoint: string; body: Uint8Array; header: Record<string, string> }[] };
  const erzeuge = ((_url: string, schluessel: string, opts?: { global?: { headers?: Record<string, string> } }) => ({
    rpc: async (name: string, args: Record<string, unknown>) => {
      protokoll.rpc.push({ schluessel, auth: opts?.global?.headers?.Authorization, name, args });
      if (name === 'fn_protokoll_erinnerungen') return a.rpcFehler ? { data: null, error: a.rpcFehler } : { data: a.plaene ?? [], error: null };
      return a.rpcFehler ? { data: null, error: a.rpcFehler } : { data: a.plan, error: null };
    },
    from: (tabelle: string) => ({
      select: () => ({ in: async (_spalte: string, ids: string[]) => { protokoll.admin.push(`${tabelle}.select:${schluessel}:${ids.join(',')}`); return a.aboFehler ? { data: null, error: { message: 'kaputt' } } : { data: (a.geraete ?? []).map(({ id, endpoint, p256dh, auth }) => ({ id, endpoint, p256dh, auth })), error: null }; } }),
      delete: () => ({ in: async (_spalte: string, ids: string[]) => { protokoll.geloescht.push(...ids); return { error: null }; } }),
    }),
  })) as never;
  const holen = (async (url: string, init: RequestInit) => {
    protokoll.gesendet.push({ endpoint: url, body: init.body as Uint8Array, header: init.headers as Record<string, string> });
    const s = a.status?.[url] ?? 201;
    if (s === 'netzwerkfehler') throw new Error('Netz weg');
    return new Response(null, { status: s });
  }) as typeof fetch;
  return { erzeuge, holen, protokoll };
}

const anfrage = (body: unknown, kopf: Record<string, string> = { Authorization: 'Bearer nutzer-jwt' }, methode = 'POST') =>
  new Request('https://x.supabase.co/functions/v1/push-senden', { method: methode, headers: { 'Content-Type': 'application/json', ...kopf }, body: methode === 'GET' ? undefined : JSON.stringify(body) });

const PLAN = { empfaenger: ['p1', 'p2'], titel: 'Neuer Hinweis · Sommer-Sause', text: 'Bitte Sonnencreme mitbringen', url: '/freizeiten/f1/hinweise' };

describe('push-senden: Eingang', () => {
  it('antwortet auf OPTIONS, lehnt GET ab und verlangt eine Anmeldung', async () => {
    const { erzeuge, holen } = attrappe({});
    expect((await behandle(anfrage(null, {}, 'OPTIONS'), umgebung(), holen, erzeuge)).status).toBe(200);
    expect((await behandle(anfrage(null, {}, 'GET'), umgebung(), holen, erzeuge)).status).toBe(405);
    expect((await behandle(anfrage({ art: 'test' }, {}), umgebung(), holen, erzeuge)).status).toBe(401);
  });

  it('ohne VAPID-Schlüssel: klare Meldung, nichts wird versucht', async () => {
    const a = attrappe({ plan: PLAN });
    for (const fehlt of ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT']) {
      const r = await behandle(anfrage({ art: 'test' }), umgebung({ [fehlt]: undefined }), a.holen, a.erzeuge);
      expect(r.status).toBe(503);
      expect((await r.json()).fehler).toMatch(/nicht eingerichtet/);
    }
    expect(a.protokoll.rpc).toHaveLength(0);
  });

  it('prüft die Art und bereinigt ref und extra', async () => {
    const a = attrappe({ plan: { ...PLAN, empfaenger: [] } });
    expect((await behandle(anfrage({}), umgebung(), a.holen, a.erzeuge)).status).toBe(400);
    expect((await behandle(anfrage({ art: 'Hinweis; drop table' }), umgebung(), a.holen, a.erzeuge)).status).toBe(400);
    expect((await behandle(anfrage({ art: 42 }), umgebung(), a.holen, a.erzeuge)).status).toBe(400);
    await behandle(anfrage({ art: 'hinweis', ref: 'kein-uuid', extra: 'text' }), umgebung(), a.holen, a.erzeuge);
    expect(a.protokoll.rpc[0]!.args).toEqual({ p_art: 'hinweis', p_ref: null, p_extra: {} });
    await behandle(anfrage({ art: 'dienstplan', ref: '123e4567-e89b-12d3-a456-426614174000', extra: { personen: ['x'] } }), umgebung(), a.holen, a.erzeuge);
    expect(a.protokoll.rpc[1]!.args).toEqual({ p_art: 'dienstplan', p_ref: '123e4567-e89b-12d3-a456-426614174000', p_extra: { personen: ['x'] } });
  });

  it('kaputtes JSON gilt als fehlende Art', async () => {
    const a = attrappe({});
    const r = await behandle(new Request('https://x/', { method: 'POST', headers: { Authorization: 'Bearer x' }, body: '{kaputt' }), umgebung(), a.holen, a.erzeuge);
    expect(r.status).toBe(400);
  });
});

describe('push-senden: Rechte', () => {
  it('die Zulässigkeit wird mit der Anmeldung der aufrufenden Person entschieden – nie mit dem Service-Schlüssel', async () => {
    const a = attrappe({ plan: PLAN, geraete: [await neuesGeraet(1)] });
    await behandle(anfrage({ art: 'hinweis' }, { Authorization: 'Bearer nutzer-jwt' }), umgebung(), a.holen, a.erzeuge);
    expect(a.protokoll.rpc).toHaveLength(1);
    expect(a.protokoll.rpc[0]).toMatchObject({ schluessel: ANON, auth: 'Bearer nutzer-jwt', name: 'fn_push_vorbereiten' });
    expect(a.protokoll.admin.every((z) => z.includes(`:${SERVICE}:`))).toBe(true);        // Service-Schlüssel nur für die Geräteliste
    expect(a.protokoll.admin.every((z) => z.startsWith('push_abos.'))).toBe(true);
  });

  it('Datenbank verweigert: 403 ohne Versand', async () => {
    const a = attrappe({ rpcFehler: { code: '42501', message: 'Mitteilung nicht zulässig' }, geraete: [await neuesGeraet(1)] });
    const r = await behandle(anfrage({ art: 'hinweis' }), umgebung(), a.holen, a.erzeuge);
    expect(r.status).toBe(403);
    expect((await r.json()).fehler).toBe('Dafür fehlt die Berechtigung.');
    expect(a.protokoll.gesendet).toHaveLength(0);
    expect(a.protokoll.admin).toHaveLength(0);
  });

  it('Bremse der Datenbank: 409 mit der Meldung im Klartext', async () => {
    const a = attrappe({ rpcFehler: { code: '23514', message: 'Diese Mitteilung wurde gerade schon gesendet' } });
    const r = await behandle(anfrage({ art: 'hinweis' }), umgebung(), a.holen, a.erzeuge);
    expect(r.status).toBe(409);
    expect((await r.json()).fehler).toBe('Diese Mitteilung wurde gerade schon gesendet');
  });

  it('unerwartete Datenbankfehler verraten keine Einzelheiten', async () => {
    const a = attrappe({ rpcFehler: { code: 'XX000', message: 'relation "geheim" does not exist' } });
    const r = await behandle(anfrage({ art: 'hinweis' }), umgebung(), a.holen, a.erzeuge);
    expect(r.status).toBe(500);
    expect(JSON.stringify(await r.json())).not.toContain('geheim');
  });
});

describe('push-senden: Versand', () => {
  it('ohne Empfänger wird nichts gelesen und nichts gesendet', async () => {
    const a = attrappe({ plan: { ...PLAN, empfaenger: [] } });
    const r = await behandle(anfrage({ art: 'dienstplan' }), umgebung(), a.holen, a.erzeuge);
    expect(await r.json()).toEqual({ empfaenger: 0, geraete: 0, gesendet: 0, entfernt: 0, fehlgeschlagen: 0 });
    expect(a.protokoll.admin).toHaveLength(0);
    expect(a.protokoll.gesendet).toHaveLength(0);
  });

  it('verschickt an jedes Gerät eine eigene, verschlüsselte Nachricht mit Titel, Text und Link', async () => {
    const g = [await neuesGeraet(1), await neuesGeraet(2), await neuesGeraet(3)];
    const a = attrappe({ plan: PLAN, geraete: g });
    const r = await behandle(anfrage({ art: 'hinweis', ref: '123e4567-e89b-12d3-a456-426614174000' }), umgebung(), a.holen, a.erzeuge);
    expect(await r.json()).toEqual({ empfaenger: 2, geraete: 3, gesendet: 3, entfernt: 0, fehlgeschlagen: 0 });
    expect(a.protokoll.gesendet.map((s) => s.endpoint).sort()).toEqual(g.map((x) => x.endpoint));
    for (const s of a.protokoll.gesendet) {
      const geraet = g.find((x) => x.endpoint === s.endpoint)!;
      expect(await lies(s.body, geraet)).toEqual({ titel: PLAN.titel, text: PLAN.text, url: PLAN.url });
      expect(s.header.Authorization).toMatch(/^vapid t=.+, k=.+$/);
      expect(text.decode(s.body)).not.toContain('Sonnencreme');
    }
  });

  it('Geräte, die es nicht mehr gibt (404/410), werden entfernt; vorübergehende Fehler bleiben', async () => {
    const g = [await neuesGeraet(1), await neuesGeraet(2), await neuesGeraet(3), await neuesGeraet(4)];
    const a = attrappe({ plan: PLAN, geraete: g, status: { [g[1]!.endpoint]: 410, [g[2]!.endpoint]: 503, [g[3]!.endpoint]: 404 } });
    const r = await behandle(anfrage({ art: 'hinweis' }), umgebung(), a.holen, a.erzeuge);
    expect(await r.json()).toEqual({ empfaenger: 2, geraete: 4, gesendet: 1, entfernt: 2, fehlgeschlagen: 1 });
    expect(a.protokoll.geloescht.sort()).toEqual(['abo-2', 'abo-4']);
  });

  it('ein Netzwerkfehler bei einem Gerät stoppt die anderen nicht und löscht nichts', async () => {
    const g = [await neuesGeraet(1), await neuesGeraet(2)];
    const a = attrappe({ plan: PLAN, geraete: g, status: { [g[0]!.endpoint]: 'netzwerkfehler' } });
    const r = await behandle(anfrage({ art: 'hinweis' }), umgebung(), a.holen, a.erzeuge);
    expect(await r.json()).toMatchObject({ gesendet: 1, fehlgeschlagen: 1, entfernt: 0 });
    expect(a.protokoll.geloescht).toEqual([]);
  });

  it('ein defektes Abo (ungültiger Schlüssel) zählt als fehlgeschlagen, ohne die Funktion zu beenden', async () => {
    const gut = await neuesGeraet(1);
    const a = attrappe({ plan: PLAN, geraete: [{ ...gut, id: 'kaputt', endpoint: 'https://push.example/kaputt', p256dh: 'AAAA' }, gut] });
    const r = await behandle(anfrage({ art: 'hinweis' }), umgebung(), a.holen, a.erzeuge);
    expect(await r.json()).toMatchObject({ geraete: 2, gesendet: 1, fehlgeschlagen: 1 });
  });

  it('Geräte nicht ladbar: Fehlermeldung ohne Einzelheiten', async () => {
    const a = attrappe({ plan: PLAN, aboFehler: true });
    const r = await behandle(anfrage({ art: 'hinweis' }), umgebung(), a.holen, a.erzeuge);
    expect(r.status).toBe(500);
    expect((await r.json()).fehler).toBe('Die Geräte konnten nicht geladen werden.');
  });

  it('die Antwort nennt nur Zahlen – keine Personen, keine Geräteadressen', async () => {
    const g = [await neuesGeraet(1)];
    const a = attrappe({ plan: PLAN, geraete: g });
    const r = await (await behandle(anfrage({ art: 'hinweis' }), umgebung(), a.holen, a.erzeuge)).text();
    expect(r).not.toContain('p1');
    expect(r).not.toContain('push.example');
    expect(r).not.toContain(g[0]!.p256dh);
  });
});

describe('push-senden: Zeitplan (Erinnerung „Tagesprotokoll fehlt“)', () => {
  const GEHEIMNIS = 'ein-langes-geheimnis-fuer-den-zeitplan';
  const zeitplan = (kopf: Record<string, string> = {}) => anfrage({}, { Authorization: `Bearer ${ANON}`, 'x-cron-secret': GEHEIMNIS, ...kopf });
  const ERINNERUNG = { empfaenger: ['p1', 'p2'], titel: 'Tagesprotokoll fehlt · Kindertreff', text: 'Bitte das Protokoll für heute eintragen.', url: '/treffs/t1/protokoll' };

  it('mit richtigem Geheimnis: Plan aus der Datenbank (Service-Schlüssel), Versand an jedes Gerät', async () => {
    const g = await neuesGeraet(1);
    const a = attrappe({ plaene: [ERINNERUNG], geraete: [g] });
    const r = await behandle(zeitplan(), umgebung({ CRON_SECRET: GEHEIMNIS }), a.holen, a.erzeuge);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ erinnerungen: 1, empfaenger: 2, geraete: 1, gesendet: 1, entfernt: 0, fehlgeschlagen: 0 });
    expect(a.protokoll.rpc).toHaveLength(1);
    expect(a.protokoll.rpc[0]).toMatchObject({ name: 'fn_protokoll_erinnerungen', schluessel: SERVICE });
    expect(a.protokoll.rpc.some((x) => x.name === 'fn_push_vorbereiten')).toBe(false);
    expect(await lies(a.protokoll.gesendet[0]!.body, g)).toEqual({ titel: ERINNERUNG.titel, text: ERINNERUNG.text, url: ERINNERUNG.url });
  });

  it('falsches, leeres oder nicht eingerichtetes Geheimnis: 401, die Datenbank wird nicht gefragt', async () => {
    const a = attrappe({ plaene: [ERINNERUNG], geraete: [await neuesGeraet(1)] });
    expect((await behandle(zeitplan({ 'x-cron-secret': 'falsch-falsch-falsch-falsch' }), umgebung({ CRON_SECRET: GEHEIMNIS }), a.holen, a.erzeuge)).status).toBe(401);
    expect((await behandle(zeitplan({ 'x-cron-secret': '' }), umgebung({ CRON_SECRET: GEHEIMNIS }), a.holen, a.erzeuge)).status).toBe(401);
    expect((await behandle(zeitplan(), umgebung(), a.holen, a.erzeuge)).status).toBe(401);                                  // CRON_SECRET nicht gesetzt
    expect((await behandle(zeitplan({ 'x-cron-secret': 'kurz' }), umgebung({ CRON_SECRET: 'kurz' }), a.holen, a.erzeuge)).status).toBe(401);   // zu kurzes Geheimnis gilt nicht
    expect(a.protokoll.rpc).toHaveLength(0);
    expect(a.protokoll.gesendet).toHaveLength(0);
  });

  it('ohne Geheimnis läuft der normale Weg – der Zeitplan ist damit nicht erreichbar', async () => {
    const a = attrappe({ plan: { ...PLAN, empfaenger: [] } });
    await behandle(anfrage({ art: 'protokoll_erinnerung' }), umgebung({ CRON_SECRET: GEHEIMNIS }), a.holen, a.erzeuge);
    expect(a.protokoll.rpc[0]).toMatchObject({ name: 'fn_push_vorbereiten', schluessel: ANON });
  });

  it('keine fälligen Treffs: nichts wird gesendet', async () => {
    const a = attrappe({ plaene: [] });
    const r = await behandle(zeitplan(), umgebung({ CRON_SECRET: GEHEIMNIS }), a.holen, a.erzeuge);
    expect(await r.json()).toEqual({ erinnerungen: 0, empfaenger: 0, geraete: 0, gesendet: 0, entfernt: 0, fehlgeschlagen: 0 });
    expect(a.protokoll.gesendet).toHaveLength(0);
  });

  it('mehrere Treffs: Zahlen werden zusammengezählt; abgelaufene Geräte werden entfernt', async () => {
    const g1 = await neuesGeraet(1); const g2 = await neuesGeraet(2);
    const a = attrappe({ plaene: [ERINNERUNG, { ...ERINNERUNG, empfaenger: ['p3'], url: '/treffs/t2/protokoll' }], geraete: [g1, g2], status: { [g2.endpoint]: 410 } });
    const r = await behandle(zeitplan(), umgebung({ CRON_SECRET: GEHEIMNIS }), a.holen, a.erzeuge);
    expect(await r.json()).toEqual({ erinnerungen: 2, empfaenger: 3, geraete: 4, gesendet: 2, entfernt: 2, fehlgeschlagen: 0 });
  });

  it('Datenbankfehler: 500 ohne Einzelheiten', async () => {
    const a = attrappe({ rpcFehler: { code: 'XX000', message: 'relation "geheim" does not exist' } });
    const r = await behandle(zeitplan(), umgebung({ CRON_SECRET: GEHEIMNIS }), a.holen, a.erzeuge);
    expect(r.status).toBe(500);
    expect(JSON.stringify(await r.json())).not.toContain('geheim');
  });

  it('ohne VAPID-Schlüssel auch im Zeitplan: 503', async () => {
    const a = attrappe({ plaene: [ERINNERUNG] });
    const r = await behandle(zeitplan(), umgebung({ CRON_SECRET: GEHEIMNIS, VAPID_PRIVATE_KEY: '' }), a.holen, a.erzeuge);
    expect(r.status).toBe(503);
    expect(a.protokoll.rpc).toHaveLength(0);
  });
});
