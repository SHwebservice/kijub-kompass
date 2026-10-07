import { wochentagKurz } from '../freizeiten/logik';
import { feiertagAm, schliesszeitText, type Abwesenheit, type Feiertag, type Tageskarte } from './dienstplan';
import { sortiereTreffTeam, type TreffMitglied } from './logik';

/**
 * Einsatz-Matrix des Dienstplans: Personen in den Zeilen, Tage in den Spalten. Auf einen Blick sichtbar, wer an welchen Tagen
 * eingeteilt ist (●), wer einen Sonderdienst hat (★), abwesend ist (U/K) oder den Dienst gewünscht hat (?) und welche Öffnungstage
 * noch niemand besetzt. Reine Fachlogik für Wochen- und Monatsansicht.
 */
export interface EinsatzSpalte {
  datum: string;
  /** "Mo" */
  wochentag: string;
  /** Tag im Monat */
  tag: number;
  heute: boolean;
  feiertag: string | null;
  /** Grund der Schließzeit („Geschlossen: …“), sonst null. */
  geschlossen: string | null;
  /** Wie viele verschiedene Personen an diesem Tag eingeteilt sind (regulär und Sonderdienste). */
  besetzung: number;
  /** Heute oder künftig ein Öffnungstag, an dem niemand eingeteilt ist (nicht an Feiertagen und in Schließzeiten). */
  unbesetzt: boolean;
}

export interface EinsatzZelle {
  /** Regulärer Dienst des Öffnungstags. */
  dienst: boolean;
  /** Bezeichnungen der Sonderdienste, bei denen die Person eingeteilt ist. */
  sonder: string[];
  abwesend: 'urlaub' | 'krank' | null;
  /** Offener Dienstwunsch (nur wenn danach gefragt wird). */
  wunsch: boolean;
}

export interface EinsatzZeile {
  person_id: string;
  name: string;
  leitung: boolean;
  zellen: EinsatzZelle[];
  /** An wie vielen Tagen die Person eingeteilt ist. */
  tage: number;
}

export interface Einsatz { spalten: EinsatzSpalte[]; zeilen: EinsatzZeile[] }

type Mitglied = Pick<TreffMitglied, 'person_id' | 'vorname' | 'nachname' | 'rolle'>;

export function baueEinsatz(
  karten: Tageskarte[], mitglieder: Mitglied[], abwesenheiten: Abwesenheit[], feiertage: Feiertag[], treffId: string, heute: string, mitWuenschen = false,
): Einsatz {
  const spalten: EinsatzSpalte[] = karten.map((k) => {
    const personen = new Set([...(k.regulaer?.personen ?? []), ...k.sonder.flatMap((s) => s.personen)]);
    const feiertag = feiertagAm(k.datum, feiertage, treffId);
    return {
      datum: k.datum, wochentag: wochentagKurz(k.datum), tag: Number(k.datum.slice(8, 10)), heute: k.datum === heute,
      feiertag: feiertag?.bezeichnung ?? null, geschlossen: k.geschlossen ? schliesszeitText(k.geschlossen) : null, besetzung: personen.size,
      unbesetzt: !!k.oeffnung && personen.size === 0 && k.datum >= heute && !feiertag && !k.geschlossen,
    };
  });

  const zeilen: EinsatzZeile[] = sortiereTreffTeam(mitglieder).map((m) => {
    const zellen = karten.map((k): EinsatzZelle => ({
      dienst: k.regulaer?.personen.includes(m.person_id) ?? false,
      sonder: k.sonder.filter((s) => s.personen.includes(m.person_id)).map((s) => s.bezeichnung ?? 'Sonderdienst'),
      abwesend: abwesenheiten.find((a) => a.datum === k.datum && a.person_id === m.person_id)?.typ ?? null,
      wunsch: mitWuenschen && (k.regulaer?.wuensche.some((w) => w.person_id === m.person_id && w.status === 'offen') ?? false),
    }));
    return {
      person_id: m.person_id, name: `${m.vorname} ${m.nachname}`, leitung: m.rolle === 'treffleitung', zellen,
      tage: zellen.filter((z) => z.dienst || z.sonder.length > 0).length,
    };
  });

  return { spalten, zeilen };
}
