import { Link } from 'react-router-dom';
import { formatKurz } from '../../freizeiten/logik';
import { dienstZeit, eigenerWunsch, istVeroeffentlicht, meineDiensttage, stundenSumme, stundenText, type Abwesenheit, type Tageskarte } from '../../treffs/dienstplan';
import { Badge, Card } from '../../components/ui';

interface Props {
  karten: Tageskarte[];
  ichId: string;
  heute: string;
  /** „in dieser Woche“ / „im November 2026“ */
  zeitraum: string;
  letzterBesuch: string | null;
  veroeffentlicht: readonly string[];
  /** Eigene Abwesenheiten und „kann nicht“ im Zeitraum. */
  abwesenheiten: Abwesenheit[];
  nurIch: boolean;
  setNurIch: (an: boolean) => void;
  tagOeffnen: (datum: string) => void;
}

/** „Mein Plan“ über der Tabelle: die eigenen Dienste des Zeitraums auf einen Blick, mit Stunden, neuen Einteilungen und offenen Wünschen. */
export function MeinPlan({ karten, ichId, heute, zeitraum, letzterBesuch, veroeffentlicht, abwesenheiten, nurIch, setNurIch, tagOeffnen }: Props) {
  const tage = meineDiensttage(karten, ichId, letzterBesuch);
  const wuensche = karten.filter((k) => eigenerWunsch(k, ichId) === 'offen').length;
  const kannNicht = abwesenheiten.filter((a) => a.person_id === ichId && a.typ === 'verhindert' && a.datum >= heute).length;

  return (
    <Card className="mein-plan">
      <h2>Deine Dienste {zeitraum}</h2>
      {tage.length === 0 ? <p>Du bist {zeitraum} nicht eingeteilt.</p> : (
        <ul className="list" aria-label="Meine Dienste im Zeitraum">
          {tage.map(({ datum, dienst, neu }) => (
            <li key={dienst.id} className={`list__item${datum === heute ? ' list__item--heute' : ''}`}>
              <div className="list__main">
                <button type="button" className="mein-plan__tag" onClick={() => tagOeffnen(datum)}>
                  {formatKurz(datum)}{datum === heute ? ' · heute' : ''}{dienstZeit(dienst) ? ` · ${dienstZeit(dienst)} Uhr` : ''}
                </button>
                <div className="list__meta">
                  {dienst.ist_sonder && <Badge ton="warning">Sonderdienst: {dienst.bezeichnung}</Badge>}
                  {neu && <Badge ton="accent">neu</Badge>}
                  {datum >= heute && !istVeroeffentlicht(datum, veroeffentlicht) && <Badge>vorläufig</Badge>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="list__meta">
        {tage.length > 0 && <span><strong>{tage.length === 1 ? 'Ein Dienst' : `${tage.length} Dienste`}</strong> · {stundenText(stundenSumme(tage.map((t) => t.dienst)))}</span>}
        {wuensche > 0 && <span>{wuensche === 1 ? 'ein Wunsch offen' : `${wuensche} Wünsche offen`}</span>}
        {kannNicht > 0 && <span>{kannNicht === 1 ? 'ein Tag „kann nicht“' : `${kannNicht} Tage „kann nicht“`}</span>}
      </p>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <label className="mein-plan__nurich">
          <input type="checkbox" checked={nurIch} onChange={(e) => setNurIch(e.target.checked)} /> In der Tabelle nur mich zeigen
        </label>
        <Link to="/dienste">Alle meine Dienste →</Link>
      </div>
      <p className="field__hint">Tipp: Tippe in der Tabelle einen Tag an, um einen Dienst zu wünschen oder zu sagen, dass du nicht kannst.</p>
    </Card>
  );
}
