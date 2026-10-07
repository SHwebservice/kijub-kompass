import { Link } from 'react-router-dom';
import { useLaden } from '../../lib/laden';
import { holeVorlaufTage, meineBewerbungen, type FreizeitZeile } from '../../freizeiten/api';
import { darfBeworbenWerden, ferienText, zeitraumText } from '../../freizeiten/logik';
import { Alert, Badge, Card } from '../../components/ui';
import { fzStreifen } from '../../components/FreizeitFarbe';

const MAX = 3;

/** Für TeamerInnen: die nächsten Freizeiten, für die man sich noch bewerben kann (nicht die eigenen, nicht schon beworbene). */
export function Bewerben({ heute, freizeiten, meineIds }: { heute: string; freizeiten: FreizeitZeile[]; meineIds: ReadonlySet<string> }) {
  const bewerbungen = useLaden(meineBewerbungen, 'heute-meine-bewerbungen');
  const vorlauf = useLaden(holeVorlaufTage, 'heute-vorlauf');
  const schonBeworben = new Set((bewerbungen.daten ?? []).map((b) => b.freizeit_id));
  const frei = freizeiten
    .filter((f) => !meineIds.has(f.id) && !schonBeworben.has(f.id) && darfBeworbenWerden(f, heute, vorlauf.daten ?? 7))
    .sort((a, b) => a.start_datum.localeCompare(b.start_datum) || a.name.localeCompare(b.name, 'de'));
  const offeneBewerbungen = (bewerbungen.daten ?? []).filter((b) => b.status === 'offen').length;
  const fehler = bewerbungen.fehler ?? vorlauf.fehler;

  if (!fehler && frei.length === 0 && offeneBewerbungen === 0) return null;

  return (
    <Card>
      <h2>Freizeiten zum Bewerben</h2>
      {fehler && <Alert ton="error">{fehler}</Alert>}
      {offeneBewerbungen > 0 && <p className="field__hint">{offeneBewerbungen === 1 ? 'Eine Bewerbung von dir wartet' : `${offeneBewerbungen} Bewerbungen von dir warten`} auf eine Antwort.</p>}
      <ul className="list" aria-label="Freizeiten zum Bewerben">
        {frei.slice(0, MAX).map((f) => (
          <li key={f.id} className="list__item fz-streifen" style={fzStreifen(f)}>
            <div className="list__main">
              <Link className="list__title" to={`/freizeiten/${f.id}`}>{f.name}</Link>
              <div className="list__meta"><span>{zeitraumText(f.start_datum, f.ende_datum)}</span>{f.ferienwoche && f.ferienzeitraum && <span>{ferienText(f)}</span>}{f.ort_name && <span>{f.ort_name}</span>}</div>
            </div>
            <Badge ton="accent">Offen</Badge>
          </li>
        ))}
      </ul>
      {frei.length > MAX && <p><Link to="/freizeiten">Alle {frei.length} kommenden Freizeiten ansehen</Link></p>}
      {frei.length > 0 && frei.length <= MAX && <p><Link to="/freizeiten">Zu den Freizeiten und Bewerbungen</Link></p>}
    </Card>
  );
}
