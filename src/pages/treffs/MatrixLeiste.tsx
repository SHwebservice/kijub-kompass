import { useState } from 'react';
import { fehlerText } from '../../lib/fehler';
import { sendePush } from '../../mitteilungen/senden';
import { listeDienste, setzeMindestbesetzung, wendeDienstplanAn, type TreffTeamMitglied } from '../../treffs/api';
import { aenderungen, LEERER_ENTWURF, vormonatUebernehmen, wochenDerKarten, wocheKopieren, type Entwurf, type MusterErgebnis, type ZeileErgebnis } from '../../treffs/entwurf';
import { kalenderwoche, mitteilungFuer, monatTage, monatText, monatVersatz, type Abwesenheit, type Feiertag, type Tageskarte } from '../../treffs/dienstplan';
import type { Oeffnungszeit } from '../../treffs/logik';
import { Alert, Button } from '../../components/ui';
import { MusterSheet } from './MusterSheet';
import { WuenscheBestaetigen } from './WuenscheBestaetigen';

interface Props {
  treffId: string;
  ansicht: 'woche' | 'monat';
  /** Erster Tag des Monats (Monatsansicht). */
  monat: string;
  /** Gespeicherter Stand des Zeitraums. */
  karten: Tageskarte[];
  team: TreffTeamMitglied[];
  oeffnungszeiten: Oeffnungszeit[];
  /** Urlaub, krank und „kann nicht“. */
  abwesenheiten: Abwesenheit[];
  feiertage: Feiertag[];
  veroeffentlicht: readonly string[];
  mindestbesetzung: number;
  mindestbesetzungGeaendert: (n: number) => void;
  bearbeiten: boolean;
  setBearbeiten: (an: boolean) => void;
  entwurf: Entwurf;
  setEntwurf: (e: Entwurf) => void;
  neuerSonderdienst: () => void;
  /** Nach dem Speichern: Dienste neu laden. */
  geaendert: () => void;
}

const anzahl = (n: number, einzahl: string, mehrzahl: string) => `${n} ${n === 1 ? einzahl : mehrzahl}`;
const KONFLIKT = 'mit Urlaub, Krankheit oder „kann nicht“';

/**
 * Werkzeuge der Treffleitung über der Einsatz-Matrix. Außerhalb des Bearbeitens: in der Tabelle einteilen (Monat), Sonderdienst,
 * offene Wünsche gesammelt bestätigen, Mindestbesetzung. Beim Bearbeiten (Monat): Wochentags-Muster, Vormonat übernehmen, Woche kopieren,
 * Zahl der Änderungen, Speichern in einem Schritt und Verwerfen – alle Werkzeuge füllen denselben Entwurf.
 */
