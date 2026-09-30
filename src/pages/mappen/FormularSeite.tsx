import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../lib/auth-kontext';
import { useLaden } from '../../lib/laden';
import { fehlerText } from '../../lib/fehler';
import { holeBeispiele, holeEntwuerfe, speichereBeispiele, speichereEntwurf } from '../../formulare/api';
import { druckTitel, leer, typInfo, TYPEN, type FormularDaten, type FormularTyp } from '../../formulare/typen';
import { Alert, Button, Card, PageHeader, Spinner } from '../../components/ui';
import { Vordruck, VordruckDruck } from './Vordruck';

const SPEICHER_VERZOEGERUNG_MS = 800;

/**
 * Die Vordrucke der Teamermappe zum Üben und Ausfüllen. Jeder Vordruck startet mit einem Beispiel; eigene Eingaben werden als Entwurf
 * gespeichert (außer der Anwesenheitsliste mit Namen von Kindern) und lassen sich als PDF drucken. Die Koordination pflegt die Beispiele.
 */
export function FormularSeite() {
  const { ich, rollen } = useAuth();
  const beispiele = useLaden(holeBeispiele, 'formular-beispiele');
  const entwuerfe = useLaden(async (): Promise<Partial<FormularDaten>> => (ich ? holeEntwuerfe(ich.id) : {}), `formular-entwuerfe-${ich?.id ?? ''}`);
  const [typ, setTyp] = useState<FormularTyp>('anwesenheit');
  const [arbeit, setArbeit] = useState<Partial<FormularDaten>>({});
  const [beispielModus, setBeispielModus] = useState<FormularDaten | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [arbeitet, setArbeitet] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  if (!ich || !rollen) return null;

  const info = typInfo(typ);
  const bearbeitetBeispiel = beispielModus !== null;
  const bereit = !!beispiele.daten && !entwuerfe.laedt;

  // Bearbeitet wird in dieser Reihenfolge: Beispiel-Modus, eigene Änderung in dieser Sitzung, gespeicherter Entwurf, Beispiel.
  const aktuell = (t: FormularTyp): FormularDaten[FormularTyp] | undefined =>
    (beispielModus?.[t] ?? arbeit[t] ?? entwuerfe.daten?.[t] ?? beispiele.daten?.[t]) as FormularDaten[FormularTyp] | undefined;
  const daten = aktuell(typ);

  function setze<T extends FormularTyp>(t: T, neu: FormularDaten[T]) {
    setFehler(null); setStatus(null);
    if (beispielModus) { setBeispielModus({ ...beispielModus, [t]: neu }); return; }
    setArbeit((a) => ({ ...a, [t]: neu }));
    if (typInfo(t).nurLokal || !ich) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      speichereEntwurf(ich.id, t as Exclude<FormularTyp, 'anwesenheit'>, neu)
        .then(() => setStatus('Entwurf gespeichert'))
        .catch((e: unknown) => setFehler(fehlerText(e, 'Der Entwurf konnte nicht gespeichert werden.')));
    }, SPEICHER_VERZOEGERUNG_MS);
  }

  function beispielWiederherstellen() {
    if (!beispiele.daten || !window.confirm('Den Vordruck auf das Beispiel zurücksetzen? Eigene Eingaben gehen dabei verloren.')) return;
    setze(typ, structuredClone(beispiele.daten[typ]));
  }

  function leeren() {
    if (!window.confirm('Den Vordruck komplett leeren? Eigene Eingaben gehen dabei verloren.')) return;
    setze(typ, leer(typ));
  }

  function drucken() {
    if (!daten) return;
    const vorher = document.title;
    document.title = druckTitel(typ, daten);
    window.print();
    document.title = vorher;
  }

  async function beispieleSpeichern() {
    if (!beispielModus) return;
    setArbeitet(true); setFehler(null);
    try {
      await speichereBeispiele(beispielModus, ich!.id);
      setBeispielModus(null); setStatus('Beispiele gespeichert'); beispiele.neuLaden();
    } catch (e) { setFehler(fehlerText(e, 'Die Beispiele konnten nicht gespeichert werden.')); } finally { setArbeitet(false); }
  }

  return (
    <>
      <p><Link to="/teamermappe">← Teamermappe</Link></p>
      <PageHeader titel="Formulare">
        {rollen.koordination && beispiele.daten && (bearbeitetBeispiel
          ? <Button onClick={() => setBeispielModus(null)}>Bearbeiten beenden</Button>
          : <Button onClick={() => setBeispielModus(structuredClone(beispiele.daten!))}>Beispiele bearbeiten</Button>)}
      </PageHeader>
      <p className="field__hint">Übe das Ausfüllen an den Beispielen oder fülle die Vordrucke für deine Freizeit aus. Mit „Drucken“ kannst du sie als PDF speichern.</p>
      {(beispiele.fehler || entwuerfe.fehler || fehler) && <Alert ton="error">{beispiele.fehler ?? entwuerfe.fehler ?? fehler}</Alert>}
      {bearbeitetBeispiel && <Alert ton="info">Bearbeitungsmodus – deine Änderungen werden zum Beispiel für alle.</Alert>}
      {!bereit && !beispiele.fehler && <Spinner />}

      {bereit && daten && (
        <div className="stack">
          <div className="tabs" role="tablist" aria-label="Vordruck">
            {TYPEN.map((t) => (
              <button key={t.id} role="tab" aria-selected={t.id === typ} className="tabs__tab" onClick={() => { setTyp(t.id); setStatus(null); }}>{t.label}</button>
            ))}
          </div>

          <Card>
            <h2>{info.label}</h2>
            <Vordruck typ={typ} daten={daten} aendere={(neu) => setze(typ, neu as never)} />
          </Card>

          <div className="row">
            {bearbeitetBeispiel ? (
              <>
                <Button variante="primary" laedt={arbeitet} onClick={() => void beispieleSpeichern()}>Beispiele speichern</Button>
                <Button onClick={leeren}>Felder leeren</Button>
              </>
            ) : (
              <>
                <Button variante="primary" onClick={drucken}>Drucken / als PDF speichern</Button>
                <Button onClick={beispielWiederherstellen}>Beispiel wiederherstellen</Button>
                <Button variante="ghost" onClick={leeren}>Vordruck leeren</Button>
              </>
            )}
            <a className="btn" href={`/formulare/${info.pdf}`} download>Original als PDF herunterladen</a>
          </div>
          {status && <p className="field__hint" role="status">{status}</p>}
          {!info.nurLokal && !bearbeitetBeispiel && <p className="field__hint">Dein Entwurf wird automatisch gespeichert und ist nur für dich sichtbar.</p>}

          <VordruckDruck typ={typ} daten={daten} />
        </div>
      )}
    </>
  );
}
