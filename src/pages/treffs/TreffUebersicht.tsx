import { useState } from 'react';
import { fehlerText } from '../../lib/fehler';
import { setzeWochenprogrammTag, type TreffDetailDaten } from '../../treffs/api';
import { darfTreffVerwalten, oeffnungszeitText, wochentagName } from '../../treffs/logik';
import type { RolleInTreff } from '../../lib/rollen';
import { Alert, Button, Card } from '../../components/ui';

function Zeile({ label, wert }: { label: string; wert: React.ReactNode }) {
  if (wert === null || wert === undefined || wert === '') return null;
  return (<><dt>{label}</dt><dd>{wert}</dd></>);
}

/** Stammdaten und Öffnungszeiten; bei jedem Öffnungstag steht sein festes Wochenprogramm (Freitext, pflegen Treffleitung und Koordination). */
export function TreffUebersicht({ treff: t, rolle }: { treff: TreffDetailDaten; rolle: RolleInTreff }) {
  const verwaltung = darfTreffVerwalten(rolle);
  const [programm, setProgramm] = useState<Record<number, string>>(t.wochenprogramm);
  const [entwurf, setEntwurf] = useState<Record<number, string> | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [arbeitet, setArbeitet] = useState(false);

  const geaendert = entwurf ? t.oeffnungszeiten.filter((o) => (entwurf[o.wochentag] ?? '').trim() !== (programm[o.wochentag] ?? '')) : [];

  async function speichern() {
    if (!entwurf) return;
    setArbeitet(true); setFehler(null);
    const neu = { ...programm };
    try {
      for (const o of geaendert) {
        const text = (entwurf[o.wochentag] ?? '').trim();
        await setzeWochenprogrammTag(t.id, o.wochentag, text);
        if (text) neu[o.wochentag] = text; else delete neu[o.wochentag];
      }
      setEntwurf(null);
    } catch (e) { setFehler(fehlerText(e, 'Das Wochenprogramm konnte nicht gespeichert werden.')); }
    finally { setProgramm(neu); setArbeitet(false); }
  }

  return (
    <div className="stack">
      <Card>
        <h2>Stammdaten</h2>
        <dl className="daten">
          <Zeile label="Ort" wert={t.ort_name} />
          <Zeile label="Adresse" wert={t.ort_adresse ?? t.adresse_abw} />
        </dl>
        <h3>Öffnungszeiten und Wochenprogramm</h3>
        {fehler && <Alert ton="error">{fehler}</Alert>}
        {t.oeffnungszeiten.length === 0 ? <p>Keine Öffnungstage eingetragen.</p> : entwurf ? (
          <div className="stack">
            {t.oeffnungszeiten.map((o) => (
              <div key={o.wochentag} className="field">
                <label className="field__label" htmlFor={`programm-${o.wochentag}`}>{wochentagName(o.wochentag)} · {oeffnungszeitText(o)}</label>
                <textarea id={`programm-${o.wochentag}`} className="input" rows={2} maxLength={2000} placeholder="Festes Programm an diesem Tag"
                  value={entwurf[o.wochentag] ?? ''} onChange={(e) => setEntwurf({ ...entwurf, [o.wochentag]: e.target.value })}
                  style={{ padding: 'var(--space-3)' }} />
              </div>
            ))}
            <div className="row">
              <Button variante="primary" laedt={arbeitet} disabled={geaendert.length === 0} onClick={() => void speichern()}>Speichern</Button>
              <Button disabled={arbeitet} onClick={() => { setEntwurf(null); setFehler(null); }}>Abbrechen</Button>
            </div>
          </div>
        ) : (
          <>
            <dl className="daten">
              {t.oeffnungszeiten.map((o) => (
                <Zeile key={o.wochentag} label={wochentagName(o.wochentag)} wert={
                  <>
                    {oeffnungszeitText(o)}
                    {programm[o.wochentag] && <div style={{ whiteSpace: 'pre-line' }}>{programm[o.wochentag]}</div>}
                  </>
                } />
              ))}
            </dl>
            {verwaltung && <Button klein onClick={() => { setFehler(null); setEntwurf({ ...programm }); }}>Programm bearbeiten</Button>}
          </>
        )}
      </Card>
    </div>
  );
}