export function MatrixLeiste(p: Props) {
  const { treffId, ansicht, monat, karten, team, abwesenheiten, feiertage, veroeffentlicht, bearbeiten, setBearbeiten, entwurf, setEntwurf, geaendert } = p;
  const [fehler, setFehler] = useState<string | null>(null);
  const [erfolg, setErfolg] = useState<string | null>(null);
  const [hinweis, setHinweis] = useState<string | null>(null);
  const [arbeitet, setArbeitet] = useState(false);
  const [musterOffen, setMusterOffen] = useState(false);
  const wochen = wochenDerKarten(karten);
  const [quelle, setQuelle] = useState('');
  const quellWoche = wochen.includes(quelle) ? quelle : (wochen[0] ?? '');
  const { zuteilen, entfernen } = aenderungen(entwurf);
  const offen = entwurf.size > 0;
  const teamIds = team.map((m) => m.person_id);

  const melde = (r: ZeileErgebnis, was: string) => {
    const neu = aenderungen(r.entwurf).zuteilen.length - zuteilen.length;
    setEntwurf(r.entwurf);
    setHinweis(`${was}: ${neu > 0 ? anzahl(neu, 'Einteilung', 'Einteilungen') + ' dazu' : 'nichts Neues'}${r.ausgelassen > 0 ? `, ${anzahl(r.ausgelassen, 'Tag', 'Tage')} ${KONFLIKT} ausgelassen` : ''}.`);
  };

  const musterUebernehmen = (r: MusterErgebnis) => {
    setEntwurf(r.entwurf);
    setHinweis(`Wochentags-Muster: ${r.dazu > 0 ? anzahl(r.dazu, 'Einteilung', 'Einteilungen') + ' dazu' : 'nichts Neues'}${r.entfernt > 0 ? `, ${r.entfernt} herausgenommen` : ''}${r.ausgelassen > 0 ? `, ${anzahl(r.ausgelassen, 'Einteilung', 'Einteilungen')} ${KONFLIKT} ausgelassen` : ''}.`);
  };

  async function vormonat() {
    setFehler(null); setHinweis(null); setArbeitet(true);
    try {
      const vor = monatVersatz(monat, -1);
      const tage = monatTage(vor);
      const dienste = await listeDienste(treffId, vor, tage[tage.length - 1]!);
      melde(vormonatUebernehmen(karten, entwurf, vor, dienste, teamIds, abwesenheiten, feiertage, treffId), `${monatText(vor)} übernommen`);
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
      const empfaenger = mitteilungFuer([...zuteilen, ...entfernen], veroeffentlicht);
      if (empfaenger.length) sendePush('dienstplan', treffId, { personen: empfaenger });
      setEntwurf(LEERER_ENTWURF);
      setBearbeiten(false);
      geaendert();
    } catch (e) { setFehler(fehlerText(e, 'Der Dienstplan konnte nicht gespeichert werden.')); } finally { setArbeitet(false); }
  }

  function beenden() {
    if (offen && !window.confirm('Die Änderungen im Entwurf gehen verloren. Trotzdem beenden?')) return;
    setEntwurf(LEERER_ENTWURF); setFehler(null); setHinweis(null); setBearbeiten(false);
  }

  async function mindestAendern(n: number) {
    setFehler(null);
    try { await setzeMindestbesetzung(treffId, n); p.mindestbesetzungGeaendert(n); } catch (e) { setFehler(fehlerText(e, 'Die Mindestbesetzung konnte nicht gespeichert werden.')); }
  }

  if (!bearbeiten) {
    return (
      <div className="einsatz__leiste">
        {erfolg && <Alert ton="success">{erfolg}</Alert>}
        {fehler && <Alert ton="error">{fehler}</Alert>}
        <div className="row">
          {ansicht === 'monat' && <Button klein variante="primary" onClick={() => { setErfolg(null); setBearbeiten(true); }}>In der Tabelle einteilen</Button>}
          <Button klein onClick={p.neuerSonderdienst}>+ Sonderdienst</Button>
          <span className="row einsatz__mindest">
            <label htmlFor={`mindest-${treffId}`}>Mindestens</label>
            <select id={`mindest-${treffId}`} className="input" style={{ width: 'auto' }} value={p.mindestbesetzung} onChange={(e) => void mindestAendern(Number(e.target.value))}>
              {Array.from({ length: 8 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <span>{p.mindestbesetzung === 1 ? 'Person' : 'Personen'} je Öffnungstag</span>
          </span>
        </div>
        {ansicht === 'woche' && <p className="field__hint">Einen ganzen Monat planst du in der Ansicht „Monat“ mit „In der Tabelle einteilen“. Hier: Tag antippen zum Zuteilen.</p>}
        <WuenscheBestaetigen treffId={treffId} karten={karten} abwesenheiten={abwesenheiten} feiertage={feiertage}
          zeitraum={ansicht === 'woche' ? 'in dieser Woche' : 'im Monat'} geaendert={geaendert} />
      </div>
    );
  }

  return (
    <div className="einsatz__leiste">
      <p className="field__hint">
        Klicke Zellen an, um einzuteilen oder herauszunehmen; mit der Maus kannst du über mehrere Tage ziehen. Ein Klick auf den Namen füllt
        oder leert die ganze Zeile. Die Werkzeuge darunter füllen denselben Entwurf. Erst „Speichern“ übernimmt alles.
      </p>
      {fehler && <Alert ton="error">{fehler}</Alert>}
      <div className="row">
        <Button klein onClick={() => setMusterOffen(true)}>Wochentags-Muster …</Button>
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
      {musterOffen && (
        <MusterSheet treffId={treffId} monat={monat} karten={karten} entwurf={entwurf} team={team} oeffnungszeiten={p.oeffnungszeiten}
          abwesenheiten={abwesenheiten} feiertage={feiertage} uebernehmen={musterUebernehmen} schliessen={() => setMusterOffen(false)} />
      )}
    </div>
  );
}
