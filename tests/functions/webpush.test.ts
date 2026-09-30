import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  base64urlZuBytes, bytesZuBase64url, sendePush, vapidKopf, verschluessele, type Abo, type VapidSchluessel,
} from '../../supabase/functions/_shared/webpush';

const FUNKTIONEN = join(__dirname, '../../supabase/functions');
const text = new TextDecoder();
const kodiere = new TextEncoder();

/** Ein „Gerät“: Schlüsselpaar und Auth-Geheimnis, wie sie der Browser beim Abonnieren erzeugt. */
async function neuesGeraet() {
  const paar = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const oeffentlich = new Uint8Array(await crypto.subtle.exportKey('raw', paar.publicKey));
  return { paar, auth, abo: { p256dh: bytesZuBase64url(oeffentlich), auth: bytesZuBase64url(auth) } };
}

/** Die Empfängerseite nach RFC 8188/8291 – unabhängig von der Sendeseite geschrieben, um sie gegenzuprüfen. */
async function entschluessele(body: Uint8Array, geraetPrivat: CryptoKey, geraetOeffentlich: Uint8Array, auth: Uint8Array): Promise<string> {
  const salz = body.slice(0, 16);
  const datensatz = new DataView(body.buffer, body.byteOffset).getUint32(16, false);
  const idLaenge = body[20]!;
  const serverOeffentlich = body.slice(21, 21 + idLaenge);
  const chiffre = body.slice(21 + idLaenge);
  expect(datensatz).toBe(4096);
  expect(idLaenge).toBe(65);

  const serverSchluessel = await crypto.subtle.importKey('raw', serverOeffentlich, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const geheim = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: serverSchluessel }, geraetPrivat, 256));
  const hk = async (salzW: Uint8Array, ikm: Uint8Array, info: Uint8Array, bits: number) =>
    new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: salzW as BufferSource, info: info as BufferSource }, await crypto.subtle.importKey('raw', ikm as BufferSource, 'HKDF', false, ['deriveBits']), bits));
  const info = new Uint8Array([...kodiere.encode('WebPush: info\0'), ...geraetOeffentlich, ...serverOeffentlich]);
  const ikm = await hk(auth, geheim, info, 256);
  const cek = await hk(salz, ikm, kodiere.encode('Content-Encoding: aes128gcm\0'), 128);
  const nonce = await hk(salz, ikm, kodiere.encode('Content-Encoding: nonce\0'), 96);
  const klar = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']), chiffre));
  expect(klar[klar.length - 1]).toBe(2);                               // Trennbyte des letzten Datensatzes
  return text.decode(klar.slice(0, -1));
}

describe('base64url', () => {
  it('wandelt hin und zurück, auch mit Zeichen, die in normalem Base64 anders aussehen', () => {
    const bytes = new Uint8Array([251, 255, 254, 0, 1, 2, 250]);
    const t = bytesZuBase64url(bytes);
    expect(t).not.toMatch(/[+/=]/);
    expect([...base64urlZuBytes(t)]).toEqual([...bytes]);
  });
});

