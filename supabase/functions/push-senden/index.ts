// Edge Function: Mitteilungen per Web-Push verschicken.
//
// Die Funktion entscheidet NICHT selbst, wer was bekommt: Sie fragt die Datenbank (fn_push_vorbereiten) mit der Anmeldung der
// auslösenden Person. Die Datenbank prüft, ob diese Person die Mitteilung auslösen darf (eigener, frischer Vorgang bzw. Koordination),
// bremst Wiederholungen und liefert die Empfänger samt Text zurück. Die Funktion verschlüsselt und verschickt dann nur noch.
//
// Die Datei ist bewusst in sich geschlossen (kein Import aus _shared), damit sie sich auch einzeln im Supabase-Dashboard einfügen lässt.
//
// Secrets (Dashboard → Edge Functions → Secrets), erzeugt mit `npm run vapid`:
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (z. B. mailto:freizeiten@frankenthal.de)
// Zeitplan (GitHub Actions, .github/workflows/erinnerung.yml): CRON_SECRET – ein langes Zufallsgeheimnis. Damit darf der Zeitplan NUR die Erinnerung
// „Tagesprotokoll fehlt“ auslösen (Kopfzeile x-cron-secret); wer sie bekommt, entscheidet fn_protokoll_erinnerungen in der Datenbank.
// Automatisch gesetzt: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from 'npm:@supabase/supabase-js@2';

// >>> webpush (identisch mit _shared/webpush.ts – wird durch tests/functions geprüft)
export interface Abo { endpoint: string; p256dh: string; auth: string }
export interface VapidSchluessel { oeffentlich: string; privat: string; betreff: string }

const kodiere = new TextEncoder();

export function base64urlZuBytes(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export function bytesZuBase64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const verbinde = (...teile: Uint8Array[]): Uint8Array => {
  const aus = new Uint8Array(teile.reduce((n, t) => n + t.length, 0));
  let pos = 0;
  for (const t of teile) { aus.set(t, pos); pos += t.length; }
  return aus;
};

/** Öffentlicher Schlüssel (65 Byte, unkomprimiert) + privater Teil d → JWK. */
function alsJwk(oeffentlich: Uint8Array, privat?: string): JsonWebKey {
  if (oeffentlich.length !== 65 || oeffentlich[0] !== 4) throw new Error('Ungültiger öffentlicher Schlüssel');
  const jwk: JsonWebKey = { kty: 'EC', crv: 'P-256', x: bytesZuBase64url(oeffentlich.slice(1, 33)), y: bytesZuBase64url(oeffentlich.slice(33, 65)), ext: true };
  if (privat) jwk.d = privat;
  return jwk;
}

async function hkdf(salz: Uint8Array, geheimnis: Uint8Array, info: Uint8Array, bits: number): Promise<Uint8Array> {
  const schluessel = await crypto.subtle.importKey('raw', geheimnis as BufferSource, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: salz as BufferSource, info: info as BufferSource }, schluessel, bits));
}

export interface Zufall { paar?: CryptoKeyPair; salz?: Uint8Array }

/** Verschlüsselt eine Nachricht für ein Gerät (Text-Nutzlast, höchstens etwa 3900 Byte). Gibt den fertigen Body zurück. */
export async function verschluessele(nutzlast: Uint8Array, abo: Pick<Abo, 'p256dh' | 'auth'>, zufall: Zufall = {}): Promise<Uint8Array> {
  if (nutzlast.length > 3900) throw new Error('Nachricht zu lang');
  const geraetOeffentlich = base64urlZuBytes(abo.p256dh);
  const authGeheimnis = base64urlZuBytes(abo.auth);
  const paar = zufall.paar ?? await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const serverOeffentlich = new Uint8Array(await crypto.subtle.exportKey('raw', paar.publicKey));
  const geraetSchluessel = await crypto.subtle.importKey('jwk', alsJwk(geraetOeffentlich), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const gemeinsam = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: geraetSchluessel }, paar.privateKey, 256));

  const salz = zufall.salz ?? crypto.getRandomValues(new Uint8Array(16));
  const schluesselInfo = verbinde(kodiere.encode('WebPush: info\0'), geraetOeffentlich, serverOeffentlich);
  const ikm = await hkdf(authGeheimnis, gemeinsam, schluesselInfo, 256);
  const cek = await hkdf(salz, ikm, kodiere.encode('Content-Encoding: aes128gcm\0'), 128);
  const nonce = await hkdf(salz, ikm, kodiere.encode('Content-Encoding: nonce\0'), 96);

  // Ein einziger Datensatz: Nutzlast + Trennbyte 0x02 (letzter Datensatz), ohne Auffüllung
  const klartext = verbinde(nutzlast, new Uint8Array([2]));
  const aes = await crypto.subtle.importKey('raw', cek as BufferSource, 'AES-GCM', false, ['encrypt']);
  const chiffre = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce as BufferSource }, aes, klartext as BufferSource));

  const kopf = new Uint8Array(21);
  kopf.set(salz, 0);
  new DataView(kopf.buffer).setUint32(16, 4096, false);       // Datensatzgröße
  kopf[20] = serverOeffentlich.length;                          // Länge der Schlüssel-ID
  return verbinde(kopf, serverOeffentlich, chiffre);
}

