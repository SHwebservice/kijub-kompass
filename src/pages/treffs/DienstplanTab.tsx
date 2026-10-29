import { useCallback, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../lib/auth-kontext';
import { useLaden } from '../../lib/laden';
import { useLive } from '../../lib/live';
import { fehlerText } from '../../lib/fehler';
import { sendePush } from '../../mitteilungen/senden';
import { formatDatum, heuteIso } from '../../freizeiten/logik';
import {
  holeTreffTeam, legeDienstplanKommentarAn, listeAbwesenheiten, listeDienste, listeDienstplanKommentare, listeFeiertage, listeSchliesszeiten,
  listeTreffAbsprachen, listeVeroeffentlicht, listeVerhinderungen, loescheDienstplanKommentar, type TreffDetailDaten,
} from '../../treffs/api';
import {
  addTage, feiertagAm, geschlosseneZeiten, monatErster, monateDer, monatText, monatVersatz, montagVon, mitVerhinderungen, offeneWuensche, tageDerAnsicht, tageskarten,
  wochenText, type Dienst,
} from '../../treffs/dienstplan';
import { LEERER_ENTWURF, mitEntwurf, type Entwurf } from '../../treffs/entwurf';
import { darfTreffVerwalten } from '../../treffs/logik';
import type { RolleInTreff } from '../../lib/rollen';
import { Alert, Button, Card, Spinner } from '../../components/ui';
import { SonderdienstSheet } from './DienstSheets';
import { Einsatzmatrix } from './Einsatzmatrix';
import { MatrixLeiste } from './MatrixLeiste';
import { MeinPlan } from './MeinPlan';
import { PlanStatus } from './PlanStatus';
import { TagSheet } from './TagSheet';
import { SchliesszeitenSheet } from './SchliesszeitenSheet';
import { MonatsplanDruck } from './MonatsplanDruck';
import { AbwesenheitBearbeiten, AbwesenheitSheet, type AbwesenheitErgebnis } from './AbwesenheitSheet';
import { AbwesenheitenListe } from './AbwesenheitenListe';
import { kurzTag, type Block } from '../../treffs/abwesenheit';
import { Sheet } from '../../components/Sheet';
import { useLetzterBesuchDienste } from '../dienste/gesehen';

type Ansicht = 'woche' | 'monat';
type Ziel = { art: 'tag'; datum: string } | { art: 'sonder'; dienst: Dienst | null; datum: string } | { art: 'schliess'; datum?: string; feiertag?: boolean }
  | { art: 'abwesenheit'; person?: string; datum?: string; block?: Block | null; bearbeiten?: boolean } | { art: 'abwesenheiten' };

const datumZeit = (iso: string) => `${formatDatum(iso.slice(0, 10))} ${iso.slice(11, 16)}`;
const istDatum = (d: string | null): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);

/**
 * Reiter „Dienstplan“: Woche oder Monat (Adresse ?ansicht=monat, ein bestimmter Tag mit ?datum=JJJJ-MM-TT). Für alle gleich aufgebaut:
 * Stand des Monatsplans (in Planung / veröffentlicht), „Deine Dienste“, die Einsatz-Matrix „Wer arbeitet wann“ als einzige Planungsfläche
 * und – in der Woche – die Kommentare. Ein Klick auf einen Tag öffnet das Tagesfenster; dort wird zugeteilt, gewünscht und entschieden.
 */