describe('verschluessele (RFC 8291)', () => {
  it('die Empfängerseite kann die Nachricht lesen (Umlaute, lange Texte)', async () => {
    const g = await neuesGeraet();
    for (const nachricht of ['Hallo', '{"titel":"Neuer Hinweis · Sommer-Sause","text":"Bitte Sonnencreme ☀️ mitbringen – Übung","url":"/x"}', 'x'.repeat(3000)]) {
      const body = await verschluessele(kodiere.encode(nachricht), g.abo);
      expect(await entschluessele(body, g.paar.privateKey, base64urlZuBytes(g.abo.p256dh), g.auth)).toBe(nachricht);
    }
  });

  it('jede Nachricht hat anderen Salz und anderen Schlüssel (nie derselbe Chiffretext)', async () => {
    const g = await neuesGeraet();
    const a = await verschluessele(kodiere.encode('gleich'), g.abo);
    const b = await verschluessele(kodiere.encode('gleich'), g.abo);
    expect(bytesZuBase64url(a)).not.toBe(bytesZuBase64url(b));
    expect(bytesZuBase64url(a.slice(0, 16))).not.toBe(bytesZuBase64url(b.slice(0, 16)));
  });

  it('ein anderes Gerät kann die Nachricht nicht lesen', async () => {
    const g = await neuesGeraet();
    const fremd = await neuesGeraet();
    const body = await verschluessele(kodiere.encode('geheim'), g.abo);
    await expect(entschluessele(body, fremd.paar.privateKey, base64urlZuBytes(g.abo.p256dh), g.auth)).rejects.toThrow();
  });

  it('ein falsches Auth-Geheimnis macht die Nachricht unlesbar', async () => {
    const g = await neuesGeraet();
    const body = await verschluessele(kodiere.encode('geheim'), g.abo);
    await expect(entschluessele(body, g.paar.privateKey, base64urlZuBytes(g.abo.p256dh), crypto.getRandomValues(new Uint8Array(16)))).rejects.toThrow();
  });

  it('stimmt mit dem Testvektor aus RFC 8291, Anhang A überein', async () => {
    const asPrivat = 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw';
    const asOeffentlich = 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8';
    const uaOeffentlich = 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4';
    const auth = 'BTBZMqHH6r4Tts7J_aSIgg';
    const salz = 'DGv6ra1nlYgDCS1FRnbzlw';
    // Der Chiffretext, wie ihn RFC 8291 in Anhang A angibt (ohne den vorangestellten Kopf aus Salz, Größe und Schlüssel)
    const erwarteterChiffretext = '8pfeW0KbunFT06SuDKoJH9Ql87S1QUrdirN6GcG7sFz1y1sqLgVi1VhjVkHsUoEsbI_0LpXMuGvnzQ';

    const o = base64urlZuBytes(asOeffentlich);
    const jwk = (privat?: string): JsonWebKey => ({ kty: 'EC', crv: 'P-256', x: bytesZuBase64url(o.slice(1, 33)), y: bytesZuBase64url(o.slice(33, 65)), ...(privat ? { d: privat } : {}), ext: true });
    const paar: CryptoKeyPair = {
      privateKey: await crypto.subtle.importKey('jwk', jwk(asPrivat), { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']),
      publicKey: await crypto.subtle.importKey('jwk', jwk(), { name: 'ECDH', namedCurve: 'P-256' }, true, []),
    };
    const body = await verschluessele(kodiere.encode('When I grow up, I want to be a watermelon'), { p256dh: uaOeffentlich, auth }, { paar, salz: base64urlZuBytes(salz) });
    expect(body.length).toBe(21 + 65 + 58);                                   // Kopf + Schlüssel + (41 Zeichen + Trennbyte + 16 Byte Tag)
    expect(bytesZuBase64url(body.slice(0, 16))).toBe(salz);
    expect([...body.slice(16, 20)]).toEqual([0, 0, 16, 0]);                   // Datensatzgröße 4096
    expect(body[20]).toBe(65);
    expect(bytesZuBase64url(body.slice(21, 86))).toBe(asOeffentlich);
    expect(bytesZuBase64url(body.slice(86))).toBe(erwarteterChiffretext);
  });

  it('lehnt zu lange Nachrichten und ungültige Schlüssel ab', async () => {
    const g = await neuesGeraet();
    await expect(verschluessele(new Uint8Array(3901), g.abo)).rejects.toThrow(/zu lang/);
    await expect(verschluessele(kodiere.encode('x'), { p256dh: 'AAAA', auth: g.abo.auth })).rejects.toThrow(/Ungültiger/);
  });
});

async function neuerVapid(): Promise<{ v: VapidSchluessel; oeffentlich: CryptoKey }> {
  const paar = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', paar.privateKey);
  const roh = new Uint8Array(await crypto.subtle.exportKey('raw', paar.publicKey));
  return { v: { oeffentlich: bytesZuBase64url(roh), privat: jwk.d!, betreff: 'mailto:test@example.org' }, oeffentlich: paar.publicKey };
}

describe('vapidKopf (RFC 8292)', () => {
  it('enthält ein gültig signiertes Token mit Herkunft, Ablauf und Betreff', async () => {
    const { v, oeffentlich } = await neuerVapid();
    const jetzt = Date.UTC(2027, 0, 1, 12, 0, 0);
    const kopf = await vapidKopf('https://fcm.googleapis.com/fcm/send/abc123', v, jetzt);
    const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(kopf);
    expect(m).not.toBeNull();
    const [, h, p, s, k] = m!;
    expect(k).toBe(v.oeffentlich);
    expect(JSON.parse(text.decode(base64urlZuBytes(h!)))).toEqual({ typ: 'JWT', alg: 'ES256' });
    const claims = JSON.parse(text.decode(base64urlZuBytes(p!)));
    expect(claims.aud).toBe('https://fcm.googleapis.com');          // nur die Herkunft, nicht der ganze Pfad
    expect(claims.sub).toBe('mailto:test@example.org');
    expect(claims.exp - Math.floor(jetzt / 1000)).toBe(12 * 3600);   // höchstens 24 Stunden erlaubt
    const signatur = base64urlZuBytes(s!);
    expect(signatur.length).toBe(64);                                  // r||s, wie bei JWS verlangt
    expect(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, oeffentlich, signatur as BufferSource, kodiere.encode(`${h}.${p}`) as BufferSource)).toBe(true);
    expect(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, oeffentlich, signatur as BufferSource, kodiere.encode(`${h}.${p}x`) as BufferSource)).toBe(false);
  });

  it('weist kaputte Schlüssel ab', async () => {
    await expect(vapidKopf('https://push.example/x', { oeffentlich: 'AAAA', privat: 'BBBB', betreff: 'mailto:a@b.de' })).rejects.toThrow();
  });
});

