import { useCallback, useState } from 'react';
import { useAuth } from '../../lib/auth-kontext';
import { useLaden } from '../../lib/laden';
import { useLive } from '../../lib/live';
import { fehlerText } from '../../lib/fehler';
import { sendePush } from '../../mitteilungen/senden';
import { formatKurz, heuteIso } from '../../freizeiten/logik';
import { dienstStatistik, holeTreffTeam, listeAbwesenheiten, listeDienste, listeFeiertage, wendeMonatsmusterAn, type TreffDetailDaten } from '../../treffs/api';
import {
  dienstZeit, feiertagAm, monatErster, monatTage, monatText, monatVersatz, musterTage, stundenText, tageskarten, type Dienst, type Muster,
} from '../../treffs/dienstplan';
import { darfTreffVerwalten, oeffnungszeitText, sortiereTreffTeam, wochentagName } from '../../treffs/logik';
import type { RolleInTreff } from '../../lib/rollen';
import { Alert, Badge, Button, Card, Spinner } from '../../components/ui';
import { SonderdienstSheet, ZuteilenSheet } from './DienstSheets';

type Ziel = { art: 'zuteilen'; datum: string; dienst: Dienst | null } | { art: 'sonder'; dienst: Dienst | null };

interface Props {
  treff: TreffDetailDaten;
  rolle: RolleInTreff;
  /** Ein Datum im angezeigten Monat; kommt vom Dienstplan, damit Woche und Monat denselben Zeitraum zeigen. Ohne Angabe verwaltet die Ansicht den Monat selbst. */
  fokus?: string;
  setFokus?: (datum: string) => void;
}

