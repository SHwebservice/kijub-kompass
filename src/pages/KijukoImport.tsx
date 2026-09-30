import { useState, type ChangeEvent } from 'react';
import { supabase } from '../lib/supabase';
import { baueImportPlan, ImportFormatFehler, sha256Hex, type ImportPlan } from '../import/kijuko';
import {
  ARTEN, feldLabel, hatAenderungen, summe, wertText, type Entscheidungen, type ImportErgebnis,
} from '../import/ergebnis';
import { Alert, Badge, Button, Card, PageHeader, Spinner } from '../components/ui';

export interface DateiInfo { name: string; sha256: string }

interface Props {
  /** Probelauf: liefert, was der Import tun würde, ohne etwas zu verändern. */
  vorschau: (plan: ImportPlan, entscheidungen: Entscheidungen) => Promise<ImportErgebnis>;
  /** Verbindlicher Lauf. */
  anwenden: (plan: ImportPlan, entscheidungen: Entscheidungen, datei: DateiInfo) => Promise<ImportErgebnis>;
}

type Phase = 'start' | 'laedt' | 'vorschau' | 'fertig';

function Zaehlertabelle({ e }: { e: ImportErgebnis }) {
  return (
    <div className="tabelle-wrap">
      <table className="tabelle">
        <caption className="sr-only">Zusammenfassung des Imports</caption>
        <thead>
          <tr><th scope="col">Bereich</th><th scope="col">Neu</th><th scope="col">Geändert</th><th scope="col">Unverändert</th><th scope="col">Entfernt</th></tr>
        </thead>
        <tbody>
          {ARTEN.map((a) => {
            const s = summe(e.zaehler[a.schluessel]);
            return (
              <tr key={a.schluessel}>
                <th scope="row">{a.label}</th><td>{s.neu}</td><td>{s.geaendert}</td><td>{s.unveraendert}</td><td>{s.weg}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Koordination: KiJuKo-Sicherung einlesen, Vorschau prüfen, Konflikte entscheiden, übernehmen. */
export function KijukoImport({ vorschau, anwenden }: Props) {
  const [phase, setPhase] = useState<Phase>('start');
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [datei, setDatei] = useState<DateiInfo | null>(null);
  const [ergebnis, setErgebnis] = useState<ImportErgebnis | null>(null);
  const [entscheidungen, setEntscheidungen] = useState<Entscheidungen>({});
  const [entfernen, setEntfernen] = useState<Set<string>>(new Set());
  const [fehler, setFehler] = useState<string | null>(null);

  const alle = (): Entscheidungen => {
    const e: Entscheidungen = { ...entscheidungen };
    entfernen.forEach((k) => { e[k] = 'kijuko'; });
    return e;
  };

  async function dateiGewaehlt(ev: ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0];
    if (!f) return;
    setFehler(null); setPhase('laedt');
    try {
      const daten = await f.arrayBuffer();
      const roh: unknown = JSON.parse(new TextDecoder('utf-8').decode(daten));
      const p = baueImportPlan(roh);
      const info = { name: f.name, sha256: await sha256Hex(daten) };
      const e = await vorschau(p, {});
      setPlan(p); setDatei(info); setErgebnis(e); setEntscheidungen({}); setEntfernen(new Set()); setPhase('vorschau');
    } catch (err) {
      setPhase('start');
      setFehler(err instanceof ImportFormatFehler ? err.message
        : err instanceof SyntaxError ? 'Die Datei ist keine gültige JSON-Datei.'
        : 'Die Datei konnte nicht geprüft werden. Bitte erneut versuchen.');
    }
  }

  async function uebernehmen() {
    if (!plan || !datei) return;
    setFehler(null); setPhase('laedt');
    try {
      setErgebnis(await anwenden(plan, alle(), datei));
      setPhase('fertig');
    } catch {
      setPhase('vorschau');
      setFehler('Der Import ist fehlgeschlagen. Es wurde nichts verändert. Bitte die Vorschau erneut prüfen.');
    }
  }

  function zuruecksetzen() {
    setPhase('start'); setPlan(null); setDatei(null); setErgebnis(null); setEntscheidungen({}); setEntfernen(new Set()); setFehler(null);
  }

  const zuteilungenEntfallen = ergebnis?.entfallen.filter((x) => x.art === 'Zuteilung') ?? [];
  const sonstigeEntfallen = ergebnis?.entfallen.filter((x) => x.art !== 'Zuteilung') ?? [];

  return (
    <>
      <PageHeader titel="KiJuKo-Import" />
      {fehler && <Alert ton="error">{fehler}</Alert>}

      {phase === 'start' && (
        <Card>
          <h2>Sicherung einlesen</h2>
          <p>Wähle die Sicherungsdatei aus KiJuKo (<code>KiJuKo-Backup-….json</code>). Die Datei wird zuerst nur geprüft –
            verändert wird erst, wenn du die Vorschau bestätigst. Nur die Angaben, die der Kompass braucht, werden übertragen
            (keine Adressen, Geburtsdaten oder Zugangscodes).</p>
          <div className="field">
            <label className="field__label" htmlFor="kijuko-datei">KiJuKo-Sicherung (.json)</label>
            <input id="kijuko-datei" className="input" type="file" accept=".json,application/json" onChange={(e) => void dateiGewaehlt(e)} />
          </div>
        </Card>
      )}

      {phase === 'laedt' && <Card><Spinner beschriftung="Wird geprüft …" /> Bitte warten …</Card>}

      {(phase === 'vorschau' || phase === 'fertig') && ergebnis && (
        <div className="stack">
          <Card>
            <h2>{phase === 'fertig' ? 'Import abgeschlossen' : 'Vorschau'}</h2>
            <p className="row" style={{ gap: 'var(--space-2)' }}>
              <Badge>{datei?.name}</Badge>
              {phase === 'vorschau' && <Badge ton="warning">Noch nichts verändert</Badge>}
              {phase === 'fertig' && <Badge ton="success">Gespeichert</Badge>}
            </p>
            {phase === 'fertig' && <Alert ton="success">Der Import wurde übernommen und im Protokoll festgehalten.</Alert>}
            <Zaehlertabelle e={ergebnis} />
            {!hatAenderungen(ergebnis) && <p>Es gibt keine Änderungen – der Kompass ist auf dem Stand der Sicherung.</p>}
          </Card>

          {ergebnis.konflikte.length > 0 && (
            <Card>
              <h2>Konflikte ({ergebnis.konflikte.length})</h2>
              <p>Diese Angaben wurden in KiJuKo <strong>und</strong> im Kompass unterschiedlich geändert. Ohne Entscheidung bleibt der Kompass-Wert
                und der Konflikt erscheint beim nächsten Import erneut.</p>
              <ul className="list">
                {ergebnis.konflikte.map((k) => (
                  <li key={k.schluessel} className="list__item" style={{ display: 'block' }}>
                    <fieldset className="optionen" disabled={phase === 'fertig'}>
                      <legend><strong>{k.name}</strong> · {feldLabel(k.feld)}</legend>
                      <label className="option">
                        <input type="radio" name={k.schluessel} checked={!entscheidungen[k.schluessel]}
                          onChange={() => setEntscheidungen(({ [k.schluessel]: _weg, ...rest }) => rest)} />
                        <span>Später entscheiden</span>
                      </label>
                      <label className="option">
                        <input type="radio" name={k.schluessel} checked={entscheidungen[k.schluessel] === 'kompass'}
                          onChange={() => setEntscheidungen((e) => ({ ...e, [k.schluessel]: 'kompass' }))} />
                        <span>Kompass behalten: <strong>{wertText(k.kompass)}</strong></span>
                      </label>
                      <label className="option">
                        <input type="radio" name={k.schluessel} checked={entscheidungen[k.schluessel] === 'kijuko'}
                          onChange={() => setEntscheidungen((e) => ({ ...e, [k.schluessel]: 'kijuko' }))} />
                        <span>KiJuKo übernehmen: <strong>{wertText(k.kijuko)}</strong></span>
                      </label>
                    </fieldset>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {(zuteilungenEntfallen.length > 0 || sonstigeEntfallen.length > 0) && (
            <Card>
              <h2>In KiJuKo nicht mehr vorhanden ({ergebnis.entfallen.length})</h2>
              <p>Nichts davon wird automatisch gelöscht. Personen und Freizeiten werden nur markiert und bleiben erhalten.</p>
              {zuteilungenEntfallen.length > 0 && (
                <>
                  <h3>Zuteilungen</h3>
                  <ul className="list">
                    {zuteilungenEntfallen.map((x) => (
                      <li key={x.schluessel} className="list__item">
                        <label className="row" style={{ gap: 'var(--space-3)' }}>
                          <input type="checkbox" disabled={phase === 'fertig'} checked={entfernen.has(x.schluessel)}
                            onChange={(e) => setEntfernen((s) => { const n = new Set(s); if (e.target.checked) n.add(x.schluessel); else n.delete(x.schluessel); return n; })} />
                          <span>{x.name} – aus dem Kompass entfernen</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {sonstigeEntfallen.length > 0 && (
                <>
                  <h3>Personen und Freizeiten (nur markiert)</h3>
                  <ul className="list">
                    {sonstigeEntfallen.map((x) => (
                      <li key={x.schluessel} className="list__item"><span>{x.name}</span><Badge>{x.art}</Badge></li>
                    ))}
                  </ul>
                </>
              )}
            </Card>
          )}

          {ergebnis.aenderungen.length > 0 && (
            <Card>
              <h2>Geänderte Angaben ({ergebnis.aenderungen.length})</h2>
              <details>
                <summary>Einzelheiten anzeigen</summary>
                <ul className="list" style={{ marginTop: 'var(--space-3)' }}>
                  {ergebnis.aenderungen.map((a, i) => (
                    <li key={`${a.art}-${a.name}-${i}`} className="list__item" style={{ display: 'block' }}>
                      <div className="list__title">{a.name} <Badge>{a.art}</Badge></div>
                      <ul style={{ margin: 'var(--space-1) 0 0', paddingLeft: 'var(--space-5)' }}>
                        {a.felder.map((f) => <li key={f.feld}>{feldLabel(f.feld)}: {wertText(f.von)} → <strong>{wertText(f.nach)}</strong></li>)}
                      </ul>
                    </li>
                  ))}
                </ul>
              </details>
            </Card>
          )}

          {(ergebnis.hinweise.length > 0 || ergebnis.uebersprungen.length > 0) && (
            <Card>
              {ergebnis.uebersprungen.length > 0 && (
                <>
                  <h2>Übersprungen ({ergebnis.uebersprungen.length})</h2>
                  <ul className="list">
                    {ergebnis.uebersprungen.map((u, i) => (
                      <li key={i} className="list__item"><span><strong>{u.name}</strong> – {u.grund}</span><Badge>{u.art}</Badge></li>
                    ))}
                  </ul>
                </>
              )}
              {ergebnis.hinweise.length > 0 && (
                <>
                  <h2 style={{ marginTop: 'var(--space-4)' }}>Hinweise ({ergebnis.hinweise.length})</h2>
                  <ul>{ergebnis.hinweise.map((h, i) => <li key={i}>{h}</li>)}</ul>
                </>
              )}
            </Card>
          )}

          <div className="row">
            {phase === 'vorschau' && <Button variante="primary" onClick={() => void uebernehmen()}>Import durchführen</Button>}
            <Button onClick={zuruecksetzen}>{phase === 'fertig' ? 'Weitere Datei einlesen' : 'Abbrechen'}</Button>
          </div>
        </div>
      )}
    </>
  );
}

/** Anbindung an Supabase. */
export function KijukoImportSeite() {
  const rufen = async (plan: ImportPlan, anwendenJa: boolean, entscheidungen: Entscheidungen, datei?: DateiInfo) => {
    const { data, error } = await supabase.rpc('fn_kijuko_import', {
      p_plan: plan, p_anwenden: anwendenJa, p_entscheidungen: entscheidungen, p_datei: datei ?? {},
    });
    if (error) throw error;
    return data as ImportErgebnis;
  };
  return (
    <KijukoImport
      vorschau={(p, e) => rufen(p, false, e)}
      anwenden={(p, e, d) => rufen(p, true, e, d)}
    />
  );
}
