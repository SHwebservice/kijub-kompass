import { useEffect, useState } from 'react';
import { holeDiensteGesehen, merkeDiensteGesehen } from '../../treffs/api';

/**
 * „Neu seit deinem letzten Besuch“ bei den eigenen Diensten: liefert den Zeitpunkt des vorigen Besuchs (null = erster Besuch oder noch nicht geladen)
 * und merkt sich danach den jetzigen. So bleiben die Markierungen während dieses Besuchs sichtbar und verschwinden beim nächsten.
 */
export function useLetzterBesuchDienste(personId: string | undefined, merken = true): string | null {
  const [seit, setSeit] = useState<string | null>(null);
  useEffect(() => {
    if (!personId) return;
    let aktuell = true;
    void (async () => {
      try {
        const vorher = (await holeDiensteGesehen(personId)) ?? null;
        if (aktuell) setSeit(vorher);
        if (merken) await merkeDiensteGesehen(personId);
      } catch { /* ohne Stand gibt es eben keine Markierung */ }
    })();
    return () => { aktuell = false; };
  }, [personId, merken]);
  return seit;
}
