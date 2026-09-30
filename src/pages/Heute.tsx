import { Link } from 'react-router-dom';
import { Alert, Badge, Card, EmptyState, PageHeader, Spinner } from '../components/ui';
import { useAuth } from '../lib/auth-kontext';
import { useLaden } from '../lib/laden';
import { rollenBezeichnungen } from '../lib/rollen';
import { listeFreizeiten, offeneBewerbungen } from '../freizeiten/api';
import { formatKurz, heuteIso, phase, tageBisStart, zeitraumText } from '../freizeiten/logik';
import { listeVorschlaege } from '../katalog/api';
import { listeKnappeLebensmittel, listeNotizenFuerHeute, listeOffeneWuensche, zaehleEingereichteNachweise } from '../heute/api';
import { baueKacheln } from '../heute/kacheln';
import { aktuelleFreizeiten, knappeJeOrt, laeuftHeute, offeneFuerMich } from '../heute/logik';
import { listeMeineDienste, listeTreffs } from '../treffs/api';
import { listeProtokollStand } from '../tagesprotokoll/api';
import { protokollFaellig } from '../tagesprotokoll/logik';
import { addTage, dienstZeit } from '../treffs/dienstplan';
import { Bewerben } from './heute/Bewerben';
import { HeuteTag } from './heute/HeuteTag';
import { KoordSicht } from './heute/KoordSicht';
import { LeitungSicht, TreffleitungSicht } from './heute/LeitungSicht';
import { MitteilungsHinweis } from './heute/MitteilungsHinweis';
import { ProtokollKarte } from './heute/ProtokollKarte';
import { Schnellzugriff } from './heute/Schnellzugriff';
import { WartetAufDich } from './heute/WartetAufDich';

const DIENSTE_TAGE = 14;

/**
 * Startseite: oben der Schnellzugriff (Kacheln für alle Funktionen der eigenen Rollen, mit Zahlen für Offenes),
 * darunter „Jetzt wichtig“: was heute läuft, was auf dich wartet, Sicht der Leitung, Treffleitung und Koordination.
 */
