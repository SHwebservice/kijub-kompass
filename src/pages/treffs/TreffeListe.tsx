import { Link } from 'react-router-dom';
import { useAuth } from '../../lib/auth-kontext';
import { useLaden } from '../../lib/laden';
import { listeTreffs, type TreffZeile } from '../../treffs/api';
import { wochentagKuerzel } from '../../treffs/logik';
import { rolleInTreff, type Rollen } from '../../lib/rollen';
import { Alert, Badge, EmptyState, PageHeader, Spinner } from '../../components/ui';

function TreffListe({ treffs, rollen, beschriftung }: { treffs: TreffZeile[]; rollen: Rollen; beschriftung?: string }) {
  return (
    <ul className="list" aria-label={beschriftung}>
      {treffs.map((t) => {
        const rolle = rolleInTreff(rollen, t.id);
        return (
          <li key={t.id} className="list__item">
            <div className="list__main">
              <Link className="list__title" to={`/treffs/${t.id}`}>{t.name}</Link>
              <div className="list__meta">
                {t.ort_name && <span>{t.ort_name}</span>}
                <span>{t.oeffnungszeiten.length ? t.oeffnungszeiten.map((o) => wochentagKuerzel(o.wochentag)).join(', ') : 'Keine Öffnungstage'}</span>
                {rolle === 'treffleitung' && <Badge ton="accent">Treffleitung</Badge>}
                {rolle === 'betreuerin' && <Badge ton="accent">Team</Badge>}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Liste der Treffs: die Koordination sieht alle, alle anderen ihre eigenen (die Datenbank liefert nur diese).
 * Ist die Treffkoordination selbst in Treffs eingeteilt, stehen diese oben unter „Meine Treffs“.
 */
export function TreffeListe() {
  const { rollen } = useAuth();
  const liste = useLaden(listeTreffs, 'treffs');
  if (!rollen) return null;
  const alle = liste.daten ?? [];
  const meineIds = new Set([...rollen.treffleitungen, ...rollen.betreuerTreffs]);
  const meine = alle.filter((t) => meineIds.has(t.id));
  const geteilt = rollen.treffkoordination && meine.length > 0 && meine.length < alle.length;

  return (
    <>
      <PageHeader titel="Treffs">
        {rollen.treffkoordination && <Link className="btn btn--primary" to="/treffs/neu">Neuer Treff</Link>}
      </PageHeader>
      {liste.fehler && <Alert ton="error">{liste.fehler}</Alert>}
      {liste.laedt && <Spinner />}
      {!liste.laedt && !liste.fehler && alle.length === 0 && (
        <EmptyState icon="🏠" titel={rollen.treffkoordination ? 'Noch kein Treff angelegt' : 'Du bist noch keinem Treff zugeordnet'}>
          {rollen.treffkoordination ? 'Lege den ersten Treff mit „Neuer Treff“ an.' : 'Die Koordination ordnet dich einem Treff zu.'}
        </EmptyState>
      )}
      {geteilt ? (
        <>
          <h2>Meine Treffs</h2>
          <TreffListe treffs={meine} rollen={rollen} beschriftung="Meine Treffs" />
          <h2>Weitere Treffs</h2>
          <TreffListe treffs={alle.filter((t) => !meineIds.has(t.id))} rollen={rollen} beschriftung="Weitere Treffs" />
        </>
      ) : <TreffListe treffs={alle} rollen={rollen} />}
    </>
  );
}
