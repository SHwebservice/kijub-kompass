import { useState, type FormEvent } from 'react';
import { useLaden } from '../../lib/laden';
import { fehlerText } from '../../lib/fehler';
import { formatDatum, heuteIso } from '../../freizeiten/logik';
import { listeFeiertage, listeSchliesszeiten, loescheFeiertag, loescheSchliesszeit, speichereFeiertag, speichereSchliesszeit } from '../../treffs/api';
import { addTage, validiereSchliesszeit } from '../../treffs/dienstplan';
import type { RolleInTreff } from '../../lib/rollen';
import { Sheet } from '../../components/Sheet';
import { Alert, Badge, Button, Spinner, TextField } from '../../components/ui';

const ZEITRAUM_TAGE = 365;
const zeitraum = (von: string, bis: string) => (von === bis ? formatDatum(von) : `${formatDatum(von)} – ${formatDatum(bis)}`);

interface Props {
  treffId: string;
  rolle: RolleInTreff;
  /** Vorbelegung, z. B. der Tag aus dem Tagesfenster. */
  startDatum?: string;
  /** Mit dem Feiertag beginnen (sonst mit der Schließzeit). */
  feiertag?: boolean;
  /** Nach dem Eintragen oder Löschen: Dienstplan neu laden. */
  geaendert: () => void;
  schliessen: () => void;
}

/**
 * Geschlossene Tage des Treffs direkt im Dienstplan (Treffleitung und Treffkoordination): Schließzeiten (Zeitraum, z. B. Sommerpause)
 * und Feiertage (ein Tag; die Treffkoordination auch für alle Treffs). An diesen Tagen wird weder eingeteilt noch gewünscht,
 * es ist kein Tagesprotokoll nötig; Sonderdienste bleiben möglich. Feiertage stehen außerdem im Stundennachweis.
 */