export function Heute() {
  const { ich, rollen } = useAuth();
  const fk = rollen?.freizeitkoordination ?? false;     // Freizeitenkoordination: alle Freizeiten, Bewerbungen, Lebensmittel
  const tk = rollen?.treffkoordination ?? false;        // Treffkoordination: alle Treffs, Dienstplan, Nachweise, Protokolle
  const koord = fk || tk;
  const heute = heuteIso();
  const hatTreffs = !!rollen && rollen.treffleitungen.length + rollen.betreuerTreffs.length > 0;
  const istLeitung = !!rollen && (rollen.leitungFreizeiten.length > 0 || fk);
  const istTreffleitung = !!rollen && (rollen.treffleitungen.length > 0 || tk);

  const freizeiten = useLaden(listeFreizeiten, 'heute-freizeiten');
  const dienste = useLaden(async () => (hatTreffs && ich ? listeMeineDienste(ich.id, heute, addTage(heute, DIENSTE_TAGE)) : []), `heute-dienste-${hatTreffs}-${heute}`);
  const treffs = useLaden(async () => (hatTreffs || tk ? listeTreffs() : []), `heute-treffs-${hatTreffs}-${tk}`);

  // Die Freizeiten und Treffs, für die die Startseite Hinweise und Absprachen einsammelt
  const alle = freizeiten.daten ?? [];
  const meineIds = new Set([...(rollen?.leitungFreizeiten ?? []), ...(rollen?.teamerFreizeiten ?? [])]);
  const aktuelle = aktuelleFreizeiten(alle, heute);
  const aktuelleMeine = aktuelle.filter((f) => meineIds.has(f.id));
  const notizFreizeiten = fk ? aktuelle : aktuelleMeine;
  const meineTreffIds = [...(rollen?.treffleitungen ?? []), ...(rollen?.betreuerTreffs ?? [])];
  const notizTreffIds = tk ? (treffs.daten ?? []).map((t) => t.id) : meineTreffIds;
  const fIds = notizFreizeiten.map((f) => f.id);

  const notizen = useLaden(() => listeNotizenFuerHeute(fIds, notizTreffIds), `heute-notizen-${fIds.join(',')}-${notizTreffIds.join(',')}`);
  const bestand = useLaden(async () => (istLeitung ? listeKnappeLebensmittel() : []), `heute-bestand-${istLeitung}`);
  const wuensche = useLaden(async () => (istTreffleitung ? listeOffeneWuensche(tk ? null : (rollen?.treffleitungen ?? []), heute) : []), `heute-wuensche-${istTreffleitung}-${tk}-${heute}`);
  const bewerbungen = useLaden(async () => (fk ? offeneBewerbungen() : []), `heute-bewerbungen-${fk}`);
  const vorschlaege = useLaden(async () => (koord ? listeVorschlaege() : []), `heute-vorschlaege-${koord}`);
  const nachweise = useLaden(async () => (istTreffleitung ? zaehleEingereichteNachweise() : 0), `heute-nachweise-${istTreffleitung}`);
  const kachelTreffs = tk ? treffs.daten ?? [] : (treffs.daten ?? []).filter((t) => meineTreffIds.includes(t.id));
  const kachelTreffIds = kachelTreffs.map((t) => t.id);
  const stand = useLaden(() => listeProtokollStand(kachelTreffIds, heute), `heute-protokollstand-${kachelTreffIds.join(',')}-${heute}`);
  if (!ich || !rollen) return null;

  const meine = alle.filter((f) => meineIds.has(f.id) && phase(f, heute) !== 'vergangen' && f.status === 'geplant').sort((a, b) => a.start_datum.localeCompare(b.start_datum) || a.name.localeCompare(b.name, 'de'));
  const laufendHeute = (fk ? aktuelle : aktuelleMeine).filter((f) => laeuftHeute(f, heute));
  const leitungFreizeiten = fk ? aktuelle : aktuelleMeine.filter((f) => rollen.leitungFreizeiten.includes(f.id));
  const kommendeDienste = (dienste.daten ?? []).filter((d) => d.datum > heute);
  const diensteHeute = (dienste.daten ?? []).filter((d) => d.datum === heute).length;
  const nichtsZuTun = meineIds.size === 0 && !hatTreffs && !koord;     // gar keine Zuordnung und keine Koordination

  // Zahlen für die Kacheln
  const offen = offeneFuerMich(notizen.daten ?? [], ich.id, rollen, heute);
  const ortIds = new Set(leitungFreizeiten.map((f) => f.ort_id).filter((o): o is string => !!o));
  const knapp = knappeJeOrt(bestand.daten ?? [], ortIds).reduce((n, o) => n + o.artikel.length, 0);

  const jetzt = new Date();
  const uhrzeit = `${String(jetzt.getHours()).padStart(2, '0')}:${String(jetzt.getMinutes()).padStart(2, '0')}`;
  const protokolliert = new Set(stand.daten?.protokolliert ?? []);
  const ohneProtokoll = stand.daten ? kachelTreffs.filter((t) => protokollFaellig(t.oeffnungszeiten, heute, uhrzeit) && !protokolliert.has(t.id)) : [];

  const kacheln = baueKacheln({
    freizeitkoordination: fk, treffkoordination: tk, bewerbend: rollen.bewerbend, darfTreffmappe: rollen.darfTreffmappe,
    leitung: rollen.leitungFreizeiten.length > 0, treffleitung: rollen.treffleitungen.length > 0,
    freizeitTeam: meineIds.size > 0, treffTeam: hatTreffs, kategorie: ich.kategorie,
    freizeiten: (fk ? aktuelle : meine).map((f) => ({ id: f.id, name: f.name })),
    treffs: kachelTreffs.map((t) => ({ id: t.id, name: t.name })),
    zaehler: {
      hinweise: offen.filter((n) => n.freizeit_id !== null).length,          // Hinweise und Absprachen der Freizeiten, die noch bestätigt werden sollen
      treffAbsprachen: offen.filter((n) => n.treff_id !== null).length,
      knapp, wuensche: wuensche.daten?.length ?? 0, bewerbungen: bewerbungen.daten?.length ?? 0,
      vorschlaege: (vorschlaege.daten ?? []).filter((v) => v.status === 'offen').length, nachweise: nachweise.daten ?? 0, diensteHeute,
      protokollFehlt: ohneProtokoll.length, offeneNotizen: Object.values(stand.daten?.offeneNotizen ?? {}).reduce((n, x) => n + x, 0),
    },
  });
  const bezeichnungen = rollenBezeichnungen(rollen);

  return (
    <>
      <PageHeader titel={`Hallo ${ich.vorname}`} />
      <p className="row" style={{ gap: 'var(--space-2)' }}>
        {bezeichnungen.map((b) => <Badge key={b} ton="accent">{b}</Badge>)}
        <Badge>{ich.kategorie}</Badge>
      </p>

      <div className="stack">
        <MitteilungsHinweis />
        <Schnellzugriff gruppen={kacheln} />
        {freizeiten.fehler && <Alert ton="error">{freizeiten.fehler}</Alert>}

        <HeuteTag heute={heute} freizeiten={laufendHeute} dienste={dienste.daten ?? []} />
        <WartetAufDich heute={heute} notizen={notizen} />
        <ProtokollKarte treffs={ohneProtokoll} />

        {istLeitung && <LeitungSicht heute={heute} freizeiten={leitungFreizeiten} bestand={bestand} notizen={notizen} />}
        {istTreffleitung && <TreffleitungSicht wuensche={wuensche} />}
        {koord && <KoordSicht freizeiten={fk} aktuelle={aktuelle} bewerbungen={bewerbungen} vorschlaege={vorschlaege} />}

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
              {(treffs.daten ?? []).filter((t) => meineTreffIds.includes(t.id)).map((t) => (
                <li key={t.id} className="list__item">
                  <div className="list__main"><Link className="list__title" to={`/treffs/${t.id}`}>{t.name}</Link></div>
                </li>
              ))}
            </ul>
            <h3>Meine nächsten Dienste ({DIENSTE_TAGE} Tage)</h3>
            {!dienste.laedt && kommendeDienste.length === 0 && <p>{diensteHeute > 0 ? 'Nach heute sind keine Dienste eingeteilt.' : 'Keine Dienste eingeteilt.'}</p>}
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

        {rollen.bewerbend && !fk && <Bewerben heute={heute} freizeiten={alle} meineIds={meineIds} />}

        {nichtsZuTun && !freizeiten.laedt && (
          <EmptyState icon="🧭" titel="Willkommen im KiJuB-Kompass">
            {rollen.bewerbend ? 'Unter „Freizeiten“ kannst du dich für kommende Freizeiten bewerben.' : 'Sobald du einer Freizeit oder einem Treff zugeordnet bist, erscheint sie hier.'}
          </EmptyState>
        )}
      </div>
    </>
  );
}
