import { Link } from 'react-router-dom';
import type { Geladen } from '../../lib/laden';
import { formatDatum, type FreizeitKurz } from '../../freizeiten/logik';
import { planNachFreizeit, type PlanPunkt } from '../../heute/logik';
import type { MeinDienst } from '../../treffs/api';
import { dienstZeit } from '../../treffs/dienstplan';
import { Alert, Badge, Card } from '../../components/ui';

interface Props {
  heute: string;
  /** Freizeiten, die heute laufen (schon auf die der Person eingegrenzt). */
  freizeiten: (FreizeitKurz & { ort_name: string | null })[];
  dienste: MeinDienst[];
  /** Wochenplan von heute für diese Freizeiten (die Datenbank liefert nur, was die Person sehen darf). */
  plan: Geladen<PlanPunkt[]>;
}

/** „Heute“: was läuft heute bei dir – laufende Freizeiten mit Tagesprogramm und die Dienste des Tages. */
export function HeuteTag({ heute, freizeiten, dienste, plan }: Props) {
  const nachFreizeit = planNachFreizeit(plan.daten ?? []);
  const heuteDienste = dienste.filter((d) => d.datum === heute);

  if (freizeiten.length === 0 && heuteDienste.length === 0) return null;

  return (
    <Card>
      <h2>Heute · {formatDatum(heute)}</h2>
      {plan.fehler && <Alert ton="error">{plan.fehler}</Alert>}

      {heuteDienste.length > 0 && (
        <ul className="list" aria-label="Dienste heute">
          {heuteDienste.map((d) => (
            <li key={d.id} className="list__item">
              <div className="list__main">
                <Link className="list__title" to={`/treffs/${d.treff_id}/dienstplan`}>
                  Dienst{dienstZeit(d) ? ` · ${dienstZeit(d)} Uhr` : ''}
                </Link>
                <div className="list__meta"><span>{d.treff_name}</span>{d.ist_sonder && <Badge ton="warning">Sonderdienst: {d.bezeichnung}</Badge>}</div>
              </div>
              <Badge ton="success">Heute</Badge>
            </li>
          ))}
        </ul>
      )}

      {freizeiten.length > 0 && (
        <ul className="list" aria-label="Laufende Freizeiten">
          {freizeiten.map((f) => {
            const punkte = nachFreizeit.get(f.id) ?? [];
            return (
              <li key={f.id} className="list__item" style={{ display: 'block' }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <Link className="list__title" to={`/freizeiten/${f.id}`}>{f.name}</Link>
                  <Badge ton="success">Läuft</Badge>
                </div>
                {f.ort_name && <div className="list__meta"><span>{f.ort_name}</span></div>}
                {plan.laedt ? <p className="field__hint">Tagesprogramm wird geladen …</p> : punkte.length > 0 ? (
                  <ul className="mappe__punkte" aria-label={`Tagesprogramm ${f.name}`}>
                    {punkte.map((p) => <li key={p.id}><strong>{p.slot}:</strong> {p.titel}</li>)}
                  </ul>
                ) : (
                  <p className="field__hint">Für heute steht noch nichts im <Link to={`/freizeiten/${f.id}/plan`}>Wochenplan</Link>.</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