/** VAPID-Kopf „Authorization“ für einen Push-Dienst (ES256-Token, 12 Stunden gültig). */
export async function vapidKopf(endpoint: string, v: VapidSchluessel, jetzt: number = Date.now()): Promise<string> {
  const herkunft = new URL(endpoint).origin;
  const teil = (o: object) => bytesZuBase64url(kodiere.encode(JSON.stringify(o)));
  const ungesichert = `${teil({ typ: 'JWT', alg: 'ES256' })}.${teil({ aud: herkunft, exp: Math.floor(jetzt / 1000) + 12 * 3600, sub: v.betreff })}`;
  const schluessel = await crypto.subtle.importKey('jwk', alsJwk(base64urlZuBytes(v.oeffentlich), v.privat), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const signatur = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, schluessel, kodiere.encode(ungesichert) as BufferSource));
  return `vapid t=${ungesichert}.${bytesZuBase64url(signatur)}, k=${v.oeffentlich}`;
}

export interface Sendeergebnis { status: number; ok: boolean; /** 404/410: das Gerät gibt es nicht mehr, das Abo kann gelöscht werden. */ abgelaufen: boolean }

/** Schickt eine Text-Nachricht an ein Gerät. */
export async function sendePush(
  abo: Abo, nachricht: string, v: VapidSchluessel, optionen: { ttl?: number; dringlichkeit?: 'very-low' | 'low' | 'normal' | 'high' } = {},
  holen: typeof fetch = fetch,
): Promise<Sendeergebnis> {
  const body = await verschluessele(kodiere.encode(nachricht), abo);
  const antwort = await holen(abo.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidKopf(abo.endpoint, v),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(optionen.ttl ?? 86400),
      Urgency: optionen.dringlichkeit ?? 'normal',
    },
    body: body as BodyInit,
    signal: AbortSignal.timeout(10_000),
  });
  return { status: antwort.status, ok: antwort.status >= 200 && antwort.status < 300, abgelaufen: antwort.status === 404 || antwort.status === 410 };
}
// <<< webpush

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function antwort(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

/** Übersetzt Datenbankfehler in Statuscodes und verständliche Meldungen. */
function fehlerAntwort(fehler: { code?: string; message?: string }) {
  if (fehler.code === '42501') return antwort({ fehler: 'Dafür fehlt die Berechtigung.' }, 403);
  if (fehler.code === '23514') return antwort({ fehler: fehler.message ?? 'Die Angaben sind nicht gültig.' }, 409);
  return antwort({ fehler: 'Die Mitteilung konnte nicht vorbereitet werden.' }, 500);
}

export interface Umgebung { get(name: string): string | undefined }

interface Plan { empfaenger: string[]; titel: string; text: string; url: string }
interface Zaehlung { empfaenger: number; geraete: number; gesendet: number; entfernt: number; fehlgeschlagen: number }

/** Vergleich ohne Zeitunterschiede, damit das Geheimnis nicht durch Antwortzeiten erraten werden kann. */
function gleich(a: string, b: string): boolean {
  const x = kodiere.encode(a); const y = kodiere.encode(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) d |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return d === 0;
}

/** Die eigentliche Funktion; Umgebung, Netzwerk und Datenbank-Client sind austauschbar, damit sie getestet werden kann. */
export async function behandle(req: Request, umgebung: Umgebung, holen: typeof fetch = fetch, erzeuge: typeof createClient = createClient): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return antwort({ fehler: 'Nur POST erlaubt' }, 405);
  if (!req.headers.get('Authorization')) return antwort({ fehler: 'Nicht angemeldet.' }, 401);

  const url = umgebung.get('SUPABASE_URL')!;
  const anon = umgebung.get('SUPABASE_ANON_KEY')!;
  const service = umgebung.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const vapid: VapidSchluessel = {
    oeffentlich: umgebung.get('VAPID_PUBLIC_KEY') ?? '',
    privat: umgebung.get('VAPID_PRIVATE_KEY') ?? '',
    betreff: umgebung.get('VAPID_SUBJECT') ?? '',
  };
  if (!vapid.oeffentlich || !vapid.privat || !vapid.betreff) return antwort({ fehler: 'Mitteilungen sind noch nicht eingerichtet (VAPID-Schlüssel fehlen).' }, 503);

  const admin = erzeuge(url, service, { auth: { persistSession: false } });

  /** Lädt die Geräte der Empfänger (nur mit Service-Schlüssel lesbar), verschickt die Nachricht und räumt abgelaufene Geräte auf. null = Geräte nicht ladbar. */
  const versende = async (plan: Plan): Promise<Zaehlung | null> => {
    if (!plan.empfaenger.length) return { empfaenger: 0, geraete: 0, gesendet: 0, entfernt: 0, fehlgeschlagen: 0 };
    const { data: abos, error: aboFehler } = await admin.from('push_abos').select('id, endpoint, p256dh, auth').in('person_id', plan.empfaenger);
    if (aboFehler) return null;

    const nachricht = JSON.stringify({ titel: plan.titel, text: plan.text, url: plan.url });
    const ergebnisse = await Promise.all((abos ?? []).map(async (a: { id: string; endpoint: string; p256dh: string; auth: string }) => {
      try { return { id: a.id, ...(await sendePush(a, nachricht, vapid, {}, holen)) }; } catch { return { id: a.id, status: 0, ok: false, abgelaufen: false }; }
    }));

    const abgelaufen = ergebnisse.filter((e) => e.abgelaufen).map((e) => e.id);
    if (abgelaufen.length) await admin.from('push_abos').delete().in('id', abgelaufen);

    return {
      empfaenger: plan.empfaenger.length,
      geraete: ergebnisse.length,
      gesendet: ergebnisse.filter((e) => e.ok).length,
      entfernt: abgelaufen.length,
      fehlgeschlagen: ergebnisse.filter((e) => !e.ok && !e.abgelaufen).length,
    };
  };

  // Zeitplan statt Anmeldung: nur die Erinnerung „Tagesprotokoll fehlt“, Plan aus der Datenbank (Service-Schlüssel, nur dafür).
  const cron = req.headers.get('x-cron-secret');
  if (cron !== null) {
    const erwartet = umgebung.get('CRON_SECRET') ?? '';
    if (erwartet.length < 16 || !gleich(cron, erwartet)) return antwort({ fehler: 'Nicht angemeldet.' }, 401);
    const { data: plaene, error: planFehler } = await admin.rpc('fn_protokoll_erinnerungen');
    if (planFehler) return antwort({ fehler: 'Die Erinnerungen konnten nicht vorbereitet werden.' }, 500);
    const summe = { erinnerungen: 0, empfaenger: 0, geraete: 0, gesendet: 0, entfernt: 0, fehlgeschlagen: 0 };
    for (const plan of (plaene ?? []) as Plan[]) {
      const z = await versende(plan);
      if (!z) return antwort({ fehler: 'Die Geräte konnten nicht geladen werden.' }, 500);
      summe.erinnerungen += 1;
      for (const k of ['empfaenger', 'geraete', 'gesendet', 'entfernt', 'fehlgeschlagen'] as const) summe[k] += z[k];
    }
    return antwort(summe);
  }

  // 1. Eingabe
  let eingabe: { art?: unknown; ref?: unknown; extra?: unknown } = {};
  try { eingabe = await req.json(); } catch { /* leer */ }
  if (typeof eingabe.art !== 'string' || !/^[a-z_]{2,40}$/.test(eingabe.art)) return antwort({ fehler: 'art fehlt oder ist ungültig.' }, 400);
  const ref = typeof eingabe.ref === 'string' && /^[0-9a-f-]{36}$/i.test(eingabe.ref) ? eingabe.ref : null;
  const extra = typeof eingabe.extra === 'object' && eingabe.extra !== null ? eingabe.extra : {};

  // 2. Die Datenbank entscheidet mit den Rechten der aufrufenden Person über Zulässigkeit, Empfänger und Text.
  const aufrufer = erzeuge(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization')! } } });
  const { data, error } = await aufrufer.rpc('fn_push_vorbereiten', { p_art: eingabe.art, p_ref: ref, p_extra: extra });
  if (error) return fehlerAntwort(error);
  const plan = data as Plan;
  if (!plan.empfaenger.length) return antwort({ empfaenger: 0, geraete: 0, gesendet: 0, entfernt: 0, fehlgeschlagen: 0 });

  // 3. Geräte der Empfänger und Versand
  const z = await versende(plan);
  if (!z) return antwort({ fehler: 'Die Geräte konnten nicht geladen werden.' }, 500);
  return antwort(z);
}

// Start in Supabase (Deno). In den Tests gibt es kein Deno – dort wird nur behandle() benutzt.
declare const Deno: { serve(handler: (req: Request) => Response | Promise<Response>): void; env: Umgebung } | undefined;
if (typeof Deno !== 'undefined') Deno.serve((req) => behandle(req, Deno.env));
