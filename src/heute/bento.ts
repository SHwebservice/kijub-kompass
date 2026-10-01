import { phase, tageBisStart } from '../freizeiten/logik';
import { personenText } from './logik';
import type { Zaehler } from './kacheln';

/**
 * Das Kachelraster der Koordination: der Stand auf einen Blick, mit Zahlen. Jede Kachel führt dorthin, wo man etwas tun kann.
 * Die Freizeitenkoordination sieht Freizeit-Kacheln, die Treffkoordination Treff-Kacheln, wer beides ist, beides.
 */
export type BentoTon = 'haupt' | 'warnung' | 'ruhig';

export interface BentoKachel {
  id: string;
  label: string;
  zahl: string;
  unter: string;
  link: string;
  ton: BentoTon;
  /** Doppelt breit. */
  breit?: boolean;
}

interface AktuelleFreizeit { id: string; name: string; start_datum: string; ende_datum: string }

export interface BentoEingabe {
  freizeitkoordination: boolean;
  treffkoordination: boolean;
  heute: string;
  zaehler: Zaehler;
  /** Treffs, die heute ohne Protokoll sind. */
  ohneProtokoll: { id: string; name: string }[];
  /** Aktuelle Freizeiten (laufend oder in den nächsten zwei Wochen), nach Beginn sortiert. */
  aktuelle: AktuelleFreizeit[];
  laufendHeute: number;
  ohneLeitung: number;
  /** Ziele der Links, falls bekannt: Treff mit offenen Dienstwünschen, erster Treff. */
  wunschTreffId: string | null;
  erstesTreffId: string | null;
}

const ton = (n: number): BentoTon => (n > 0 ? 'warnung' : 'ruhig');

export function baueBento(e: BentoEingabe): BentoKachel[] {
  const k: BentoKachel[] = [];
  const z = e.zaehler;
  const fk = e.freizeitkoordination;
  const tk = e.treffkoordination;

  // Die große Kachel: was heute offen ist
  if (tk) {
    const n = e.ohneProtokoll.length;
    const freizeiten = fk && e.laufendHeute > 0 ? ` · ${personenText(e.laufendHeute, 'Freizeit läuft', 'Freizeiten laufen')}` : '';
    k.push({
      id: 'heute', label: 'Heute offen', zahl: String(n), breit: true, ton: 'haupt',
      unter: (n > 0 ? `${personenText(n, 'Treff ohne Protokoll', 'Treffs ohne Protokoll')}: ${e.ohneProtokoll.map((t) => t.name).join(', ')}` : 'Alle Tagesprotokolle sind da') + freizeiten,
      link: n === 1 ? `/treffs/${e.ohneProtokoll[0]!.id}/protokoll` : '/treffs',
    });
  } else if (fk) {
    k.push({ id: 'heute', label: 'Heute', zahl: String(e.laufendHeute), breit: true, ton: 'haupt', unter: e.laufendHeute === 1 ? 'Freizeit läuft gerade' : 'Freizeiten laufen gerade', link: '/freizeiten' });
  }

  if (fk) k.push({ id: 'bewerbungen', label: 'Bewerbungen', zahl: String(z.bewerbungen), unter: z.bewerbungen > 0 ? 'warten auf Entscheidung' : 'keine offen', link: '/bewerbungen', ton: ton(z.bewerbungen) });
  k.push({ id: 'vorschlaege', label: 'Katalog-Vorschläge', zahl: String(z.vorschlaege), unter: z.vorschlaege > 0 ? 'warten auf Prüfung' : 'keine offen', link: '/katalog/vorschlaege', ton: ton(z.vorschlaege) });

  if (fk) {
    const f = e.aktuelle[0];
    if (f) {
      const laeuft = phase(f, e.heute) === 'laufend';
      const bis = tageBisStart(f, e.heute);
      k.push({ id: 'naechste', label: laeuft ? 'Läuft gerade' : 'Nächste Freizeit', zahl: laeuft ? 'jetzt' : `in ${bis} ${bis === 1 ? 'Tag' : 'Tagen'}`, unter: f.name, link: `/freizeiten/${f.id}`, ton: 'ruhig' });
    }
    k.push({ id: 'lebensmittel', label: 'Lebensmittel', zahl: String(z.knapp), unter: z.knapp > 0 ? 'knapp oder leer' : 'alles da', link: f ? `/freizeiten/${f.id}/lebensmittel` : '/freizeiten', ton: ton(z.knapp) });
    if (e.ohneLeitung > 0) k.push({ id: 'ohne-leitung', label: 'Ohne Leitung', zahl: String(e.ohneLeitung), unter: e.ohneLeitung === 1 ? 'Freizeit hat noch keine Leitung' : 'Freizeiten haben noch keine Leitung', link: '/freizeiten', ton: 'warnung' });
  }

  if (tk) {
    k.push({ id: 'wuensche', label: 'Dienstwünsche', zahl: String(z.wuensche), unter: z.wuensche > 0 ? 'warten auf Antwort' : 'keine offen', link: e.wunschTreffId ? `/treffs/${e.wunschTreffId}/dienstplan` : '/treffs', ton: ton(z.wuensche) });
    k.push({ id: 'nachweise', label: 'Nachweise', zahl: String(z.nachweise), unter: z.nachweise > 0 ? 'eingereicht, noch offen' : 'keine offen', link: e.erstesTreffId ? `/treffs/${e.erstesTreffId}/nachweis` : '/treffs', ton: ton(z.nachweise) });
  }

  k.push({ id: 'fehler', label: 'Fehlermeldungen', zahl: String(z.fehler), unter: z.fehler > 0 ? 'in der App aufgetreten' : 'keine', link: '/fehler', ton: ton(z.fehler) });
  return k;
}
