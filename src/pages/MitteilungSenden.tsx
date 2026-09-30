import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useLaden } from '../lib/laden';
import { useAuth } from '../lib/auth-kontext';
import { listeFreizeiten } from '../freizeiten/api';
import { listeTreffs } from '../treffs/api';
import { ladeVorschau } from '../mitteilungen/api';
import { PushFehler, sendeMitteilung, type PushErgebnis } from '../mitteilungen/senden';
import {
  MAX_TEXT, MAX_TITEL, reichweiteText, validiereMitteilung, ZIEL_LABEL, zielJson, type FreizeitRolle, type TreffRolle, type ZielArt,
} from '../mitteilungen/ziele';
import { Alert, Button, Card, PageHeader, SelectField, Spinner, TextField } from '../components/ui';

const ALLE_ZIELE = Object.keys(ZIEL_LABEL) as ZielArt[];

/**
 * Koordination: eine Mitteilung an eine Gruppe schicken – mit Vorschau, wer sie bekommt.
 * An Freizeiten sendet nur die Freizeitenkoordination, an Treffs nur die Treffkoordination; alle übrigen Gruppen jede der beiden.
 */
export function MitteilungSenden() {
  const { rollen } = useAuth();
  const ZIELE = ALLE_ZIELE.filter((z) => (z === 'freizeit' ? rollen?.freizeitkoordination : z === 'treff' ? rollen?.treffkoordination : true));
  const freizeiten = useLaden(listeFreizeiten, 'mitteilung-freizeiten');
  const treffs = useLaden(listeTreffs, 'mitteilung-treffs');
  const [art, setArt] = useState<ZielArt>('alle');
  const [id, setId] = useState('');
  const [rolle, setRolle] = useState<FreizeitRolle | TreffRolle>('');
  const [titel, setTitel] = useState('');
  const [text, setText] = useState('');
  const [feld, setFeld] = useState<{ titel?: string; text?: string }>({});
  const [fehler, setFehler] = useState<string | null>(null);
  const [ergebnis, setErgebnis] = useState<PushErgebnis | null>(null);
  const [arbeitet, setArbeitet] = useState(false);

  const ziel = zielJson({ art, id, rolle });
  const vorschau = useLaden(async () => (ziel ? ladeVorschau(ziel) : null), `mitteilung-vorschau-${JSON.stringify(ziel)}`);

  function waehleArt(a: ZielArt) { setArt(a); setId(''); setRolle(''); setErgebnis(null); }

  async function senden(e: FormEvent) {
    e.preventDefault();
    const probleme = validiereMitteilung(titel, text);
    setFeld(probleme); setFehler(null); setErgebnis(null);
    if (probleme.titel || probleme.text || !ziel) return;
    const wen = vorschau.daten ? `${vorschau.daten.anzahl} ${vorschau.daten.anzahl === 1 ? 'Person' : 'Personen'}` : 'die gewählte Gruppe';
    if (!window.confirm(`Mitteilung „${titel.trim()}“ an ${wen} senden?`)) return;
    setArbeitet(true);
    try {
      setErgebnis(await sendeMitteilung('manuell', null, { ziel, titel: titel.trim(), text: text.trim() }));
      setTitel(''); setText('');
    } catch (err) { setFehler(err instanceof PushFehler || err instanceof Error ? err.message : 'Die Mitteilung konnte nicht gesendet werden.'); }
    finally { setArbeitet(false); }
  }

  return (
    <>
      <p><Link to="/mehr">← Mehr</Link></p>
      <PageHeader titel="Mitteilung senden" />
      <p className="field__hint">Die Mitteilung erscheint auf den Geräten der Personen, die Mitteilungen eingeschaltet haben. Wer sie nicht eingeschaltet hat, bekommt nichts – wichtige Dinge bitte zusätzlich auf anderem Weg weitergeben.</p>
      {(freizeiten.fehler || treffs.fehler) && <Alert ton="error">{freizeiten.fehler ?? treffs.fehler}</Alert>}

      <form onSubmit={(e) => void senden(e)} noValidate className="stack">
        <Card>
          <h2>An wen?</h2>
          <SelectField label="Gruppe" value={art} onChange={(e) => waehleArt(e.target.value as ZielArt)}>
            {ZIELE.map((z) => <option key={z} value={z}>{ZIEL_LABEL[z]}</option>)}
          </SelectField>
          {art === 'freizeit' && (
            <>
              <SelectField label="Freizeit" value={id} onChange={(e) => setId(e.target.value)}>
                <option value="">– bitte wählen –</option>
                {(freizeiten.daten ?? []).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </SelectField>
              <SelectField label="Wer in der Freizeit?" value={rolle} onChange={(e) => setRolle(e.target.value as FreizeitRolle)}>
                <option value="">Das ganze Team</option>
                <option value="leitung">Nur die Leitung</option>
                <option value="teamer">Nur die TeamerInnen</option>
              </SelectField>
            </>
          )}
          {art === 'treff' && (
            <>
              <SelectField label="Treff" value={id} onChange={(e) => setId(e.target.value)}>
                <option value="">– bitte wählen –</option>
                {(treffs.daten ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </SelectField>
              <SelectField label="Wer im Treff?" value={rolle} onChange={(e) => setRolle(e.target.value as TreffRolle)}>
                <option value="">Das ganze Team</option>
                <option value="treffleitung">Nur die Treffleitung</option>
                <option value="betreuerin">Nur die BetreuerInnen</option>
              </SelectField>
            </>
          )}
          <div role="status" aria-label="Reichweite">
            {ziel && vorschau.laedt && <Spinner beschriftung="Empfänger werden ermittelt …" />}
            {ziel && vorschau.fehler && <Alert ton="error">{vorschau.fehler}</Alert>}
            {ziel && vorschau.daten && (
              <>
                <p><strong>{reichweiteText(vorschau.daten)}</strong></p>
                {vorschau.daten.personen.length > 0 && (
                  <details>
                    <summary>Wer das ist</summary>
                    <ul aria-label="Empfänger">{vorschau.daten.personen.map((p) => <li key={p.id}>{p.name}</li>)}</ul>
                  </details>
                )}
              </>
            )}
          </div>
        </Card>

        <Card>
          <h2>Was?</h2>
          <TextField label="Titel" value={titel} onChange={(e) => setTitel(e.target.value)} maxLength={MAX_TITEL} fehler={feld.titel} hinweis="Erscheint fett in der Mitteilung." />
          <div className="field">
            <label className="field__label" htmlFor="mitteilung-text">Text</label>
            <textarea id="mitteilung-text" className="input" rows={4} maxLength={MAX_TEXT} value={text} onChange={(e) => setText(e.target.value)}
              aria-invalid={feld.text ? true : undefined} style={{ padding: 'var(--space-3)' }} />
            <span className="field__hint">{text.length} von {MAX_TEXT} Zeichen</span>
            {feld.text && <span className="field__error">{feld.text}</span>}
          </div>
        </Card>

        {fehler && <Alert ton="error">{fehler}</Alert>}
        {ergebnis && (
          <Alert ton={ergebnis.gesendet > 0 ? 'success' : 'warning'}>
            {ergebnis.gesendet > 0
              ? `Gesendet an ${ergebnis.gesendet} ${ergebnis.gesendet === 1 ? 'Gerät' : 'Geräte'} von ${ergebnis.empfaenger} ${ergebnis.empfaenger === 1 ? 'Person' : 'Personen'}.`
              : `An ${ergebnis.empfaenger} ${ergebnis.empfaenger === 1 ? 'Person' : 'Personen'}, aber kein Gerät erreichbar.`}
            {ergebnis.entfernt > 0 && ` ${ergebnis.entfernt} nicht mehr gültige ${ergebnis.entfernt === 1 ? 'Geräteanmeldung wurde' : 'Geräteanmeldungen wurden'} entfernt.`}
            {ergebnis.fehlgeschlagen > 0 && ` Bei ${ergebnis.fehlgeschlagen} ${ergebnis.fehlgeschlagen === 1 ? 'Gerät' : 'Geräten'} hat es vorübergehend nicht geklappt.`}
          </Alert>
        )}
        <div className="row">
          <Button variante="primary" type="submit" laedt={arbeitet} disabled={!ziel}>Mitteilung senden</Button>
        </div>
      </form>
    </>
  );
}
