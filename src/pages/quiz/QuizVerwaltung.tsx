import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useLaden } from '../../lib/laden';
import { fehlerText } from '../../lib/fehler';
import { holeNamen } from '../../freizeiten/api';
import { alleErgebnisse, listeFragen, loescheFrage, speichereFrage, uebernimmStandardfragen } from '../../quiz/api';
import {
  bereinigeFrage, fragenZu, MAX_ANTWORTEN, prozent, themaVon, THEMEN, validiereFrage, type Frage, type FrageEingabe, type ThemaId,
} from '../../quiz/logik';
import { Alert, Badge, Button, Card, EmptyState, PageHeader, SelectField, Spinner, TextField } from '../../components/ui';

const leereFrage = (thema: ThemaId): FrageEingabe => ({ thema, frage: '', antworten: ['', '', '', ''], korrekt: [], erklaerung: '' });

/** Koordination: Quiz-Fragen pflegen und die Bestwerte der Personen ansehen. */
export function QuizVerwaltung() {
  const fragen = useLaden(listeFragen, 'quiz-fragen');
  const ergebnisse = useLaden(alleErgebnisse, 'quiz-ergebnisse');
  const ids = [...new Set((ergebnisse.daten ?? []).map((e) => e.person_id))].sort();
  const namen = useLaden(() => holeNamen(ids), `quiz-namen-${ids.join(',')}`);
  const [thema, setThema] = useState<ThemaId>(THEMEN[0]!.id);
  const [form, setForm] = useState<{ id: string | null; werte: FrageEingabe } | null>(null);
  const [feld, setFeld] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [erfolg, setErfolg] = useState<string | null>(null);
  const [arbeitet, setArbeitet] = useState(false);

  const stand = fragen.daten;
  const inThema = fragenZu(stand?.fragen ?? [], thema);

  async function lauf(fn: () => Promise<void>, ok?: string) {
    setFehler(null); setErfolg(null); setArbeitet(true);
    try { await fn(); if (ok) setErfolg(ok); fragen.neuLaden(); } catch (e) { setFehler(fehlerText(e, 'Das hat nicht geklappt.')); } finally { setArbeitet(false); }
  }

  function oeffne(f: Frage | null) {
    setFeld(null); setFehler(null); setErfolg(null);
    if (!f) { setForm({ id: null, werte: leereFrage(thema) }); return; }
    const antworten = [...f.antworten, ...Array(Math.max(0, 4 - f.antworten.length)).fill('')];
    setForm({ id: f.id, werte: { thema: f.thema, frage: f.frage, antworten, korrekt: f.korrekt, erklaerung: f.erklaerung } });
  }

  async function speichern(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    const sauber = bereinigeFrage(form.werte);
    const problem = validiereFrage(sauber);
    setFeld(problem);
    if (problem) return;
    // Die vorhandenen Standardfragen sind nur Vorschläge (noch nicht in der Datenbank): erst übernehmen, dann ändern wäre unklar –
    // deshalb wird eine geänderte Standardfrage als neue Frage angelegt.
    const echteId = form.id && !form.id.startsWith('standard-') ? form.id : null;
    await lauf(async () => { await speichereFrage(echteId, sauber); setForm(null); }, 'Gespeichert.');
  }

  return (
    <>
      <p><Link to="/quiz">← Quiz</Link></p>
      <PageHeader titel="Quiz-Fragen verwalten" />
      {(fragen.fehler || ergebnisse.fehler || fehler) && <Alert ton="error">{fragen.fehler ?? ergebnisse.fehler ?? fehler}</Alert>}
      {erfolg && <Alert ton="success">{erfolg}</Alert>}
      {fragen.laedt && <Spinner />}

      {stand?.standard && (
        <Alert ton="warning">
          Die Datenbank enthält noch keine eigenen Fragen – es gelten die 35 Standardfragen.
          {' '}<Button klein disabled={arbeitet} onClick={() => void lauf(uebernimmStandardfragen, 'Die Standardfragen wurden übernommen und lassen sich jetzt ändern.')}>Standardfragen übernehmen</Button>
        </Alert>
      )}

      <div className="tabs" role="tablist" aria-label="Thema">
        {THEMEN.map((t) => (
          <button key={t.id} role="tab" aria-selected={t.id === thema} className="tabs__tab" onClick={() => { setThema(t.id); setForm(null); }}>{t.label}</button>
        ))}
      </div>

      {!form && (
        <div className="stack">
          <p><Button variante="primary" onClick={() => oeffne(null)}>+ Neue Frage</Button></p>
          {!fragen.laedt && inThema.length === 0 && <EmptyState icon="❓" titel="Keine Fragen in diesem Thema" />}
          <ul className="list">
            {inThema.map((f) => (
              <li key={f.id} className="list__item">
                <div className="list__main">
                  <div className="list__title">{f.frage}</div>
                  <div className="list__meta">
                    <span>{f.antworten.length} Antworten</span>
                    {f.korrekt.length > 1 && <Badge>Mehrfachauswahl</Badge>}
                  </div>
                </div>
                <div className="row" style={{ gap: 'var(--space-2)' }}>
                  <Button klein aria-label={`Frage bearbeiten: ${f.frage}`} onClick={() => oeffne(f)}>Bearbeiten</Button>
                  {!f.id.startsWith('standard-') && (
                    <Button klein variante="danger" aria-label={`Frage löschen: ${f.frage}`}
                      onClick={() => { if (window.confirm('Diese Frage löschen?')) void lauf(() => loescheFrage(f.id), 'Gelöscht.'); }}>Löschen</Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {form && (
        <Card>
          <h2>{form.id ? 'Frage bearbeiten' : 'Neue Frage'}</h2>
          <form onSubmit={(e) => void speichern(e)} noValidate>
            {feld && <Alert ton="error">{feld}</Alert>}
            <SelectField label="Thema" value={form.werte.thema} onChange={(e) => setForm({ ...form, werte: { ...form.werte, thema: e.target.value as ThemaId } })}>
              {THEMEN.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </SelectField>
            <div className="field">
              <label className="field__label" htmlFor="quiz-frage">Frage</label>
              <textarea id="quiz-frage" className="input" rows={2} value={form.werte.frage} style={{ padding: 'var(--space-3)' }}
                onChange={(e) => setForm({ ...form, werte: { ...form.werte, frage: e.target.value } })} />
            </div>
            <fieldset className="optionen">
              <legend className="field__label">Antworten – Häkchen bei den richtigen (mehrere möglich)</legend>
              {form.werte.antworten.map((a, i) => (
                <div key={i} className="row" style={{ alignItems: 'center', flexWrap: 'nowrap' }}>
                  <input type="checkbox" aria-label={`Antwort ${i + 1} ist richtig`} checked={form.werte.korrekt.includes(i)}
                    onChange={(e) => setForm({ ...form, werte: { ...form.werte, korrekt: e.target.checked ? [...form.werte.korrekt, i] : form.werte.korrekt.filter((k) => k !== i) } })} />
                  <input className="input" aria-label={`Antwort ${i + 1}`} value={a}
                    onChange={(e) => setForm({ ...form, werte: { ...form.werte, antworten: form.werte.antworten.map((x, j) => (j === i ? e.target.value : x)) } })} />
                </div>
              ))}
            </fieldset>
            {form.werte.antworten.length < MAX_ANTWORTEN && (
              <p><Button klein onClick={() => setForm({ ...form, werte: { ...form.werte, antworten: [...form.werte.antworten, ''] } })}>+ Antwort hinzufügen</Button></p>
            )}
            <TextField label="Erklärung (wird nach der Antwort gezeigt)" value={form.werte.erklaerung} maxLength={600}
              onChange={(e) => setForm({ ...form, werte: { ...form.werte, erklaerung: e.target.value } })} />
            <div className="row">
              <Button variante="primary" type="submit" laedt={arbeitet}>Speichern</Button>
              <Button onClick={() => setForm(null)}>Abbrechen</Button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        <h2>Bestwerte der Personen</h2>
        {ergebnisse.laedt && <Spinner />}
        {!ergebnisse.laedt && (ergebnisse.daten?.length ?? 0) === 0 && <p>Noch hat niemand ein Quiz abgeschlossen.</p>}
        {(ergebnisse.daten?.length ?? 0) > 0 && (
          <table className="tabelle">
            <thead><tr><th scope="col">Person</th><th scope="col">Thema</th><th scope="col">Bestwert</th></tr></thead>
            <tbody>
              {[...ergebnisse.daten!]
                .sort((a, b) => (namen.daten?.[a.person_id] ?? '').localeCompare(namen.daten?.[b.person_id] ?? '', 'de') || a.thema.localeCompare(b.thema))
                .map((e) => (
                  <tr key={`${e.person_id}-${e.thema}`}>
                    <th scope="row">{namen.daten?.[e.person_id] ?? 'Jemand'}</th>
                    <td>{themaVon(e.thema)?.label ?? e.thema}</td>
                    <td>{e.bester_wert}/{e.gesamt} ({prozent(e.bester_wert, e.gesamt)} %)</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
