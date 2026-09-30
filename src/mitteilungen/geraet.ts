import { supabase } from '../lib/supabase';

/** Mitteilungen auf diesem Gerät: einschalten, ausschalten, Stand prüfen. */

export type GeraeteStatus = 'nicht_unterstuetzt' | 'nicht_eingerichtet' | 'verweigert' | 'aus' | 'an';

/** Öffentlicher VAPID-Schlüssel (aus `npm run vapid`); ohne ihn bleibt die Funktion ausgeschaltet. */
export const vapidOeffentlich = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined)?.trim() ?? '';

export function base64urlZuBytes(text: string): Uint8Array<ArrayBuffer> {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  const bin = atob(b64);
  const aus = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) aus[i] = bin.charCodeAt(i);
  return aus;
}

export const unterstuetzt = (): boolean =>
  typeof navigator !== 'undefined' && 'serviceWorker' in navigator && typeof window !== 'undefined' && 'PushManager' in window && 'Notification' in window;

/** iPhone/iPad: Web-Push gibt es erst, wenn die Seite zum Home-Bildschirm hinzugefügt und von dort geöffnet wurde. */
export const istApple = (): boolean =>
  typeof navigator !== 'undefined' && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

async function registrierung(): Promise<ServiceWorkerRegistration> {
  return (await navigator.serviceWorker.getRegistration('/')) ?? navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

/** Stand auf diesem Gerät. „an“ gilt nur, wenn der Browser abonniert ist UND die Datenbank das Gerät für diese Person kennt. */
export async function pruefeStatus(personId: string): Promise<GeraeteStatus> {
  if (!unterstuetzt()) return 'nicht_unterstuetzt';
  if (!vapidOeffentlich) return 'nicht_eingerichtet';
  if (Notification.permission === 'denied') return 'verweigert';
  const reg = await navigator.serviceWorker.getRegistration('/');
  const abo = await reg?.pushManager.getSubscription();
  if (!abo) return 'aus';
  const { data, error } = await supabase.from('push_abos').select('id').eq('person_id', personId).eq('endpoint', abo.endpoint).maybeSingle();
  return !error && data ? 'an' : 'aus';
}

export class GeraetFehler extends Error {
  constructor(meldung: string) { super(meldung); this.name = 'GeraetFehler'; }
}

/** Fragt um Erlaubnis, abonniert beim Push-Dienst und merkt sich das Gerät in der Datenbank. */
export async function schalteEin(personId: string): Promise<void> {
  if (!unterstuetzt()) throw new GeraetFehler('Dieses Gerät unterstützt keine Mitteilungen.');
  if (!vapidOeffentlich) throw new GeraetFehler('Mitteilungen sind noch nicht eingerichtet.');
  const erlaubnis = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (erlaubnis !== 'granted') throw new GeraetFehler('Ohne Erlaubnis kann der Browser keine Mitteilungen anzeigen.');

  const reg = await registrierung();
  await navigator.serviceWorker.ready;
  // Immer ein frisches Abonnement: So gehört die Geräteadresse sicher zu dieser Person und nicht zu einer früheren Anmeldung am selben Browser.
  await (await reg.pushManager.getSubscription())?.unsubscribe();
  const abo = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64urlZuBytes(vapidOeffentlich) });
  const json = abo.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
    await abo.unsubscribe();
    throw new GeraetFehler('Der Browser hat kein vollständiges Abonnement geliefert.');
  }
  const { error } = await supabase.from('push_abos').insert({
    person_id: personId, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, user_agent: navigator.userAgent.slice(0, 200),
  });
  if (error) {
    await abo.unsubscribe();
    throw new GeraetFehler('Das Gerät konnte nicht gespeichert werden.');
  }
}

/** Meldet dieses Gerät ab (Browser und Datenbank). Fehler werden verschluckt, damit z. B. das Abmelden nie daran scheitert. */
export async function schalteAus(personId: string): Promise<void> {
  if (!unterstuetzt()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    const abo = await reg?.pushManager.getSubscription();
    if (!abo) return;
    await supabase.from('push_abos').delete().eq('person_id', personId).eq('endpoint', abo.endpoint);
    await abo.unsubscribe();
  } catch (e) {
    console.warn('Gerät konnte nicht abgemeldet werden:', e instanceof Error ? e.message : e);
  }
}
