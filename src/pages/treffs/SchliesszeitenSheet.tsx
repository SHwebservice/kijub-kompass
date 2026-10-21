import { useState, type FormEvent } from 'react';
import { useLaden } from '../../lib/laden';
import { fehlerText } from '../../lib/fehler';
import { formatDatum, heuteIso } from '../../freizeiten/logik';
import { listeSchliesszeiten, loescheSchliesszeit, speichereSchliesszeit } from '../../treffs/api';
import { addTage, validiereSchliesszeit } from '../../treffs/dienstplan';
import { Sheet } from '../../components/Sheet';
import { Alert, Badge, Button, Spinner, TextField } from '../../components/ui';

const ZEITRAUM_TAGE = 365;
const zeitraum = (von: string, bis: string) => (von === bis ? formatDatum(von) : `${formatDatum(von)} – ${formatDatum(bis)}`);

interface Props {
  treffId: string;
  /** Vorbelegung „von“ und „bis“, z. B. der Tag aus dem Tagesfenster. */
  startDatum?: string;
  /** Nach dem Eintragen oder Löschen: Dienstplan neu laden. */
  geaendert: () => void;
  schliessen: () => void;
}

/**
 * Schließzeiten des Treffs direkt im Dienstplan (Treffleitung und Treffkoordination): eintragen und löschen.
 * An diesen Tagen wird weder eingeteilt noch gewünscht, kein Tagesprotokoll ist nötig; Sonderdienste bleiben möglich.
 */
export function SchliesszeitenSheet({ treffId, startDatum = '', geaendert, schliessen }: Props) {
  const heute = heuteIso();
  const liste = useLaden(() => listeSchliesszeiten(treffId, heute, addTage(heute, ZEITRAUM_TAGE)), `schliesszeiten-sheet-${treffId}`);
  const [s, setS] = useState({ von: startDatum, bis: startDatum, grund: '' });
  const [feldFehler, setFeldFehler] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [erfolg, setErfolg] = useState<string | null>(null);
  const [arbeitet, setArbeitet] = useState(false);

  async function aktion(fn: () => Promise<void>, text: string) {
    setFehler(null); setErfolg(null); setArbeitet(true);
    try { await fn(); setErfolg(text); liste.neuLaden(); geaendert(); } catch (e) { setFehler(fehlerText(e)); } finally { setArbeitet(false); }
  }

  function speichern(e: FormEvent) {
    e.preventDefault();
    const problem = validiereSchliesszeit(s);
    setFeldFehler(problem);
    if (problem) return;
    void aktion(async () => { await speichereSchliesszeit(treffId, s.von, s.bis, s.grund); setS({ von: '', bis: '', grund: '' }); },
      `Schließzeit ${zeitraum(s.von, s.bis)} eingetragen.`);
  }

  return (
    <Sheet titel="Schließzeiten" schliessen={schliessen}>
      <p className="field__hint">
        Ist der Treff geschlossen (z. B. Sommerpause, Fortbildung), wird an diesen Tagen weder eingeteilt noch gewünscht, es ist kein
        Tagesprotokoll nötig und es kommt keine Erinnerung. Sonderdienste bleiben möglich. Schon eingetragene Dienste bleiben stehen – nimm die Personen bei Bedarf im Tagesfenster heraus.
      </p>
      {fehler && <Alert ton="error">{fehler}</Alert>}
      {erfolg && <Alert ton="success">{erfolg}</Alert>}
      <form onSubmit={speichern} noValidate>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 150px' }}><TextField label="Geschlossen von" type="date" value={s.von} onChange={(e) => setS({ ...s, von: e.target.value, bis: s.bis || e.target.value })} /></div>
          <div style={{ flex: '1 1 150px' }}><TextField label="Geschlossen bis" type="date" value={s.bis} onChange={(e) => setS({ ...s, bis: e.target.value })} fehler={feldFehler ?? undefined} /></div>
        </div>
        <TextField label="Grund (optional)" value={s.grund} onChange={(e) => setS({ ...s, grund: e.target.value })} maxLength={200} />
        <Button variante="primary" type="submit" laedt={arbeitet}>Schließzeit eintragen</Button>
      </form>

      <h3>Aktuelle und kommende Schließzeiten</h3>
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
              onClick={() => { if (window.confirm(`Schließzeit ${zeitraum(x.von, x.bis)} löschen? Danach kann an diesen Tagen wieder eingeteilt werden.`)) void aktion(() => loescheSchliesszeit(x.id), 'Schließzeit gelöscht.'); }}>Löschen</Button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
