import { abwesenheitsBloecke, addTage, dienstStunden, isoWochentag, montagVon, tageImZeitraum, type Abwesenheit, type Dienst, type Tageskarte } from './dienstplan';
import { stundenVon } from './entwurf';
import { sortiereTreffTeam, type TreffMitglied } from './logik';

/**
 * Abwesenheiten (Urlaub, krank, Sonstiges) einfacher eintragen und ändern: Schnellwahl für den Zeitraum, die betroffenen Dienste,
 * eine Übersicht je Person und – für den Ersatz – wer an einem Tag frei ist. Reine Fachlogik ohne Datenbank und Oberfläche.
 */

export type Block = ReturnType<typeof abwesenheitsBloecke>[number];

/* ───── Schnellwahl ───── */

export interface Schnellwahl { label: string; von: string; bis: string }

/** Zeiträume zum Antippen, ausgehend von einem Tag: nur dieser Tag, bis Freitag, die ganze Woche, die Woche danach. */
export function schnellwahl(datum: string): Schnellwahl[] {
  const montag = montagVon(datum);
  const freitag = addTage(montag, 4);
  const liste: Schnellwahl[] = [{ label: 'Nur dieser Tag', von: datum, bis: datum }];
  if (datum < freitag) liste.push({ label: 'Bis Freitag', von: datum, bis: freitag });
  liste.push({ label: 'Ganze Woche', von: montag, bis: addTage(montag, 6) });
  liste.push({ label: 'Nächste Woche', von: addTage(montag, 7), bis: addTage(montag, 13) });
  return liste;
}

/* ───── Betroffene Dienste ───── */

/** Dienste der Person im Zeitraum (reguläre und Sonderdienste), ab `ab` (vergangene bleiben – sie sind Grundlage der Nachweise). */
export function betroffeneDienste(dienste: Dienst[], person: string, von: string, bis: string, ab: string): Dienst[] {
  const start = von > ab ? von : ab;
  return dienste.filter((d) => d.personen.includes(person) && d.datum >= start && d.datum <= bis)
    .sort((a, b) => a.datum.localeCompare(b.datum) || (a.von ?? '').localeCompare(b.von ?? ''));
}

/* ───── Ändern eines Blocks ───── */

/** Tage eines Blocks (die IDs gehören in derselben Reihenfolge zu den Tagen ab `von`). */
export const tageDesBlocks = (b: Pick<Block, 'von' | 'bis'>) => tageImZeitraum(b.von, b.bis);

/**
 * Was beim Ändern eines Blocks passiert: Die neuen Tage werden (über)schrieben, die alten Tage außerhalb des neuen Zeitraums gelöscht.
 * Wechselt die Person, fallen alle alten Tage weg.
 */
export function blockAenderung(alt: Block | null, person: string, von: string, bis: string): { tage: string[]; loeschen: string[] } {
  const tage = tageImZeitraum(von, bis);
  if (!alt) return { tage, loeschen: [] };
  const alteTage = tageDesBlocks(alt);
  const loeschen = alt.ids.filter((_, i) => alt.person_id !== person || !tage.includes(alteTage[i]!));
  return { tage, loeschen };
}

/* ───── Übersicht je Person ───── */

export interface PersonAbwesenheiten {
  person_id: string;
  name: string;
  /** Heute laufend */
  laufend: Block[];
  kommend: Block[];
  vergangen: Block[];
}

/** Abwesenheiten je Person des Teams (Treffleitung zuerst, dann nach Nachname); nur Personen mit Einträgen. */
export function abwesenheitenJePerson(
  liste: Abwesenheit[], team: Pick<TreffMitglied, 'person_id' | 'vorname' | 'nachname' | 'rolle'>[], heute: string,
): PersonAbwesenheiten[] {
  const imTeam = new Set(team.map((m) => m.person_id));
  const bloecke = abwesenheitsBloecke(liste.filter((a) => a.typ !== 'verhindert' && imTeam.has(a.person_id)));
  return sortiereTreffTeam(team).map((m) => {
    const eigene = bloecke.filter((b) => b.person_id === m.person_id);
    return {
      person_id: m.person_id, name: `${m.vorname} ${m.nachname}`,
      laufend: eigene.filter((b) => b.von <= heute && heute <= b.bis),
      kommend: eigene.filter((b) => b.von > heute),
      vergangen: eigene.filter((b) => b.bis < heute).reverse(),
    };
  }).filter((p) => p.laufend.length + p.kommend.length + p.vergangen.length > 0);
}

/* ───── Ersatz ───── */

export interface Kandidat {
  person_id: string;
  name: string;
  /** Stunden im angezeigten Zeitraum */
  stunden: number;
  /** Höchststunden im Monat (Teilzeitkräfte), sonst null */
  max: number | null;
  /** Mit diesem Dienst über den Höchststunden */
  ueberMax: boolean;
  /** Hat sich den Dienst gewünscht */
  wunsch: boolean;
}

/**
 * Wer an einem Tag einspringen könnte: im Team, nicht im regulären Dienst eingeteilt, nicht abwesend und ohne „kann nicht“.
 * Wer sich den Dienst gewünscht hat, steht oben; danach wer die wenigsten Stunden hat.
 */
export function freiePersonen(
  karte: Tageskarte, karten: Tageskarte[], team: (Pick<TreffMitglied, 'person_id' | 'vorname' | 'nachname' | 'rolle'> & { tzk_max_stunden?: number | null })[],
  abwesenheiten: Abwesenheit[],
): Kandidat[] {
  const drin = new Set(karte.regulaer?.personen ?? []);
  const weg = new Set(abwesenheiten.filter((a) => a.datum === karte.datum).map((a) => a.person_id));
  const wuensche = new Set((karte.regulaer?.wuensche ?? []).filter((w) => w.status === 'offen').map((w) => w.person_id));
  const dauer = karte.oeffnung ? dienstStunden(karte.oeffnung) : 0;
  return sortiereTreffTeam(team).filter((m) => !drin.has(m.person_id) && !weg.has(m.person_id)).map((m) => {
    const stunden = stundenVon(karten, m.person_id);
    const max = m.tzk_max_stunden ?? null;
    return { person_id: m.person_id, name: `${m.vorname} ${m.nachname}`, stunden, max, ueberMax: max !== null && stunden + dauer > max, wunsch: wuensche.has(m.person_id) };
  }).sort((a, b) => Number(b.wunsch) - Number(a.wunsch) || Number(a.ueberMax) - Number(b.ueberMax) || a.stunden - b.stunden);
}

/** Ein Öffnungstag ab heute mit weniger Personen als die Mindestbesetzung (außer Schließtagen): hier wird Ersatz gesucht. */
export const ersatzGesucht = (k: Tageskarte, mindestbesetzung: number, heute: string) =>
  !!k.oeffnung && !k.geschlossen && k.datum >= heute && (k.regulaer?.personen.length ?? 0) < Math.max(1, mindestbesetzung);

/** „Mo 02.11.“ für Listen */
export const kurzTag = (d: string) => `${['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'][isoWochentag(d) - 1]} ${d.slice(8, 10)}.${d.slice(5, 7)}.`;
