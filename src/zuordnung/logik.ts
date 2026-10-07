import { phase, zeitraumText } from '../freizeiten/logik';
export { darfInTreff } from '../treffs/logik';

/**
 * Fachlogik der Zuordnung von Personen zu Freizeiten und Treffs (Tabelle in „Personen & Zugänge“, Team-Reiter).
 * Reine Funktionen ohne Datenbank und Oberfläche.
 */

export type FreizeitRolle = 'teamer' | 'leitung';
export type TreffRolle = 'betreuerin' | 'treffleitung';

export interface FreizeitSpalte {
  id: string;
  name: string;
  start_datum: string;
  ende_datum: string;
  status: 'geplant' | 'abgesagt';
  /** Gewählte Farbe der Freizeit (ohne Angabe: automatisch aus der ID). */
  farbe?: string | null;
}
export interface TreffSpalte { id: string; name: string }
export interface FreizeitTeamZeile { freizeit_id: string; person_id: string; rolle: FreizeitRolle }
export interface TreffTeamZeile { treff_id: string; person_id: string; rolle: TreffRolle }

export interface PersonMini { id: string; vorname: string; nachname: string; kategorie: string; aktiv: boolean }

export const FREIZEIT_ROLLEN: { wert: FreizeitRolle; label: string }[] = [{ wert: 'teamer', label: 'TeamerIn' }, { wert: 'leitung', label: 'Leitung' }];
export const TREFF_ROLLEN: { wert: TreffRolle; label: string }[] = [{ wert: 'betreuerin', label: 'BetreuerIn' }, { wert: 'treffleitung', label: 'Treffleitung' }];

export const personName = (p: Pick<PersonMini, 'vorname' | 'nachname'>) => `${p.vorname} ${p.nachname}`;

/* ───── Spalten ───── */

/** „aktuell“ = laufende und kommende Freizeiten; eine Zahl = alle Freizeiten, die in diesem Jahr beginnen. Abgesagte erscheinen nicht. */
export type Zeitraum = 'aktuell' | number;

export function waehleFreizeiten<T extends FreizeitSpalte>(freizeiten: T[], zeitraum: Zeitraum, heute: string): T[] {
  return freizeiten
    .filter((f) => f.status === 'geplant' && (zeitraum === 'aktuell' ? phase(f, heute) !== 'vergangen' : Number(f.start_datum.slice(0, 4)) === zeitraum))
    .sort((a, b) => a.start_datum.localeCompare(b.start_datum) || a.name.localeCompare(b.name, 'de') || a.id.localeCompare(b.id));
}

/** Jahre, für die es Freizeiten gibt (neuestes zuerst). */
export function verfuegbareJahre(freizeiten: Pick<FreizeitSpalte, 'start_datum' | 'status'>[]): number[] {
  return [...new Set(freizeiten.filter((f) => f.status === 'geplant').map((f) => Number(f.start_datum.slice(0, 4))))].sort((a, b) => b - a);
}

export const spaltenZeitraum = (f: Pick<FreizeitSpalte, 'start_datum' | 'ende_datum'>) => zeitraumText(f.start_datum, f.ende_datum);

/* ───── Zuordnungen nachschlagen ───── */

export interface Zuordnungen {
  freizeitRolle(freizeitId: string, personId: string): FreizeitRolle | null;
  treffRolle(treffId: string, personId: string): TreffRolle | null;
  /** Freizeit-Zeilen einer Person. */
  freizeitenVon(personId: string): FreizeitTeamZeile[];
  treffsVon(personId: string): TreffTeamZeile[];
}

export function indexiere(freizeitTeams: FreizeitTeamZeile[], treffTeams: TreffTeamZeile[]): Zuordnungen {
  const f = new Map(freizeitTeams.map((z) => [`${z.freizeit_id}:${z.person_id}`, z.rolle]));
  const t = new Map(treffTeams.map((z) => [`${z.treff_id}:${z.person_id}`, z.rolle]));
  return {
    freizeitRolle: (fid, pid) => f.get(`${fid}:${pid}`) ?? null,
    treffRolle: (tid, pid) => t.get(`${tid}:${pid}`) ?? null,
    freizeitenVon: (pid) => freizeitTeams.filter((z) => z.person_id === pid),
    treffsVon: (pid) => treffTeams.filter((z) => z.person_id === pid),
  };
}

