import { useEffect, useRef, type ReactNode } from 'react';

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
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') schliessenRef.current(); };
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
