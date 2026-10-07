import { useCallback, useState } from 'react';
import { useAuth } from '../../lib/auth-kontext';
import { useLaden } from '../../lib/laden';
import { useLive } from '../../lib/live';
import { formatKurz, heuteIso } from '../../freizeiten/logik';
import { dienstStatistik, holeTreffTeam, listeAbwesenheiten, listeDienste, listeFeiertage, listeSchliesszeiten, type TreffDetailDaten } from '../../treffs/api';
import {
  dienstZeit, feiertagAm, monatErster, monatTage, monatText, monatVersatz, schliesszeitText, stundenText, tageskarten, type Dienst,
} from '../../treffs/dienstplan';
import { darfTreffVerwalten, oeffnungszeitText } from '../../treffs/logik';
import { LEERER_ENTWURF, mitEntwurf, type Entwurf } from '../../treffs/entwurf';
import type { RolleInTreff } from '../../lib/rollen';
import { Alert, Badge, Button, Card, Spinner } from '../../components/ui';
import { Einsatzmatrix } from './Einsatzmatrix';
import { MatrixLeiste } from './MatrixLeiste';
import { MonatEinteilen } from './MonatEinteilen';
import { SonderdienstSheet, ZuteilenSheet } from './DienstSheets';

type Ziel = { art: 'zuteilen'; datum: string; dienst: Dienst | null } | { art: 'sonder'; dienst: Dienst | null };

interface Props {
  treff: TreffDetailDaten;
  rolle: RolleInTreff;
  /** Ein Datum im angezeigten Monat; kommt vom Dienstplan, damit Woche und Monat denselben Zeitraum zeigen. Ohne Angabe verwaltet die Ansicht den Monat selbst. */
  fokus?: string;
  setFokus?: (datum: string) => void;
}

