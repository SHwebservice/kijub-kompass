/** Antwort der Datenbankfunktion fn_kijuko_import (Vorschau und Anwenden). */
export interface Konflikt {
  schluessel: string;
  art: string;
  name: string;
  feld: string;
  kompass: unknown;
  kijuko: unknown;
}

export interface Entfallen { art: string; name: string; schluessel: string }

export interface ImportErgebnis {
  angewendet: boolean;
  zaehler: Record<string, Record<string, number | undefined> | undefined>;
  aenderungen: { art: string; name: string; felder: { feld: string; von: unknown; nach: unknown }[] }[];
  konflikte: Konflikt[];
  entfallen: Entfallen[];
  hinweise: string[];
  uebersprungen: { art: string; name: string; grund: string }[];
}

/** 'kijuko' = KiJuKo-Wert übernehmen, 'kompass' = Kompass-Wert behalten; ohne Eintrag bleibt der Konflikt offen. */
export type Entscheidungen = Record<string, 'kijuko' | 'kompass'>;

export const ARTEN: { schluessel: string; label: string }[] = [
  { schluessel: 'orte', label: 'Orte' },
  { schluessel: 'personen', label: 'Personen' },
  { schluessel: 'freizeiten', label: 'Freizeiten' },
  { schluessel: 'zuteilungen', label: 'Zuteilungen' },
  { schluessel: 'verpflegung', label: 'Verpflegung' },
  { schluessel: 'material', label: 'Material' },
];

export const FELD_LABEL: Record<string, string> = {
  name: 'Name', adresse: 'Adresse', lieferstelle_nr: 'Lieferstelle', vorname: 'Vorname', nachname: 'Nachname', mail: 'Mail',
  telefon: 'Telefon', ernaehrung: 'Ernährung', notizen: 'Notizen', kategorie: 'Kategorie', aktiv: 'Aktiv', status: 'Status',
  ferienzeitraum: 'Ferienzeit', ferienwoche: 'Ferienwoche', start_datum: 'Start', ende_datum: 'Ende',
  arbeitsbeginn: 'Arbeitsbeginn', arbeitsende: 'Arbeitsende', alter_von: 'Alter von', alter_bis: 'Alter bis',
  max_teilnehmende: 'Max. Teilnehmende', kijuko_code: 'KiJuKo-Code', kijuko_serie_id: 'Serie', ort_id: 'Ort', rolle: 'Rolle',
};

export function feldLabel(feld: string): string { return FELD_LABEL[feld] ?? feld; }

/** Anzeige eines Werts aus der Datenbank (null → Strich, Wahrheitswerte auf Deutsch). */
export function wertText(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'ja' : 'nein';
  return String(v);
}

export interface Summe { neu: number; geaendert: number; unveraendert: number; weg: number }

/** Fasst die Zähler einer Art zusammen ("weg" = entfernt, gelöscht oder entfallen). */
export function summe(z: Record<string, number | undefined> | undefined): Summe {
  const n = (k: string) => z?.[k] ?? 0;
  return { neu: n('neu'), geaendert: n('geaendert'), unveraendert: n('unveraendert'), weg: n('geloescht') + n('entfernt') };
}

/** Wurde etwas geschrieben bzw. würde etwas geschrieben? */
export function hatAenderungen(e: ImportErgebnis): boolean {
  return ARTEN.some((a) => { const s = summe(e.zaehler[a.schluessel]); return s.neu + s.geaendert + s.weg > 0; });
}