/** Schreibt eine Änderung in die Liste (null = entfernt), ohne die übrigen Zeilen zu verändern. */
export function mitFreizeitRolle(liste: FreizeitTeamZeile[], freizeitId: string, personId: string, rolle: FreizeitRolle | null): FreizeitTeamZeile[] {
  const rest = liste.filter((z) => !(z.freizeit_id === freizeitId && z.person_id === personId));
  return rolle ? [...rest, { freizeit_id: freizeitId, person_id: personId, rolle }] : rest;
}
export function mitTreffRolle(liste: TreffTeamZeile[], treffId: string, personId: string, rolle: TreffRolle | null): TreffTeamZeile[] {
  const rest = liste.filter((z) => !(z.treff_id === treffId && z.person_id === personId));
  return rolle ? [...rest, { treff_id: treffId, person_id: personId, rolle }] : rest;
}

/* ───── Überschneidungen ───── */

export const ueberschneiden = (a: Pick<FreizeitSpalte, 'start_datum' | 'ende_datum'>, b: Pick<FreizeitSpalte, 'start_datum' | 'ende_datum'>) =>
  a.start_datum <= b.ende_datum && b.start_datum <= a.ende_datum;

/** Schlüssel eines akzeptierten Paares: Person und die beiden Freizeiten, unabhängig von der Reihenfolge. */
export const paarSchluessel = (personId: string, a: string, b: string) => (a < b ? `${personId}:${a}:${b}` : `${personId}:${b}:${a}`);

/** Akzeptierte Überschneidungen (Schlüssel aus `paarSchluessel`): dafür gibt es keine Warnung mehr. */
export type Akzeptiert = ReadonlySet<string>;

/** Andere (nicht abgesagte) Freizeiten, in denen die Person zur selben Zeit eingeteilt ist – ohne die bewusst akzeptierten. */
export function konflikteFuer<T extends FreizeitSpalte>(personId: string, freizeit: FreizeitSpalte, freizeiten: T[], z: Zuordnungen, akzeptiert?: Akzeptiert): T[] {
  return freizeiten.filter((f) => f.id !== freizeit.id && f.status === 'geplant' && z.freizeitRolle(f.id, personId) !== null && ueberschneiden(f, freizeit)
    && !akzeptiert?.has(paarSchluessel(personId, f.id, freizeit.id)));
}

/** IDs aller Freizeiten, in denen die Person mit einer anderen Freizeit kollidiert (akzeptierte Paare zählen nicht). */
export function kollidierende(personId: string, freizeiten: FreizeitSpalte[], z: Zuordnungen, akzeptiert?: Akzeptiert): Set<string> {
  const ids = new Set<string>();
  for (const p of ueberschneidungsPaare(personId, freizeiten, z)) {
    if (akzeptiert?.has(paarSchluessel(personId, p.a.id, p.b.id))) continue;
    ids.add(p.a.id); ids.add(p.b.id);
  }
  return ids;
}

export interface UeberschneidungsPaar<T extends FreizeitSpalte = FreizeitSpalte> { a: T; b: T; rolleA: FreizeitRolle; rolleB: FreizeitRolle }

/** Alle Paare von Freizeiten, die sich für die Person zeitlich überschneiden – auch die akzeptierten. Früher beginnende Freizeit zuerst. */
export function ueberschneidungsPaare<T extends FreizeitSpalte>(personId: string, freizeiten: T[], z: Zuordnungen): UeberschneidungsPaar<T>[] {
  const meine = freizeiten
    .filter((f) => f.status === 'geplant' && z.freizeitRolle(f.id, personId) !== null)
    .sort((x, y) => x.start_datum.localeCompare(y.start_datum) || x.name.localeCompare(y.name, 'de') || x.id.localeCompare(y.id));
  const paare: UeberschneidungsPaar<T>[] = [];
  for (let i = 0; i < meine.length; i += 1) {
    for (let j = i + 1; j < meine.length; j += 1) {
      if (ueberschneiden(meine[i]!, meine[j]!)) paare.push({ a: meine[i]!, b: meine[j]!, rolleA: z.freizeitRolle(meine[i]!.id, personId)!, rolleB: z.freizeitRolle(meine[j]!.id, personId)! });
    }
  }
  return paare;
}

