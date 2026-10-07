import { useEffect, useRef, useState, type ReactNode } from 'react';
import { baueEinsatz } from '../../treffs/einsatz';
import { bearbeitbar, eingeteilt, konfliktAm, setze, stundenVon, umschalten, zeileFuellen, type Entwurf } from '../../treffs/entwurf';
import { stundenText, type Abwesenheit, type Feiertag, type Tageskarte } from '../../treffs/dienstplan';
import type { TreffTeamMitglied } from '../../treffs/api';
import { Card } from '../../components/ui';

/** Bearbeiten-Modus: `karten` der Matrix zeigen dann den Entwurf, `gespeichert` den Stand der Datenbank. */
export interface MatrixBearbeiten {
  gespeichert: Tageskarte[];
  entwurf: Entwurf;
  aendern: (f: (e: Entwurf) => Entwurf) => void;
}

interface Props {
  karten: Tageskarte[];
  mitglieder: TreffTeamMitglied[];
  abwesenheiten: Abwesenheit[];
  feiertage: Feiertag[];
  treffId: string;
  /** Die angemeldete Person (ihre Zeile ist hervorgehoben). */
  ichId: string;
  heute: string;
  /** Offene Dienstwünsche anzeigen (Treffleitung und Koordination). */
  mitWuenschen: boolean;
  /** Beschriftung für Hilfsmittel, z. B. „Woche“ oder „Monat“. */
  zeitraum: string;
  bearbeiten?: MatrixBearbeiten;
  /** Zusätzlicher Inhalt unter der Überschrift (z. B. Knöpfe zum Bearbeiten). */
  kopf?: ReactNode;
}

const ABWESEND = { urlaub: { zeichen: 'U', text: 'Urlaub' }, krank: { zeichen: 'K', text: 'krank' } } as const;

/**
 * „Wer arbeitet wann“: Personen mal Tage. ● Dienst, ★ Sonderdienst, U Urlaub, K krank, ? Wunsch; darunter die Besetzung je Tag.
 * Im Bearbeiten-Modus sind die Zellen der Öffnungstage Schalter: Klick teilt ein oder nimmt heraus, mit der Maus lässt sich über
 * mehrere Tage ziehen, der Knopf am Namen füllt oder leert die ganze Zeile. Rechts stehen die Stunden nach dem Entwurf.
 */