export function DienstplanTab({ treff: t, rolle }: { treff: TreffDetailDaten; rolle: RolleInTreff }) {
  const { ich } = useAuth();
  const [params, setParams] = useSearchParams();
  const ansicht: Ansicht = params.get('ansicht') === 'monat' ? 'monat' : 'woche';
  const [fokus, setFokus] = useState(() => (istDatum(params.get('datum')) ? params.get('datum')! : heuteIso()));
  const heute = heuteIso();
  const tage = tageDerAnsicht(ansicht, fokus);
  const von = tage[0]!;
  const bis = tage[tage.length - 1]!;
  const montag = montagVon(fokus);
  const monat = monatErster(fokus);
  const schluessel = `${t.id}-${von}-${bis}`;

  const team = useLaden(() => holeTreffTeam(t.id), `treffteam-${t.id}`);
  const dienste = useLaden(() => listeDienste(t.id, von, bis), `dienste-${schluessel}`);
  const feiertage = useLaden(() => listeFeiertage(t.id, von, bis), `feiertage-${schluessel}`);
  const abwesenheiten = useLaden(() => listeAbwesenheiten(von, bis), `abwesenheiten-${schluessel}`);
  const schliesszeiten = useLaden(() => listeSchliesszeiten(t.id, von, bis), `schliesszeiten-${schluessel}`);
  const verhinderungen = useLaden(async () => (await listeVerhinderungen(t.id, von, bis)) ?? [], `verhinderungen-${schluessel}`);
  const veroeffentlicht = useLaden(async () => ((await listeVeroeffentlicht([t.id], von, bis)) ?? []).map((m) => m.monat), `veroeffentlicht-${schluessel}`);
  const absprachen = useLaden(() => listeTreffAbsprachen(t.id), `treffabsprachen-${t.id}`);
  const kommentare = useLaden(async () => (ansicht === 'woche' ? listeDienstplanKommentare(t.id, montag) : []), `dp-kommentare-${t.id}-${ansicht}-${montag}`);
  const letzterBesuch = useLetzterBesuchDienste(ich?.id);
  useLive(['dienste', 'dienst_zuteilungen', 'dienst_wuensche', 'feiertage', 'treff_schliesszeiten', 'dienstplan_kommentare', 'dienstplan_monate', 'notizen', 'treff_team'], () => {
    dienste.neuLaden(); feiertage.neuLaden(); schliesszeiten.neuLaden(); kommentare.neuLaden(); absprachen.neuLaden(); team.neuLaden(); veroeffentlicht.neuLaden();
  });

  // ?zeige=abwesenheiten (z. B. von der Startseite) öffnet gleich die Übersicht der Abwesenheiten
  const [ziel, setZiel] = useState<Ziel | null>(() => (params.get('zeige') === 'abwesenheiten' && darfTreffVerwalten(rolle) ? { art: 'abwesenheiten' } : null));
  const schliessen = useCallback(() => setZiel(null), [setZiel]);
  const [bearbeiten, setBearbeiten] = useState(false);
  const [entwurf, setEntwurf] = useState<Entwurf>(LEERER_ENTWURF);
  const [mindest, setMindest] = useState(t.mindestbesetzung ?? 1);
  const [nurIch, setNurIch] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [kommentarText, setKommentarText] = useState('');
  /** Nach dem Eintragen einer Abwesenheit: Tage, an denen die Person herausgenommen wurde – dort wird Ersatz gesucht. */
  const [ersatz, setErsatz] = useState<{ person: string; tage: string[] } | null>(null);
  if (!ich) return null;

  const verwaltung = darfTreffVerwalten(rolle);
  const mitglieder = team.daten ?? [];
  const namen = Object.fromEntries(mitglieder.map((m) => [m.person_id, `${m.vorname} ${m.nachname}`]));
  const name = (id: string) => namen[id] ?? 'Jemand';
  const imTeam = mitglieder.some((m) => m.person_id === ich.id);
  const zu = geschlosseneZeiten(schliesszeiten.daten ?? [], feiertage.daten ?? [], t.id);
  const karten = tageskarten(tage, t.oeffnungszeiten, dienste.daten ?? [], zu);
  const abw = mitVerhinderungen(abwesenheiten.daten ?? [], verhinderungen.daten ?? []);
  const fest = veroeffentlicht.daten ?? [];
  const editierend = verwaltung && bearbeiten && ansicht === 'monat';
  const ladefehler = team.fehler ?? dienste.fehler ?? feiertage.fehler ?? abwesenheiten.fehler ?? absprachen.fehler ?? kommentare.fehler ?? schliesszeiten.fehler
    ?? verhinderungen.fehler ?? veroeffentlicht.fehler;
  const laedt = team.laedt || dienste.laedt;
  const zeitraumText = ansicht === 'woche' ? 'in dieser Woche' : `im ${monatText(monat)}`;

  const neuLaden = () => { dienste.neuLaden(); };
  const abwesenheitGespeichert = (e: AbwesenheitErgebnis) => {
    abwesenheiten.neuLaden(); dienste.neuLaden();
    setErsatz(e.herausgenommen.length ? { person: e.person, tage: e.herausgenommen } : null);
  };
  /** Tagesfenster öffnen – liegt der Tag nicht im angezeigten Zeitraum, wird dorthin geblättert. */
  const tagZeigen = (datum: string) => {
    if (!tage.includes(datum)) { if (!entwurfVerwerfen()) return; setFokus(datum); }
    setZiel({ art: 'tag', datum });
  };

  // Ein Entwurf gilt nur für seinen Monat: Beim Blättern oder Umschalten geht er (nach Rückfrage) verloren.
  const entwurfVerwerfen = () => {
    if (entwurf.size > 0 && !window.confirm('Die Änderungen in der Tabelle sind noch nicht gespeichert und gehen verloren. Trotzdem wechseln?')) return false;
    setEntwurf(LEERER_ENTWURF);
    return true;
  };
  const blaettern = (n: number) => {
    if (!entwurfVerwerfen()) return;
    setFokus(ansicht === 'woche' ? addTage(montag, 7 * n) : monatVersatz(monat, n));
  };
  const zuHeute = () => { if (entwurfVerwerfen()) setFokus(heute); };

  function wechsle(neu: Ansicht) {
    if (neu === ansicht || !entwurfVerwerfen()) return;
    setBearbeiten(false);
    // Von der Monats- zur Wochenansicht: im laufenden Monat zur heutigen Woche, sonst zur Woche des Monatsanfangs
    if (neu === 'woche') setFokus(fokus.slice(0, 7) === heute.slice(0, 7) ? heute : monat);
    setParams(neu === 'monat' ? { ansicht: 'monat' } : {}, { replace: true });
  }

  // Anklickbare Zellen außerhalb des Bearbeitens: die eigene Spalte (BetreuerInnen) und offene Wünsche (Treffleitung)
  const zelleKlickbar = (datum: string, person: string) => {
    const k = karten.find((x) => x.datum === datum);
    if (!k) return false;
    // Treffleitung: offene Wünsche und Abwesende (im Tagesfenster lässt sich die Abwesenheit ändern)
    if (verwaltung) return (k.regulaer?.wuensche.some((w) => w.person_id === person && w.status === 'offen') ?? false)
      || abw.some((a) => a.datum === datum && a.person_id === person && a.typ !== 'verhindert');
    return person === ich.id && (!!k.oeffnung || k.sonder.some((s) => s.personen.includes(ich.id)));
  };

  async function kommentarSenden(e: FormEvent) {
    e.preventDefault();
    if (!kommentarText.trim() || !ich) return;
    setFehler(null);
    try {
      const id = await legeDienstplanKommentarAn(t.id, montag, ich.id, kommentarText);
      setKommentarText(''); kommentare.neuLaden();
      if (id) sendePush('dienstplan_kommentar', id);
    } catch (err) { setFehler(fehlerText(err)); }
  }

  async function kommentarLoeschen(id: string) {
    setFehler(null);
    try { await loescheDienstplanKommentar(id); kommentare.neuLaden(); } catch (err) { setFehler(fehlerText(err)); }
  }

  const tagKarte = ziel?.art === 'tag' ? karten.find((k) => k.datum === ziel.datum) : undefined;
  const aktuell = ansicht === 'woche' ? montag === montagVon(heute) : monat === monatErster(heute);

  return (
    <div className="stack">
      <div className="segment" role="group" aria-label="Ansicht des Dienstplans">
        <button type="button" className="segment__knopf" aria-pressed={ansicht === 'woche'} onClick={() => wechsle('woche')}>Woche</button>
        <button type="button" className="segment__knopf" aria-pressed={ansicht === 'monat'} onClick={() => wechsle('monat')}>Monat</button>
      </div>

      {(ladefehler || fehler) && <Alert ton="error">{ladefehler ?? fehler}</Alert>}

      <div className="row" style={{ justifyContent: 'space-between' }}>
        <Button aria-label={ansicht === 'woche' ? 'Vorherige Woche' : 'Vorheriger Monat'} onClick={() => blaettern(-1)}>←</Button>
        <div style={{ textAlign: 'center' }}>
          <strong>{ansicht === 'woche' ? wochenText(montag) : monatText(monat)}</strong>
          {!aktuell && <div><Button klein variante="ghost" onClick={zuHeute}>{ansicht === 'woche' ? 'Zur aktuellen Woche' : 'Zum aktuellen Monat'}</Button></div>}
        </div>
        <Button aria-label={ansicht === 'woche' ? 'Nächste Woche' : 'Nächster Monat'} onClick={() => blaettern(1)}>→</Button>
      </div>

      {!veroeffentlicht.laedt && (
        <PlanStatus treffId={t.id} monate={monateDer(karten.map((k) => k.datum))} veroeffentlicht={fest} verwaltung={verwaltung} heute={heute} geaendert={() => veroeffentlicht.neuLaden()} />
      )}

      {ansicht === 'monat' && !laedt && !editierend && karten.length > 0 && (
        <MonatsplanDruck treff={t} monat={monat} mitglieder={mitglieder} dienste={dienste.daten ?? []} abwesenheiten={abwesenheiten.daten ?? []}
          feiertage={feiertage.daten ?? []} schliesszeiten={schliesszeiten.daten ?? []} vorlaeufig={monat >= monatErster(heute) && !fest.includes(monat)} />
      )}

      {verwaltung && !laedt && !editierend && offeneWuensche(karten).length > 0 && (
        <Alert ton="info">
          {offeneWuensche(karten).length === 1 ? 'Ein offener Dienstwunsch' : `${offeneWuensche(karten).length} offene Dienstwünsche`} {zeitraumText} – in der Tabelle mit „?“ markiert. Antippen zum Beantworten.
        </Alert>
      )}

      {verwaltung && ersatz && (
        <Alert ton="warning">
          <strong>Ersatz gesucht</strong> für {name(ersatz.person)}:{' '}
          {ersatz.tage.map((d) => <Button key={d} klein onClick={() => tagZeigen(d)}>{kurzTag(d)}</Button>)}
          {' '}<Button klein variante="ghost" onClick={() => setErsatz(null)}>Ausblenden</Button>
        </Alert>
      )}

      {laedt && <Spinner />}
      {!laedt && karten.length === 0 && (
        <Card><p>{t.oeffnungszeiten.length === 0 ? 'Der Treff hat noch keine Öffnungstage.' : `${ansicht === 'woche' ? 'In dieser Woche' : 'In diesem Monat'} gibt es keinen Dienst.`}</p></Card>
      )}

      {!laedt && imTeam && !verwaltung && karten.length > 0 && (
        <MeinPlan karten={karten} ichId={ich.id} heute={heute} zeitraum={zeitraumText} letzterBesuch={letzterBesuch} veroeffentlicht={fest}
          abwesenheiten={abw} nurIch={nurIch} setNurIch={setNurIch} tagOeffnen={(datum) => setZiel({ art: 'tag', datum })} />
      )}

      {!laedt && (
        <Einsatzmatrix karten={editierend ? mitEntwurf(karten, entwurf) : karten} mitglieder={mitglieder} abwesenheiten={abw} feiertage={feiertage.daten ?? []}
          treffId={t.id} ichId={ich.id} heute={heute} mitWuenschen={verwaltung} zeitraum={ansicht === 'woche' ? 'Woche' : 'Monat'}
          mindestbesetzung={mindest} letzterBesuch={letzterBesuch} stunden={verwaltung ? { mitHoechst: ansicht === 'monat' } : undefined}
          nurIch={nurIch && !verwaltung}
          bearbeiten={editierend ? { gespeichert: karten, entwurf, aendern: (f) => setEntwurf(f) } : undefined}
          tagOeffnen={editierend ? undefined : (datum) => setZiel({ art: 'tag', datum })} zelleKlickbar={zelleKlickbar}
          personOeffnen={verwaltung && !editierend ? (person) => setZiel({ art: 'abwesenheit', person, datum: tage.includes(heute) ? heute : von }) : undefined}
          kopf={verwaltung ? (
            <MatrixLeiste treffId={t.id} ansicht={ansicht} monat={monat} karten={karten} team={mitglieder} oeffnungszeiten={t.oeffnungszeiten}
              abwesenheiten={abw} feiertage={feiertage.daten ?? []} veroeffentlicht={fest} mindestbesetzung={mindest} mindestbesetzungGeaendert={setMindest}
              bearbeiten={editierend} setBearbeiten={setBearbeiten} entwurf={entwurf} setEntwurf={setEntwurf}
              neuerSonderdienst={() => setZiel({ art: 'sonder', dienst: null, datum: tage.includes(heute) ? heute : von })}
              schliesszeitenOeffnen={() => setZiel({ art: 'schliess' })} abwesenheitenOeffnen={() => setZiel({ art: 'abwesenheiten' })} geaendert={neuLaden} />
          ) : undefined} />
      )}

      {ansicht === 'woche' && (
        <Card>
          <h2>Kommentare zur Woche</h2>
          {(kommentare.daten ?? []).length === 0 && <p className="field__hint">Noch keine Kommentare.</p>}
          <ul className="list" style={{ marginBottom: 'var(--space-3)' }}>
            {(kommentare.daten ?? []).map((c) => (
              <li key={c.id} className="list__item">
                <div className="list__main">
                  <div style={{ whiteSpace: 'pre-line' }}>{c.text}</div>
                  <div className="list__meta"><span>{name(c.person_id)}</span><span>{datumZeit(c.created_at)}</span></div>
                </div>
                {(c.person_id === ich.id || verwaltung) && (
                  <Button klein variante="ghost" aria-label="Kommentar löschen" onClick={() => void kommentarLoeschen(c.id)}>🗑</Button>
                )}
              </li>
            ))}
          </ul>
          <form onSubmit={(e) => void kommentarSenden(e)}>
            <div className="field">
              <label className="field__label" htmlFor="dp-kommentar">Kommentar schreiben</label>
              <textarea id="dp-kommentar" className="input" rows={2} value={kommentarText} onChange={(e) => setKommentarText(e.target.value)} style={{ padding: 'var(--space-3)' }} />
            </div>
            <Button klein type="submit" disabled={!kommentarText.trim()}>Kommentar senden</Button>
          </form>
        </Card>
      )}

      {tagKarte && (
        <TagSheet treffId={t.id} rolle={rolle} karte={tagKarte} team={mitglieder} abwesenheiten={abw} feiertag={feiertagAm(tagKarte.datum, feiertage.daten ?? [], t.id)}
          absprachen={(absprachen.daten ?? []).filter((n) => n.datum === tagKarte.datum)} ichId={ich.id} heute={heute} veroeffentlicht={fest}
          karten={karten} mindestbesetzung={mindest}
          abwesenheit={(person, aendern) => setZiel({ art: 'abwesenheit', person, datum: tagKarte.datum, bearbeiten: aendern })}
          sonderdienst={(d) => setZiel({ art: 'sonder', dienst: d, datum: tagKarte.datum })} schliesszeit={(feiertag) => setZiel({ art: 'schliess', datum: tagKarte.datum, feiertag })} geaendert={neuLaden}
          verhinderungGeaendert={() => verhinderungen.neuLaden()} schliessen={schliessen} />
      )}
      {ziel?.art === 'sonder' && (
        <SonderdienstSheet treffId={t.id} dienst={ziel.dienst} startDatum={ziel.datum} team={mitglieder} abwesenheiten={abw}
          veroeffentlicht={fest} schliessen={schliessen} geaendert={neuLaden} />
      )}
      {ziel?.art === 'abwesenheit' && (ziel.bearbeiten && ziel.person && ziel.datum
        ? <AbwesenheitBearbeiten treffId={t.id} team={mitglieder} heute={heute} person={ziel.person} datum={ziel.datum} gespeichert={abwesenheitGespeichert} schliessen={schliessen} />
        : <AbwesenheitSheet treffId={t.id} team={mitglieder} heute={heute} person={ziel.person} datum={ziel.datum} block={ziel.block ?? null}
            gespeichert={abwesenheitGespeichert} schliessen={schliessen} />)}
      {ziel?.art === 'abwesenheiten' && (
        <Sheet titel="Abwesenheiten" schliessen={schliessen}>
          <AbwesenheitenListe treffId={t.id} team={mitglieder} heute={heute} oeffnen={(block) => setZiel({ art: 'abwesenheit', block })} />
        </Sheet>
      )}
      {ziel?.art === 'schliess' && (
        <SchliesszeitenSheet treffId={t.id} rolle={rolle} startDatum={ziel.datum} feiertag={ziel.feiertag} schliessen={schliessen}
          geaendert={() => { schliesszeiten.neuLaden(); feiertage.neuLaden(); dienste.neuLaden(); }} />
      )}
    </div>
  );
}
