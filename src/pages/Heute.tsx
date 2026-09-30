import { Link } from 'react-router-dom';
import { Alert, Badge, Card, EmptyState, PageHeader, Spinner } from '../components/ui';
import { useAuth } from '../lib/auth-kontext';
import { useLaden } from '../lib/laden';
import { rollenBezeichnungen } from '../lib/rollen';
import { listeFreizeiten } from '../freizeiten/api';
import { formatKurz, heuteIso, phase, tageBisStart, zeitraumText } from '../freizeiten/logik';
import { listeMeineDienste, listeTreffs } from '../treffs/api';
import { addTage, dienstZeit } from '../treffs/dienstplan';

const DIENSTE_TAGE = 14;

/** Startseite: rollenabhängiger Überblick (wächst mit den weiteren Bereichen). */
export function Heute() {
  const { ich, rollen } = useAuth();
  const freizeiten = useLaden(listeFreizeiten, 'heute-freizeiten');
  const hatTreffs = !!rollen && rollen.treffleitungen.length + rollen.betreuerTreffs.length > 0;
  const heute = heuteIso();
  const dienste = useLaden(async () => (hatTreffs && ich ? listeMeineDienste(ich.id, heute, addTage(heute, DIENSTE_TAGE)) : []), `heute-dienste-${hatTreffs}-${heute}`);
  const treffs = useLaden(async () => (hatTreffs ? listeTreffs() : []), `heute-treffs-${hatTreffs}`);
  if (!ich || !rollen) return null;

  const meineIds = new Set([...rollen.leitungFreizeiten, ...rollen.teamerFreizeiten]);
  const meine = (freizeiten.daten ?? [])
    .filter((f) => meineIds.has(f.id) && phase(f, heute) !== 'vergangen' && f.status === 'geplant')
    .slice(0, 6);
  const bezeichnungen = rollenBezeichnungen(rollen);

  return (
    <>
      <PageHeader titel={`Hallo ${ich.vorname}`} />
      <p className="row" style={{ gap: 'var(--space-2)' }}>
        {bezeichnungen.map((b) => <Badge key={b} ton="accent">{b}</Badge>)}
        <Badge>{ich.kategorie}</Badge>
      </p>

      {meineIds.size > 0 && (
        <Card>
          <h2>Meine Freizeiten</h2>
          {freizeiten.fehler && <Alert ton="error">{freizeiten.fehler}</Alert>}
          {freizeiten.laedt && <Spinner />}
          {!freizeiten.laedt && meine.length === 0 && <p>Keine laufenden oder kommenden Freizeiten.</p>}
          <ul className="list">
            {meine.map((f) => {
              const laeuft = phase(f, heute) === 'laufend';
              const bis = tageBisStart(f, heute);
              return (
                <li key={f.id} className="list__item">
                  <div className="list__main">
                    <Link className="list__title" to={`/freizeiten/${f.id}`}>{f.name}</Link>
                    <div className="list__meta"><span>{zeitraumText(f.start_datum, f.ende_datum)}</span></div>
                  </div>
                  {laeuft ? <Badge ton="success">Läuft</Badge> : <Badge ton={bis <= 7 ? 'warning' : 'neutral'}>in {bis} {bis === 1 ? 'Tag' : 'Tagen'}</Badge>}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {hatTreffs && (
        <Card>
          <h2>Meine Treffs</h2>
          {(dienste.fehler || treffs.fehler) && <Alert ton="error">{dienste.fehler ?? treffs.fehler}</Alert>}
          {(dienste.laedt || treffs.laedt) && <Spinner />}
          <ul className="list" aria-label="Meine Treffs">
            {(treffs.daten ?? []).map((t) => (
              <li key={t.id} className="list__item">
                <div className="list__main"><Link className="list__title" to={`/treffs/${t.id}`}>{t.name}</Link></div>
              </li>
            ))}
          </ul>
          <h3>Meine Dienste in den nächsten {DIENSTE_TAGE} Tagen</h3>
          {!dienste.laedt && (dienste.daten?.length ?? 0) === 0 && <p>Keine Dienste eingeteilt.</p>}
          <ul className="list" aria-label="Meine Dienste">
            {(dienste.daten ?? []).map((d) => (
              <li key={d.id} className="list__item">
                <div className="list__main">
                  <Link className="list__title" to={`/treffs/${d.treff_id}/dienstplan`}>{formatKurz(d.datum)}{dienstZeit(d) ? ` · ${dienstZeit(d)} Uhr` : ''}</Link>
                  <div className="list__meta"><span>{d.treff_name}</span>{d.ist_sonder && <Badge ton="warning">Sonderdienst: {d.bezeichnung}</Badge>}</div>
                </div>
                {d.datum === heute && <Badge ton="success">Heute</Badge>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {meineIds.size === 0 && !hatTreffs && (
        <EmptyState icon="🧭" titel="Willkommen im KiJuB-Kompass">
          {rollen.bewerbend ? 'Unter „Freizeiten" kannst du dich für kommende Freizeiten bewerben.' : 'Sobald du einer Freizeit oder einem Treff zugeordnet bist, erscheint sie hier.'}
        </EmptyState>
      )}
    </>
  );
}

export function Platzhalter({ titel, text }: { titel: string; text: string }) {
  return (
    <>
      <PageHeader titel={titel} />
      <EmptyState titel="Kommt in Kürze">{text}</EmptyState>
    </>
  );
}
