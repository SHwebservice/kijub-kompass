import { Link } from 'react-router-dom';
import type { Geladen } from '../../lib/laden';
import type { FreizeitZeile } from '../../freizeiten/api';
import { ferienText, gruppiereNachFerien, zeitraumText } from '../../freizeiten/logik';
import { ohneLeitung, personenText, type TeamZeile } from '../../heute/logik';
import { Alert, Badge, Card } from '../../components/ui';

/** Koordination: offene Bewerbungen (nur Freizeitenkoordination) und Vorschläge, Freizeiten ohne Leitung und der Überblick über die aktuelle Saison. */
export function KoordSicht({ freizeiten, aktuelle, bewerbungen, vorschlaege, team }: {
  freizeiten: boolean; aktuelle: FreizeitZeile[]; bewerbungen: Geladen<number>; vorschlaege: Geladen<number>; team: TeamZeile[];
}) {
  // Bewerbungen und Saison-Überblick gehören zur Freizeitenkoordination; die Katalog-Vorschläge zu jeder Koordination
  const nBewerbungen = bewerbungen.daten ?? 0;
  const nVorschlaege = vorschlaege.daten ?? 0;
  const ohne = freizeiten ? ohneLeitung(aktuelle, team) : [];
  const fehler = bewerbungen.fehler ?? vorschlaege.fehler;

  return (
    <>
      <Card>
        <h2>Für die Koordination</h2>
        {fehler && <Alert ton="error">{fehler}</Alert>}
        <ul className="list" aria-label="Offene Aufgaben der Koordination">
          {freizeiten && (
          <li className="list__item">
            <div className="list__main">
              <Link className="list__title" to="/bewerbungen">Bewerbungen</Link>
              <div className="list__meta"><span>{nBewerbungen === 0 ? 'Keine offenen Bewerbungen' : `${personenText(nBewerbungen, 'Bewerbung wartet', 'Bewerbungen warten')} auf Entscheidung`}</span></div>
            </div>
            {nBewerbungen > 0 && <Badge ton="warning">{nBewerbungen}</Badge>}
          </li>
          )}
          <li className="list__item">
            <div className="list__main">
              <Link className="list__title" to="/katalog/vorschlaege">Katalog-Vorschläge</Link>
              <div className="list__meta"><span>{nVorschlaege === 0 ? 'Keine offenen Vorschläge' : `${personenText(nVorschlaege, 'Vorschlag wartet', 'Vorschläge warten')} auf Prüfung`}</span></div>
            </div>
            {nVorschlaege > 0 && <Badge ton="warning">{nVorschlaege}</Badge>}
          </li>
        </ul>
      </Card>

      {freizeiten && aktuelle.length > 0 && (
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
      )}
    </>
  );
}
