import { useState } from 'react';
import { formatDatum } from '../../freizeiten/logik';
import { bloecke, type Teamprotokoll } from '../../teamprotokolle/logik';
import { Button } from '../../components/ui';

/** Ergebnis eines Abschnitts: Absätze und Aufzählungen (Zeilen mit „- “ am Anfang). */
export function Ergebnis({ text }: { text: string }) {
  return (
    <div className="teamprotokoll__ergebnis">
      {bloecke(text).map((b, i) => (b.art === 'liste'
        ? <ul key={i}>{b.punkte.map((p, j) => <li key={j}>{p}</li>)}</ul>
        : <p key={i}>{b.text}</p>))}
    </div>
  );
}

/**
 * Inhalt eines Teamprotokolls: Abschnitte mit Überschrift lassen sich ein- und ausklappen (der erste ist offen),
 * Abschnitte ohne Überschrift stehen als Text da. Am Ende nächstes Treffen sowie Aufgaben und Ziele.
 */
export function TeamprotokollInhalt({ p }: { p: Pick<Teamprotokoll, 'abschnitte' | 'naechstes_datum' | 'naechstes_zeit' | 'aufgaben'> }) {
  const mitTitel = p.abschnitte.filter((a) => a.titel).length;
  const [offen, setOffen] = useState<boolean[]>(() => {
    let erster = true;
    return p.abschnitte.map((a) => { if (!a.titel) return true; const o = erster; erster = false; return o; });
  });
  const alleOffen = p.abschnitte.every((a, i) => !a.titel || offen[i]);
  const setze = (i: number, wert: boolean) => setOffen((o) => (o[i] === wert ? o : o.map((x, j) => (j === i ? wert : x))));

  return (
    <div className="teamprotokoll__inhalt">
      {mitTitel > 1 && (
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <Button klein variante="ghost" onClick={() => setOffen(p.abschnitte.map(() => !alleOffen))}>{alleOffen ? 'Alle zuklappen' : 'Alle aufklappen'}</Button>
        </div>
      )}
      {p.abschnitte.map((a, i) => (a.titel
        ? (
          <details key={i} className="teamprotokoll__abschnitt" open={offen[i]} onToggle={(e) => setze(i, e.currentTarget.open)}>
            <summary>{a.titel}</summary>
            {a.text && <Ergebnis text={a.text} />}
          </details>
        )
        : <Ergebnis key={i} text={a.text} />))}
      {(p.naechstes_datum || p.aufgaben) && (
        <section className="teamprotokoll__abschluss" aria-label="Nächstes Treffen, Aufgaben und Ziele">
          {p.naechstes_datum && (
            <p><strong>📅 Nächstes Treffen:</strong> {formatDatum(p.naechstes_datum)}{p.naechstes_zeit ? ` um ${p.naechstes_zeit.slice(0, 5)} Uhr` : ''}</p>
          )}
          {p.aufgaben && (
            <>
              <p><strong>🎯 Aufgaben und Ziele</strong></p>
              <Ergebnis text={p.aufgaben} />
            </>
          )}
        </section>
      )}
    </div>
  );
}
