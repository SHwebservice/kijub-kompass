import { wochentagKurz } from '../freizeiten/logik';
import { feiertagAm, istNeu, schliesszeitText, type Abwesenheit, type Feiertag, type Tageskarte } from './dienstplan';
import { sortiereTreffTeam, type TreffMitglied } from './logik';

/**
 * Einsatz-Matrix des Dienstplans: Personen in den Zeilen, Tage in den Spalten. Auf einen Blick sichtbar, wer an welchen Tagen
 * eingeteilt ist (●), wer einen Sonderdienst hat (★), abwesend ist (U/K), nicht kann (✕) oder den Dienst gewünscht hat (?) und welche
 * Öffnungstage noch niemand besetzt oder weniger Personen als die Mindestbesetzung haben. Die eigene Zeile steht oben.
 * Reine Fachlogik für Wochen- und Monatsansicht.
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
  /** Heute oder künftig ein Öffnungstag mit Personen, aber weniger als die Mindestbesetzung. */
  unterbesetzt: boolean;
}

export interface EinsatzZelle {
  /** Regulärer Dienst des Öffnungstags. */
  dienst: boolean;
  /** Bezeichnungen der Sonderdienste, bei denen die Person eingeteilt ist. */
  sonder: string[];
  abwesend: Abwesenheit['typ'] | null;
  /** Offener Dienstwunsch (nur wenn danach gefragt wird). */
  wunsch: boolean;
  /** Seit dem letzten Besuch neu eingeteilt (nur für die eigene Zeile). */
  neu: boolean;
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

export interface EinsatzOptionen {
  /** Offene Wünsche zeigen (Treffleitung und Koordination). */
  mitWuenschen?: boolean;
  /** Ab wie vielen Personen ein Öffnungstag ausreichend besetzt ist (Standard 1). */
  mindestbesetzung?: number;
  /** Die angemeldete Person: ihre Zeile steht oben. */
  ichId?: string;
  /** Letzter Besuch der angemeldeten Person: neuere Einteilungen in ihrer Zeile gelten als neu. */
  letzterBesuch?: string | null;
}

export function baueEinsatz(
  karten: Tageskarte[], mitglieder: Mitglied[], abwesenheiten: Abwesenheit[], feiertage: Feiertag[], treffId: string, heute: string, opt: EinsatzOptionen = {},
): Einsatz {
  const mindest = Math.max(1, opt.mindestbesetzung ?? 1);
  const spalten: EinsatzSpalte[] = karten.map((k) => {
    const personen = new Set([...(k.regulaer?.personen ?? []), ...k.sonder.flatMap((s) => s.personen)]);
    const feiertag = feiertagAm(k.datum, feiertage, treffId);
    const offenUndKuenftig = !!k.oeffnung && k.datum >= heute && !feiertag && !k.geschlossen;
    return {
      datum: k.datum, wochentag: wochentagKurz(k.datum), tag: Number(k.datum.slice(8, 10)), heute: k.datum === heute,
      feiertag: feiertag?.bezeichnung ?? null, geschlossen: k.geschlossen && !k.geschlossen.feiertag ? schliesszeitText(k.geschlossen) : null, besetzung: personen.size,
      unbesetzt: offenUndKuenftig && personen.size === 0,
      unterbesetzt: offenUndKuenftig && personen.size > 0 && personen.size < mindest,
    };
  });

  const sortiert = sortiereTreffTeam(mitglieder);
  const reihenfolge = opt.ichId ? [...sortiert.filter((m) => m.person_id === opt.ichId), ...sortiert.filter((m) => m.person_id !== opt.ichId)] : sortiert;
  const zeilen: EinsatzZeile[] = reihenfolge.map((m) => {
    const ich = m.person_id === opt.ichId;
    const zellen = karten.map((k): EinsatzZelle => {
      const dienst = k.regulaer?.personen.includes(m.person_id) ?? false;
      const sonder = k.sonder.filter((s) => s.personen.includes(m.person_id));
      return {
        dienst,
        sonder: sonder.map((s) => s.bezeichnung ?? 'Sonderdienst'),
        // Urlaub und Krankheit gehen „kann nicht“ vor
        abwesend: abwesenheiten.filter((a) => a.datum === k.datum && a.person_id === m.person_id).sort((a, b) => (a.typ === 'verhindert' ? 1 : 0) - (b.typ === 'verhindert' ? 1 : 0))[0]?.typ ?? null,
        wunsch: (opt.mitWuenschen ?? false) && (k.regulaer?.wuensche.some((w) => w.person_id === m.person_id && w.status === 'offen') ?? false),
        neu: ich && [...(dienst ? [k.regulaer!] : []), ...sonder].some((d) => istNeu(d.seit?.[m.person_id], opt.letzterBesuch ?? null)),
      };
    });
    return {
      person_id: m.person_id, name: `${m.vorname} ${m.nachname}`, leitung: m.rolle === 'treffleitung', zellen,
      tage: zellen.filter((z) => z.dienst || z.sonder.length > 0).length,
    };
  });

  return { spalten, zeilen };
}
