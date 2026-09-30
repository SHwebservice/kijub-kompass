// Service Worker des KiJuB-Kompass: zeigt Mitteilungen (Web-Push) an und öffnet beim Antippen die passende Seite.
// Er speichert bewusst nichts zwischen (kein Offline-Betrieb) und fängt keine Anfragen ab.

/** Nur Adressen innerhalb der App sind erlaubt (Pfad ab "/"), alles andere führt zur Startseite. */
function sichereAdresse(roh) {
  if (typeof roh !== 'string' || !roh.startsWith('/') || roh.startsWith('//') || roh.includes('\\')) return '/';
  return roh;
}

self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()); });

self.addEventListener('push', (e) => {
  let daten = {};
  try { daten = e.data ? e.data.json() : {}; } catch { daten = {}; }
  const titel = typeof daten.titel === 'string' && daten.titel ? daten.titel.slice(0, 100) : 'KiJuB-Kompass';
  const text = typeof daten.text === 'string' ? daten.text.slice(0, 300) : '';
  e.waitUntil(self.registration.showNotification(titel, {
    body: text,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: sichereAdresse(daten.url) },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const ziel = new URL(sichereAdresse(e.notification.data && e.notification.data.url), self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((fenster) => {
    for (const f of fenster) {
      if (new URL(f.url).origin === self.location.origin && 'focus' in f) {
        if ('navigate' in f) f.navigate(ziel);
        return f.focus();
      }
    }
    return self.clients.openWindow(ziel);
  }));
});
