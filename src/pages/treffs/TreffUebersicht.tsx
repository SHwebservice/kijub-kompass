import { useState } from 'react';
import { fehlerText } from '../../lib/fehler';
import { setzeWochenprogramm, type TreffDetailDaten } from '../../treffs/api';
import { darfTreffVerwalten, oeffnungszeitText, wochentagName } from '../../treffs/logik';
import type { RolleInTreff } from '../../lib/rollen';
import { Alert, Button, Card } from '../../components/ui';

function Zeile({ label, wert }: { label: string; wert: React.ReactNode }) {
  if (wert === null || wert === undefined || wert === '') return null;
  return (<><dt>{label}</dt><dd>{wert}</dd></>);
}

/** Stammdaten, Öffnungszeiten und das feste Wochenprogramm (ein Freitext, den Treffleitung und Koordination pflegen). */
export function TreffUebersicht({ treff: t, rolle }: { treff: TreffDetailDaten; rolle: RolleInTreff }) {
  const verwaltung = darfTreffVerwalten(rolle);
  const [programm, setProgramm] = useState(t.wochenprogramm ?? '');
  const [entwurf, setEntwurf] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [arbeitet, setArbeitet] = useState(false);

  async function speichern(text: string) {
    setArbeitet(true); setFehler(null);
    try { await setzeWochenprogramm(t.id, text); setProgramm(text.trim()); setEntwurf(null); }
    catch (e) { setFehler(fehlerText(e, 'Das Wochenprogramm konnte nicht gespeichert werden.')); }
    finally { setArbeitet(false); }
  }

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

        <h3>Wochenprogramm</h3>
        {fehler && <Alert ton="error">{fehler}</Alert>}
        {entwurf !== null ? (
          <div className="stack">
            <div className="field">
              <label className="field__label" htmlFor="wochenprogramm">Festes Programm, das sich jede Woche wiederholt</label>
              <textarea id="wochenprogramm" className="input" rows={6} maxLength={4000} value={entwurf} onChange={(e) => setEntwurf(e.target.value)}
                style={{ padding: 'var(--space-3)' }} />
            </div>
            <div className="row">
              <Button variante="primary" laedt={arbeitet} disabled={entwurf.trim() === programm} onClick={() => void speichern(entwurf)}>Speichern</Button>
              <Button disabled={arbeitet} onClick={() => { setEntwurf(null); setFehler(null); }}>Abbrechen</Button>
            </div>
          </div>
        ) : (
          <>
            {programm ? <p style={{ whiteSpace: 'pre-line' }}>{programm}</p> : <p className="field__hint">Noch kein Wochenprogramm eingetragen.</p>}
            {verwaltung && <Button klein onClick={() => { setFehler(null); setEntwurf(programm); }}>{programm ? 'Bearbeiten' : 'Eintragen'}</Button>}
          </>
        )}
      </Card>
    </div>
  );
}
