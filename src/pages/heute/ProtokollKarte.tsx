import { Link } from 'react-router-dom';
import { Badge, Card } from '../../components/ui';

/** „Tagesprotokoll fehlt“: Treffs, die heute geöffnet haben und für die noch niemand ein Protokoll geschrieben hat. */
export function ProtokollKarte({ treffs }: { treffs: { id: string; name: string }[] }) {
  if (treffs.length === 0) return null;
  return (
    <Card>
      <h2>Tagesprotokoll fehlt</h2>
      <ul className="list" aria-label="Treffs ohne Protokoll von heute">
        {treffs.map((t) => (
          <li key={t.id} className="list__item">
            <div className="list__main">
              <Link className="list__title" to={`/treffs/${t.id}/protokoll`}>{t.name}</Link>
              <div className="list__meta"><span>Heute ist geöffnet – bitte das Protokoll schreiben.</span></div>
            </div>
            <Badge ton="warning">offen</Badge>
          </li>
        ))}
      </ul>
    </Card>
  );
}
