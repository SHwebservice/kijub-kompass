// Erzeugt ein Schlüsselpaar für Web-Push (VAPID, ES256). Der öffentliche Schlüssel darf in die App; der private bleibt geheim.
const base64url = (bytes) => Buffer.from(bytes).toString('base64url');

export async function erzeugeVapid() {
  const paar = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const oeffentlich = new Uint8Array(await crypto.subtle.exportKey('raw', paar.publicKey));
  const privat = (await crypto.subtle.exportKey('jwk', paar.privateKey)).d;
  return { oeffentlich: base64url(oeffentlich), privat };
}
