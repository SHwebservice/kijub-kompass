/**
 * Die fünf Vordrucke der Teamermappe (Anwesenheitsliste, Tagesbericht, Unfallbericht, Bescheinigung Abholen, Stundenmeldung):
 * Datenformen, Beispiele mit Musternamen, leere Vordrucke und robustes Einlesen gespeicherter Daten.
 */

export type FormularTyp = 'anwesenheit' | 'tagesbericht' | 'unfallbericht' | 'bescheinigung' | 'stundenmeldung';

export interface AnwesenheitZeile { name: string; status: string[] }
export interface Anwesenheit { massnahme: string; teamerGruppe: string; days: string[]; rows: AnwesenheitZeile[] }
export interface Tagesbericht { freizeitGruppe: string; teamer: string; datum: string; bericht: string; fehlendeKinder: string; unterschrift: string }
export interface Unfallbericht { datum: string; betroffene: string; betreuungskraft: string; ortUhrzeit: string; schaeden: string; schilderung: string; unterschrift: string }
export interface Bescheinigung { kind: string; regelung: 'allein' | 'abgeholt'; alleinFreizeit: string; weitereAbholberechtigte: string; ortDatum: string; unterschrift: string }
export interface StundenZeile { datum: string; vormittag: string; nachmittag: string; stunden: string; zwischensumme: string }
export interface Stundenmeldung {
  datum: string; freizeit: string; zeitraum: string; nachname: string; vorname: string; rows: StundenZeile[];
  unterschriftBetreuer: string; unterschriftLeitung: string;
}

export interface FormularDaten {
  anwesenheit: Anwesenheit;
  tagesbericht: Tagesbericht;
  unfallbericht: Unfallbericht;
  bescheinigung: Bescheinigung;
  stundenmeldung: Stundenmeldung;
}

export interface TypInfo { id: FormularTyp; label: string; pdf: string; /** Nur als PDF/auf dem Gerät – enthält Namen von Kindern und wird nie gespeichert. */ nurLokal: boolean }

export const TYPEN: TypInfo[] = [
  { id: 'anwesenheit', label: 'Anwesenheitsliste', pdf: 'Anwesenheitsliste.pdf', nurLokal: true },
  { id: 'tagesbericht', label: 'Tagesbericht', pdf: 'Tagesbericht.pdf', nurLokal: false },
  { id: 'unfallbericht', label: 'Unfallbericht', pdf: 'Unfallbericht.pdf', nurLokal: false },
  { id: 'bescheinigung', label: 'Bescheinigung Abholen', pdf: 'Bescheinigung_Abholen.pdf', nurLokal: false },
  { id: 'stundenmeldung', label: 'Stundenmeldung', pdf: 'Stundenmeldung.pdf', nurLokal: false },
];

export const typInfo = (t: FormularTyp) => TYPEN.find((x) => x.id === t)!;

