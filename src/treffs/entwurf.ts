import { abwesendeAm, dienstStunden, feiertagAm, type Abwesenheit, type Feiertag, type Tageskarte } from './dienstplan';
import type { Paar } from './monatsplan';

/**
 * Entwurf für die bearbeitbare Einsatz-Matrix: Die Treffleitung klickt Zellen (Person × Öffnungstag) an oder aus, füllt ganze Zeilen
 * oder zieht über mehrere Tage. Gespeichert wird erst am Ende in einem Schritt. Der Entwurf merkt sich nur Zellen, die vom gespeicherten
 * Stand abweichen; was zurückgeklickt wird, fällt wieder heraus. Betroffen ist nur der reguläre Dienst eines Öffnungstags, Sonderdienste nicht.
 * Reine Fachlogik ohne Datenbank und Oberfläche.
 */

/** Schlüssel "JJJJ-MM-TT|person" → gewünschter Stand (true = eingeteilt). */
export type Entwurf = ReadonlyMap<string, boolean>;

export const LEERER_ENTWURF: Entwurf = new Map();

const schluessel = (datum: string, person: string) => `${datum}|${person}`;

/** Gespeicherter Stand: Ist die Person im regulären Dienst des Tages eingeteilt? */
const gespeichert = (karten: Tageskarte[], datum: string, person: string) =>
  karten.find((k) => k.datum === datum)?.regulaer?.personen.includes(person) ?? false;

/** Nur Öffnungstage lassen sich in der Matrix einteilen. */
export const bearbeitbar = (k: Tageskarte) => k.oeffnung !== null;

export function eingeteilt(karten: Tageskarte[], e: Entwurf, datum: string, person: string): boolean {
  return e.get(schluessel(datum, person)) ?? gespeichert(karten, datum, person);
}

/** Setzt eine Zelle auf einen Stand; entspricht er dem gespeicherten, verschwindet sie aus dem Entwurf. */
export function setze(karten: Tageskarte[], e: Entwurf, datum: string, person: string, wert: boolean): Entwurf {
  const k = karten.find((x) => x.datum === datum);
  if (!k || !bearbeitbar(k)) return e;
  const s = schluessel(datum, person);
  if ((e.get(s) ?? gespeichert(karten, datum, person)) === wert) return e;
  const n = new Map(e);
  if (gespeichert(karten, datum, person) === wert) n.delete(s); else n.set(s, wert);
  return n;
}

export const umschalten = (karten: Tageskarte[], e: Entwurf, datum: string, person: string) =>
  setze(karten, e, datum, person, !eingeteilt(karten, e, datum, person));

/** Urlaub, Krankheit oder Feiertag: Beim Füllen und Ziehen wird hier nicht eingeteilt – nur, wenn man die Zelle einzeln anklickt. */
export function konfliktAm(datum: string, person: string, abwesenheiten: Abwesenheit[], feiertage: Feiertag[], treffId: string): string | null {
  const weg = abwesendeAm(datum, abwesenheiten).find((a) => a.person_id === person);
  if (weg) return weg.typ === 'urlaub' ? 'Urlaub' : 'krank';
  const f = feiertagAm(datum, feiertage, treffId);
  return f ? `Feiertag: ${f.bezeichnung}` : null;
}

export interface ZeileErgebnis { entwurf: Entwurf; ausgelassen: number }

/**
 * Ganze Zeile: Ist die Person an allen Öffnungstagen ohne Konflikt schon eingeteilt, wird sie überall herausgenommen;
 * sonst an allen diesen Tagen eingeteilt. Tage mit Konflikt bleiben, wie sie sind, und werden gezählt.
 */
export function zeileFuellen(
  karten: Tageskarte[], e: Entwurf, person: string, abwesenheiten: Abwesenheit[], feiertage: Feiertag[], treffId: string,
): ZeileErgebnis {
  const tage = karten.filter(bearbeitbar).map((k) => k.datum);
  const frei = tage.filter((d) => !konfliktAm(d, person, abwesenheiten, feiertage, treffId));
  const alleDrin = tage.every((d) => !frei.includes(d) || eingeteilt(karten, e, d, person)) && frei.length > 0;
  if (alleDrin) return { entwurf: tage.reduce((n, d) => setze(karten, n, d, person, false), e), ausgelassen: 0 };
  const ausgelassen = tage.filter((d) => !frei.includes(d) && !eingeteilt(karten, e, d, person)).length;
  return { entwurf: frei.reduce((n, d) => setze(karten, n, d, person, true), e), ausgelassen };
}

/** Die Tageskarten, wie sie nach dem Speichern aussähen (für Anzeige, Besetzung und Stunden). Ein neuer Dienst hat die Öffnungszeit. */
export function mitEntwurf(karten: Tageskarte[], e: Entwurf): Tageskarte[] {
  if (e.size === 0) return karten;
  return karten.map((k) => {
    if (!bearbeitbar(k)) return k;
    const aenderungen = [...e].filter(([s]) => s.startsWith(`${k.datum}|`)).map(([s, wert]) => [s.slice(11), wert] as const);
    if (aenderungen.length === 0) return k;
    const personen = new Set(k.regulaer?.personen ?? []);
    for (const [person, wert] of aenderungen) if (wert) personen.add(person); else personen.delete(person);
    const regulaer = k.regulaer ?? { id: `neu-${k.datum}`, datum: k.datum, von: k.oeffnung!.von, bis: k.oeffnung!.bis, ist_sonder: false, bezeichnung: null, personen: [], wuensche: [] };
    return { ...k, regulaer: { ...regulaer, personen: [...personen] } };
  });
}

/** Die Änderungen für fn_dienstplan_anwenden, nach Datum und Person sortiert. */
export function aenderungen(e: Entwurf): { zuteilen: Paar[]; entfernen: Paar[] } {
  const zuteilen: Paar[] = []; const entfernen: Paar[] = [];
  for (const [s, wert] of e) (wert ? zuteilen : entfernen).push({ datum: s.slice(0, 10), person: s.slice(11) });
  const sortiert = (l: Paar[]) => l.sort((a, b) => a.datum.localeCompare(b.datum) || a.person.localeCompare(b.person));
  return { zuteilen: sortiert(zuteilen), entfernen: sortiert(entfernen) };
}

/** Stunden einer Person in den Karten: reguläre Dienste und Sonderdienste. */
export function stundenVon(karten: Tageskarte[], person: string): number {
  const h = karten.flatMap((k) => [k.regulaer, ...k.sonder]).filter((d) => d?.personen.includes(person)).reduce((n, d) => n + dienstStunden(d!), 0);
  return Math.round(h * 100) / 100;
}
