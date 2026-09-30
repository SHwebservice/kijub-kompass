import { useEffect, useRef, useState } from 'react';
import { fehlerText } from './fehler';

export interface Geladen<T> {
  daten: T | null;
  fehler: string | null;
  /** true, bis für den aktuellen Schlüssel das erste Ergebnis (auch „nichts gefunden") da ist. Beim Neuladen bleiben die Daten sichtbar. */
  laedt: boolean;
  neuLaden: () => void;
}

interface Ergebnis<T> { schluessel: string; daten: T | null; fehler: string | null }

/**
 * Lädt Daten asynchron. `schluessel` bestimmt, wann neu geladen wird (z. B. die ID einer Freizeit);
 * Ergebnisse gehören immer zu ihrem Schlüssel – beim Wechsel erscheinen nie Daten des vorherigen Eintrags.
 * `neuLaden()` lädt nach einer Änderung erneut, ohne die Anzeige leerzuräumen.
 */
export function useLaden<T>(laden: () => Promise<T>, schluessel: string): Geladen<T> {
  const [ergebnis, setErgebnis] = useState<Ergebnis<T> | null>(null);
  const [version, setVersion] = useState(0);
  const ladenRef = useRef(laden);

  useEffect(() => { ladenRef.current = laden; });

  useEffect(() => {
    let aktuell = true;
    ladenRef.current()
      .then((d) => { if (aktuell) setErgebnis({ schluessel, daten: d, fehler: null }); })
      .catch((e: unknown) => {
        if (aktuell) setErgebnis({ schluessel, daten: null, fehler: fehlerText(e, 'Die Daten konnten nicht geladen werden.') });
      });
    return () => { aktuell = false; };
  }, [schluessel, version]);

  const passend = ergebnis?.schluessel === schluessel ? ergebnis : null;
  return {
    daten: passend?.daten ?? null,
    fehler: passend?.fehler ?? null,
    laedt: passend === null,
    neuLaden: () => setVersion((v) => v + 1),
  };
}

/** Ein Ausschnitt eines Ergebnisses (z. B. nur die Notizen aus dem Gesamtergebnis der Startseite) mit demselben Lade- und Fehlerzustand. */
export function teil<T, U>(g: Geladen<T>, aus: (t: T) => U): Geladen<U> {
  return { daten: g.daten === null ? null : aus(g.daten), fehler: g.fehler, laedt: g.laedt, neuLaden: g.neuLaden };
}
