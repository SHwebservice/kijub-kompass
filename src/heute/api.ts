import { supabase } from '../lib/supabase';
import { ApiFehler } from '../lib/fehler';
import type { BestandZeile, OffeneNotiz, PlanPunkt, TeamZeile, WunschZeile } from './logik';

/**
 * Die Startseite „Heute“ holt alles in einem einzigen Aufruf (fn_heute, Migration 0020). Die Funktion läuft mit den Rechten der
 * aufrufenden Person: jede Person bekommt nur, was sie sehen darf. Welche Freizeiten und Treffs gemeint sind, bestimmt die Oberfläche.
 */

export type NeuigkeitArt = 'hinweis' | 'absprache' | 'plan' | 'protokoll' | 'notiz' | 'kommentar' | 'bewerbung' | 'vorschlag' | 'nachweis';

export interface Neuigkeit { zeit: string; art: NeuigkeitArt; text: string; quelle: string; url: string }

export interface HeuteAnfrage {
  heute: string;
  /** Freizeiten und Treffs, deren Hinweise und Absprachen die Startseite einsammelt (und deren Neuigkeiten). */
  notizFreizeiten: string[];
  notizTreffs: string[];
  /** Freizeiten, deren Team gebraucht wird (Leitung, „noch nicht gesehen“, „ohne Leitung“). */
  teamFreizeiten: string[];
  /** Freizeiten, deren Wochenplan von heute gezeigt wird. */
  planFreizeiten: string[];
  /** Treffs der Kacheln (offene Notizen, Neuigkeiten). */
  kachelTreffs: string[];
  /** Treffs, für die „Protokoll fehlt“ und „Protokoll neu“ gelten – nur die eigenen, nicht alle der Treffkoordination (Migration 0026). */
  protokollTreffs: string[];
  bestand?: boolean;
  nachweise?: boolean;
  bewerbungen?: boolean;
  vorschlaege?: boolean;
  fehler?: boolean;
  /** 'alle' oder bestimmte Treffs; nicht angegeben = nicht anfragen. */
  wuensche?: 'alle' | string[];
  /** „Neu seit letztem Besuch“ berechnen und den Besuch vermerken. */
  besuch?: boolean;
}

export interface HeuteDaten {
  notizen: OffeneNotiz[];
  team: TeamZeile[];
  plan: PlanPunkt[];
  bestand: BestandZeile[];
  /** Namen der Orte, an denen etwas knapp ist. */
  orte: Record<string, string>;
  wuensche: WunschZeile[];
  treffNamen: Record<string, string>;
  bewerbungen: number;
  vorschlaege: number;
  nachweise: number;
  fehler: number;
  /** Treffs, für die heute schon ein Protokoll geschrieben wurde. */
  protokolliert: string[];
  /** Angefragte Treffs, die heute wegen Feiertag oder Schließzeit geschlossen sind. */
  geschlossen: string[];
  offeneNotizen: Record<string, number>;
  seit: string | null;
  neu: Neuigkeit[];
  neuGesamt: number;
}

/** Wandelt die Antwort der Datenbank in die Form der Oberfläche um (fehlende Teile werden leer). */
export function heuteDatenAus(r: Record<string, unknown>): HeuteDaten {
  const liste = <T>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : []);
  const karte = <T>(x: unknown): Record<string, T> => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, T>) : {});
  return {
    notizen: liste<OffeneNotiz>(r.notizen),
    team: liste<TeamZeile>(r.team),
    plan: liste<PlanPunkt>(r.plan),
    bestand: liste<BestandZeile & { rest: number | string }>(r.bestand).map((b) => ({ ...b, rest: Number(b.rest) })),
    orte: karte<string>(r.orte),
    wuensche: liste<WunschZeile>(r.wuensche),
    treffNamen: karte<string>(r.treff_namen),
    bewerbungen: Number(r.bewerbungen ?? 0),
    vorschlaege: Number(r.vorschlaege ?? 0),
    nachweise: Number(r.nachweise ?? 0),
    fehler: Number(r.fehler ?? 0),
    protokolliert: liste<string>(r.protokolliert),
    geschlossen: liste<string>(r.geschlossen),
    offeneNotizen: karte<number>(r.offene_notizen),
    seit: typeof r.seit === 'string' ? r.seit : null,
    neu: liste<Neuigkeit>(r.neu),
    neuGesamt: Number(r.neu_gesamt ?? 0),
  };
}

export async function ladeHeute(a: HeuteAnfrage): Promise<HeuteDaten> {
  const anfrage: Record<string, unknown> = {
    notiz_freizeiten: a.notizFreizeiten, notiz_treffs: a.notizTreffs, team_freizeiten: a.teamFreizeiten, plan_freizeiten: a.planFreizeiten, kachel_treffs: a.kachelTreffs, protokoll_treffs: a.protokollTreffs,
    bestand: a.bestand ?? false, nachweise: a.nachweise ?? false, bewerbungen: a.bewerbungen ?? false, vorschlaege: a.vorschlaege ?? false, fehler: a.fehler ?? false,
    besuch: a.besuch ?? false,
  };
  if (a.wuensche !== undefined) anfrage.wuensche = a.wuensche;
  const { data, error } = await supabase.rpc('fn_heute', { p_heute: a.heute, p_anfrage: anfrage });
  if (error) throw new ApiFehler(error);
  return heuteDatenAus((data ?? {}) as Record<string, unknown>);
}

/** „Alles gesehen“: der nächste Besuch beginnt ab jetzt. */
export async function quittiereBesuch(): Promise<void> {
  const { error } = await supabase.rpc('fn_besuch_quittieren');
  if (error) throw new ApiFehler(error);
}
