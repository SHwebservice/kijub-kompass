import { Link } from 'react-router-dom';
import { Alert, Card, EmptyState, PageHeader, Spinner } from '../components/ui';
import { useAuth } from '../lib/auth-kontext';
import { useLaden } from '../lib/laden';
import { listeFreizeiten } from '../freizeiten/api';
import { heuteIso, phase } from '../freizeiten/logik';
import { ladeHeute, quittiereBesuch } from '../heute/api';
import { baueKacheln } from '../heute/kacheln';
import { baueBento } from '../heute/bento';
import { baueFeed } from '../heute/feed';
import { aktuelleFreizeiten, gruppiereOffene, knappeJeOrt, laeuftHeute, nichtGeseheneImTeam, offeneFuerMich, ohneLeitung, planNachFreizeit, wuenscheJeTreff } from '../heute/logik';
import { listeMeineDienste, listeTreffs } from '../treffs/api';
import { ladeCheckliste } from '../checkliste/api';
import { listeNeueTeamprotokolle } from '../teamprotokolle/api';
import { ungeleseneJeTreff } from '../teamprotokolle/logik';
import { standJeFreizeit } from '../checkliste/logik';
import { protokollFaellig } from '../tagesprotokoll/logik';
import { addTage } from '../treffs/dienstplan';
import { useLetzterBesuchDienste } from './dienste/gesehen';
import { Bewerben } from './heute/Bewerben';
import { Bento } from './heute/Bento';
import { Feed } from './heute/Feed';
import { MitteilungsHinweis } from './heute/MitteilungsHinweis';
import { Schnellzugriff } from './heute/Schnellzugriff';
import { FolgeDienste, NaechsteFreizeit, NaechsterDienst } from './heute/AlsNaechstes';

const DIENSTE_TAGE = 14;
/** So viele kommende Dienste zeigt „Als Nächstes“; alle stehen unter „Meine Dienste“. */
const NAECHSTE_DIENSTE = 3;