export function Einsatzmatrix({ karten, mitglieder, abwesenheiten, feiertage, treffId, ichId, heute, mitWuenschen, zeitraum, bearbeiten, kopf }: Props) {
  const [hinweis, setHinweis] = useState<string | null>(null);
  const ziehen = useRef<{ wert: boolean } | null>(null);
  const klickIgnorieren = useRef(false);

  useEffect(() => {
    const ende = () => { ziehen.current = null; };
    window.addEventListener('pointerup', ende);
    window.addEventListener('pointercancel', ende);
    return () => { window.removeEventListener('pointerup', ende); window.removeEventListener('pointercancel', ende); };
  }, []);

  if (karten.length === 0 || mitglieder.length === 0) return null;
  const { spalten, zeilen } = baueEinsatz(karten, mitglieder, abwesenheiten, feiertage, treffId, heute, mitWuenschen);
  const unbesetzt = spalten.filter((s) => s.unbesetzt).length;
  const maxStunden = Object.fromEntries(mitglieder.map((m) => [m.person_id, m.tzk_max_stunden]));
  const b = bearbeiten;

  const zelleSetzen = (datum: string, person: string, wert: boolean, einzeln: boolean) => {
    if (!b) return;
    // Beim Ziehen werden Tage mit Urlaub, Krankheit oder Feiertag übersprungen; einzeln angeklickt entscheidet die Treffleitung selbst.
    if (!einzeln && wert && konfliktAm(datum, person, abwesenheiten, feiertage, treffId)) return;
    b.aendern((e) => setze(b.gespeichert, e, datum, person, wert));
  };

  const zieheUeber = (x: number, y: number) => {
    if (!ziehen.current) return;
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-zelle]');
    if (el?.dataset.datum && el.dataset.person) zelleSetzen(el.dataset.datum, el.dataset.person, ziehen.current.wert, false);
  };

  const fuelleZeile = (person: string, name: string) => {
    if (!b) return;
    const { entwurf, ausgelassen } = zeileFuellen(b.gespeichert, b.entwurf, person, abwesenheiten, feiertage, treffId);
    b.aendern(() => entwurf);
    setHinweis(ausgelassen > 0
      ? `${name}: ${ausgelassen === 1 ? 'ein Tag' : `${ausgelassen} Tage`} mit Urlaub, Krankheit oder Feiertag ausgelassen – zum Einteilen einzeln anklicken.`
      : null);
  };

  return (
    <Card>
      <h2>Wer arbeitet wann</h2>
      {kopf}
      {unbesetzt > 0 && <p className="einsatz__warnung">{unbesetzt === 1 ? 'Ein Öffnungstag ist' : `${unbesetzt} Öffnungstage sind`} noch nicht besetzt (rot markiert).</p>}
      {b && hinweis && <p className="field__hint" role="status">{hinweis}</p>}
      <div className={`einsatz-wrap${b ? ' einsatz-wrap--bearbeiten' : ''}`} role="region" aria-label={`Einsatzplan ${zeitraum}`} tabIndex={0}
        onPointerMove={b ? (ev) => zieheUeber(ev.clientX, ev.clientY) : undefined}>
        <table className="einsatz">
          <caption className="sr-only">Wer in diesem {zeitraum} an welchen Tagen eingeteilt ist</caption>
          <thead>
            <tr>
              <th scope="col" className="einsatz__person">Person</th>
              {spalten.map((s) => (
                <th key={s.datum} scope="col" title={s.feiertag ?? undefined}
                  className={`einsatz__tag${s.heute ? ' einsatz__tag--heute' : ''}${s.unbesetzt ? ' einsatz__tag--leer' : ''}${s.feiertag ? ' einsatz__tag--feiertag' : ''}`}>
                  <span aria-hidden="true">{s.wochentag}</span>
                  <span aria-hidden="true" className="einsatz__zahl">{s.tag}</span>
                  <span className="sr-only">{`${s.wochentag} ${s.tag}.${s.heute ? ' (heute)' : ''}${s.feiertag ? `, Feiertag: ${s.feiertag}` : ''}`}</span>
                </th>
              ))}
              <th scope="col" className="einsatz__summe">Tage</th>
              {b && <th scope="col" className="einsatz__summe">Std.</th>}
            </tr>
          </thead>
          <tbody>
            {zeilen.map((z) => {
              const stunden = b ? stundenVon(karten, z.person_id) : 0;
              const vorher = b ? stundenVon(b.gespeichert, z.person_id) : 0;
              const max = maxStunden[z.person_id] ?? null;
              const zuViel = b && max !== null && stunden > max;
              return (
                <tr key={z.person_id} className={z.person_id === ichId ? 'einsatz__ich' : undefined}>
                  <th scope="row" className="einsatz__person">
                    {b ? (
                      <button type="button" className="einsatz__zeilenknopf" onClick={() => fuelleZeile(z.person_id, z.name)}
                        title="Ganze Zeile einteilen oder leeren" aria-label={`${z.name}: an allen Öffnungstagen einteilen oder herausnehmen`}>
                        {z.name}
                      </button>
                    ) : z.name}
                    {z.leitung && <span className="einsatz__rolle"> (Leitung)</span>}
                  </th>
                  {z.zellen.map((c, i) => {
                    const s = spalten[i]!;
                    const karte = karten[i]!;
                    const inhalt = (
                      <>
                        {c.dienst && <><span className="einsatz__dienst" aria-hidden="true">●</span><span className="sr-only">eingeteilt</span></>}
                        {c.sonder.length > 0 && <><span className="einsatz__sonder" aria-hidden="true">★</span><span className="sr-only">Sonderdienst: {c.sonder.join(', ')}</span></>}
                        {c.abwesend && <><span className="einsatz__abwesend" aria-hidden="true">{ABWESEND[c.abwesend].zeichen}</span><span className="sr-only">abwesend: {ABWESEND[c.abwesend].text}</span></>}
                        {c.wunsch && <><span className="einsatz__wunsch" aria-hidden="true">?</span><span className="sr-only">wünscht den Dienst</span></>}
                      </>
                    );
                    if (!b || !bearbeitbar(karte)) return <td key={s.datum} className={s.heute ? 'einsatz__zelle--heute' : undefined}>{inhalt}</td>;

                    const vorherDrin = eingeteilt(b.gespeichert, new Map(), s.datum, z.person_id);
                    const neu = c.dienst && !vorherDrin;
                    const weg = !c.dienst && vorherDrin;
                    const konflikt = konfliktAm(s.datum, z.person_id, abwesenheiten, feiertage, treffId);
                    return (
                      <td key={s.datum} className={`einsatz__schalterzelle${s.heute ? ' einsatz__zelle--heute' : ''}${neu ? ' einsatz__zelle--neu' : ''}${weg ? ' einsatz__zelle--weg' : ''}`}>
                        <button type="button" className="einsatz__schalter" data-zelle="" data-datum={s.datum} data-person={z.person_id} aria-pressed={c.dienst}
                          aria-label={`${z.name}, ${s.wochentag} ${s.tag}.${konflikt ? ` (${konflikt})` : ''}${neu ? ', neu' : ''}${weg ? ', wird herausgenommen' : ''}`}
                          onPointerDown={(ev) => {
                            if (ev.pointerType !== 'mouse' || ev.button !== 0) return;          // Touch: tippen schaltet, Wischen scrollt
                            ev.preventDefault();
                            klickIgnorieren.current = true;
                            ziehen.current = { wert: !c.dienst };
                            setHinweis(null);
                            zelleSetzen(s.datum, z.person_id, !c.dienst, true);
                          }}
                          onClick={() => {
                            if (klickIgnorieren.current) { klickIgnorieren.current = false; return; }
                            setHinweis(null);
                            b.aendern((e) => umschalten(b.gespeichert, e, s.datum, z.person_id));
                          }}>
                          {inhalt}
                          {weg && <span className="einsatz__weg" aria-hidden="true">○</span>}
                        </button>
                      </td>
                    );
                  })}
                  <td className="einsatz__summe">{z.tage}</td>
                  {b && (
                    <td className={`einsatz__summe${zuViel ? ' einsatz__zuviel' : ''}`} title={max !== null ? `höchstens ${stundenText(max)} im Monat` : undefined}>
                      {stundenText(stunden)}
                      {stunden !== vorher && <span className="einsatz__delta"> ({stunden > vorher ? '+' : '−'}{stundenText(Math.abs(Math.round((stunden - vorher) * 100) / 100))})</span>}
                      {zuViel && <span className="sr-only"> – mehr als die höchstens {stundenText(max!)}</span>}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="einsatz__person">Besetzung</th>
              {spalten.map((s) => <td key={s.datum} className={s.unbesetzt ? 'einsatz__leer' : undefined}>{s.besetzung}</td>)}
              <td className="einsatz__summe" />
              {b && <td className="einsatz__summe" />}
            </tr>
          </tfoot>
        </table>
      </div>
      <ul className="einsatz__legende" aria-label="Zeichenerklärung">
        <li><span className="einsatz__dienst" aria-hidden="true">●</span> Dienst</li>
        <li><span className="einsatz__sonder" aria-hidden="true">★</span> Sonderdienst</li>
        <li><span className="einsatz__abwesend" aria-hidden="true">U</span> Urlaub</li>
        <li><span className="einsatz__abwesend" aria-hidden="true">K</span> krank</li>
        {mitWuenschen && <li><span className="einsatz__wunsch" aria-hidden="true">?</span> Wunsch offen</li>}
        {b && <li><span className="einsatz__legende-neu" aria-hidden="true">●</span> neu im Entwurf</li>}
        {b && <li><span className="einsatz__weg" aria-hidden="true">○</span> wird herausgenommen</li>}
      </ul>
    </Card>
  );
}
