import { Link } from 'react-router-dom';
import { Alert, Badge, Card, EmptyState, PageHeader, Spinner } from '../components/ui';
import { useAuth } from '../lib/auth-kontext';
import { useLaden } from '../lib/laden';
import { rollenBezeichnungen } from '../lib/rollen';
import { listeFreizeiten } from '../freizeiten/api';
import { formatKurz, heuteIso, phase, tageBisStart, zeitraumText } from '../freizeiten/logik';
import { aktuelleFreizeiten, laeuftHeute } from '../heute/logik';
import { listeMeineDienste, listeTreffs } from '../treffs/api';
import { addTage, dienstZeit } from '../treffs/dienstplan';
import { Bewerben } from './heute/Bewerben';
import { HeuteTag } from './heute/HeuteTag';
import { KoordSicht } from './heute/KoordSicht';
import { LeitungSicht, TreffleitungSicht } from './heute/LeitungSicht';
import { MitteilungsHinweis } from './heute/MitteilungsHinweis';
import { WartetAufDich } from './heute/WartetAufDich';

const DIENSTE_TAGE = 14;

/**
 * Startseite: rollenabhängiger Überblick.
 * Alle: was heute läuft und was auf dich wartet. Leitung/Treffleitung: knappe Lebensmittel, offene Wünsche.
 * Koordination: offene Bewerbungen und Vorschläge, Saison-Überblick. TeamerInnen: Freizeiten zum Bewerben.
 */
export function Heute() {
  const { ich, rollen } = useAuth();
  const freizeiten = useLaden(listeFreizeiten, 'heute-freizeiten');
  const hatTreffs = !!rollen && rollen.treffleitungen.length + rollen.betreuerTreffs.length > 0;
  const heute = heuteIso();
  const dienste = useLaden(async () => (hatTreffs && ich ? listeMeineDienste(ich.id, heute, addTage(heute, DIENSTE_TAGE)) : []), `heute-dienste-${hatTreffs}-${heute}`);
  const treffs = useLaden(async () => (hatTreffs || rollen?.koordination ? listeTreffs() : []), `heute-treffs-${hatTreffs}-${rollen?.koordination ?? false}`);
  if (!ich || !rollen) return null;

  const koord = rollen.koordination;
  const alle = freizeiten.daten ?? [];
  const meineIds = new Set([...rollen.leitungFreizeiten, ...rollen.teamerFreizeiten]);
  const meine = alle.filter((f) => meineIds.has(f.id) && phase(f, heute) !== 'vergangen' && f.status === 'geplant');
  const aktuelle = aktuelleFreizeiten(alle, heute);
  const aktuelleMeine = aktuelle.filter((f) => meineIds.has(f.id));
  // Wofür die Startseite Hinweise und Absprachen einsammelt: die eigenen aktuellen Freizeiten bzw. – Koordination – alle aktuellen
  const notizFreizeiten = koord ? aktuelle : aktuelleMeine;
  const laufendHeute = (koord ? aktuelle : aktuelleMeine).filter((f) => laeuftHeute(f, heute));
  const leitungFreizeiten = (koord ? aktuelle : aktuelleMeine.filter((f) => rollen.leitungFreizeiten.includes(f.id)));
  const meineTreffIds = [...rollen.treffleitungen, ...rollen.betreuerTreffs];
  const notizTreffIds = koord ? (treffs.daten ?? []).map((t) => t.id) : meineTreffIds;
  const kommendeDienste = (dienste.daten ?? []).filter((d) => d.datum > heute);
  const istLeitung = rollen.leitungFreizeiten.length > 0 || koord;
  const bezeichnungen = rollenBezeichnungen(rollen);
  const nichtsZuTun = meineIds.size === 0 && !hatTreffs && !koord;

  return (
    <>
      <PageHeader titel={`Hallo ${ich.vorname}`} />
      <p className="row" style={{ gap: 'var(--space-2)' }}>
        {bezeichnungen.map((b) => <Badge key={b} ton="accent">{b}</Badge>)}
        <Badge>{ich.kategorie}</Badge>
      </p>

      <div className="stack">
        <MitteilungsHinweis />
        {freizeiten.fehler && <Alert ton="error">{freizeiten.fehler}</Alert>}

        <HeuteTag heute={heute} freizeiten={laufendHeute} dienste={dienste.daten ?? []} />
        <WartetAufDich heute={heute} freizeitIds={notizFreizeiten.map((f) => f.id)} treffIds={notizTreffIds} />

        {istLeitung && <LeitungSicht heute={heute} freizeiten={leitungFreizeiten} />}
        {(rollen.treffleitungen.length > 0 || koord) && <TreffleitungSicht heute={heute} treffIds={koord ? null : rollen.treffleitungen} />}
        {koord && <KoordSicht aktuelle={aktuelle} />}

        {meineIds.size > 0 && (
          <Card>
            <h2>Meine Freizeiten</h2>
            {freizeiten.laedt && <Spinner />}
            {!freizeiten.laedt && meine.length === 0 && <p>Keine laufenden oder kommenden Freizeiten.</p>}
            <ul className="list" aria-label="Meine Freizeiten">
              {meine.slice(0, 6).map((f) => {
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
              {(treffs.daten ?? []).filter((t) => koord ? meineTreffIds.includes(t.id) : true).map((t) => (
                <li key={t.id} className="list__item">
                  <div className="list__main"><Link className="list__title" to={`/treffs/${t.id}`}>{t.name}</Link></div>
                </li>
              ))}
            </ul>
            <h3>Meine nächsten Dienste ({DIENSTE_TAGE} Tage)</h3>
            {!dienste.laedt && kommendeDienste.length === 0 && <p>{(dienste.daten ?? []).some((d) => d.datum === heute) ? 'Nach heute sind keine Dienste eingeteilt.' : 'Keine Dienste eingeteilt.'}</p>}
            <ul className="list" aria-label="Meine Dienste">
              {kommendeDienste.map((d) => (
                <li key={d.id} className="list__item">
                  <div className="list__main">
                    <Link className="list__title" to={`/treffs/${d.treff_id}/dienstplan`}>{formatKurz(d.datum)}{dienstZeit(d) ? ` · ${dienstZeit(d)} Uhr` : ''}</Link>
                    <div className="list__meta"><span>{d.treff_name}</span>{d.ist_sonder && <Badge ton="warning">Sonderdienst: {d.bezeichnung}</Badge>}</div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {rollen.bewerbend && !koord && <Bewerben heute={heute} freizeiten={alle} meineIds={meineIds} />}

        {nichtsZuTun && !freizeiten.laedt && (
          <EmptyState icon="🧭" titel="Willkommen im KiJuB-Kompass">
            {rollen.bewerbend ? 'Unter „Freizeiten“ kannst du dich für kommende Freizeiten bewerben.' : 'Sobald du einer Freizeit oder einem Treff zugeordnet bist, erscheint sie hier.'}
          </EmptyState>
        )}
      </div>
    </>
  );
}
