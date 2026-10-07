import { useState } from 'react';
import { fehlerText } from '../../lib/fehler';
import { sendePush } from '../../mitteilungen/senden';
import { wendeDienstplanAn } from '../../treffs/api';
import { aenderungen, LEERER_ENTWURF, type Entwurf } from '../../treffs/entwurf';
import { Alert, Button } from '../../components/ui';

interface Props {
  treffId: string;
  /** Erster Tag des Monats. */
  monat: string;
  bearbeiten: boolean;
  setBearbeiten: (an: boolean) => void;
  entwurf: Entwurf;
  setEntwurf: (e: Entwurf) => void;
  /** Nach dem Speichern: Dienste und Statistik neu laden. */
  geaendert: () => void;
}

const anzahl = (n: number, einzahl: string, mehrzahl: string) => `${n} ${n === 1 ? einzahl : mehrzahl}`;

/** Knöpfe über der Einsatz-Matrix: Bearbeiten an/aus, Zahl der Änderungen, Speichern in einem Schritt und Verwerfen. */
export function MatrixLeiste({ treffId, monat, bearbeiten, setBearbeiten, entwurf, setEntwurf, geaendert }: Props) {
  const [fehler, setFehler] = useState<string | null>(null);
  const [erfolg, setErfolg] = useState<string | null>(null);
  const [arbeitet, setArbeitet] = useState(false);
  const { zuteilen, entfernen } = aenderungen(entwurf);
  const offen = entwurf.size > 0;

  async function speichern() {
    setArbeitet(true); setFehler(null); setErfolg(null);
    try {
      const r = await wendeDienstplanAn(treffId, monat, zuteilen, entfernen);
      setErfolg(`${anzahl(r.zugeteilt, 'Einteilung', 'Einteilungen')} gespeichert${r.entfernt > 0 ? `, ${anzahl(r.entfernt, 'Einteilung', 'Einteilungen')} entfernt` : ''}.`);
      const betroffene = [...new Set([...zuteilen, ...entfernen].map((p) => p.person))];
      if (betroffene.length) sendePush('dienstplan', treffId, { personen: betroffene });
      setEntwurf(LEERER_ENTWURF);
      setBearbeiten(false);
      geaendert();
    } catch (e) { setFehler(fehlerText(e, 'Der Dienstplan konnte nicht gespeichert werden.')); } finally { setArbeitet(false); }
  }

  function beenden() {
    if (offen && !window.confirm('Die Änderungen im Entwurf gehen verloren. Trotzdem beenden?')) return;
    setEntwurf(LEERER_ENTWURF); setFehler(null); setBearbeiten(false);
  }

  if (!bearbeiten) {
    return (
      <>
        {erfolg && <Alert ton="success">{erfolg}</Alert>}
        <p><Button klein onClick={() => { setErfolg(null); setBearbeiten(true); }}>In der Tabelle einteilen</Button></p>
      </>
    );
  }

  return (
    <div className="einsatz__leiste">
      <p className="field__hint">
        Klicke Zellen an, um einzuteilen oder herauszunehmen; mit der Maus kannst du über mehrere Tage ziehen. Ein Klick auf den Namen füllt
        oder leert die ganze Zeile. Erst „Speichern“ übernimmt alles.
      </p>
      {fehler && <Alert ton="error">{fehler}</Alert>}
      <div className="row" aria-live="polite">
        <span>
          {offen
            ? <strong>{[zuteilen.length > 0 && anzahl(zuteilen.length, 'neue Einteilung', 'neue Einteilungen'), entfernen.length > 0 && `${entfernen.length} herausgenommen`].filter(Boolean).join(', ')}</strong>
            : <span className="field__hint">Noch keine Änderungen.</span>}
        </span>
      </div>
      <div className="row">
        <Button variante="primary" klein laedt={arbeitet} disabled={!offen} onClick={() => void speichern()}>Speichern</Button>
        {offen && <Button klein onClick={() => setEntwurf(LEERER_ENTWURF)}>Änderungen verwerfen</Button>}
        <Button klein onClick={beenden}>Fertig</Button>
      </div>
    </div>
  );
}