export function SchliesszeitenSheet({ treffId, rolle, startDatum = '', feiertag: mitFeiertag = false, geaendert, schliessen }: Props) {
  const heute = heuteIso();
  const bis = addTage(heute, ZEITRAUM_TAGE);
  const liste = useLaden(() => listeSchliesszeiten(treffId, heute, bis), `schliesszeiten-sheet-${treffId}`);
  const feiertage = useLaden(() => listeFeiertage(treffId, heute, bis), `feiertage-sheet-${treffId}`);
  const [s, setS] = useState({ von: mitFeiertag ? '' : startDatum, bis: mitFeiertag ? '' : startDatum, grund: '' });
  const [f, setF] = useState({ datum: mitFeiertag ? startDatum : '', bezeichnung: '', alle: false });
  const [sFehler, setSFehler] = useState<string | null>(null);
  const [fFehler, setFFehler] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [erfolg, setErfolg] = useState<string | null>(null);
  const [arbeitet, setArbeitet] = useState(false);
  const koordination = rolle === 'koordination';

  async function aktion(fn: () => Promise<void>, text: string, neu: () => void) {
    setFehler(null); setErfolg(null); setArbeitet(true);
    try { await fn(); setErfolg(text); neu(); geaendert(); } catch (e) { setFehler(fehlerText(e)); } finally { setArbeitet(false); }
  }

  function schliesszeitSpeichern(e: FormEvent) {
    e.preventDefault();
    const problem = validiereSchliesszeit(s);
    setSFehler(problem);
    if (problem) return;
    void aktion(async () => { await speichereSchliesszeit(treffId, s.von, s.bis, s.grund); setS({ von: '', bis: '', grund: '' }); },
      `Schließzeit ${zeitraum(s.von, s.bis)} eingetragen.`, () => liste.neuLaden());
  }

  function feiertagSpeichern(e: FormEvent) {
    e.preventDefault();
    if (!f.datum || !f.bezeichnung.trim()) { setFFehler('Bitte Datum und Bezeichnung angeben.'); return; }
    setFFehler(null);
    void aktion(async () => { await speichereFeiertag(f.alle ? null : treffId, f.datum, f.bezeichnung); setF({ datum: '', bezeichnung: '', alle: false }); },
      `Feiertag ${f.bezeichnung.trim()} (${formatDatum(f.datum)}) eingetragen.`, () => feiertage.neuLaden());
  }

  const schliesszeitTeil = (
    <section className="tag__abschnitt" aria-label="Schließzeiten">
      <h3>Schließzeiten</h3>
      <p className="field__hint">
        Ist der Treff geschlossen (z. B. Sommerpause, Fortbildung), wird an diesen Tagen weder eingeteilt noch gewünscht, es ist kein
        Tagesprotokoll nötig und es kommt keine Erinnerung. Schon eingetragene Dienste bleiben stehen – nimm die Personen bei Bedarf im Tagesfenster heraus.
      </p>
      <form onSubmit={schliesszeitSpeichern} noValidate>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 150px' }}><TextField label="Geschlossen von" type="date" value={s.von} onChange={(e) => setS({ ...s, von: e.target.value, bis: s.bis || e.target.value })} /></div>
          <div style={{ flex: '1 1 150px' }}><TextField label="Geschlossen bis" type="date" value={s.bis} onChange={(e) => setS({ ...s, bis: e.target.value })} fehler={sFehler ?? undefined} /></div>
        </div>
        <TextField label="Grund (optional)" value={s.grund} onChange={(e) => setS({ ...s, grund: e.target.value })} maxLength={200} />
        <Button variante="primary" type="submit" laedt={arbeitet}>Schließzeit eintragen</Button>
      </form>
      <h4>Aktuelle und kommende Schließzeiten</h4>
      {liste.fehler && <Alert ton="error">{liste.fehler}</Alert>}
      {liste.laedt && <Spinner />}
      {!liste.laedt && (liste.daten?.length ?? 0) === 0 && <p>Keine Schließzeiten eingetragen.</p>}
      <ul className="list" aria-label="Schließzeiten">
        {(liste.daten ?? []).map((x) => (
          <li key={x.id} className="list__item">
            <div className="list__main">
              <div className="list__title">{zeitraum(x.von, x.bis)}</div>
              <div className="list__meta">
                {x.grund ? <span>{x.grund}</span> : <span className="field__hint">ohne Grund</span>}
                {x.von <= heute && <Badge ton="warning">läuft</Badge>}
              </div>
            </div>
            <Button klein variante="danger" disabled={arbeitet} aria-label={`Schließzeit ${zeitraum(x.von, x.bis)} löschen`}
              onClick={() => { if (window.confirm(`Schließzeit ${zeitraum(x.von, x.bis)} löschen? Danach kann an diesen Tagen wieder eingeteilt werden.`)) void aktion(() => loescheSchliesszeit(x.id), 'Schließzeit gelöscht.', () => liste.neuLaden()); }}>Löschen</Button>
          </li>
        ))}
      </ul>
    </section>
  );

  const feiertagTeil = (
    <section className="tag__abschnitt" aria-label="Feiertage">
      <h3>Feiertage</h3>
      <p className="field__hint">An Feiertagen ist der Treff geschlossen wie in einer Schließzeit. Im Stundennachweis werden sie vermerkt.</p>
      <form onSubmit={feiertagSpeichern} noValidate>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 150px' }}><TextField label="Datum" type="date" value={f.datum} onChange={(e) => setF({ ...f, datum: e.target.value })} /></div>
          <div style={{ flex: '2 1 200px' }}><TextField label="Bezeichnung" value={f.bezeichnung} onChange={(e) => setF({ ...f, bezeichnung: e.target.value })} maxLength={100} fehler={fFehler ?? undefined} /></div>
        </div>
        {koordination && (
          <label className="option">
            <input type="checkbox" checked={f.alle} onChange={(e) => setF({ ...f, alle: e.target.checked })} />
            <span>Gilt für alle Treffs</span>
          </label>
        )}
        <Button variante="primary" type="submit" laedt={arbeitet}>Feiertag eintragen</Button>
      </form>
      <h4>Kommende Feiertage</h4>
      {feiertage.fehler && <Alert ton="error">{feiertage.fehler}</Alert>}
      {feiertage.laedt && <Spinner />}
      {!feiertage.laedt && (feiertage.daten?.length ?? 0) === 0 && <p>Keine Feiertage eingetragen.</p>}
      <ul className="list" aria-label="Feiertage">
        {(feiertage.daten ?? []).map((x) => (
          <li key={x.id} className="list__item">
            <div className="list__main">
              <div className="list__title">{x.bezeichnung}</div>
              <div className="list__meta"><span>{formatDatum(x.datum)}</span>{x.treff_id === null && <Badge>Alle Treffs</Badge>}</div>
            </div>
            {(x.treff_id !== null || koordination) && (
              <Button klein variante="danger" disabled={arbeitet} aria-label={`Feiertag ${x.bezeichnung} löschen`}
                onClick={() => { if (window.confirm(`Feiertag ${x.bezeichnung} löschen?`)) void aktion(() => loescheFeiertag(x.id), 'Feiertag gelöscht.', () => feiertage.neuLaden()); }}>Löschen</Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );

  return (
    <Sheet titel="Schließzeiten & Feiertage" schliessen={schliessen}>
      {fehler && <Alert ton="error">{fehler}</Alert>}
      {erfolg && <Alert ton="success">{erfolg}</Alert>}
      {mitFeiertag ? <>{feiertagTeil}{schliesszeitTeil}</> : <>{schliesszeitTeil}{feiertagTeil}</>}
    </Sheet>
  );
}
