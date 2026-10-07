import { formatKurz } from '../freizeiten/logik';
import { abwesendeAm, feiertagAm, geschlossenAm, isoWochentag, monatTage, type Abwesenheit, type Dienst, type Feiertag, type Schliesszeit } from './dienstplan';
import type { Oeffnungszeit } from './logik';

/**
 * Einen Monat einteilen: je Person die Wochentage, an denen sie arbeitet. Daraus entsteht die Liste der Änderungen,
 * die die Treffleitung vor dem Speichern sieht. Vorhandene Einteilungen bleiben (weitere Personen kommen dazu) – außer im Modus „ersetzen“.
 * Konflikte (Urlaub oder Krankheit, Feiertag) entscheidet die Treffleitung selbst: Ohne Erlaubnis wird nicht eingeteilt.
 * Reine Fachlogik ohne Datenbank und Oberfläche.
 */

/** Person → Wochentage (1 = Montag … 7 = Sonntag). */
export type PersonMuster = Record<string, number[]>;
export type Modus = 'hinzufuegen' | 'ersetzen';
export interface Paar { datum: string; person: string }

export interface Konflikt {
  /** Eindeutiger Schlüssel; wer ihn erlaubt, wird trotzdem eingeteilt. */
  schluessel: string;
  art: 'abwesend' | 'feiertag';
  datum: string;
  /** Betroffene Person (nur bei Abwesenheit). */
  person: string | null;
  text: string;
  /** Wie viele Einteilungen daran hängen. */
  betrifft: number;
}

export interface MonatsPlan {
  /** Neue Einteilungen (ohne die, die schon bestehen und ohne unerlaubte Konflikte). */
  zuteilen: Paar[];
  /** Nur im Modus „ersetzen“: bisherige Einteilungen, die wegfallen. */
  entfernen: Paar[];
  /** Einteilungen aus dem Muster, die schon eingetragen sind. */
  schonDa: number;
  konflikte: Konflikt[];
  /** Tage, an denen sich etwas ändert. */
  tage: string[];
}

export interface PlanEingabe {
  monat: string;
  treffId: string;
  oeffnungszeiten: Oeffnungszeit[];
  muster: PersonMuster;
  modus: Modus;
  dienste: Dienst[];
  abwesenheiten: Abwesenheit[];
  feiertage: Feiertag[];
  /** Schließzeiten: an diesen Tagen wird nicht eingeteilt (kein Konflikt, der Treff ist zu). */
  schliesszeiten?: Schliesszeit[];
  /** Erlaubte Konflikte (Schlüssel aus `Konflikt.schluessel`). */
  erlaubt: ReadonlySet<string>;
  /** Name einer Person für die Konflikttexte. */
  name: (personId: string) => string;
}

const sortiert = (l: Paar[]) => l.sort((a, b) => a.datum.localeCompare(b.datum) || a.person.localeCompare(b.person));

export function planeMonat(e: PlanEingabe): MonatsPlan {
  const zuteilen: Paar[] = [];
  const entfernen: Paar[] = [];
  const konflikte = new Map<string, Konflikt>();
  const tage = new Set<string>();
  let schonDa = 0;

  for (const datum of monatTage(e.monat)) {
    if (!e.oeffnungszeiten.some((o) => o.wochentag === isoWochentag(datum))) continue;          // nur Öffnungstage
    if (geschlossenAm(datum, e.schliesszeiten ?? [])) continue;                                    // nicht in Schließzeiten
    const wochentag = isoWochentag(datum);
    const gewollt = Object.entries(e.muster).filter(([, tageDerPerson]) => tageDerPerson.includes(wochentag)).map(([person]) => person);
    // „ersetzen“ betrifft nur Tage, an denen das Muster etwas vorsieht
    const vorhanden = e.dienste.find((d) => d.datum === datum && !d.ist_sonder)?.personen ?? [];
    const feiertag = feiertagAm(datum, e.feiertage, e.treffId);

    for (const person of gewollt) {
      if (vorhanden.includes(person)) { schonDa += 1; continue; }
      const schluessel: string[] = [];
      if (feiertag) {
        const k = `feiertag:${datum}`;
        schluessel.push(k);
        const alt = konflikte.get(k);
        konflikte.set(k, alt ? { ...alt, betrifft: alt.betrifft + 1 } : { schluessel: k, art: 'feiertag', datum, person: null, text: `${formatKurz(datum)} ist ein Feiertag (${feiertag.bezeichnung})`, betrifft: 1 });
      }
      const weg = abwesendeAm(datum, e.abwesenheiten).find((a) => a.person_id === person);
      if (weg) {
        const k = `abwesend:${person}:${datum}`;
        schluessel.push(k);
        konflikte.set(k, { schluessel: k, art: 'abwesend', datum, person, text: `${e.name(person)} ist am ${formatKurz(datum)} ${weg.typ === 'urlaub' ? 'im Urlaub' : 'krank'}`, betrifft: 1 });
      }
      if (schluessel.every((k) => e.erlaubt.has(k))) { zuteilen.push({ datum, person }); tage.add(datum); }
    }

    if (e.modus === 'ersetzen' && gewollt.length > 0) {
      for (const person of vorhanden) if (!gewollt.includes(person)) { entfernen.push({ datum, person }); tage.add(datum); }
    }
  }

  return {
    zuteilen: sortiert(zuteilen), entfernen: sortiert(entfernen), schonDa,
    konflikte: [...konflikte.values()].sort((a, b) => a.datum.localeCompare(b.datum) || (a.art === 'feiertag' ? -1 : 1)),
    tage: [...tage].sort(),
  };
}
