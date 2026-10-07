import { useState } from 'react';
import { fehlerText } from '../../lib/fehler';
import { sendePush } from '../../mitteilungen/senden';
import { bestaetigeWuensche } from '../../treffs/api';
import { offeneWunschListe } from '../../treffs/entwurf';
import type { Abwesenheit, Feiertag, Tageskarte } from '../../treffs/dienstplan';
import { Alert, Button } from '../../components/ui';

interface Props {
  treffId: string;
  karten: Tageskarte[];
  abwesenheiten: Abwesenheit[];
  feiertage: Feiertag[];
  /** „in dieser Woche“ / „im Monat“ */
  zeitraum: string;
  geaendert: () => void;
}

const wuensche = (n: number) => (n === 1 ? 'ein offener Wunsch' : `${n} offene Wünsche`);

/**
 * Alle offenen Dienstwünsche des Zeitraums auf einmal bestätigen (bestätigen teilt zugleich ein). Wünsche an Tagen mit Urlaub,
 * Krankheit oder Feiertag bleiben offen: Die entscheidet die Treffleitung einzeln.
 */
export function WuenscheBestaetigen({ treffId, karten, abwesenheiten, feiertage, zeitraum, geaendert }: Props) {
  const [fehler, setFehler] = useState<string | null>(null);
  const [erfolg, setErfolg] = useState<string | null>(null);
  const [arbeitet, setArbeitet] = useState(false);
  const { ohneKonflikt, mitKonflikt } = offeneWunschListe(karten, abwesenheiten, feiertage, treffId);
  if (ohneKonflikt.length === 0 && mitKonflikt.length === 0 && !erfolg && !fehler) return null;

  async function bestaetigen() {
    const n = ohneKonflikt.length;
    if (!window.confirm(`${n === 1 ? 'Den offenen Wunsch' : `Alle ${n} offenen Wünsche`} ${zeitraum} bestätigen? Die Personen werden damit eingeteilt.`)) return;
    setArbeitet(true); setFehler(null); setErfolg(null);
    try {
      const bestaetigt = await bestaetigeWuensche(treffId, ohneKonflikt);
      setErfolg(bestaetigt === 1 ? 'Ein Wunsch bestätigt.' : `${bestaetigt} Wünsche bestätigt.`);
      const personen = [...new Set(ohneKonflikt.map((w) => w.person))];
      if (bestaetigt > 0) sendePush('dienstplan', treffId, { personen });
      geaendert();
    } catch (e) { setFehler(fehlerText(e, 'Die Wünsche konnten nicht bestätigt werden.')); } finally { setArbeitet(false); }
  }

  return (
    <div className="stack" style={{ gap: 'var(--space-2)' }}>
      {fehler && <Alert ton="error">{fehler}</Alert>}
      {erfolg && <Alert ton="success">{erfolg}</Alert>}
      {ohneKonflikt.length > 0 && (
        <p><Button klein variante="primary" laedt={arbeitet} onClick={() => void bestaetigen()}>
          {ohneKonflikt.length === 1 ? 'Offenen Wunsch bestätigen' : `Alle ${ohneKonflikt.length} offenen Wünsche bestätigen`}
        </Button></p>
      )}
      {mitKonflikt.length > 0 && (
        <p className="field__hint">
          {wuensche(mitKonflikt.length).replace(/^ein/, 'Ein')} an {mitKonflikt.length === 1 ? 'einem Tag' : 'Tagen'} mit Urlaub, Krankheit oder Feiertag – bitte einzeln entscheiden.
        </p>
      )}
    </div>
  );
}
