import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../lib/auth-kontext';
import { istApple, pruefeStatus, schalteAus, schalteEin, type GeraeteStatus } from '../mitteilungen/geraet';
import { sendeMitteilung } from '../mitteilungen/senden';
import { Alert, Button, Card } from '../components/ui';

const STANDARD_TEXT: Record<Exclude<GeraeteStatus, 'aus' | 'an' | 'nicht_unterstuetzt'>, string> = {
  nicht_eingerichtet: 'Mitteilungen sind noch nicht eingerichtet. Bitte bei der Koordination melden.',
  verweigert: 'Du hast Mitteilungen für diese Seite blockiert. Erlaube sie in den Einstellungen deines Browsers (Schloss-Symbol neben der Adresse) und lade die Seite neu.',
};

/** Mitteilungen (Web-Push) auf diesem Gerät ein- und ausschalten und testen. */
export function MitteilungenKarte() {
  const { ich } = useAuth();
  const [status, setStatus] = useState<GeraeteStatus | null>(null);
  const [meldung, setMeldung] = useState<{ ton: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [arbeitet, setArbeitet] = useState(false);

  const laden = useCallback(async () => {
    if (!ich) return;
    try { setStatus(await pruefeStatus(ich.id)); } catch { setStatus('aus'); }
  }, [ich]);

  // Stand beim Öffnen der Seite lesen (Browser-Abfrage, daher im Effekt)
  useEffect(() => { let aktuell = true; void (async () => { if (!ich) return; let s: GeraeteStatus; try { s = await pruefeStatus(ich.id); } catch { s = 'aus'; } if (aktuell) setStatus(s); })(); return () => { aktuell = false; }; }, [ich]);

  if (!ich) return null;

  async function einschalten() {
    setArbeitet(true); setMeldung(null);
    try { await schalteEin(ich!.id); setMeldung({ ton: 'success', text: 'Mitteilungen sind auf diesem Gerät eingeschaltet.' }); }
    catch (e) { setMeldung({ ton: 'error', text: e instanceof Error ? e.message : 'Das Einschalten hat nicht geklappt.' }); }
    finally { setArbeitet(false); await laden(); }
  }

  async function ausschalten() {
    setArbeitet(true); setMeldung(null);
    await schalteAus(ich!.id);
    setArbeitet(false); setMeldung({ ton: 'info', text: 'Mitteilungen sind auf diesem Gerät ausgeschaltet.' });
    await laden();
  }

  async function testen() {
    setArbeitet(true); setMeldung(null);
    try {
      const r = await sendeMitteilung('test');
      setMeldung(r.gesendet > 0
        ? { ton: 'success', text: `Testmitteilung an ${r.gesendet} ${r.gesendet === 1 ? 'Gerät' : 'Geräte'} gesendet. Sie sollte gleich erscheinen.` }
        : { ton: 'error', text: 'Es konnte an kein Gerät gesendet werden. Schalte die Mitteilungen aus und wieder ein.' });
    } catch (e) { setMeldung({ ton: 'error', text: e instanceof Error ? e.message : 'Die Testmitteilung konnte nicht gesendet werden.' }); }
    finally { setArbeitet(false); await laden(); }
  }

  return (
    <Card>
      <h2>Mitteilungen</h2>
      {status === null && <p className="field__hint">Wird geprüft …</p>}
      {status === 'nicht_unterstuetzt' && (
        <p>
          Dieser Browser kann keine Mitteilungen anzeigen.
          {istApple() && ' Auf dem iPhone und iPad geht das erst, wenn du die Seite zum Home-Bildschirm hinzufügst (Teilen → „Zum Home-Bildschirm“) und die App von dort öffnest.'}
        </p>
      )}
      {(status === 'nicht_eingerichtet' || status === 'verweigert') && <p>{STANDARD_TEXT[status]}</p>}
      {status === 'aus' && (
        <>
          <p>Bekomme eine Mitteilung auf dieses Gerät, wenn es etwas Neues für dich gibt – zum Beispiel einen Hinweis, eine Absprache oder eine Änderung im Dienstplan.</p>
          <Button variante="primary" laedt={arbeitet} onClick={() => void einschalten()}>Mitteilungen einschalten</Button>
        </>
      )}
      {status === 'an' && (
        <>
          <p>Mitteilungen sind auf diesem Gerät <strong>eingeschaltet</strong>.</p>
          <div className="row">
            <Button laedt={arbeitet} onClick={() => void testen()}>Testmitteilung senden</Button>
            <Button variante="ghost" disabled={arbeitet} onClick={() => void ausschalten()}>Ausschalten</Button>
          </div>
        </>
      )}
      {meldung && <Alert ton={meldung.ton}>{meldung.text}</Alert>}
    </Card>
  );
}
