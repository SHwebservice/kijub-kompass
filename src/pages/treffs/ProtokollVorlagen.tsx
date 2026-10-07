import { useState } from 'react';
import { fehlerText } from '../../lib/fehler';
import { speichereVorlage } from '../../tagesprotokoll/api';
import { MAX_VORLAGE, type Vorlage } from '../../tagesprotokoll/logik';
import { sortiereOeffnungszeiten, wochentagName, type Oeffnungszeit } from '../../treffs/logik';
import { Alert, Button, Card } from '../../components/ui';

interface Props {
  treffId: string;
  oeffnungszeiten: Oeffnungszeit[];
  vorlagen: Vorlage[];
  geaendert: () => void;
}

/** Ein Wochentag: Textfeld mit eigenem Speichern; leer speichern entfernt die Vorlage. */
function VorlageTag({ treffId, wochentag, gespeichert, geaendert }: { treffId: string; wochentag: number; gespeichert: string; geaendert: () => void }) {
  const [text, setText] = useState(gespeichert);
  const [fehler, setFehler] = useState<string | null>(null);
  const [erfolg, setErfolg] = useState(false);
  const [arbeitet, setArbeitet] = useState(false);
  const id = `vorlage-${wochentag}`;
  const geaendertLokal = text !== gespeichert;

  async function speichern() {
    if (text.length > MAX_VORLAGE) { setFehler(`Höchstens ${MAX_VORLAGE} Zeichen.`); return; }
    setArbeitet(true); setFehler(null); setErfolg(false);
    try { await speichereVorlage(treffId, wochentag, text); setErfolg(true); geaendert(); }
    catch (e) { setFehler(fehlerText(e, 'Die Vorlage konnte nicht gespeichert werden.')); } finally { setArbeitet(false); }
  }

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>{wochentagName(wochentag)}</label>
      <textarea id={id} className="input" rows={3} value={text} maxLength={MAX_VORLAGE + 1} style={{ padding: 'var(--space-3)' }}
        placeholder="z. B. Programm: …  Stimmung: …  Stand der Dinge: …" onChange={(e) => { setText(e.target.value); setErfolg(false); }} />
      {fehler && <Alert ton="error">{fehler}</Alert>}
      <div className="row">
        <Button klein variante={geaendertLokal ? 'primary' : undefined} laedt={arbeitet} disabled={!geaendertLokal}
          aria-label={`Vorlage für ${wochentagName(wochentag)} speichern`} onClick={() => void speichern()}>Speichern</Button>
        {erfolg && <span className="field__hint" role="status">{text.trim() ? 'Gespeichert.' : 'Vorlage entfernt.'}</span>}
      </div>
    </div>
  );
}

/**
 * Treffleitung und Treffkoordination: Vorlagen je Öffnungs-Wochentag. Ein neues Protokoll an diesem Wochentag startet mit diesem Text
 * im Feld „Was war los?“ (Zahlen und Vorkommnisse nie). Zugeklappt, damit die Seite für den Alltag kurz bleibt.
 */
export function ProtokollVorlagen({ treffId, oeffnungszeiten, vorlagen, geaendert }: Props) {
  const tage = sortiereOeffnungszeiten(oeffnungszeiten).map((o) => o.wochentag);
  const anzahl = vorlagen.filter((v) => tage.includes(v.wochentag)).length;
  if (tage.length === 0) return null;

  return (
    <Card>
      <details>
        <summary><h2 style={{ display: 'inline' }}>Vorlagen je Wochentag</h2> <span className="field__hint">({anzahl === 0 ? 'keine' : `${anzahl} von ${tage.length}`})</span></summary>
        <p className="field__hint">
          Ein neues Protokoll startet an diesem Wochentag mit diesem Text unter „Was war los?“ – zum Beispiel eine feste Gliederung oder der übliche
          Programmpunkt. Das Team ergänzt oder überschreibt ihn. Zahlen und Vorkommnisse werden nie vorbelegt. Ein leeres Feld speichern entfernt die Vorlage.
        </p>
        {tage.map((w) => (
          <VorlageTag key={w} treffId={treffId} wochentag={w}
            gespeichert={vorlagen.find((v) => v.wochentag === w)?.text ?? ''} geaendert={geaendert} />
        ))}
      </details>
    </Card>
  );
}
