import { phase, tageBisStart } from '../freizeiten/logik';

/** Fachlogik der Startseite „Heute“ ohne Datenbank und Oberfläche. */

export interface OffeneNotiz {
  id: string;
  art: 'hinweis' | 'absprache';
  geltung: 'gesamt' | 'tag';
  datum: string | null;
  text: string;
  created_at: string;
  freizeit_id: string | null;
  treff_id: string | null;
  /** Name der Freizeit bzw. des Treffs. */
  quelle: string;
  bestaetigt_von: string[];
}

export interface TeamZeile { freizeit_id: string; person_id: string; rolle: 'leitung' | 'teamer' }
export interface PlanPunkt { id: string; freizeit_id: string; titel: string; slot: string; position: number }
export interface BestandZeile { ort_id: string; name: string; einheit: string | null; rest: number; status: 'knapp' | 'leer' }
export interface WunschZeile { person_id: string; datum: string; treff_id: string }

export interface RollenAuszug {
  koordination: boolean;
  leitungFreizeiten: string[];
  teamerFreizeiten: string[];
  treffleitungen: string[];
  betreuerTreffs: string[];
}

/** Spiegel der Datenbankregeln: Hinweise bestätigen TeamerInnen, Absprachen Leitung und Koordination, Treff-Absprachen alle im Treff. */
export function darfBestaetigen(n: OffeneNotiz, r: RollenAuszug): boolean {
  if (n.treff_id) return r.koordination || r.treffleitungen.includes(n.treff_id) || r.betreuerTreffs.includes(n.treff_id);
  if (!n.freizeit_id) return false;
  if (n.art === 'hinweis') return r.teamerFreizeiten.includes(n.freizeit_id);
  return r.koordination || r.leitungFreizeiten.includes(n.freizeit_id);
}

/** Notizen am Tag, die schon vorbei sind, erledigen sich von selbst. */
const istVorbei = (n: Pick<OffeneNotiz, 'geltung' | 'datum'>, heute: string) => n.geltung === 'tag' && !!n.datum && n.datum < heute;

/** Was die Person noch bestätigen soll („gesehen“ bei Hinweisen, „bestätigt“ bei Absprachen), neueste zuerst. */
export function offeneFuerMich(notizen: OffeneNotiz[], ichId: string, r: RollenAuszug, heute: string): OffeneNotiz[] {
  return notizen
    .filter((n) => darfBestaetigen(n, r) && !n.bestaetigt_von.includes(ichId) && !istVorbei(n, heute))
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id));
}

export interface NotizGruppe { schluessel: string; typ: 'freizeit' | 'treff'; id: string; name: string; anzahl: number; hinweise: number; absprachen: number }

/** Fasst offene Notizen je Freizeit bzw. Treff zusammen; die zuletzt beschriebene Stelle steht oben. */
export function gruppiereOffene(notizen: OffeneNotiz[]): NotizGruppe[] {
  const gruppen = new Map<string, NotizGruppe>();
  for (const n of notizen) {
    const typ = n.treff_id ? 'treff' : 'freizeit';
    const id = (n.treff_id ?? n.freizeit_id)!;
    const schluessel = `${typ}-${id}`;
    const g = gruppen.get(schluessel) ?? { schluessel, typ, id, name: n.quelle, anzahl: 0, hinweise: 0, absprachen: 0 };
    g.anzahl++; if (n.art === 'hinweis') g.hinweise++; else g.absprachen++;
    gruppen.set(schluessel, g);
  }
  return [...gruppen.values()];              // Reihenfolge = neueste Notiz zuerst (Eingabe ist so sortiert)
}

export interface NichtGesehen { freizeit_id: string; quelle: string; anzahl: number }

/**
 * Für Leitungen: In wie vielen aktuellen Hinweisen fehlt noch das „gesehen“ von mindestens einer TeamerIn?
 * (Die Leitung selbst bestätigt Hinweise nicht.) Freizeiten ohne TeamerInnen tauchen nicht auf.
 */
