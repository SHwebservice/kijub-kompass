import { Link } from 'react-router-dom';
import type { FreizeitZeile } from '../../freizeiten/api';
import { formatMonatKurz, gruppiereNachFerien, phase, tageBisStart, zeitraumText } from '../../freizeiten/logik';
import { ohneLeitung, personenText, type TeamZeile } from '../../heute/logik';
import { Badge, Card } from '../../components/ui';

interface Props { freizeiten: boolean; aktuelle: FreizeitZeile[]; team: TeamZeile[]; heute: string }

/** Koordination: die aktuelle Saison auf einen Blick – oben die Zahlen, darunter je Ferienzeit kompakte Karten mit Datum, Status und Teamstand. */
export function KoordSicht({ freizeiten, aktuelle, team, heute }: Props) {
  if (!freizeiten || aktuelle.length === 0) return null;
  const ohne = new Set(ohneLeitung(aktuelle, team).map((f) => f.id));
  const laufen = aktuelle.filter((f) => phase(f, heute) === 'laufend').length;
  const imTeam = (id: string, rolle: TeamZeile['rolle']) => team.filter((t) => t.freizeit_id === id && t.rolle === rolle).length;

  return (
    <Card>
      <h2>Saison-Überblick</h2>
      <p className="field__hint">Laufende Freizeiten und solche, die in den nächsten zwei Wochen beginnen.</p>
      <ul className="saison__zahlen" aria-label="Zusammenfassung">
        <li className="saison__zahl">{personenText(aktuelle.length, 'Freizeit', 'Freizeiten')}</li>
        <li className="saison__zahl">{laufen} {laufen === 1 ? 'läuft' : 'laufen'}</li>
        {ohne.size > 0 && <li className="saison__zahl saison__zahl--warnung">{ohne.size} ohne Leitung</li>}
      </ul>
      {gruppiereNachFerien(aktuelle).map((g) => (
        <section key={g.schluessel} aria-label={g.label}>
          <h3>{g.label} <span className="saison__anzahl">· {g.eintraege.length}</span></h3>
          <ul className="saison">
            {g.eintraege.map((f) => {
              const laeuft = phase(f, heute) === 'laufend';
              const bis = tageBisStart(f, heute);
              const keine = ohne.has(f.id);
              const leitung = imTeam(f.id, 'leitung');
              const teamer = imTeam(f.id, 'teamer');
              return (
                <li key={f.id} className={`saison__karte${keine ? ' saison__karte--warnung' : ''}`}>
                  <span className="saison__datum" aria-hidden="true"><span className="saison__tag">{Number(f.start_datum.slice(8, 10))}</span><span className="saison__monat">{formatMonatKurz(f.start_datum)}</span></span>
                  <div className="saison__inhalt">
                    <Link className="saison__titel" to={`/freizeiten/${f.id}`}>{f.name}</Link>
                    <div className="saison__meta">{zeitraumText(f.start_datum, f.ende_datum)}{f.ort_name ? ` · ${f.ort_name}` : ''}</div>
                    <div className="saison__chips">
                      {laeuft ? <Badge ton="success">Läuft</Badge> : <Badge ton={bis <= 7 ? 'warning' : 'neutral'}>in {bis} {bis === 1 ? 'Tag' : 'Tagen'}</Badge>}
                      {keine ? <Badge ton="danger">Keine Leitung</Badge> : <Badge>Leitung {leitung} · Team {teamer}</Badge>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </Card>
  );
}
