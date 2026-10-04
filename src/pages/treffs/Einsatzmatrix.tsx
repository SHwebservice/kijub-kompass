import { baueEinsatz } from '../../treffs/einsatz';
import type { Abwesenheit, Feiertag, Tageskarte } from '../../treffs/dienstplan';
import type { TreffTeamMitglied } from '../../treffs/api';
import { Card } from '../../components/ui';

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
}

const ABWESEND = { urlaub: { zeichen: 'U', text: 'Urlaub' }, krank: { zeichen: 'K', text: 'krank' } } as const;

/** „Wer arbeitet wann“: Personen mal Tage. ● Dienst, ★ Sonderdienst, U Urlaub, K krank, ? Wunsch; darunter die Besetzung je Tag. */
export function Einsatzmatrix({ karten, mitglieder, abwesenheiten, feiertage, treffId, ichId, heute, mitWuenschen, zeitraum }: Props) {
  if (karten.length === 0 || mitglieder.length === 0) return null;
  const { spalten, zeilen } = baueEinsatz(karten, mitglieder, abwesenheiten, feiertage, treffId, heute, mitWuenschen);
  const unbesetzt = spalten.filter((s) => s.unbesetzt).length;

  return (
    <Card>
      <h2>Wer arbeitet wann</h2>
      {unbesetzt > 0 && <p className="einsatz__warnung">{unbesetzt === 1 ? 'Ein Öffnungstag ist' : `${unbesetzt} Öffnungstage sind`} noch nicht besetzt (rot markiert).</p>}
      <div className="einsatz-wrap" role="region" aria-label={`Einsatzplan ${zeitraum}`} tabIndex={0}>
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
            </tr>
          </thead>
          <tbody>
            {zeilen.map((z) => (
              <tr key={z.person_id} className={z.person_id === ichId ? 'einsatz__ich' : undefined}>
                <th scope="row" className="einsatz__person">{z.name}{z.leitung && <span className="einsatz__rolle"> (Leitung)</span>}</th>
                {z.zellen.map((c, i) => {
                  const s = spalten[i]!;
                  return (
                    <td key={s.datum} className={s.heute ? 'einsatz__zelle--heute' : undefined}>
                      {c.dienst && <><span className="einsatz__dienst" aria-hidden="true">●</span><span className="sr-only">eingeteilt</span></>}
                      {c.sonder.length > 0 && <><span className="einsatz__sonder" aria-hidden="true">★</span><span className="sr-only">Sonderdienst: {c.sonder.join(', ')}</span></>}
                      {c.abwesend && <><span className="einsatz__abwesend" aria-hidden="true">{ABWESEND[c.abwesend].zeichen}</span><span className="sr-only">abwesend: {ABWESEND[c.abwesend].text}</span></>}
                      {c.wunsch && <><span className="einsatz__wunsch" aria-hidden="true">?</span><span className="sr-only">wünscht den Dienst</span></>}
                    </td>
                  );
                })}
                <td className="einsatz__summe">{z.tage}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="einsatz__person">Besetzung</th>
              {spalten.map((s) => <td key={s.datum} className={s.unbesetzt ? 'einsatz__leer' : undefined}>{s.besetzung}</td>)}
              <td className="einsatz__summe" />
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
      </ul>
    </Card>
  );
}
