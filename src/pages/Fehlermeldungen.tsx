import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLaden } from '../lib/laden';
import { fehlerText } from '../lib/fehler';
import { formatDatum } from '../freizeiten/logik';
import { listeFehlermeldungen, loescheErledigteFehler, loescheFehlermeldung, setzeFehlerErledigt } from '../fehlermeldungen/api';
import { Alert, Badge, Button, Card, EmptyState, PageHeader, Spinner } from '../components/ui';

const zeit = (iso: string) => `${formatDatum(iso.slice(0, 10))} ${iso.slice(11, 16)}`;

/** Koordination: Fehler, die die App selbst gemeldet hat – ohne Personendaten, gleiche Fehler gezählt. */
export function Fehlermeldungen() {
  const liste = useLaden(listeFehlermeldungen, 'fehlermeldungen');
  const [erledigteZeigen, setErledigteZeigen] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  async function lauf(aktion: () => Promise<void>) {
    setFehler(null);
    try { await aktion(); liste.neuLaden(); } catch (e) { setFehler(fehlerText(e)); }
  }

  const alle = liste.daten ?? [];
  const offen = alle.filter((f) => !f.erledigt);
  const sichtbar = erledigteZeigen ? alle : offen;

  return (
    <>
      <p><Link to="/mehr">← Mehr</Link></p>
      <PageHeader titel="Fehlermeldungen" />
      <p className="field__hint">Wenn in der App etwas Unerwartetes schiefgeht, meldet sie das hierher – ohne Namen und ohne Kennungen. Gleiche Fehler werden gezählt. Nach 90 Tagen ohne Wiederholung verschwinden sie von selbst.</p>
      {(liste.fehler || fehler) && <Alert ton="error">{liste.fehler ?? fehler}</Alert>}
      {liste.laedt && <Spinner />}
      {!liste.laedt && offen.length === 0 && <EmptyState icon="🎉" titel="Keine offenen Fehlermeldungen">Es ist nichts Unerwartetes aufgefallen.</EmptyState>}

      <div className="row" style={{ marginBottom: 'var(--space-3)' }}>
        <label className="option">
          <input type="checkbox" checked={erledigteZeigen} onChange={(e) => setErledigteZeigen(e.target.checked)} />
          <span>Erledigte zeigen ({alle.length - offen.length})</span>
        </label>
        {alle.length - offen.length > 0 && (
          <Button klein onClick={() => { if (window.confirm('Alle erledigten Fehlermeldungen löschen?')) void lauf(loescheErledigteFehler); }}>Erledigte löschen</Button>
        )}
      </div>

      <ul className="list" aria-label="Fehlermeldungen">
        {sichtbar.map((f) => (
          <li key={f.id} className="list__item" style={{ display: 'block' }}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div className="list__main" style={{ flex: 1, whiteSpace: 'normal' }}>
                <div className="list__title" style={{ whiteSpace: 'normal', fontFamily: 'var(--font-mono, monospace)' }}>{f.meldung}</div>
                <div className="list__meta">
                  <span>Seite {f.seite}</span>
                  <span>Version {f.version}</span>
                  <span>zuletzt {zeit(f.zuletzt)}</span>
                  <span>erstmals {zeit(f.erstmals)}</span>
                </div>
              </div>
              <div className="row" style={{ gap: 'var(--space-2)' }}>
                <Badge ton={f.erledigt ? 'success' : f.anzahl > 5 ? 'danger' : 'warning'}>{f.anzahl}× {f.erledigt && '· erledigt'}</Badge>
              </div>
            </div>
            {f.stapel && (
              <details>
                <summary>Technische Einzelheiten</summary>
                <pre style={{ whiteSpace: 'pre-wrap', fontSize: 'var(--fs-sm)' }}>{f.stapel}</pre>
              </details>
            )}
            <div className="row" style={{ marginTop: 'var(--space-2)' }}>
              <Button klein onClick={() => void lauf(() => setzeFehlerErledigt(f.id, !f.erledigt))}>{f.erledigt ? 'Wieder öffnen' : 'Erledigt'}</Button>
              <Button klein variante="ghost" onClick={() => void lauf(() => loescheFehlermeldung(f.id))} aria-label={`Fehlermeldung „${f.meldung}“ löschen`}>Löschen</Button>
            </div>
          </li>
        ))}
      </ul>
      <Card><p className="field__hint" style={{ margin: 0 }}>Tipp: Bitte keine Fehlermeldungen mit Personenbezug weitergeben – hier steht nur Technisches.</p></Card>
    </>
  );
}
