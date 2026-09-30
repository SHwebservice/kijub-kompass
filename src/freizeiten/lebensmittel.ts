import { bestand, hochrechnung, tageVonBis, type BestandStatus } from './logik';

/** Lebensmittelbestand je Ort: Wareneingang und Verbrauch, Ampel und Hochrechnung. */

export interface Eingang { id: string; name: string; menge: number; einheit: string | null; datum: string; freizeit_id: string | null }
export interface Verbrauch { id: string; name: string; menge: number; datum: string; freizeit_id: string | null }

export interface Artikel {
  name: string;
  einheit: string;
  erhalten: number;
  verbraucht: number;
  rest: number;
  status: BestandStatus;
  prozent: number;
  eingaenge: Eingang[];
  verbrauch: Verbrauch[];
  prognose: { bedarf: number; resttage: number; reicht: boolean } | null;
}

/** "1,5" oder "1.5" → 1.5; ungültig, leer oder nicht positiv → null. */
export function parseMenge(t: string): number | null {
  const s = t.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return n > 0 && Number.isFinite(n) ? n : null;
}

/** Deutsche Darstellung: 1.5 → "1,5", 100 → "100". */
export function formatMenge(n: number): string {
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 }).format(n);
}

const schluessel = (name: string) => name.trim().toLowerCase();
const REIHENFOLGE: Record<BestandStatus, number> = { leer: 0, knapp: 1, ok: 2 };

/**
 * Fasst Eingänge und Verbrauch zu Artikeln zusammen (gleicher Name = gleicher Artikel, ohne Beachtung der Schreibweise).
 * Die Hochrechnung nutzt den Verbrauch DIESER Freizeit an ihren Tagen; der Bestand gilt für den ganzen Ort.
 */
export function artikelListe(
  eingaenge: Eingang[],
  verbrauch: Verbrauch[],
  freizeit: { id: string; start_datum: string; ende_datum: string },
): Artikel[] {
  const tage = tageVonBis(freizeit.start_datum, freizeit.ende_datum);
  const namen = new Map<string, string>();
  for (const e of [...eingaenge].sort((a, b) => a.datum.localeCompare(b.datum))) if (!namen.has(schluessel(e.name))) namen.set(schluessel(e.name), e.name.trim());

  const liste = [...namen.entries()].map(([k, name]): Artikel => {
    const ein = eingaenge.filter((e) => schluessel(e.name) === k);
    const ver = verbrauch.filter((v) => schluessel(v.name) === k);
    const erhalten = ein.reduce((s, e) => s + e.menge, 0);
    const verbraucht = ver.reduce((s, v) => s + v.menge, 0);
    const b = bestand(erhalten, verbraucht);
    const einheit = ein.find((e) => e.einheit)?.einheit ?? '';
    const proTag = tage.map((datum) => ({ datum, menge: ver.filter((v) => v.freizeit_id === freizeit.id && v.datum === datum).reduce((s, v) => s + v.menge, 0) }));
    return {
      name, einheit, erhalten, verbraucht, ...b,
      eingaenge: ein.sort((a, c) => a.datum.localeCompare(c.datum)),
      verbrauch: ver.sort((a, c) => c.datum.localeCompare(a.datum)),
      prognose: b.status === 'leer' ? null : hochrechnung(proTag, tage, b.rest),
    };
  });
  return liste.sort((a, b) => REIHENFOLGE[a.status] - REIHENFOLGE[b.status] || a.name.localeCompare(b.name, 'de'));
}

/** Ein Tag für neuen Verbrauch: heute, wenn er in der Freizeit liegt, sonst der erste oder letzte Tag. */
export function standardTag(freizeit: { start_datum: string; ende_datum: string }, heute: string): string {
  if (heute < freizeit.start_datum) return freizeit.start_datum;
  if (heute > freizeit.ende_datum) return freizeit.ende_datum;
  return heute;
}