describe('sendePush', () => {
  async function aufbau(status: number) {
    const g = await neuesGeraet();
    const { v } = await neuerVapid();
    let gesehen: { url: string; init: RequestInit } | null = null;
    const holen = (async (url: string, init: RequestInit) => { gesehen = { url, init }; return new Response(null, { status }); }) as unknown as typeof fetch;
    const abo: Abo = { endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/xyz', ...g.abo };
    return { g, v, abo, holen, gesehen: () => gesehen! };
  }

  it('schickt verschlüsselt mit allen nötigen Köpfen an die Adresse des Geräts', async () => {
    const { g, v, abo, holen, gesehen } = await aufbau(201);
    const r = await sendePush(abo, '{"titel":"Hallo"}', v, { ttl: 600, dringlichkeit: 'high' }, holen);
    expect(r).toEqual({ status: 201, ok: true, abgelaufen: false });
    const { url, init } = gesehen();
    expect(url).toBe(abo.endpoint);
    expect(init.method).toBe('POST');
    const h = init.headers as Record<string, string>;
    expect(h['Content-Encoding']).toBe('aes128gcm');
    expect(h['Content-Type']).toBe('application/octet-stream');
    expect(h.TTL).toBe('600');
    expect(h.Urgency).toBe('high');
    expect(h.Authorization).toMatch(/^vapid t=.+, k=.+$/);
    const body = init.body as Uint8Array;
    expect(await entschluessele(body, g.paar.privateKey, base64urlZuBytes(abo.p256dh), g.auth)).toBe('{"titel":"Hallo"}');
    expect(text.decode(body)).not.toContain('Hallo');                   // im Klartext steht nichts im Body
  });

  it('Standardwerte: ein Tag gültig, normale Dringlichkeit', async () => {
    const { v, abo, holen, gesehen } = await aufbau(201);
    await sendePush(abo, 'x', v, {}, holen);
    const h = gesehen().init.headers as Record<string, string>;
    expect(h.TTL).toBe('86400');
    expect(h.Urgency).toBe('normal');
  });

  it('404 und 410 heißen: Gerät gibt es nicht mehr', async () => {
    for (const status of [404, 410]) {
      const { v, abo, holen } = await aufbau(status);
      expect(await sendePush(abo, 'x', v, {}, holen)).toEqual({ status, ok: false, abgelaufen: true });
    }
  });

  it('andere Fehler sind nicht „abgelaufen“ (z. B. vorübergehend)', async () => {
    for (const status of [400, 401, 413, 429, 500, 503]) {
      const { v, abo, holen } = await aufbau(status);
      expect(await sendePush(abo, 'x', v, {}, holen)).toEqual({ status, ok: false, abgelaufen: false });
    }
  });
});

describe('Edge Function push-senden', () => {
  const block = (datei: string) => {
    const t = readFileSync(join(FUNKTIONEN, datei), 'utf8').replace(/\r\n/g, '\n');   // Zeilenenden egal
    const a = t.indexOf('// >>> webpush');
    const b = t.indexOf('// <<< webpush');
    expect(a).toBeGreaterThan(-1);
    expect(b).toBeGreaterThan(a);
    return t.slice(a, b);
  };

  it('enthält denselben Web-Push-Block wie _shared/webpush.ts (Datei ist absichtlich eine Kopie)', () => {
    expect(block('push-senden/index.ts')).toBe(block('_shared/webpush.ts'));
  });

  it('der Block kommt ohne Importe aus (lässt sich einzeln im Dashboard einfügen)', () => {
    expect(block('_shared/webpush.ts')).not.toMatch(/^\s*import\s/m);
  });
});

describe('VAPID-Schlüssel erzeugen (npm run vapid)', () => {
  it('liefert einen 65-Byte-Schlüssel und einen 32-Byte-Teil, mit denen der VAPID-Kopf funktioniert', async () => {
    const { erzeugeVapid } = await import('../../scripts/vapid-erzeugen.mjs');
    const k = await erzeugeVapid();
    expect(base64urlZuBytes(k.oeffentlich)).toHaveLength(65);
    expect(base64urlZuBytes(k.oeffentlich)[0]).toBe(4);
    expect(base64urlZuBytes(k.privat)).toHaveLength(32);
    const kopf = await vapidKopf('https://push.example/x', { oeffentlich: k.oeffentlich, privat: k.privat, betreff: 'mailto:a@b.de' });
    expect(kopf).toContain(`k=${k.oeffentlich}`);
  });
  it('jeder Aufruf erzeugt ein neues Paar', async () => {
    const { erzeugeVapid } = await import('../../scripts/vapid-erzeugen.mjs');
    expect((await erzeugeVapid()).privat).not.toBe((await erzeugeVapid()).privat);
  });
});
