import { useCallback, useState } from 'react';
import { useLaden } from '../../lib/laden';
import { fehlerText } from '../../lib/fehler';
import { holeWochenprogramm, loescheProgrammpunkt, speichereProgrammpunkt, type TreffDetailDaten } from '../../treffs/api';
import { darfTreffVerwalten, oeffnungszeitText, programmTitel, wochentagName, type WochenprogrammEintrag } from '../../treffs/logik';
import type { RolleInTreff } from '../../lib/rollen';
import { Sheet } from '../../components/Sheet';
import { Alert, Button, Card, Spinner } from '../../components/ui';
import { ProgrammAuswahl } from '../freizeiten/ProgrammAuswahl';

function Zeile({ label, wert }: { label: string; wert: React.ReactNode }) {
  if (wert === null || wert === undefined || wert === '') return null;
  return (<><dt>{label}</dt><dd>{wert}</dd></>);
}

/** Stammdaten, Öffnungszeiten und das wiederkehrende Wochenprogramm (ein Programmpunkt je Öffnungstag). */
export function TreffUebersicht({ treff: t, rolle }: { treff: TreffDetailDaten; rolle: RolleInTreff }) {
  const programm = useLaden(() => holeWochenprogramm(t.id), `programm-${t.id}`);
  const verwaltung = darfTreffVerwalten(rolle);
  const [tag, setTag] = useState<number | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const schliessen = useCallback(() => setTag(null), []);

  const nachTag = new Map((programm.daten ?? []).map((e) => [e.wochentag, e]));

  return (
    <div className="stack">
      <Card>
        <h2>Stammdaten</h2>
        <dl className="daten">
          <Zeile label="Ort" wert={t.ort_name} />
          <Zeile label="Adresse" wert={t.ort_adresse ?? t.adresse_abw} />
        </dl>
        <h3>Öffnungszeiten</h3>
        {t.oeffnungszeiten.length === 0 ? <p>Keine Öffnungstage eingetragen.</p> : (
          <dl className="daten">
            {t.oeffnungszeiten.map((o) => <Zeile key={o.wochentag} label={wochentagName(o.wochentag)} wert={oeffnungszeitText(o)} />)}
          </dl>
        )}
      </Card>

      <Card>
        <h2>Wochenprogramm</h2>
        <p className="field__hint">Was an den Öffnungstagen jede Woche auf dem Programm steht.</p>
        {(programm.fehler || fehler) && <Alert ton="error">{programm.fehler ?? fehler}</Alert>}
        {programm.laedt && <Spinner />}
        {t.oeffnungszeiten.length === 0 && !programm.laedt && <p>Das Wochenprogramm hängt an den Öffnungstagen – sie fehlen noch.</p>}
        <ul className="list">
          {t.oeffnungszeiten.map((o) => {
            const e = nachTag.get(o.wochentag);
            return (
              <li key={o.wochentag} className="list__item">
                <div className="list__main">
                  <div className="list__title">{wochentagName(o.wochentag)}</div>
                  <div className="list__meta"><span>{oeffnungszeitText(o)}</span></div>
                  {e ? (
                    <>
                      <div><strong>{programmTitel(e)}</strong></div>
                      {e.notiz && <div className="list__meta" style={{ whiteSpace: 'pre-line' }}>{e.notiz}</div>}
                    </>
                  ) : <div className="field__hint">Noch kein Programm</div>}
                </div>
                {verwaltung && <Button klein onClick={() => { setFehler(null); setTag(o.wochentag); }}>{e ? 'Ändern' : 'Eintragen'}</Button>}
              </li>
            );
          })}
        </ul>
      </Card>

      {tag !== null && (
        <ProgrammSheet treffId={t.id} wochentag={tag} eintrag={nachTag.get(tag)} schliessen={schliessen}
          geaendert={() => programm.neuLaden()} fehlerMelden={setFehler} />
      )}
    </div>
  );
}

function ProgrammSheet({ treffId, wochentag, eintrag, schliessen, geaendert, fehlerMelden }: {
  treffId: string; wochentag: number; eintrag: WochenprogrammEintrag | undefined; schliessen: () => void; geaendert: () => void; fehlerMelden: (f: string | null) => void;
}) {
  const [waehlen, setWaehlen] = useState(!eintrag);
  const [notiz, setNotiz] = useState(eintrag?.notiz ?? '');
  const [fehler, setFehler] = useState<string | null>(null);
  const [arbeitet, setArbeitet] = useState(false);

  async function ausfuehren(aktion: () => Promise<void>) {
    setArbeitet(true); setFehler(null); fehlerMelden(null);
    try { await aktion(); geaendert(); schliessen(); }
    catch (e) { setFehler(fehlerText(e, 'Das hat nicht geklappt.')); setArbeitet(false); }
  }
  const wahl = (w: { angebot_id: string | null; freitext: string | null }) =>
    ausfuehren(() => speichereProgrammpunkt(treffId, wochentag, { ...w, notiz: eintrag?.notiz ?? null }));

  return (
    <Sheet titel={`Wochenprogramm · ${wochentagName(wochentag)}`} schliessen={schliessen}>
      {fehler && <Alert ton="error">{fehler}</Alert>}
      {waehlen ? (
        <>
          {eintrag && <p><Button klein onClick={() => setWaehlen(false)}>← Zurück</Button></p>}
          <ProgrammAuswahl freitextErlaubt
            waehleAngebot={(id) => void wahl({ angebot_id: id, freitext: null })}
            waehleFreitext={(text) => void wahl({ angebot_id: null, freitext: text })} />
        </>
      ) : eintrag && (
        <div className="stack">
          <p><strong>{programmTitel(eintrag)}</strong></p>
          <div className="field">
            <label className="field__label" htmlFor="programm-notiz">Notiz</label>
            <textarea id="programm-notiz" className="input" rows={4} value={notiz} onChange={(e) => setNotiz(e.target.value)} style={{ padding: 'var(--space-3)' }} />
          </div>
          <div className="row">
            <Button variante="primary" laedt={arbeitet} disabled={notiz.trim() === (eintrag.notiz ?? '')}
              onClick={() => void ausfuehren(() => speichereProgrammpunkt(treffId, wochentag,
                { angebot_id: eintrag.angebot_id, freitext: eintrag.freitext, notiz: notiz.trim() || null }))}>Notiz speichern</Button>
            <Button disabled={arbeitet} onClick={() => setWaehlen(true)}>Programmpunkt ändern</Button>
            <Button variante="danger" disabled={arbeitet}
              onClick={() => { if (window.confirm('Den Programmpunkt dieses Tages entfernen?')) void ausfuehren(() => loescheProgrammpunkt(treffId, wochentag)); }}>Entfernen</Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
