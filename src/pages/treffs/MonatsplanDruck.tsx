import { useState } from 'react';
import { baueMonatsplan, druckeMonatsplanPdf, monatsplanPdfName, speichereMonatsplanPdf } from '../../treffs/dienstplanPdf';
import type { Abwesenheit, Dienst, Feiertag, Schliesszeit } from '../../treffs/dienstplan';
import type { TreffDetailDaten, TreffTeamMitglied } from '../../treffs/api';
import { Alert, Button } from '../../components/ui';

interface Props {
  treff: TreffDetailDaten;
  /** Erster Tag des Monats */
  monat: string;
  mitglieder: TreffTeamMitglied[];
  dienste: Dienst[];
  /** Urlaub und krank (aus der Datenbank; „kann nicht“ kommt nicht in den Ausdruck) */
  abwesenheiten: Abwesenheit[];
  feiertage: Feiertag[];
  schliesszeiten: Schliesszeit[];
  vorlaeufig: boolean;
}

/** „Als PDF speichern“ und „Drucken“ für den Monatsplan (eine Seite DIN A4 quer: Tage links, Mitarbeitende oben). */
export function MonatsplanDruck({ treff: t, monat, mitglieder, dienste, abwesenheiten, feiertage, schliesszeiten, vorlaeufig }: Props) {
  const [fehler, setFehler] = useState<string | null>(null);
  const [arbeitet, setArbeitet] = useState(false);

  const plan = () => baueMonatsplan({
    treffName: t.name, monat, oeffnungszeiten: t.oeffnungszeiten, mitglieder, dienste, abwesenheiten, feiertage, schliesszeiten, treffId: t.id, vorlaeufig,
  });

  async function los(fn: () => Promise<void>) {
    setFehler(null); setArbeitet(true);
    try { await fn(); } catch (e) { setFehler(e instanceof Error && e.message ? e.message : 'Das PDF konnte nicht erstellt werden.'); } finally { setArbeitet(false); }
  }

  return (
    <div className="stack" style={{ gap: 'var(--space-2)' }}>
      {fehler && <Alert ton="error">{fehler}</Alert>}
      <div className="row">
        <Button klein disabled={arbeitet || mitglieder.length === 0} onClick={() => void los(() => speichereMonatsplanPdf(plan(), monatsplanPdfName(t.name, monat)))}>Als PDF speichern</Button>
        <Button klein disabled={arbeitet || mitglieder.length === 0} onClick={() => void los(() => druckeMonatsplanPdf(plan()))}>Drucken</Button>
        <span className="field__hint">Monatsplan auf einer Seite (A4 quer){vorlaeufig ? ' – noch vorläufig' : ''}</span>
      </div>
    </div>
  );
}
