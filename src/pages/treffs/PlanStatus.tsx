import { useState } from 'react';
import { fehlerText } from '../../lib/fehler';
import { sendePush } from '../../mitteilungen/senden';
import { nimmVeroeffentlichungZurueck, veroeffentliche } from '../../treffs/api';
import { monatErster, monatText } from '../../treffs/dienstplan';
import { Alert, Button } from '../../components/ui';

interface Props {
  treffId: string;
  /** Die Monate des angezeigten Zeitraums (jeweils der Erste). */
  monate: string[];
  veroeffentlicht: readonly string[];
  verwaltung: boolean;
  heute: string;
  geaendert: () => void;
}

/**
 * Stand des Monatsplans: „in Planung“ oder „veröffentlicht“ (Migration 0036). Vergangene Monate zeigen nichts.
 * Die Treffleitung veröffentlicht einen Monat – das Team bekommt dann eine einzige Mitteilung – oder nimmt ihn zurück in die Planung.
 * Das Team sieht für Monate in Planung den Hinweis „vorläufig“.
 */
export function PlanStatus({ treffId, monate, veroeffentlicht, verwaltung, heute, geaendert }: Props) {
  const [fehler, setFehler] = useState<string | null>(null);
  const [erfolg, setErfolg] = useState<string | null>(null);
  const [arbeitet, setArbeitet] = useState(false);
  const relevant = monate.filter((m) => m >= monatErster(heute));
  if (relevant.length === 0) return null;

  async function aktion(fn: () => Promise<void>, text: string) {
    setFehler(null); setErfolg(null); setArbeitet(true);
    try { await fn(); setErfolg(text); geaendert(); } catch (e) { setFehler(fehlerText(e)); } finally { setArbeitet(false); }
  }

  const veroeffentlichen = (m: string) => {
    if (!window.confirm(`Den Dienstplan für ${monatText(m)} veröffentlichen? Das Team bekommt eine Mitteilung, danach auch bei jeder Änderung.`)) return;
    void aktion(async () => { await veroeffentliche(treffId, m); sendePush('dienstplan_veroeffentlicht', treffId, { monat: m }); }, `${monatText(m)} ist veröffentlicht – das Team wurde benachrichtigt.`);
  };
  const zuruecknehmen = (m: string) => {
    if (!window.confirm(`${monatText(m)} zurück in die Planung nehmen? Das Team sieht den Plan dann als vorläufig und bekommt keine Mitteilungen über Änderungen.`)) return;
    void aktion(() => nimmVeroeffentlichungZurueck(treffId, m), `${monatText(m)} ist wieder in Planung.`);
  };

  return (
    <div className="stack plan-status" style={{ gap: 'var(--space-2)' }}>
      {fehler && <Alert ton="error">{fehler}</Alert>}
      {erfolg && <Alert ton="success">{erfolg}</Alert>}
      {relevant.map((m) => {
        const fest = veroeffentlicht.includes(m);
        if (!verwaltung) {
          return fest ? null : (
            <Alert key={m} ton="info"><strong>Vorläufig:</strong> Der Dienstplan für {monatText(m)} ist noch in Planung und kann sich ändern.</Alert>
          );
        }
        return fest ? (
          <p key={m} className="plan-status__zeile">
            <span className="plan-status__punkt plan-status__punkt--fest" aria-hidden="true" /> {monatText(m)} ist veröffentlicht.
            {' '}<Button klein variante="ghost" disabled={arbeitet} onClick={() => zuruecknehmen(m)}>Zurück in Planung</Button>
          </p>
        ) : (
          <Alert key={m} ton="warning">
            <strong>{monatText(m)} ist in Planung.</strong> Das Team sieht den Plan als vorläufig und bekommt noch keine Mitteilungen über Änderungen.
            {' '}<Button klein variante="primary" disabled={arbeitet} onClick={() => veroeffentlichen(m)}>{monatText(m)} veröffentlichen</Button>
          </Alert>
        );
      })}
    </div>
  );
}