/** Text für einen Hinweis, z. B. „Sommer 1 (01.07.–05.07.2027)“. */
export const konfliktText = (f: Pick<FreizeitSpalte, 'name' | 'start_datum' | 'ende_datum'>) => `${f.name} (${spaltenZeitraum(f)})`;

/* ───── Spaltenköpfe ───── */

export function ohneLeitungIds(freizeiten: Pick<FreizeitSpalte, 'id'>[], team: FreizeitTeamZeile[]): Set<string> {
  const mit = new Set(team.filter((t) => t.rolle === 'leitung').map((t) => t.freizeit_id));
  return new Set(freizeiten.filter((f) => !mit.has(f.id)).map((f) => f.id));
}

export function anzahlen(freizeitId: string, team: FreizeitTeamZeile[]): { leitung: number; teamer: number } {
  const z = team.filter((t) => t.freizeit_id === freizeitId);
  return { leitung: z.filter((t) => t.rolle === 'leitung').length, teamer: z.filter((t) => t.rolle === 'teamer').length };
}

/* ───── Personen filtern ───── */

export interface PersonenFilter { suche: string; kategorie: string; mitDeaktivierten: boolean }

export function filterePersonen<T extends PersonMini & { mail?: string }>(personen: T[], f: PersonenFilter): T[] {
  const s = f.suche.trim().toLowerCase();
  return personen.filter((p) =>
    (f.mitDeaktivierten || p.aktiv) &&
    (!f.kategorie || p.kategorie === f.kategorie) &&
    (!s || `${p.vorname} ${p.nachname} ${p.mail ?? ''}`.toLowerCase().includes(s)));
}

/** Kandidaten für eine Zuordnung: aktive Personen, die noch nicht im Team sind. */
export function kandidatenFuer<T extends PersonMini>(personen: T[], imTeam: Set<string>, f: { suche: string; kategorie: string }): T[] {
  const s = f.suche.trim().toLowerCase();
  return personen.filter((p) => p.aktiv && !imTeam.has(p.id) && (!f.kategorie || p.kategorie === f.kategorie) && (!s || `${p.vorname} ${p.nachname}`.toLowerCase().includes(s)))
    .sort((a, b) => a.nachname.localeCompare(b.nachname, 'de') || a.vorname.localeCompare(b.vorname, 'de'));
}

/** Kurzfassung für die Personenzeile: „2 Freizeiten · 1 Treff“ (nur Freizeiten, die nicht vorbei sind). */
export function zusammenfassung(personId: string, freizeiten: FreizeitSpalte[], z: Zuordnungen, heute: string): string {
  const f = freizeiten.filter((x) => x.status === 'geplant' && phase(x, heute) !== 'vergangen' && z.freizeitRolle(x.id, personId) !== null).length;
  const t = z.treffsVon(personId).length;
  const teile = [f > 0 && `${f} ${f === 1 ? 'Freizeit' : 'Freizeiten'}`, t > 0 && `${t} ${t === 1 ? 'Treff' : 'Treffs'}`].filter(Boolean);
  return teile.join(' · ');
}

/** Rückfrage beim Entfernen aus einem Treff; nennt, wie viele künftige Dienste dabei wegfallen. */
export function entfernenFrage(name: string, treffName: string, kuenftigeDienste: number): string {
  const grund = `${name} aus dem Team von „${treffName}“ entfernen?`;
  if (kuenftigeDienste <= 0) return grund;
  const dienste = kuenftigeDienste === 1 ? 'einem künftigen Dienst' : `${kuenftigeDienste} künftigen Diensten`;
  return `Achtung: ${name} ist noch in ${dienste} eingeteilt. Beim Entfernen fallen diese Dienste und offene Dienstwünsche weg (vergangene Dienste bleiben).

${grund}`;
}