export function nichtGeseheneImTeam(notizen: OffeneNotiz[], team: TeamZeile[], freizeitIds: string[], heute: string): NichtGesehen[] {
  const out: NichtGesehen[] = [];
  for (const fid of freizeitIds) {
    const teamer = team.filter((t) => t.freizeit_id === fid && t.rolle === 'teamer').map((t) => t.person_id);
    if (!teamer.length) continue;
    const offen = notizen.filter((n) => n.freizeit_id === fid && n.art === 'hinweis' && !istVorbei(n, heute) && teamer.some((p) => !n.bestaetigt_von.includes(p)));
    if (offen.length) out.push({ freizeit_id: fid, quelle: offen[0]!.quelle, anzahl: offen.length });
  }
  return out.sort((a, b) => b.anzahl - a.anzahl || a.quelle.localeCompare(b.quelle, 'de'));
}

/** Programmpunkte je Freizeit in der Reihenfolge der Zeitabschnitte. */
export function planNachFreizeit(punkte: PlanPunkt[]): Map<string, PlanPunkt[]> {
  const m = new Map<string, PlanPunkt[]>();
  for (const p of [...punkte].sort((a, b) => a.position - b.position || a.titel.localeCompare(b.titel, 'de'))) m.set(p.freizeit_id, [...(m.get(p.freizeit_id) ?? []), p]);
  return m;
}

export interface OrtBestand { ort_id: string; leer: number; knapp: number; artikel: BestandZeile[] }

/** Knappe und leere Lebensmittel je Ort – nur für Orte, die gerade eine Rolle spielen; leerste Orte zuerst. */
export function knappeJeOrt(zeilen: BestandZeile[], ortIds: ReadonlySet<string>): OrtBestand[] {
  const m = new Map<string, OrtBestand>();
  for (const z of zeilen) {
    if (!ortIds.has(z.ort_id)) continue;
    const o = m.get(z.ort_id) ?? { ort_id: z.ort_id, leer: 0, knapp: 0, artikel: [] };
    if (z.status === 'leer') o.leer++; else o.knapp++;
    o.artikel.push(z);
    m.set(z.ort_id, o);
  }
  return [...m.values()]
    .map((o) => ({ ...o, artikel: o.artikel.sort((a, b) => Number(b.status === 'leer') - Number(a.status === 'leer') || a.name.localeCompare(b.name, 'de')) }))
    .sort((a, b) => b.leer - a.leer || b.knapp - a.knapp || a.ort_id.localeCompare(b.ort_id));
}

export interface TreffWuensche { treff_id: string; anzahl: number; erster: string }

export function wuenscheJeTreff(zeilen: WunschZeile[]): TreffWuensche[] {
  const m = new Map<string, TreffWuensche>();
  for (const z of zeilen) {
    const w = m.get(z.treff_id) ?? { treff_id: z.treff_id, anzahl: 0, erster: z.datum };
    w.anzahl++; if (z.datum < w.erster) w.erster = z.datum;
    m.set(z.treff_id, w);
  }
  return [...m.values()].sort((a, b) => a.erster.localeCompare(b.erster) || a.treff_id.localeCompare(b.treff_id));
}

interface FreizeitMini { id: string; status: 'geplant' | 'abgesagt'; start_datum: string; ende_datum: string; ort_id: string | null }

/** Laufende Freizeiten und solche, die in den nächsten Tagen beginnen (abgesagte nicht). */
export function aktuelleFreizeiten<T extends FreizeitMini>(liste: T[], heute: string, tage = 14): T[] {
  return liste
    .filter((f) => f.status === 'geplant' && (phase(f, heute) === 'laufend' || (phase(f, heute) === 'kommend' && tageBisStart(f, heute) <= tage)))
    .sort((a, b) => a.start_datum.localeCompare(b.start_datum) || a.id.localeCompare(b.id));
}

export const laeuftHeute = (f: Pick<FreizeitMini, 'status' | 'start_datum' | 'ende_datum'>, heute: string) => f.status === 'geplant' && phase(f, heute) === 'laufend';

/** Freizeiten ohne eingetragene Leitung (Warnung für die Koordination). */
export function ohneLeitung<T extends { id: string }>(freizeiten: T[], team: TeamZeile[]): T[] {
  const mitLeitung = new Set(team.filter((t) => t.rolle === 'leitung').map((t) => t.freizeit_id));
  return freizeiten.filter((f) => !mitLeitung.has(f.id));
}

export const personenText = (n: number, einzahl: string, mehrzahl: string) => `${n} ${n === 1 ? einzahl : mehrzahl}`;
