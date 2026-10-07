import { useState } from 'react';
import { fehlerText } from '../../lib/fehler';
import { sendePush } from '../../mitteilungen/senden';
import { listeDienste, wendeDienstplanAn } from '../../treffs/api';
import { aenderungen, LEERER_ENTWURF, vormonatUebernehmen, wochenDerKarten, wocheKopieren, type Entwurf, type ZeileErgebnis } from '../../treffs/entwurf';
import { kalenderwoche, monatTage, monatText, monatVersatz, type Abwesenheit, type Feiertag, type Tageskarte } from '../../treffs/dienstplan';
import { Alert, Button } from '../../components/ui';
import { WuenscheBestaetigen } from './WuenscheBestaetigen';

interface Props {
  treffId: string;
  /** Erster Tag des Monats. */
  monat: string;
  /** Gespeicherter Stand des Monats. */
  karten: Tageskarte[];
  /** Person-IDs des Treff-Teams. */
  team: string[];
  abwesenheiten: Abwesenheit[];
  feiertage: Feiertag[];
  bearbeiten: boolean;
  setBearbeiten: (an: boolean) => void;
  entwurf: Entwurf;
  setEntwurf: (e: Entwurf) => void;
  /** Nach dem Speichern: Dienste und Statistik neu laden. */
  geaendert: () => void;
}

const anzahl = (n: number, einzahl: string, mehrzahl: string) => `${n} ${n === 1 ? einzahl : mehrzahl}`;

/**
 * Knöpfe über der Einsatz-Matrix: Bearbeiten an/aus, Vormonat übernehmen, Woche kopieren, Zahl der Änderungen, Speichern in einem Schritt
 * und Verwerfen. Außerhalb des Bearbeitens: offene Wünsche gesammelt bestätigen.
 */
export function MatrixLeiste({ treffId, monat, karten, team, abwesenheiten, feiertage, bearbeiten, setBearbeiten, entwurf, setEntwurf, geaendert }: Props) {
  const [fehler, setFehler] = useState<string | null>(null);
  const [erfolg, setErfolg] = useState<string | null>(null);
  const [hinweis, setHinweis] = useState<string | null>(null);
  const [arbeitet, setArbeitet] = useState(false);
  const wochen = wochenDerKarten(karten);
  const [quelle, setQuelle] = useState('');
  const quellWoche = wochen.includes(quelle) ? quelle : (wochen[0] ?? '');
  const { zuteilen, entfernen } = aenderungen(entwurf);
  const offen = entwurf.size > 0;

  const melde = (r: ZeileErgebnis, was: string) => {
    const neu = aenderungen(r.entwurf).zuteilen.length - zuteilen.length;
    setEntwurf(r.entwurf);
    setHinweis(`${was}: ${neu > 0 ? anzahl(neu, 'Einteilung', 'Einteilungen') + ' dazu' : 'nichts Neues'}${r.ausgelassen > 0 ? `, ${anzahl(r.ausgelassen, 'Tag', 'Tage')} mit Urlaub, Krankheit oder Feiertag ausgelassen` : ''}.`);
  };

  async function vormonat() {
    setFehler(null); setHinweis(null); setArbeitet(true);
    try {
      const vor = monatVersatz(monat, -1);
      const tage = monatTage(vor);
      const dienste = await listeDienste(treffId, vor, tage[tage.length - 1]!);
      melde(vormonatUebernehmen(karten, entwurf, vor, dienste, team, abwesenheiten, feiertage, treffId), `${monatText(vor)} übernommen`);
    } catch (e) { setFehler(fehlerText(e, 'Der Vormonat konnte nicht geladen werden.')); } finally { setArbeitet(false); }
  }

  function woche() {
    if (!quellWoche) return;
    setHinweis(null);
    melde(wocheKopieren(karten, entwurf, quellWoche, abwesenheiten, feiertage, treffId), `KW ${kalenderwoche(quellWoche)} kopiert`);
  }

  async function speichern() {
    setArbeitet(true); setFehler(null); setErfolg(null); setHinweis(null);
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
    setEntwurf(LEERER_ENTWURF); setFehler(null); setHinweis(null); setBearbeiten(false);
  }

  if (!bearbeiten) {
    return (
      <div className="einsatz__leiste">
        {erfolg && <Alert ton="success">{erfolg}</Alert>}
        <p><Button klein onClick={() => { setErfolg(null); setBearbeiten(true); }}>In der Tabelle einteilen</Button></p>
        <WuenscheBestaetigen treffId={treffId} karten={karten} abwesenheiten={abwesenheiten} feiertage={feiertage} zeitraum="im Monat" geaendert={geaendert} />
      </div>
    );
  }

  return (
    <div className="einsatz__leiste">
      <p className="field__hint">
        Klicke Zellen an, um einzuteilen oder herauszunehmen; mit der Maus kannst du über mehrere Tage ziehen. Ein Klick auf den Namen füllt
        oder leert die ganze Zeile. Erst „Speichern“ übernimmt alles.
      </p>
      {fehler && <Alert ton="error">{fehler}</Alert>}
      <div className="row">
        <Button klein disabled={arbeitet} onClick={() => void vormonat()}>{monatText(monatVersatz(monat, -1))} übernehmen</Button>
        {wochen.length > 1 && (
          <span className="row" style={{ gap: 'var(--space-2)' }}>
            <label className="sr-only" htmlFor="woche-kopieren">Woche, deren Einteilung kopiert wird</label>
            <select id="woche-kopieren" className="input" style={{ width: 'auto' }} value={quellWoche} onChange={(e) => setQuelle(e.target.value)}>
              {wochen.slice(0, -1).map((m) => <option key={m} value={m}>KW {kalenderwoche(m)}</option>)}
            </select>
            <Button klein disabled={arbeitet} onClick={woche}>auf die folgenden Wochen kopieren</Button>
          </span>
        )}
      </div>
      {hinweis && <p className="field__hint" role="status">{hinweis}</p>}
      <div className="row" aria-live="polite">
        <span>
          {offen
            ? <strong>{[zuteilen.length > 0 && anzahl(zuteilen.length, 'neue Einteilung', 'neue Einteilungen'), entfernen.length > 0 && `${entfernen.length} herausgenommen`].filter(Boolean).join(', ')}</strong>
            : <span className="field__hint">Noch keine Änderungen.</span>}
        </span>
      </div>
      <div className="row">
        <Button variante="primary" klein laedt={arbeitet} disabled={!offen} onClick={() => void speichern()}>Speichern</Button>
        {offen && <Button klein onClick={() => { setEntwurf(LEERER_ENTWURF); setHinweis(null); }}>Änderungen verwerfen</Button>}
        <Button klein onClick={beenden}>Fertig</Button>
      </div>
    </div>
  );
}
