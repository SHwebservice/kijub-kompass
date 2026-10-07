import { abwesendeAm, addTage, dienstStunden, feiertagAm, isoWochentag, monatTage, montagVon, type Abwesenheit, type Dienst, type Feiertag, type Tageskarte } from './dienstplan';
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

/** Nur Öffnungstage außerhalb einer Schließzeit lassen sich in der Matrix einteilen. */
export const bearbeitbar = (k: Tageskarte) => k.oeffnung !== null && !k.geschlossen;

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

/** Personen in den Entwurf übernehmen (nur hinzufügen); Tage mit Konflikt werden ausgelassen und gezählt. */
function uebernimm(karten: Tageskarte[], e: Entwurf, paare: { datum: string; person: string }[], abw: Abwesenheit[], feiertage: Feiertag[], treffId: string): ZeileErgebnis {
  let entwurf = e; let ausgelassen = 0;
  for (const { datum, person } of paare) {
    if (eingeteilt(karten, entwurf, datum, person)) continue;
    if (konfliktAm(datum, person, abw, feiertage, treffId)) { ausgelassen += 1; continue; }
    entwurf = setze(karten, entwurf, datum, person, true);
  }
  return { entwurf, ausgelassen };
}

/** Der wievielte dieses Wochentags im Monat (0 = erster). */
const vorkommen = (d: string) => Math.floor((Number(d.slice(8, 10)) - 1) / 7);

/**
 * Vormonat übernehmen: Wer im Vormonat am n-ten Montag (Dienstag …) im regulären Dienst stand, kommt am n-ten Montag dieses Monats dazu.
 * So bleiben auch wechselnde Wochen erhalten. Hat dieser Monat einen fünften Montag, der Vormonat aber nicht, gilt der letzte Montag des Vormonats.
 * Nur Personen, die noch im Team sind; Vorhandenes bleibt; Tage mit Konflikt werden ausgelassen.
 */
export function vormonatUebernehmen(
  karten: Tageskarte[], e: Entwurf, vormonat: string, diensteVormonat: Dienst[], team: string[], abw: Abwesenheit[], feiertage: Feiertag[], treffId: string,
): ZeileErgebnis {
  const regulaer = diensteVormonat.filter((d) => !d.ist_sonder);
  const vorTage = monatTage(vormonat);
  const paare = karten.filter(bearbeitbar).flatMap((k) => {
    const wt = isoWochentag(k.datum);
    const gleiche = vorTage.filter((d) => isoWochentag(d) === wt);
    const quelle = gleiche[Math.min(vorkommen(k.datum), gleiche.length - 1)];
    const personen = regulaer.find((d) => d.datum === quelle)?.personen ?? [];
    return personen.filter((p) => team.includes(p)).map((person) => ({ datum: k.datum, person }));
  });
  return uebernimm(karten, e, paare, abw, feiertage, treffId);
}

/** Montage der Wochen, die Öffnungstage in den Karten haben (für die Auswahl „Woche kopieren“). */
export const wochenDerKarten = (karten: Tageskarte[]) => [...new Set(karten.filter(bearbeitbar).map((k) => montagVon(k.datum)))].sort();

/**
 * Woche kopieren: Die Einteilung der Woche ab `quellMontag` (wie im Entwurf gerade zu sehen) kommt an denselben Wochentagen
 * in allen folgenden Wochen der Karten dazu. Vorhandenes bleibt; Tage mit Konflikt werden ausgelassen.
 */
export function wocheKopieren(karten: Tageskarte[], e: Entwurf, quellMontag: string, abw: Abwesenheit[], feiertage: Feiertag[], treffId: string): ZeileErgebnis {
  const quelle = new Map<number, string[]>();
  for (const k of karten.filter(bearbeitbar)) {
    if (k.datum < quellMontag || k.datum > addTage(quellMontag, 6)) continue;
    const personen = mitEntwurf(karten, e).find((x) => x.datum === k.datum)?.regulaer?.personen ?? [];
    quelle.set(isoWochentag(k.datum), personen);
  }
  const paare = karten.filter((k) => bearbeitbar(k) && k.datum > addTage(quellMontag, 6))
    .flatMap((k) => (quelle.get(isoWochentag(k.datum)) ?? []).map((person) => ({ datum: k.datum, person })));
  return uebernimm(karten, e, paare, abw, feiertage, treffId);
}

export interface OffenerWunsch { dienst: string; person: string; datum: string }

/** Offene Wünsche der Karten, getrennt nach „ohne Konflikt“ (lassen sich gesammelt bestätigen) und „mit Konflikt“ (einzeln entscheiden). */
export function offeneWunschListe(karten: Tageskarte[], abw: Abwesenheit[], feiertage: Feiertag[], treffId: string): { ohneKonflikt: OffenerWunsch[]; mitKonflikt: OffenerWunsch[] } {
  const alle = karten.flatMap((k) => (k.regulaer?.wuensche ?? []).filter((w) => w.status === 'offen')
    .map((w) => ({ dienst: k.regulaer!.id, person: w.person_id, datum: k.datum })));
  const zu = new Set(karten.filter((k) => k.geschlossen).map((k) => k.datum));
  const konflikt = (w: OffenerWunsch) => zu.has(w.datum) || konfliktAm(w.datum, w.person, abw, feiertage, treffId) !== null;
  return { ohneKonflikt: alle.filter((w) => !konflikt(w)), mitKonflikt: alle.filter(konflikt) };
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
