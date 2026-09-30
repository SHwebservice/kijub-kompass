/**
 * Meldet unerwartete Fehler der App an die Koordination – ohne Personendaten: Adresse und Text werden von Kennungen, Mail-Adressen
 * und Zahlenfolgen befreit (die Datenbank bereinigt noch einmal). Pro Sitzung werden wenige, verschiedene Fehler gemeldet.
 * Reine Logik ohne Netzwerk; das Senden wird übergeben.
 */

const UUID = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g;
const MAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const ZAHLEN = /\+?[0-9][0-9 /()-]{6,}[0-9]/g;

export const bereinige = (t: string) => t.replace(UUID, ':id').replace(MAIL, '[mail]').replace(ZAHLEN, '[zahl]');

/** Adresse ohne Suchteil, Anker und Kennungen: „/treffs/<uuid>/protokoll?x=1“ → „/treffs/:id/protokoll“. */
export function bereinigePfad(pfad: string): string {
  const ohne = pfad.split('?')[0]!.split('#')[0]!;
  return bereinige(ohne).slice(0, 200) || '/';
}

/** Dinge, die keine Fehler der App sind: fehlendes Netz, Browser-Erweiterungen, harmlose Layout-Meldungen. */
const IGNORIERT = [
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
  /Failed to fetch|NetworkError|Load failed|network request failed|The network connection was lost|AbortError|signal is aborted/i,
];

export interface Fehlerangaben { meldung: string; stapel: string | null }

/** Liest Meldung und Stapel aus allem, was geworfen werden kann. Leere oder ignorierte Meldungen ergeben null. */
export function fehlerAngaben(fehler: unknown): Fehlerangaben | null {
  let meldung = '';
  let stapel: string | null = null;
  if (fehler instanceof Error) { meldung = fehler.message; stapel = fehler.stack ?? null; }
  else if (typeof fehler === 'string') meldung = fehler;
  else if (fehler && typeof fehler === 'object' && 'message' in fehler && typeof (fehler as { message: unknown }).message === 'string') meldung = (fehler as { message: string }).message;
  meldung = bereinige(meldung).trim().slice(0, 400);
  if (!meldung || IGNORIERT.some((r) => r.test(meldung))) return null;
  return { meldung, stapel: stapel ? bereinige(stapel).slice(0, 1500) : null };
}

export type Senden = (version: string, seite: string, meldung: string, stapel: string | null) => Promise<void>;

export interface MelderOptionen {
  senden: Senden;
  version: string;
  /** Aktuelle Adresse der Seite. */
  pfad: () => string;
  /** Höchstens so viele verschiedene Fehler pro Sitzung (Standard 5). */
  max?: number;
}

/** Erzeugt die Meldefunktion: dieselbe Meldung an derselben Stelle nur einmal, insgesamt höchstens `max`; Fehler beim Senden stören nie. */
export function erzeugeMelder({ senden, version, pfad, max = 5 }: MelderOptionen): (fehler: unknown) => void {
  const gemeldet = new Set<string>();
  return (fehler) => {
    const a = fehlerAngaben(fehler);
    if (!a || gemeldet.size >= max) return;
    const seite = bereinigePfad(pfad());
    const schluessel = `${seite}|${a.meldung}`;
    if (gemeldet.has(schluessel)) return;
    gemeldet.add(schluessel);
    void Promise.resolve().then(() => senden(version, seite, a.meldung, a.stapel)).catch(() => undefined);
  };
}

/** Hört auf nicht abgefangene Fehler und Promise-Fehler der Seite; liefert die Abmeldung. */
export function installiereFehlerMeldung(melder: (fehler: unknown) => void, ziel: Pick<Window, 'addEventListener' | 'removeEventListener'> = window): () => void {
  const beiFehler = (e: Event) => { const x = e as ErrorEvent; melder(x.error ?? x.message); };
  const beiAblehnung = (e: Event) => melder((e as PromiseRejectionEvent).reason);
  ziel.addEventListener('error', beiFehler);
  ziel.addEventListener('unhandledrejection', beiAblehnung);
  return () => { ziel.removeEventListener('error', beiFehler); ziel.removeEventListener('unhandledrejection', beiAblehnung); };
}
