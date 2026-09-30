import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../lib/auth-kontext';
import { useLaden } from '../../lib/laden';
import { fehlerText } from '../../lib/fehler';
import { listeFragen, meineBestwerte, meldeErgebnis, type Bestwert } from '../../quiz/api';
import {
  anzahlJeThema, ergebnisText, fragenZu, istMehrfach, istRichtig, markierung, mischeAntworten, mischen, prozent, THEMEN,
  type Antwort, type Frage, type Thema, type Zufall,
} from '../../quiz/logik';
import { Alert, Badge, Button, Card, EmptyState, PageHeader, Spinner } from '../../components/ui';

interface Lauf { thema: Thema; fragen: Frage[]; index: number; richtig: number }

const SYMBOL = { richtig: '✓', falsch: '✗', verpasst: '✓', neutral: '' } as const;

/** Quiz zu den Themen der Teamermappe: Fragen mit einer oder mehreren richtigen Antworten, Erklärung, Ergebnis und persönlicher Bestwert. */
export function QuizSeite({ zufall = Math.random }: { zufall?: Zufall }) {
  const { ich, rollen } = useAuth();
  const fragen = useLaden(listeFragen, 'quiz-fragen');
  const bestwerte = useLaden(async () => (ich ? meineBestwerte(ich.id) : []), `quiz-best-${ich?.id ?? ''}`);
  const [lauf, setLauf] = useState<Lauf | null>(null);
  const [antworten, setAntworten] = useState<Antwort[]>([]);
  const [gewaehlt, setGewaehlt] = useState<number[]>([]);
  const [ausgewertet, setAusgewertet] = useState(false);
  const [fertig, setFertig] = useState<{ thema: Thema; richtig: number; gesamt: number; neuerBestwert: boolean } | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  if (!ich || !rollen) return null;

  const alle = fragen.daten?.fragen ?? [];
  const jeThema = anzahlJeThema(alle);
  const bestVon = (id: string): Bestwert | undefined => bestwerte.daten?.find((b) => b.thema === id);

  function zeigeFrage(l: Lauf) {
    setLauf(l); setGewaehlt([]); setAusgewertet(false);
    setAntworten(mischeAntworten(l.fragen[l.index]!, zufall));
  }

  function starten(t: Thema) {
    const f = fragenZu(alle, t.id);
    if (f.length === 0) { setMeldung('Für dieses Thema gibt es noch keine Fragen.'); return; }
    setMeldung(null); setFehler(null); setFertig(null);
    zeigeFrage({ thema: t, fragen: mischen(f, zufall), index: 0, richtig: 0 });
  }

  function auswerten(auswahl: number[]) {
    if (!lauf || ausgewertet) return;
    setGewaehlt(auswahl); setAusgewertet(true);
    if (istRichtig(antworten, auswahl)) setLauf({ ...lauf, richtig: lauf.richtig + 1 });
  }

  function antippen(i: number) {
    if (ausgewertet || !lauf) return;
    if (istMehrfach(lauf.fragen[lauf.index]!)) setGewaehlt((g) => (g.includes(i) ? g.filter((x) => x !== i) : [...g, i]));
    else auswerten([i]);
  }

  async function weiter() {
    if (!lauf) return;
    if (lauf.index + 1 < lauf.fragen.length) { zeigeFrage({ ...lauf, index: lauf.index + 1 }); return; }
    const gesamt = lauf.fragen.length;
    let neu = false;
    try { neu = await meldeErgebnis(ich!.id, lauf.thema.id, lauf.richtig, gesamt, bestVon(lauf.thema.id)); bestwerte.neuLaden(); }
    catch (e) { setFehler(fehlerText(e, 'Das Ergebnis konnte nicht gespeichert werden.')); }
    setFertig({ thema: lauf.thema, richtig: lauf.richtig, gesamt, neuerBestwert: neu });
    setLauf(null);
  }

  const frage = lauf?.fragen[lauf.index];

  return (
    <>
      <PageHeader titel="Quiz">
        {rollen.koordination && <Link className="btn" to="/quiz/verwalten">Fragen verwalten</Link>}
      </PageHeader>
      {(fragen.fehler || bestwerte.fehler || fehler) && <Alert ton="error">{fragen.fehler ?? bestwerte.fehler ?? fehler}</Alert>}
      {meldung && <Alert ton="info">{meldung}</Alert>}
      {fragen.laedt && <Spinner />}

      {lauf && frage && (
        <Card>
          <p className="field__hint" role="status">{lauf.thema.emoji} {lauf.thema.label} · Frage {lauf.index + 1} von {lauf.fragen.length}</p>
          <progress className="quiz__fortschritt" max={lauf.fragen.length} value={lauf.index + (ausgewertet ? 1 : 0)} aria-label="Fortschritt" />
          <h2>{frage.frage}</h2>
          {istMehrfach(frage) && <p className="field__hint">Mehrere Antworten sind richtig – wähle alle aus und bestätige dann.</p>}
          <ul className="list" aria-label="Antworten">
            {antworten.map((a, i) => {
              const m = ausgewertet ? markierung(a, gewaehlt.includes(i)) : 'neutral';
              return (
                <li key={i}>
                  <button type="button" className={`quiz__antwort quiz__antwort--${m}${!ausgewertet && gewaehlt.includes(i) ? ' quiz__antwort--gewaehlt' : ''}`}
                    aria-pressed={!ausgewertet && istMehrfach(frage) ? gewaehlt.includes(i) : undefined} disabled={ausgewertet} onClick={() => antippen(i)}>
                    <span aria-hidden="true" className="quiz__symbol">{ausgewertet ? SYMBOL[m] : ''}</span>
                    <span>{a.text}</span>
                    {ausgewertet && m === 'verpasst' && <span className="sr-only"> (richtige Antwort)</span>}
                    {ausgewertet && m === 'richtig' && <span className="sr-only"> (richtig)</span>}
                    {ausgewertet && m === 'falsch' && <span className="sr-only"> (falsch)</span>}
                  </button>
                </li>
              );
            })}
          </ul>
          {!ausgewertet && istMehrfach(frage) && (
            <Button variante="primary" onClick={() => (gewaehlt.length ? auswerten(gewaehlt) : setMeldung('Bitte mindestens eine Antwort auswählen.'))}>Antwort bestätigen</Button>
          )}
          {ausgewertet && (
            <div role="status" className="quiz__erklaerung">
              <strong>{istRichtig(antworten, gewaehlt) ? '✓ Richtig!' : '✗ Leider falsch.'}</strong>
              {frage.erklaerung && <p>{frage.erklaerung}</p>}
              <Button variante="primary" onClick={() => void weiter()}>{lauf.index + 1 < lauf.fragen.length ? 'Nächste Frage' : 'Ergebnis anzeigen'}</Button>
            </div>
          )}
          <p><Button klein variante="ghost" onClick={() => { setLauf(null); setMeldung(null); }}>Quiz abbrechen</Button></p>
        </Card>
      )}

      {fertig && (() => {
        const t = ergebnisText(fertig.richtig, fertig.gesamt);
        return (
          <Card>
            <div aria-hidden="true" style={{ fontSize: '2.5rem' }}>{t.emoji}</div>
            <h2>{t.titel}</h2>
            <p><strong>{fertig.richtig} von {fertig.gesamt}</strong> richtig ({prozent(fertig.richtig, fertig.gesamt)} %) · {fertig.thema.label}</p>
            {fertig.neuerBestwert && <p><Badge ton="success">Neuer Bestwert</Badge></p>}
            <p>{t.text}</p>
            <div className="row">
              <Button variante="primary" onClick={() => starten(fertig.thema)}>Nochmal versuchen</Button>
              <Button onClick={() => setFertig(null)}>Zur Themenwahl</Button>
            </div>
          </Card>
        );
      })()}

      {!lauf && !fertig && !fragen.laedt && (
        <>
          <p className="field__hint">Wähle ein Thema. Die Fragen stammen aus der Teamermappe.</p>
          {alle.length === 0 && <EmptyState icon="❓" titel="Noch keine Fragen vorhanden" />}
          <ul className="list">
            {THEMEN.map((t) => {
              const b = bestVon(t.id);
              const n = jeThema[t.id] ?? 0;
              return (
                <li key={t.id} className="list__item">
                  <div className="list__main">
                    <div className="list__title">{t.emoji} {t.label}</div>
                    <div className="list__meta">
                      <span>{n} {n === 1 ? 'Frage' : 'Fragen'}</span>
                      {b && <Badge ton="success">Bestwert: {b.bester_wert}/{b.gesamt}</Badge>}
                    </div>
                  </div>
                  <Button variante="primary" disabled={n === 0} aria-label={`Quiz starten: ${t.label}`} onClick={() => starten(t)}>Starten</Button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}
