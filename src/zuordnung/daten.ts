import { useState } from 'react';
import { useLaden } from '../lib/laden';
import { useLive } from '../lib/live';
import {
  akzeptiereUeberschneidung, listeFreizeitTeams, listeTreffTeams, listeUeberschneidungsFreigaben, setzeFreizeitRolle, setzeTreffRolle, widerrufeUeberschneidung,
  type UeberschneidungFreigabe,
} from './api';
import { mitFreizeitRolle, mitTreffRolle, paarSchluessel, type Akzeptiert, type FreizeitRolle, type FreizeitTeamZeile, type TreffRolle, type TreffTeamZeile } from './logik';

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

/** Akzeptierte Überschneidungen: Schlüsselmenge für die Warnungen, Einzelheiten (wer, wann, Notiz) für die Detailansicht. */
export function useUeberschneidungen() {
  const l = useLaden(async () => (await listeUeberschneidungsFreigaben()) ?? [], 'ueberschneidungen-akzeptiert');
  const [kopie, setKopie] = useState<Spiegel<UeberschneidungFreigabe>>({ quelle: null, liste: null });
  if (l.daten !== kopie.quelle) setKopie({ quelle: l.daten, liste: l.daten });
  const liste = kopie.liste ?? [];
  const akzeptiert: Akzeptiert = new Set(liste.map((x) => paarSchluessel(x.person_id, x.freizeit_a, x.freizeit_b)));
  const ordne = (x: string, y: string) => (x < y ? [x, y] : [y, x]) as [string, string];

  return {
    akzeptiert,
    einzelheiten: (personId: string, x: string, y: string) => { const [a, b] = ordne(x, y); return liste.find((e) => e.person_id === personId && e.freizeit_a === a && e.freizeit_b === b); },
    laedt: l.laedt,
    fehler: l.fehler,
    async akzeptiere(personId: string, x: string, y: string, notiz: string | null) {
      await akzeptiereUeberschneidung(personId, x, y, notiz);
      const [a, b] = ordne(x, y);
      // Sofort anzeigen; Person und Zeitpunkt trägt die Datenbank ein und kommen beim nächsten Laden dazu
      setKopie((k) => ({ ...k, liste: [...(k.liste ?? []).filter((e) => !(e.person_id === personId && e.freizeit_a === a && e.freizeit_b === b)),
        { person_id: personId, freizeit_a: a, freizeit_b: b, notiz: notiz?.trim() ? notiz.trim() : null, akzeptiert_von: null, akzeptiert_am: new Date().toISOString() }] }));
      l.neuLaden();
    },
    async widerrufe(personId: string, x: string, y: string) {
      await widerrufeUeberschneidung(personId, x, y);
      const [a, b] = ordne(x, y);
      setKopie((k) => ({ ...k, liste: (k.liste ?? []).filter((e) => !(e.person_id === personId && e.freizeit_a === a && e.freizeit_b === b)) }));
      l.neuLaden();
    },
  };
}
