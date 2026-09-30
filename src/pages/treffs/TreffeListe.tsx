import { Link } from 'react-router-dom';
import { useAuth } from '../../lib/auth-kontext';
import { useLaden } from '../../lib/laden';
import { listeTreffs } from '../../treffs/api';
import { wochentagKuerzel } from '../../treffs/logik';
import { rolleInTreff } from '../../lib/rollen';
import { Alert, Badge, EmptyState, PageHeader, Spinner } from '../../components/ui';

/** Liste der Treffs: die Koordination sieht alle, alle anderen ihre eigenen (die Datenbank liefert nur diese). */
export function TreffeListe() {
  const { rollen } = useAuth();
  const liste = useLaden(listeTreffs, 'treffs');
  if (!rollen) return null;

  return (
    <>
      <PageHeader titel="Treffs">
        {rollen.treffkoordination && <Link className="btn btn--primary" to="/treffs/neu">Neuer Treff</Link>}
      </PageHeader>
      {liste.fehler && <Alert ton="error">{liste.fehler}</Alert>}
      {liste.laedt && <Spinner />}
      {!liste.laedt && !liste.fehler && (liste.daten?.length ?? 0) === 0 && (
        <EmptyState icon="🏠" titel={rollen.treffkoordination ? 'Noch kein Treff angelegt' : 'Du bist noch keinem Treff zugeordnet'}>
          {rollen.treffkoordination ? 'Lege den ersten Treff mit „Neuer Treff“ an.' : 'Die Koordination ordnet dich einem Treff zu.'}
        </EmptyState>
      )}
      <ul className="list">
        {(liste.daten ?? []).map((t) => {
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
    </>
  );
}