/**
 * Startseite – nur „Was braucht mich jetzt?“: die Koordination sieht oben das Kachelraster mit Zahlen („Überblick“). Für alle folgt der Feed:
 * Zu erledigen, Heute, Neu seit dem letzten Besuch. Darunter „Als Nächstes“ (nächste eigene Freizeit, nächste Dienste) und der Schnellzugriff
 * in die eigenen Freizeiten und Treffs. Jede Zahl steht nur an einer Stelle; Listen und die Saison stehen in den Bereichen Freizeiten und Treffs.
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
  const letzterBesuchDienste = useLetzterBesuchDienste(hatTreffs ? ich?.id : undefined, false);      // nur anzeigen; gemerkt wird in „Meine Dienste“ und im Dienstplan
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

  const kachelTreffs = tk ? treffs.daten ?? [] : (treffs.daten ?? []).filter((t) => meineTreffIds.includes(t.id));
  const kachelTreffIds = kachelTreffs.map((t) => t.id);
  const laufendIds = (fk ? aktuelle : aktuelleMeine).filter((f) => laeuftHeute(f, heute)).map((f) => f.id);
  const leitungIds = fk ? aktuelle.map((f) => f.id) : aktuelleMeine.filter((f) => rollen?.leitungFreizeiten.includes(f.id)).map((f) => f.id);
  const teamIds = [...new Set([...leitungIds, ...(fk ? aktuelle.map((f) => f.id) : [])])];

  // Alles Übrige in EINEM Aufruf (fn_heute) – erst, wenn klar ist, welche Freizeiten und Treffs gemeint sind
  const bereit = !freizeiten.laedt && !treffs.laedt;
  const anfrage = {
    heute, notizFreizeiten: fIds, notizTreffs: notizTreffIds, teamFreizeiten: teamIds, planFreizeiten: laufendIds, kachelTreffs: kachelTreffIds, protokollTreffs: meineTreffIds,
    bestand: istLeitung, nachweise: istTreffleitung, bewerbungen: fk, vorschlaege: koord, fehler: koord, besuch: true,
    ...(istTreffleitung ? { wuensche: tk ? ('alle' as const) : (rollen?.treffleitungen ?? []) } : {}),
  };
  const stand = useLaden(async () => (bereit ? ladeHeute(anfrage) : null), `heute-stand-${bereit}-${JSON.stringify(anfrage)}`);

  // Checkliste der Vorbereitung: eigene kommende Freizeiten als Leitung (Karten im Feed; den Stand aller zeigt die Saison unter „Freizeiten“)
  const eigeneLeitung = alle.filter((f) => rollen?.leitungFreizeiten.includes(f.id) && f.status === 'geplant' && phase(f, heute) !== 'vergangen');
  const checklisteIds = eigeneLeitung.map((f) => f.id).sort();
  const checkliste = useLaden(async () => (bereit ? ladeCheckliste(checklisteIds) : []), `heute-checkliste-${bereit}-${checklisteIds.join(',')}`);
  // Ungelesene Teamprotokolle der eigenen Treffs (die letzten 60 Tage)
  const teamprotokolle = useLaden(async () => (meineTreffIds.length ? listeNeueTeamprotokolle(meineTreffIds, addTage(heute, -60)) : []), `heute-teamprotokolle-${meineTreffIds.join(',')}`);
  if (!ich || !rollen) return null;
  const vorbereitung = standJeFreizeit(checkliste.daten ?? [], heute);

  const meine = alle.filter((f) => meineIds.has(f.id) && phase(f, heute) !== 'vergangen' && f.status === 'geplant').sort((a, b) => a.start_datum.localeCompare(b.start_datum) || a.name.localeCompare(b.name, 'de'));
  const laufendHeute = (fk ? aktuelle : aktuelleMeine).filter((f) => laeuftHeute(f, heute));
  const leitungFreizeiten = fk ? aktuelle : aktuelleMeine.filter((f) => rollen.leitungFreizeiten.includes(f.id));
  const d = stand.daten;
  const kommendeDienste = (dienste.daten ?? []).filter((d) => d.datum > heute);
  const diensteHeute = (dienste.daten ?? []).filter((d) => d.datum === heute).length;
  const nichtsZuTun = meineIds.size === 0 && !hatTreffs && !koord;     // gar keine Zuordnung und keine Koordination

  // Zahlen für die Kacheln
  const offen = offeneFuerMich(d?.notizen ?? [], ich.id, rollen, heute);
  const ortIds = new Set(leitungFreizeiten.map((f) => f.ort_id).filter((o): o is string => !!o));
  const knapp = knappeJeOrt(d?.bestand ?? [], ortIds).reduce((n, o) => n + o.artikel.length, 0);

  const jetzt = new Date();
  const uhrzeit = `${String(jetzt.getHours()).padStart(2, '0')}:${String(jetzt.getMinutes()).padStart(2, '0')}`;
  // „Protokoll fehlt“ nur für die eigenen Treffs (auch bei der Treffkoordination) und nicht an Feiertagen oder in Schließzeiten
  const protokolliert = new Set(d?.protokolliert ?? []);
  const geschlossen = new Set(d?.geschlossen ?? []);
  const ohneProtokoll = d ? (treffs.daten ?? []).filter((t) => meineTreffIds.includes(t.id) && protokollFaellig(t.oeffnungszeiten, heute, uhrzeit) && !protokolliert.has(t.id) && !geschlossen.has(t.id)) : [];

  const freizeitAmOrt = (ortId: string) => leitungFreizeiten.find((f) => f.ort_id === ortId);
  const offeneGruppen = gruppiereOffene(offen);
  const knappJeOrt = knappeJeOrt(d?.bestand ?? [], ortIds);
  const planHeute = planNachFreizeit(d?.plan ?? []);
  const wuenscheJe = istTreffleitung ? wuenscheJeTreff(d?.wuensche ?? []) : [];
  const eintraege = baueFeed({
    ohneProtokoll: ohneProtokoll.map((t) => ({ id: t.id, name: t.name })),
    offene: offeneGruppen,
    // Lebensmittel (Freizeitenkoordination) und Dienstwünsche (Treffkoordination) zählt bei der Koordination schon der Überblick oben
    knapp: istLeitung && !fk ? knappJeOrt.map((o) => ({ ort: o, freizeitId: freizeitAmOrt(o.ort_id)?.id ?? null, name: d?.orte[o.ort_id] ?? freizeitAmOrt(o.ort_id)?.name ?? 'Ort' })) : [],
    nichtGesehen: istLeitung ? nichtGeseheneImTeam(d?.notizen ?? [], d?.team ?? [], leitungFreizeiten.map((f) => f.id), heute) : [],
    wuensche: tk ? [] : wuenscheJe.map((w) => ({ treff: w, name: d?.treffNamen[w.treff_id] ?? 'Treff' })),
    teamprotokolle: Object.entries(ungeleseneJeTreff(teamprotokolle.daten ?? [], ich.id))
      .map(([treffId, anzahl]) => ({ treffId, anzahl, name: (treffs.daten ?? []).find((t) => t.id === treffId)?.name ?? 'Treff' })),
    vorbereitung: eigeneLeitung.filter((f) => vorbereitung[f.id]).map((f) => ({ id: f.id, name: f.name, ueberfaellig: vorbereitung[f.id]!.ueberfaellig, bald: vorbereitung[f.id]!.bald })),
    diensteHeute: (dienste.daten ?? []).filter((x) => x.datum === heute),
    freizeitenHeute: laufendHeute.map((f) => ({ id: f.id, name: f.name, ort_name: f.ort_name ?? null, punkte: planHeute.get(f.id) ?? [] })),
    neu: d?.neu ?? [],
  });

  const kacheln = baueKacheln({
    freizeitkoordination: fk, treffkoordination: tk,
    leitung: rollen.leitungFreizeiten.length > 0, treffleitung: rollen.treffleitungen.length > 0,
    freizeitTeam: meineIds.size > 0, treffTeam: hatTreffs, kategorie: ich.kategorie,
    freizeiten: (fk ? aktuelle : meine).map((f) => ({ id: f.id, name: f.name })),
    treffs: kachelTreffs.map((t) => ({ id: t.id, name: t.name })),
    zaehler: {
      hinweise: offen.filter((n) => n.freizeit_id !== null).length,          // Hinweise und Absprachen der Freizeiten, die noch bestätigt werden sollen
      treffAbsprachen: offen.filter((n) => n.treff_id !== null).length,
      knapp, wuensche: d?.wuensche.length ?? 0, bewerbungen: d?.bewerbungen ?? 0, vorschlaege: d?.vorschlaege ?? 0, nachweise: d?.nachweise ?? 0, diensteHeute,
      protokollFehlt: ohneProtokoll.length, offeneNotizen: Object.values(d?.offeneNotizen ?? {}).reduce((n, x) => n + x, 0), fehler: d?.fehler ?? 0,
    },
  });
  const bento = koord ? baueBento({
    freizeitkoordination: fk, treffkoordination: tk, heute, zaehler: {
      hinweise: 0, treffAbsprachen: 0, knapp, wuensche: d?.wuensche.length ?? 0, bewerbungen: d?.bewerbungen ?? 0, vorschlaege: d?.vorschlaege ?? 0,
      nachweise: d?.nachweise ?? 0, diensteHeute, protokollFehlt: ohneProtokoll.length, offeneNotizen: 0, fehler: d?.fehler ?? 0,
    },
    aktuelle: fk ? aktuelle : [], laufendHeute: laufendHeute.length,
    ohneLeitung: fk ? ohneLeitung(aktuelle, d?.team ?? []).length : 0, wunschTreffId: wuenscheJe[0]?.treff_id ?? null, erstesTreffId: kachelTreffs[0]?.id ?? null,
  }) : [];

  // „Als Nächstes“: die nächste eigene Freizeit, die noch nicht läuft (laufende stehen im Feed unter „Heute“), und die nächsten Dienste
  const naechsteFreizeit = meine.find((f) => phase(f, heute) === 'kommend');
  const naechsteDienste = kommendeDienste.slice(0, NAECHSTE_DIENSTE);

  return (
    <>
      <PageHeader titel={`Hallo ${ich.vorname}`} />

      <div className="stack">
        <MitteilungsHinweis />
        {(freizeiten.fehler ?? stand.fehler) && <Alert ton="error">{freizeiten.fehler ?? stand.fehler}</Alert>}
        {koord && <Bento kacheln={bento} />}
        <Feed heute={heute} eintraege={eintraege} seit={d?.seit ?? null} neuGesamt={d?.neuGesamt ?? 0} laedt={stand.laedt || freizeiten.laedt || !bereit}
          gesehen={async () => { await quittiereBesuch(); stand.neuLaden(); }} />

        {(meineIds.size > 0 || hatTreffs) && (
          <Card>
            <h2>Als Nächstes</h2>
            {dienste.fehler && <Alert ton="error">{dienste.fehler}</Alert>}
            {(freizeiten.laedt || dienste.laedt) && <Spinner />}
            {meineIds.size > 0 && !freizeiten.laedt && (
              <section aria-label="Nächste Freizeit">
                {naechsteFreizeit ? <NaechsteFreizeit freizeit={naechsteFreizeit} heute={heute} /> : <p>Keine kommende Freizeit.</p>}
              </section>
            )}
            {hatTreffs && !dienste.laedt && (
              <section aria-label="Meine nächsten Dienste">
                {naechsteDienste[0]
                  ? <NaechsterDienst dienst={naechsteDienste[0]} heute={heute} letzterBesuch={letzterBesuchDienste} />
                  : <p>{diensteHeute > 0 ? 'Nach heute sind keine Dienste eingeteilt.' : `Keine Dienste in den nächsten ${DIENSTE_TAGE} Tagen.`}</p>}
                <FolgeDienste dienste={naechsteDienste.slice(1)} heute={heute} letzterBesuch={letzterBesuchDienste} />
                <p><Link to="/dienste">Alle meine Dienste und Kalender-Abo →</Link></p>
              </section>
            )}
          </Card>
        )}

        <Schnellzugriff gruppen={kacheln} />

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