export const BEISPIELE: FormularDaten = {
  anwesenheit: {
    massnahme: 'Sommer-Sause 2',
    teamerGruppe: 'Gruppe 2 – Miriam Mustermann',
    days: ['17.7', '18.7', '19.07', '20.07', '21.07', '24.07', '25.07', '26.07', '27.07', '28.07'],
    rows: [
      { name: 'Apfel, Amelie', status: ['X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X'] },
      { name: 'Bertram, Bettina', status: ['X', 'X', 'X', 'E', 'E', 'X', 'X', 'X', 'X', 'X'] },
      { name: 'Ciesel, Christa', status: ['X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X'] },
      { name: 'Demmel, Dina', status: ['X', 'X', 'X', '', '', 'X', 'X', 'X', 'X', 'X'] },
      { name: 'Esel, Emily', status: ['E', 'E', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X'] },
      { name: 'Faller, Frauke', status: ['X', 'E', 'E', 'E', 'X', 'X', 'X', 'X', 'X', 'X'] },
      { name: 'Gustavson, Gerda', status: ['X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X'] },
      { name: 'Hauser, Hanna', status: ['X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X'] },
    ],
  },
  tagesbericht: {
    freizeitGruppe: 'Sommer-Sause 2, Gruppe 2',
    teamer: 'Miriam Mustermann',
    datum: '2026-08-15',
    bericht: '07.30–08.00 Uhr   Teamsitzung\n08.30–09.00 Uhr   Frühstück\n09.10–10.30 Uhr   Fertigung von Gipsmasken\n10.30–11.30 Uhr   Ballspiele\n12.00–12.30 Uhr   Mittagessen\n12.30–13.45 Uhr   Freispiel – Knüpfen von Freundschaftsbändern\n14.00–15.00 Uhr   Schwimmen\n15.00–16.00 Uhr   Volleyball\n\nBeate Beispiel klagte beim Mittagessen über Bauchschmerzen, kaum gegessen. Ab 12.30 Uhr keine Schmerzen mehr.\n\nMaria Muster fiel beim Volleyball hin. Knie blutete. Wundversorgung mit Pflaster (15.30 Uhr).',
    fehlendeKinder: 'keine',
    unterschrift: 'Mustermann Miriam',
  },
  unfallbericht: {
    datum: '2026-08-05',
    betroffene: 'Finn Fischer (Teilnehmer)\nLea Lehmann (Teilnehmerin, leichte Schürfwunde)',
    betreuungskraft: 'Miriam Mustermann',
    ortUhrzeit: 'Sportplatz hinter der Sporthalle, ca. 15.10 Uhr',
    schaeden: 'Schürfwunde am Knie (Finn Fischer). Keine Sachschäden.',
    schilderung: 'Finn ist beim Fangenspielen über eine Bordsteinkante gestolpert und hingefallen. Wunde sofort gereinigt und mit Pflaster versorgt, Kind konnte weiterspielen. Eltern beim Abholen informiert.',
    unterschrift: 'Mustermann Miriam',
  },
  bescheinigung: {
    kind: 'Finn Fischer',
    regelung: 'abgeholt',
    alleinFreizeit: '',
    weitereAbholberechtigte: 'Oma Erika Fischer (0151 2345678)\nOnkel Tom Fischer (0160 9988776)',
    ortDatum: 'Frankenthal, den 21.07.2026',
    unterschrift: 'Julia Fischer',
  },
  stundenmeldung: {
    datum: '2026-08-16',
    freizeit: 'Sommer-Sause 2',
    zeitraum: '21.07.–01.08.2026',
    nachname: 'Mustermann',
    vorname: 'Miriam',
    rows: [
      { datum: '21.07.', vormittag: '07:30–12:00', nachmittag: '14:00–17:00', stunden: '7,5', zwischensumme: '' },
      { datum: '22.07.', vormittag: '07:30–12:00', nachmittag: '14:00–17:00', stunden: '7,5', zwischensumme: '' },
      { datum: '23.07.', vormittag: '07:30–12:00', nachmittag: '14:00–17:00', stunden: '7,5', zwischensumme: '22,5' },
    ],
    unterschriftBetreuer: 'Mustermann Miriam',
    unterschriftLeitung: 'Schmidt',
  },
};

export const leereStundenZeile = (): StundenZeile => ({ datum: '', vormittag: '', nachmittag: '', stunden: '', zwischensumme: '' });

/** Leerer Vordruck. */
export function leer<T extends FormularTyp>(typ: T): FormularDaten[T];
export function leer(typ: FormularTyp): FormularDaten[FormularTyp] {
  switch (typ) {
    case 'anwesenheit': return { massnahme: '', teamerGruppe: '', days: ['', '', '', '', ''], rows: [{ name: '', status: ['', '', '', '', ''] }] };
    case 'tagesbericht': return { freizeitGruppe: '', teamer: '', datum: '', bericht: '', fehlendeKinder: '', unterschrift: '' };
    case 'unfallbericht': return { datum: '', betroffene: '', betreuungskraft: '', ortUhrzeit: '', schaeden: '', schilderung: '', unterschrift: '' };
    case 'bescheinigung': return { kind: '', regelung: 'abgeholt', alleinFreizeit: '', weitereAbholberechtigte: '', ortDatum: '', unterschrift: '' };
    case 'stundenmeldung': return { datum: '', freizeit: '', zeitraum: '', nachname: '', vorname: '', rows: [leereStundenZeile()], unterschriftBetreuer: '', unterschriftLeitung: '' };
  }
}

const s = (v: unknown): string => (typeof v === 'string' ? v : '');
const obj = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Liest gespeicherte Daten ein; Fehlendes wird aus dem leeren Vordruck ergänzt, Unbrauchbares verworfen. */
export function normalisiereFormular<T extends FormularTyp>(typ: T, roh: unknown): FormularDaten[T];
export function normalisiereFormular(typ: FormularTyp, roh: unknown): FormularDaten[FormularTyp] {
  const o = obj(roh);
  switch (typ) {
    case 'anwesenheit': {
      const days = arr(o.days).map(s);
      const tage = days.length ? days : leer('anwesenheit').days;
      const rows = arr(o.rows).map((r) => {
        const z = obj(r);
        const status = arr(z.status).map(s);
        return { name: s(z.name), status: tage.map((_, i) => status[i] ?? '') };
      });
      return { massnahme: s(o.massnahme), teamerGruppe: s(o.teamerGruppe), days: tage, rows: rows.length ? rows : leer('anwesenheit').rows.map((r) => ({ ...r, status: tage.map(() => '') })) };
    }
    case 'tagesbericht': return { freizeitGruppe: s(o.freizeitGruppe), teamer: s(o.teamer), datum: s(o.datum), bericht: s(o.bericht), fehlendeKinder: s(o.fehlendeKinder), unterschrift: s(o.unterschrift) };
    case 'unfallbericht':
      return { datum: s(o.datum), betroffene: s(o.betroffene), betreuungskraft: s(o.betreuungskraft), ortUhrzeit: s(o.ortUhrzeit), schaeden: s(o.schaeden), schilderung: s(o.schilderung), unterschrift: s(o.unterschrift) };
    case 'bescheinigung':
      return { kind: s(o.kind), regelung: o.regelung === 'allein' ? 'allein' : 'abgeholt', alleinFreizeit: s(o.alleinFreizeit), weitereAbholberechtigte: s(o.weitereAbholberechtigte), ortDatum: s(o.ortDatum), unterschrift: s(o.unterschrift) };
    case 'stundenmeldung': {
      const rows = arr(o.rows).map((r) => { const z = obj(r); return { datum: s(z.datum), vormittag: s(z.vormittag), nachmittag: s(z.nachmittag), stunden: s(z.stunden), zwischensumme: s(z.zwischensumme) }; });
      return {
        datum: s(o.datum), freizeit: s(o.freizeit), zeitraum: s(o.zeitraum), nachname: s(o.nachname), vorname: s(o.vorname),
        rows: rows.length ? rows : [leereStundenZeile()], unterschriftBetreuer: s(o.unterschriftBetreuer), unterschriftLeitung: s(o.unterschriftLeitung),
      };
    }
  }
}

/** Beispiele der Koordination über den Standard legen (fehlende Typen fallen auf die eingebauten Beispiele zurück). */
export function beispieleAus(roh: unknown): FormularDaten {
  const o = obj(roh);
  return {
    anwesenheit: o.anwesenheit ? normalisiereFormular('anwesenheit', o.anwesenheit) : structuredClone(BEISPIELE.anwesenheit),
    tagesbericht: o.tagesbericht ? normalisiereFormular('tagesbericht', o.tagesbericht) : structuredClone(BEISPIELE.tagesbericht),
    unfallbericht: o.unfallbericht ? normalisiereFormular('unfallbericht', o.unfallbericht) : structuredClone(BEISPIELE.unfallbericht),
    bescheinigung: o.bescheinigung ? normalisiereFormular('bescheinigung', o.bescheinigung) : structuredClone(BEISPIELE.bescheinigung),
    stundenmeldung: o.stundenmeldung ? normalisiereFormular('stundenmeldung', o.stundenmeldung) : structuredClone(BEISPIELE.stundenmeldung),
  };
}

/** Summe der „Stunden insgesamt“ (Komma oder Punkt als Dezimalzeichen, Unleserliches zählt 0). */
export function stundenSumme(rows: Pick<StundenZeile, 'stunden'>[]): number {
  const t = rows.reduce((sum, r) => { const n = parseFloat(r.stunden.replace(',', '.')); return sum + (Number.isFinite(n) ? n : 0); }, 0);
  return Math.round(t * 100) / 100;
}

/** Ein Tag mehr bzw. eine Teilnehmerzeile mehr (Anwesenheitsliste: so viele Felder wie Tagesspalten). */
export const neueAnwesenheitZeile = (days: string[]): AnwesenheitZeile => ({ name: '', status: days.map(() => '') });

/** Neue Tagesspalte; bestehende Zeilen bekommen ein leeres Feld dazu. */
export function tagHinzufuegen(a: Anwesenheit): Anwesenheit {
  return { ...a, days: [...a.days, ''], rows: a.rows.map((r) => ({ ...r, status: [...r.status, ''] })) };
}

export function tagEntfernen(a: Anwesenheit, i: number): Anwesenheit {
  if (a.days.length <= 1) return a;
  return { ...a, days: a.days.filter((_, j) => j !== i), rows: a.rows.map((r) => ({ ...r, status: r.status.filter((_, j) => j !== i) })) };
}

/** Anwesenheit E/U/X: nur ein bis zwei Zeichen, großgeschrieben. */
export const statusWert = (v: string) => v.trim().toUpperCase().slice(0, 2);

/** Dateiname für den PDF-Vorschlag des Browsers, z. B. "Tagesbericht_2026-08-15". */
export function druckTitel(typ: FormularTyp, d: FormularDaten[FormularTyp]): string {
  const name = typInfo(typ).label.replace(/\s+/g, '-');
  const datum = 'datum' in d && typeof d.datum === 'string' && d.datum ? `_${d.datum}` : '';
  return `${name}${datum}`;
}
