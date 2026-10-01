import { Link } from 'react-router-dom';
import type { FreizeitZeile } from '../../freizeiten/api';
import { ferienText, gruppiereNachFerien, zeitraumText } from '../../freizeiten/logik';
import { ohneLeitung, type TeamZeile } from '../../heute/logik';
import { Alert, Badge, Card } from '../../components/ui';

/** Koordination: der Überblick über die aktuelle Saison. Bewerbungen und Vorschläge stehen im Kachelraster oben. */
export function KoordSicht({ freizeiten, aktuelle, team }: { freizeiten: boolean; aktuelle: FreizeitZeile[]; team: TeamZeile[] }) {
  const ohne = freizeiten ? ohneLeitung(aktuelle, team) : [];
  if (!freizeiten || aktuelle.length === 0) return null;

  return (
    <Card>
      <h2>Saison-Überblick</h2>
      <p className="field__hint">Laufende Freizeiten und solche, die in den nächsten zwei Wochen beginnen.</p>
      {ohne.length > 0 && <Alert ton="warning">{ohne.length === 1 ? 'Eine Freizeit hat' : `${ohne.length} Freizeiten haben`} noch keine Leitung: {ohne.map((f) => f.name).join(', ')}.</Alert>}
      {gruppiereNachFerien(aktuelle).map((g) => (
        <section key={g.schluessel} aria-label={g.label}>
          <h3>{g.label}</h3>
          <ul className="list">
            {g.eintraege.map((f) => (
              <li key={f.id} className="list__item">
                <div className="list__main">
                  <Link className="list__title" to={`/freizeiten/${f.id}`}>{f.name}</Link>
                  <div className="list__meta"><span>{zeitraumText(f.start_datum, f.ende_datum)}</span>{f.ferienwoche && f.ferienzeitraum && <span>{ferienText(f)}</span>}{f.ort_name && <span>{f.ort_name}</span>}</div>
                </div>
                {ohne.some((x) => x.id === f.id) && <Badge ton="danger">Keine Leitung</Badge>}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Card>
  );
}