/** Monatsansicht des Dienstplans: alle Dienste mit Zuteilung (Treffleitung und Koordination teilen hier ein), Statistik je Person und „Monat einteilen“ (je Person die Wochentage) zum schnellen Einteilen. */
export function MonatTab({ treff: t, rolle, fokus: fokusVonAussen, setFokus: setzeVonAussen }: Props) {
  const { ich } = useAuth();
  const [interner, setInterner] = useState(() => heuteIso());
  const fokus = fokusVonAussen ?? interner;
  const setFokus = setzeVonAussen ?? setInterner;
  const monat = monatErster(fokus);
  const heute = heuteIso();
  const tage = monatTage(monat);
  const letzter = tage[tage.length - 1]!;
  const team = useLaden(() => holeTreffTeam(t.id), `treffteam-${t.id}`);
  const dienste = useLaden(() => listeDienste(t.id, monat, letzter), `monat-dienste-${t.id}-${monat}`);
  const feiertage = useLaden(() => listeFeiertage(t.id, monat, letzter), `monat-feiertage-${t.id}-${monat}`);
  const statistik = useLaden(() => dienstStatistik(t.id, monat), `monat-statistik-${t.id}-${monat}`);
  const abwesenheiten = useLaden(() => listeAbwesenheiten(monat, letzter), `monat-abwesenheiten-${t.id}-${monat}`);
  const schliesszeiten = useLaden(() => listeSchliesszeiten(t.id, monat, letzter), `monat-schliesszeiten-${t.id}-${monat}`);
  useLive(['dienste', 'dienst_zuteilungen', 'dienst_wuensche', 'feiertage', 'treff_schliesszeiten', 'treff_team'], () => {
    dienste.neuLaden(); feiertage.neuLaden(); schliesszeiten.neuLaden(); statistik.neuLaden(); team.neuLaden();
  });

  const [ziel, setZiel] = useState<Ziel | null>(null);
  const schliessen = useCallback(() => setZiel(null), []);
  const [bearbeiten, setBearbeiten] = useState(false);
  const [entwurf, setEntwurf] = useState<Entwurf>(LEERER_ENTWURF);
  if (!ich) return null;

  const verwaltung = darfTreffVerwalten(rolle);
  const mitglieder = team.daten ?? [];
  const namen = Object.fromEntries(mitglieder.map((m) => [m.person_id, `${m.vorname} ${m.nachname}`]));
  const name = (id: string) => namen[id] ?? 'Jemand';
  const karten = tageskarten(tage, t.oeffnungszeiten, dienste.daten ?? [], schliesszeiten.daten ?? []);
  const ladefehler = team.fehler ?? dienste.fehler ?? feiertage.fehler ?? statistik.fehler ?? abwesenheiten.fehler ?? schliesszeiten.fehler;
  const geaendert = () => { dienste.neuLaden(); statistik.neuLaden(); };

  // Ein Entwurf gilt nur für seinen Monat: Beim Blättern geht er (nach Rückfrage) verloren.
  const blaettern = (n: number) => {
    if (entwurf.size > 0 && !window.confirm('Die Änderungen in der Tabelle sind noch nicht gespeichert und gehen verloren. Trotzdem wechseln?')) return;
    setEntwurf(LEERER_ENTWURF);
    setFokus(monatVersatz(monat, n));
  };

  return (
    <div className="stack">
      {ladefehler && <Alert ton="error">{ladefehler}</Alert>}

      <div className="row" style={{ justifyContent: 'space-between' }}>
        <Button aria-label="Vorheriger Monat" onClick={() => blaettern(-1)}>←</Button>
        <strong>{monatText(monat)}</strong>
        <Button aria-label="Nächster Monat" onClick={() => blaettern(1)}>→</Button>
      </div>

      {!dienste.laedt && (
        <Einsatzmatrix karten={verwaltung && bearbeiten ? mitEntwurf(karten, entwurf) : karten} mitglieder={mitglieder} abwesenheiten={abwesenheiten.daten ?? []}
          feiertage={feiertage.daten ?? []} treffId={t.id} ichId={ich.id} heute={heute} mitWuenschen={verwaltung} zeitraum="Monat"
          bearbeiten={verwaltung && bearbeiten ? { gespeichert: karten, entwurf, aendern: (f) => setEntwurf(f) } : undefined}
          kopf={verwaltung ? (
            <MatrixLeiste treffId={t.id} monat={monat} karten={karten} team={mitglieder.map((m) => m.person_id)} abwesenheiten={abwesenheiten.daten ?? []}
              feiertage={feiertage.daten ?? []} bearbeiten={bearbeiten} setBearbeiten={setBearbeiten} entwurf={entwurf} setEntwurf={setEntwurf} geaendert={geaendert} />
          ) : undefined} />
      )}

      {verwaltung && !dienste.laedt && (
        <MonatEinteilen key={monat} treff={t} monat={monat} mitglieder={mitglieder} dienste={dienste.daten ?? []} abwesenheiten={abwesenheiten.daten ?? []}
          feiertage={feiertage.daten ?? []} schliesszeiten={schliesszeiten.daten ?? []} geaendert={geaendert} />
      )}

      <Card>
        <h2>Tage im Monat</h2>
        {verwaltung && <p><Button klein onClick={() => setZiel({ art: 'sonder', dienst: null })}>+ Sonderdienst</Button></p>}
        {dienste.laedt && <Spinner />}
        {!dienste.laedt && karten.length === 0 && <p>In diesem Monat gibt es keine Öffnungstage.</p>}
        <ul className="list" aria-label="Dienste im Monat">
          {karten.map((k) => {
            const f = feiertagAm(k.datum, feiertage.daten ?? [], t.id);
            const eintraege = [k.regulaer, ...k.sonder].filter((d): d is NonNullable<typeof d> => d !== null);
            const offeneWuensche = (k.regulaer?.wuensche ?? []).filter((x) => x.status === 'offen').length;
            return (
              <li key={k.datum} className={`list__item${k.datum === heute ? ' list__item--heute' : ''}`}>
                <div className="list__main">
                  <div className="list__title">{formatKurz(k.datum)}{k.datum === heute ? ' · heute' : ''}</div>
                  <div className="list__meta">
                    {k.oeffnung && <span>{oeffnungszeitText(k.oeffnung)}</span>}
                    {f && <Badge ton="warning">{f.bezeichnung}</Badge>}
                    {k.geschlossen && <Badge>{schliesszeitText(k.geschlossen)}</Badge>}
                    {verwaltung && offeneWuensche > 0 && <Badge ton="accent">{offeneWuensche === 1 ? '1 Wunsch' : `${offeneWuensche} Wünsche`}</Badge>}
                  </div>
                  {eintraege.map((d) => (
                    <div key={d.id}>
                      {d.ist_sonder && <div className="list__meta"><Badge ton="warning">Sonderdienst: {d.bezeichnung}{dienstZeit(d) ? ` ${dienstZeit(d)}` : ''}</Badge></div>}
                      <div className="einsatz__schilder">
                        {d.personen.length ? d.personen.map((pid) => <Badge key={pid} ton={pid === ich.id ? 'accent' : 'neutral'}>{name(pid)}</Badge>) : <span className="field__hint">niemand eingeteilt</span>}
                      </div>
                    </div>
                  ))}
                  {eintraege.length === 0 && <div className="field__hint">niemand eingeteilt</div>}
                </div>
                {verwaltung && (
                  <div className="row" style={{ gap: 'var(--space-2)' }}>
                    {/* geschlossen: nur noch zum Herausnehmen von Einteilungen, die vor der Schließzeit bestanden */}
                    {k.oeffnung && (!k.geschlossen || (k.regulaer?.personen.length ?? 0) > 0) && <Button klein aria-label={`Zuteilen am ${formatKurz(k.datum)}`} onClick={() => setZiel({ art: 'zuteilen', datum: k.datum, dienst: k.regulaer })}>Zuteilen</Button>}
                    {k.sonder.map((sd) => (
                      <Button key={sd.id} klein aria-label={`Sonderdienst ${sd.bezeichnung} am ${formatKurz(k.datum)} bearbeiten`} onClick={() => setZiel({ art: 'sonder', dienst: sd })}>Sonderdienst bearbeiten</Button>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <h2>Statistik</h2>
        <p className="field__hint">Dienste und Stunden im {monatText(monat)}{verwaltung ? '' : ' (nur deine)'}.</p>
        {statistik.laedt && <Spinner />}
        {!statistik.laedt && (statistik.daten?.length ?? 0) === 0 && <p>Keine Daten.</p>}
        {(statistik.daten?.length ?? 0) > 0 && (
          <table className="tabelle" aria-label="Dienste und Stunden je Person">
            <thead><tr><th scope="col">Person</th><th scope="col">Dienste</th><th scope="col">Stunden</th></tr></thead>
            <tbody>
              {[...statistik.daten!].sort((a, b) => name(a.person_id).localeCompare(name(b.person_id), 'de')).map((z) => (
                <tr key={z.person_id}><th scope="row">{name(z.person_id)}</th><td>{z.dienste}</td><td>{stundenText(z.stunden)}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {ziel?.art === 'zuteilen' && (
        <ZuteilenSheet treffId={t.id} datum={ziel.datum} dienst={ziel.dienst} team={mitglieder} abwesenheiten={abwesenheiten.daten ?? []}
          feiertag={feiertagAm(ziel.datum, feiertage.daten ?? [], t.id)} schliessen={schliessen} geaendert={geaendert} />
      )}
      {ziel?.art === 'sonder' && (
        <SonderdienstSheet treffId={t.id} dienst={ziel.dienst} startDatum={tage.includes(heute) ? heute : monat} team={mitglieder}
          abwesenheiten={abwesenheiten.daten ?? []} schliessen={schliessen} geaendert={geaendert} />
      )}
    </div>
  );
}
