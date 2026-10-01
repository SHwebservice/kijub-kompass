import { useSyncExternalStore } from 'react';

/** Gewählte Darstellung: dem Gerät folgen oder fest hell/dunkel. Bleibt nur in diesem Browser gespeichert. */
export type Darstellung = 'system' | 'hell' | 'dunkel';

/** Muss mit public/theme-init.js übereinstimmen (setzt die Wahl vor dem ersten Zeichnen). */
export const SCHLUESSEL = 'kompass-darstellung';
export const FARBE_HELL = '#eaf1ff';
export const FARBE_DUNKEL = '#0d1226';

const gueltig = (w: unknown): w is Darstellung => w === 'system' || w === 'hell' || w === 'dunkel';

export function ladeDarstellung(): Darstellung {
  try {
    const w = localStorage.getItem(SCHLUESSEL);
    return gueltig(w) ? w : 'system';
  } catch { return 'system'; }
}

const geraetIstDunkel = () => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;

/** Was tatsächlich angezeigt wird. */
export const istDunkel = (d: Darstellung): boolean => (d === 'system' ? geraetIstDunkel() : d === 'dunkel');

/** Setzt data-theme am Wurzelelement („system“ = Attribut entfernen) und die Farbe der Browserleiste. */
export function wendeAn(d: Darstellung, doc: Document = document): void {
  const wurzel = doc.documentElement;
  if (d === 'system') wurzel.removeAttribute('data-theme');
  else wurzel.setAttribute('data-theme', d === 'dunkel' ? 'dark' : 'light');
  doc.querySelector('meta[name="theme-color"]')?.setAttribute('content', istDunkel(d) ? FARBE_DUNKEL : FARBE_HELL);
}

let aktuell: Darstellung = ladeDarstellung();
let version = 0;
const zuhoerer = new Set<() => void>();
const melde = () => { version += 1; zuhoerer.forEach((f) => f()); };

export function setzeDarstellung(d: Darstellung): void {
  aktuell = d;
  try { localStorage.setItem(SCHLUESSEL, d); } catch { /* ohne Speicher gilt die Wahl bis zum Neuladen */ }
  wendeAn(d);
  melde();
}

/** Beim Start aufrufen: Wahl anwenden und auf Wechsel der Geräteeinstellung reagieren (nur bei „system“ relevant). */
export function starteDarstellung(): void {
  aktuell = ladeDarstellung();
  wendeAn(aktuell);
  if (typeof matchMedia === 'function') {
    matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (aktuell === 'system') { wendeAn('system'); melde(); } });
  }
}

const abonniere = (f: () => void) => { zuhoerer.add(f); return () => { zuhoerer.delete(f); }; };

/** Aktuelle Wahl und was daraus angezeigt wird. */
export function useDarstellung(): { wahl: Darstellung; dunkel: boolean; setze: (d: Darstellung) => void } {
  useSyncExternalStore(abonniere, () => version);
  return { wahl: aktuell, dunkel: istDunkel(aktuell), setze: setzeDarstellung };
}
