import { useEffect, useRef, type ReactNode } from 'react';

const FOKUSSIERBAR = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex]:not([tabindex="-1"])';

interface Props { titel: string; schliessen: () => void; children: ReactNode }

/** Einfaches Fenster über der Seite (Dialog): Escape und Klick auf den Hintergrund schließen, Fokus wandert hinein und zurück. */
export function Sheet({ titel, schliessen, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  // Die aktuelle Schließen-Funktion merken, damit das Fenster nicht bei jedem Neuzeichnen den Fokus neu setzt
  // (sonst springt der Cursor nach jedem getippten Zeichen aus dem Eingabefeld, wenn die Funktion bei jedem Rendern neu entsteht).
  const schliessenRef = useRef(schliessen);
  useEffect(() => { schliessenRef.current = schliessen; });

  useEffect(() => {
    const vorher = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { schliessenRef.current(); return; }
      if (e.key !== 'Tab' || !ref.current) return;
      // Der Fokus bleibt im Fenster: am Ende geht es zum Anfang und umgekehrt
      const ziele = [...ref.current.querySelectorAll<HTMLElement>(FOKUSSIERBAR)].filter((x) => !x.hasAttribute('disabled') && x.getAttribute('aria-hidden') !== 'true');
      if (ziele.length === 0) { e.preventDefault(); ref.current.focus(); return; }
      const erstes = ziele[0]!; const letztes = ziele[ziele.length - 1]!;
      const aktiv = document.activeElement;
      if (!ref.current.contains(aktiv) || aktiv === ref.current) { e.preventDefault(); (e.shiftKey ? letztes : erstes).focus(); }
      else if (e.shiftKey && aktiv === erstes) { e.preventDefault(); letztes.focus(); }
      else if (!e.shiftKey && aktiv === letztes) { e.preventDefault(); erstes.focus(); }
    };
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('keydown', esc); vorher?.focus?.(); };
  }, []);

  return (
    <div className="sheet__hintergrund" onMouseDown={(e) => { if (e.target === e.currentTarget) schliessen(); }}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={titel} tabIndex={-1} ref={ref}>
        <div className="sheet__kopf">
          <h2>{titel}</h2>
          <button type="button" className="btn btn--ghost btn--sm" onClick={schliessen} aria-label="Schließen">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
