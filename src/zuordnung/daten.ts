import { useState } from 'react';
import { useLaden } from '../lib/laden';
import { useLive } from '../lib/live';
import { listeFreizeitTeams, listeTreffTeams, setzeFreizeitRolle, setzeTreffRolle } from './api';
import { mitFreizeitRolle, mitTreffRolle, type FreizeitRolle, type FreizeitTeamZeile, type TreffRolle, type TreffTeamZeile } from './logik';

interface Spiegel<T> { quelle: T[] | null; liste: T[] | null }

/**
 * Alle Zuordnungen (Freizeit- und Treffteams) zum Anzeigen und Ändern. Änderungen erscheinen sofort in der Anzeige,
 * sobald die Datenbank sie bestätigt hat; Änderungen anderer Personen kommen live nach.
 */
export function useZuordnungsdaten() {
  const f = useLaden(listeFreizeitTeams, 'zuordnung-freizeitteams');
  const t = useLaden(listeTreffTeams, 'zuordnung-treffteams');
  useLive(['freizeit_team', 'treff_team'], () => { f.neuLaden(); t.neuLaden(); });

  // Kopie der geladenen Daten, die nach einer Änderung sofort angepasst wird (und bei neu geladenen Daten wieder gleichgezogen)
  const [fs, setFs] = useState<Spiegel<FreizeitTeamZeile>>({ quelle: null, liste: null });
  const [ts, setTs] = useState<Spiegel<TreffTeamZeile>>({ quelle: null, liste: null });
  if (f.daten !== fs.quelle) setFs({ quelle: f.daten, liste: f.daten });
  if (t.daten !== ts.quelle) setTs({ quelle: t.daten, liste: t.daten });

  return {
    freizeitTeams: fs.liste ?? [],
    treffTeams: ts.liste ?? [],
    laedt: f.laedt || t.laedt,
    fehler: f.fehler ?? t.fehler,
    neuLaden: () => { f.neuLaden(); t.neuLaden(); },
    async setzeFreizeit(freizeitId: string, personId: string, rolle: FreizeitRolle | null) {
      await setzeFreizeitRolle(freizeitId, personId, rolle);
      setFs((s) => ({ ...s, liste: mitFreizeitRolle(s.liste ?? [], freizeitId, personId, rolle) }));
    },
    async setzeTreff(treffId: string, personId: string, rolle: TreffRolle | null) {
      await setzeTreffRolle(treffId, personId, rolle);
      setTs((s) => ({ ...s, liste: mitTreffRolle(s.liste ?? [], treffId, personId, rolle) }));
    },
  };
}