/** Monatsansicht des Dienstplans: alle Dienste mit Zuteilung (Treffleitung und Koordination teilen hier ein), Statistik je Person und das Monatsmuster zum Massen-Einteilen. */
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
  useLive(['dienste', 'dienst_zuteilungen', 'feiertage', 'treff_team'], () => { dienste.neuLaden(); feiertage.neuLaden(); statistik.neuLaden(); team.neuLaden(); });

  const [muster, setMuster] = useState<Muster>({});
  const [ziel, setZiel] = useState<Ziel | null>(null);
  const schliessen = useCallback(() => setZiel(null), []);
  const [fehler, setFehler] = useState<string | null>(null);
  const [erfolg, setErfolg] = useState<string | null>(null);
  const [arbeitet, setArbeitet] = useState(false);
  if (!ich) return null;

  const verwaltung = darfTreffVerwalten(rolle);
  const mitglieder = team.daten ?? [];
  const namen = Object.fromEntries(mitglieder.map((m) => [m.person_id, `${m.vorname} ${m.nachname}`]));
  const name = (id: string) => namen[id] ?? 'Jemand';
  const karten = tageskarten(tage, t.oeffnungszeiten, dienste.daten ?? []);
  const betroffen = musterTage(monat, t.oeffnungszeiten, muster);
  const ladefehler = team.fehler ?? dienste.fehler ?? feiertage.fehler ?? statistik.fehler ?? abwesenheiten.fehler;
  const geaendert = () => { dienste.neuLaden(); statistik.neuLaden(); };

  const blaettern = (n: number) => { setFokus(monatVersatz(monat, n)); setMuster({}); setErfolg(null); setFehler(null); };

  function waehle(wochentag: number, person: string, an: boolean) {
    setMuster((m) => {
      const alt = m[wochentag] ?? [];
      return { ...m, [wochentag]: an ? [...alt, person] : alt.filter((p) => p !== person) };
    });
  }
  const abwaehlen = (wochentag: number) => setMuster((m) => Object.fromEntries(Object.entries(m).filter(([k]) => Number(k) !== wochentag)));

  async function anwenden() {
    if (betroffen.length === 0) return;
    if (!window.confirm(`Die Zuteilung an ${betroffen.length} ${betroffen.length === 1 ? 'Tag' : 'Tagen'} im ${monatText(monat)} wird ersetzt. Fortfahren?`)) return;
    setArbeitet(true); setFehler(null); setErfolg(null);
    try {
      const n = await wendeMonatsmusterAn(t.id, monat, muster);
      setErfolg(`Das Muster wurde auf ${n} ${n === 1 ? 'Tag' : 'Tage'} angewendet.`);
      const betroffene = [...new Set(Object.values(muster).flat())];
      if (betroffene.length) sendePush('dienstplan', t.id, { personen: betroffene });
      setMuster({});
      dienste.neuLaden(); statistik.neuLaden();
    } catch (e) { setFehler(fehlerText(e, 'Das Muster konnte nicht angewendet werden.')); } finally { setArbeitet(false); }
  }

  return (
    <div className="stack">
      {(ladefehler || fehler) && <Alert ton="error">{ladefehler ?? fehler}</Alert>}
      {erfolg && <Alert ton="success">{erfolg}</Alert>}

      <div className="row" style={{ justifyContent: 'space-between' }}>
        <Button aria-label="Vorheriger Monat" onClick={() => blaettern(-1)}>←</Button>
        <strong>{monatText(monat)}</strong>
        <Button aria-label="Nächster Monat" onClick={() => blaettern(1)}>→</Button>
      </div>

      <Card>
        <h2>Übersicht</h2>
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
                    {verwaltung && offeneWuensche > 0 && <Badge ton="accent">{offeneWuensche === 1 ? '1 Wunsch' : `${offeneWuensche} Wünsche`}</Badge>}
                  </div>
                  {eintraege.map((d) => (
                    <div key={d.id} className="list__meta">
                      {d.ist_sonder && <Badge ton="warning">Sonderdienst: {d.bezeichnung}{dienstZeit(d) ? ` ${dienstZeit(d)}` : ''}</Badge>}
                      <span>{d.personen.length ? d.personen.map(name).join(', ') : 'niemand eingeteilt'}</span>
                    </div>
                  ))}
                  {eintraege.length === 0 && <div className="field__hint">niemand eingeteilt</div>}
                </div>
                {verwaltung && (
                  <div className="row" style={{ gap: 'var(--space-2)' }}>
                    {k.oeffnung && <Button klein aria-label={`Zuteilen am ${formatKurz(k.datum)}`} onClick={() => setZiel({ art: 'zuteilen', datum: k.datum, dienst: k.regulaer })}>Zuteilen</Button>}
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
          <table className="tabelle">
            <thead><tr><th scope="col">Person</th><th scope="col">Dienste</th><th scope="col">Stunden</th></tr></thead>
            <tbody>
              {[...statistik.daten!].sort((a, b) => name(a.person_id).localeCompare(name(b.person_id), 'de')).map((z) => (
                <tr key={z.person_id}><th scope="row">{name(z.person_id)}</th><td>{z.dienste}</td><td>{stundenText(z.stunden)}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {verwaltung && (
        <Card>
          <h2>Monatsmuster</h2>
          <p className="field__hint">
            Wähle je Wochentag die Personen, die an allen Öffnungstagen des Monats eingeteilt werden. Die bisherige Zuteilung dieser Tage wird ersetzt;
            Tage ohne Häkchen bleiben unverändert. Einzelne Tage änderst du danach im Dienstplan.
          </p>
          {t.oeffnungszeiten.length === 0 && <p>Der Treff hat noch keine Öffnungstage.</p>}
          {t.oeffnungszeiten.map((o) => {
            const aktiv = o.wochentag in muster;
            return (
              <fieldset key={o.wochentag} className="optionen">
                <legend className="field__label">{wochentagName(o.wochentag)} · {oeffnungszeitText(o)}</legend>
                <label className="option">
                  <input type="checkbox" checked={aktiv} onChange={(e) => (e.target.checked ? setMuster((m) => ({ ...m, [o.wochentag]: [] })) : abwaehlen(o.wochentag))} />
                  <span>An allen {wochentagName(o.wochentag)}en einteilen</span>
                </label>
                {aktiv && sortiereTreffTeam(mitglieder).map((m) => (
                  <label key={m.person_id} className="option" style={{ marginLeft: 'var(--space-4)' }}>
                    <input type="checkbox" checked={(muster[o.wochentag] ?? []).includes(m.person_id)}
                      aria-label={`${wochentagName(o.wochentag)}: ${m.vorname} ${m.nachname}`}
                      onChange={(e) => waehle(o.wochentag, m.person_id, e.target.checked)} />
                    <span>{m.vorname} {m.nachname}{m.rolle === 'treffleitung' ? ' (Treffleitung)' : ''}</span>
                  </label>
                ))}
              </fieldset>
            );
          })}
          <Button variante="primary" laedt={arbeitet} disabled={betroffen.length === 0} onClick={() => void anwenden()}>
            {betroffen.length === 0 ? 'Auf den Monat anwenden' : `Auf ${betroffen.length} ${betroffen.length === 1 ? 'Tag' : 'Tage'} anwenden`}
          </Button>
        </Card>
      )}

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
