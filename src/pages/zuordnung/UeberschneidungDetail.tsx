import { useState } from 'react';
import { Link } from 'react-router-dom';
import { fehlerText } from '../../lib/fehler';
import { formatDatum } from '../../freizeiten/logik';
import { FREIZEIT_ROLLEN, personName, spaltenZeitraum, type UeberschneidungsPaar } from '../../zuordnung/logik';
import type { PersonZeile, UeberschneidungFreigabe } from '../../zuordnung/api';
import { Sheet } from '../../components/Sheet';
import { Alert, Badge, Button, TextField } from '../../components/ui';

/** Was die Detailansicht von den Überschneidungsdaten braucht (kommt aus `useUeberschneidungen`). */
export interface UeberschneidungsDaten {
  einzelheiten: (personId: string, a: string, b: string) => UeberschneidungFreigabe | undefined;
  akzeptiere: (personId: string, a: string, b: string, notiz: string | null) => Promise<void>;
  widerrufe: (personId: string, a: string, b: string) => Promise<void>;
  /** Name der Person, die akzeptiert hat. */
  nameVon: (personId: string | null) => string;
}

const rolleText = (r: string) => FREIZEIT_ROLLEN.find((x) => x.wert === r)?.label ?? r;

/** Die Tage, an denen beide Freizeiten gleichzeitig laufen, als Text. */
export const gemeinsamerZeitraum = (p: Pick<UeberschneidungsPaar, 'a' | 'b'>) =>
  spaltenZeitraum({ start_datum: p.a.start_datum > p.b.start_datum ? p.a.start_datum : p.b.start_datum, ende_datum: p.a.ende_datum < p.b.ende_datum ? p.a.ende_datum : p.b.ende_datum });

function PaarKarte({ person, paar, daten, gesperrt, schliessen }: { person: PersonZeile; paar: UeberschneidungsPaar; daten: UeberschneidungsDaten; gesperrt: boolean; schliessen?: () => void }) {
  const [notiz, setNotiz] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  const [arbeitet, setArbeitet] = useState(false);
  const frei = daten.einzelheiten(person.id, paar.a.id, paar.b.id);

  async function lauf(fn: () => Promise<void>) {
    setFehler(null); setArbeitet(true);
    try { await fn(); } catch (e) { setFehler(fehlerText(e, 'Das hat nicht geklappt.')); } finally { setArbeitet(false); }
  }

  const freizeit = (f: UeberschneidungsPaar['a'], rolle: string) => (
    <div className="ueberschneidung__freizeit">
      <Link to={`/freizeiten/${f.id}/team`} onClick={schliessen}>{f.name}</Link>
      <div className="field__hint">{spaltenZeitraum(f)} · {rolleText(rolle)}</div>
    </div>
  );

  return (
    <li className="ueberschneidung">
      <div className="ueberschneidung__paar">
        {freizeit(paar.a, paar.rolleA)}
        <span className="ueberschneidung__und" aria-hidden="true">⇄</span>
        {freizeit(paar.b, paar.rolleB)}
      </div>
      <p className="ueberschneidung__zeit">Gleichzeitig an: <strong>{gemeinsamerZeitraum(paar)}</strong></p>
      {fehler && <Alert ton="error">{fehler}</Alert>}
      {frei ? (
        <>
          <p><Badge ton="success">Akzeptiert</Badge> {frei.akzeptiert_von ? `von ${daten.nameVon(frei.akzeptiert_von)} ` : ''}am {formatDatum(frei.akzeptiert_am.slice(0, 10))}</p>
          {frei.notiz && <p className="ueberschneidung__notiz">„{frei.notiz}“</p>}
          <Button klein laedt={arbeitet} disabled={gesperrt} onClick={() => void lauf(() => daten.widerrufe(person.id, paar.a.id, paar.b.id))}>Akzeptanz zurücknehmen</Button>
        </>
      ) : (
        <>
          <TextField label="Notiz (optional)" value={notiz} maxLength={500} onChange={(e) => setNotiz(e.target.value)}
            hinweis="Zum Beispiel: nur an einzelnen Tagen dabei. Die Notiz sehen alle, die die Zuordnungen verwalten." />
          <Button variante="primary" klein laedt={arbeitet} disabled={gesperrt}
            onClick={() => void lauf(() => daten.akzeptiere(person.id, paar.a.id, paar.b.id, notiz.trim() || null))}>Überschneidung akzeptieren</Button>
        </>
      )}
    </li>
  );
}

interface Props { person: PersonZeile; paare: UeberschneidungsPaar[]; daten: UeberschneidungsDaten; gesperrt: boolean; schliessen?: () => void }

/** Die sich überschneidenden Freizeiten einer Person: beide Freizeiten mit Zeitraum und Rolle, dazu „akzeptieren“ (Warnung entfällt) oder die Akzeptanz zurücknehmen. */
export function UeberschneidungDetail({ person, paare, daten, gesperrt, schliessen }: Props) {
  if (paare.length === 0) return <p>Keine Überschneidungen.</p>;
  return (
    <ul className="ueberschneidungen" aria-label="Überschneidungen">
      {paare.map((p) => <PaarKarte key={`${p.a.id}:${p.b.id}`} person={person} paar={p} daten={daten} gesperrt={gesperrt} schliessen={schliessen} />)}
    </ul>
  );
}

/** Dasselbe als Fenster (aus der Zuordnungstabelle und aus dem Hinweis nach dem Zuordnen). */
export function UeberschneidungSheet({ person, paare, daten, gesperrt, schliessen }: Props & { schliessen: () => void }) {
  return (
    <Sheet titel={`Überschneidung · ${personName(person)}`} schliessen={schliessen}>
      <p className="field__hint">
        Die Person ist in diesen Freizeiten zur selben Zeit eingeteilt. Wenn das in der Praxis trotzdem passt, kannst du die Überschneidung akzeptieren – die Warnung verschwindet dann.
        Du kannst die Akzeptanz jederzeit zurücknehmen.
      </p>
      <UeberschneidungDetail person={person} paare={paare} daten={daten} gesperrt={gesperrt} schliessen={schliessen} />
    </Sheet>
  );
}
