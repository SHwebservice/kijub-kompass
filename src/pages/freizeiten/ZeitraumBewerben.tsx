import { useState } from 'react';
import { useAuth } from '../../lib/auth-kontext';
import { useLaden } from '../../lib/laden';
import { fehlerText } from '../../lib/fehler';
import { sendePush } from '../../mitteilungen/senden';
import { meineZeitraumBewerbungen, zeitraumBewerben, zeitraumZurueckziehen, type FreizeitZeile } from '../../freizeiten/api';
import {
  bewerbungsJahre, FERIEN_LABEL, heuteIso, MAX_FERIENWOCHEN, passendeFreizeiten, zeitraumWahlText, type Ferienzeitraum,
} from '../../freizeiten/logik';
import { Alert, Badge, Button, Card, SelectField } from '../../components/ui';

/**
 * Für Mitarbeitende: sich für eine Ferienzeit (optional nur bestimmte Wochen) bewerben, ohne eine Freizeit zu wählen.
 * Die Freizeitenkoordination ordnet sie dann einer passenden Freizeit zu (Migration 0030).
 */
export function ZeitraumBewerben({ freizeiten }: { freizeiten: FreizeitZeile[] }) {
  const { ich } = useAuth();
  const heute = heuteIso();
  const jahre = bewerbungsJahre(heute);
  const meine = useLaden(async () => (ich ? meineZeitraumBewerbungen(ich.id) : []), `zeitraum-meine-${ich?.id}`);
  const [jahr, setJahr] = useState(jahre[0]!);
  const [zeit, setZeit] = useState<Ferienzeitraum>('sommer');
  const [wochen, setWochen] = useState<number[]>([]);
  const [notiz, setNotiz] = useState('');
  const [meldung, setMeldung] = useState<{ ton: 'success' | 'error'; text: string } | null>(null);
  const [arbeitet, setArbeitet] = useState(false);
  if (!ich) return null;

  const liste = meine.daten ?? [];
  const schonDa = liste.some((z) => z.jahr === jahr && z.ferienzeitraum === zeit);
  const passend = passendeFreizeiten({ jahr, ferienzeitraum: zeit, wochen }, freizeiten);
  const umschalten = (w: number, an: boolean) => setWochen((l) => (an ? [...l, w] : l.filter((x) => x !== w)).sort((a, b) => a - b));

  async function absenden() {
    setArbeitet(true); setMeldung(null);
    try {
      const id = await zeitraumBewerben(ich!.id, jahr, zeit, wochen, notiz);
      sendePush('bewerbung_zeitraum', id);
      setMeldung({ ton: 'success', text: `Deine Bewerbung für ${zeitraumWahlText({ jahr, ferienzeitraum: zeit, wochen })} ist eingegangen. Die Koordination ordnet dich einer Freizeit zu.` });
      setWochen([]); setNotiz('');
      meine.neuLaden();
    } catch (e) { setMeldung({ ton: 'error', text: fehlerText(e, 'Die Bewerbung konnte nicht gesendet werden.') }); } finally { setArbeitet(false); }
  }

  async function zurueckziehen(id: string, text: string) {
    if (!window.confirm(`Bewerbung für ${text} zurückziehen?`)) return;
    setMeldung(null);
    try { await zeitraumZurueckziehen(id); meine.neuLaden(); setMeldung({ ton: 'success', text: 'Die Bewerbung wurde zurückgezogen.' }); }
    catch (e) { setMeldung({ ton: 'error', text: fehlerText(e) }); }
  }

  return (
    <Card>
      <details open={liste.length > 0 || undefined}>
        <summary><h2 style={{ display: 'inline' }}>Für eine Ferienzeit bewerben</h2></summary>
        <p className="field__hint">Du weißt, wann du Zeit hast, aber nicht, welche Freizeit? Bewirb dich für eine Ferienzeit oder einzelne Wochen – die Koordination ordnet dich einer passenden Freizeit zu.</p>
        {meldung && <Alert ton={meldung.ton}>{meldung.text}</Alert>}

        {liste.length > 0 && (
          <ul className="list" aria-label="Meine Bewerbungen für Ferienzeiten" style={{ marginBottom: 'var(--space-3)' }}>
            {liste.map((z) => {
              const text = zeitraumWahlText(z);
              return (
                <li key={z.id} className="list__item">
                  <div className="list__main">
                    <div className="list__title">{text}</div>
                    <div className="list__meta">
                      {z.status === 'offen' ? <Badge ton="warning">Beworben</Badge> : <Badge ton="success">Bearbeitet</Badge>}
                      {z.notiz && <span>„{z.notiz}“</span>}
                    </div>
                  </div>
                  {z.status === 'offen' && <Button klein onClick={() => void zurueckziehen(z.id, text)}>Zurückziehen</Button>}
                </li>
              );
            })}
          </ul>
        )}

        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 120px' }}>
            <SelectField label="Jahr" value={String(jahr)} onChange={(e) => setJahr(Number(e.target.value))}>
              {jahre.map((j) => <option key={j} value={j}>{j}</option>)}
            </SelectField>
          </div>
          <div style={{ flex: '1 1 140px' }}>
            <SelectField label="Ferienzeit" value={zeit} onChange={(e) => { setZeit(e.target.value as Ferienzeitraum); setWochen([]); }}>
              {(Object.keys(FERIEN_LABEL) as Ferienzeitraum[]).map((k) => <option key={k} value={k}>{FERIEN_LABEL[k]}</option>)}
            </SelectField>
          </div>
        </div>
        <fieldset className="optionen">
          <legend className="field__label">Welche Wochen?</legend>
          <div className="row">
            {Array.from({ length: MAX_FERIENWOCHEN[zeit] }, (_, i) => i + 1).map((w) => (
              <label key={w} className="option">
                <input type="checkbox" checked={wochen.includes(w)} onChange={(e) => umschalten(w, e.target.checked)} />
                <span>Woche {w}</span>
              </label>
            ))}
          </div>
          <p className="field__hint">Keine Woche angekreuzt = jede Woche der {FERIEN_LABEL[zeit]}ferien.
            {' '}{passend.length === 0 ? 'Für diese Zeit ist noch keine Freizeit angelegt – du kannst dich trotzdem schon bewerben.' : `Passende Freizeiten: ${passend.map((f) => f.name).join(', ')}.`}</p>
        </fieldset>
        <div className="field">
          <label className="field__label" htmlFor="zeitraum-notiz">Nachricht zu dieser Bewerbung (optional)</label>
          <textarea id="zeitraum-notiz" className="input" rows={2} value={notiz} maxLength={2000} onChange={(e) => setNotiz(e.target.value)}
            placeholder="z. B. Wunschfreizeit, mit wem du gern zusammenarbeitest, Erfahrung" style={{ padding: 'var(--space-3)' }} />
        </div>
        {schonDa && <p className="field__hint">Für {FERIEN_LABEL[zeit]} {jahr} hast du dich schon beworben. Zum Ändern zurückziehen und neu bewerben.</p>}
        <Button variante="primary" laedt={arbeitet} disabled={schonDa} onClick={() => void absenden()}>Für {zeitraumWahlText({ jahr, ferienzeitraum: zeit, wochen })} bewerben</Button>
      </details>
    </Card>
  );
}
