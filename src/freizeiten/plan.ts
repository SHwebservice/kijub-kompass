import type { RolleInFreizeit } from '../lib/rollen';
import { istLeitungOderKoordination } from '../lib/rollen';

/** Fachlogik des Wochenplans (ohne Datenbank und Oberfläche). */

export interface Slot { id: string; name: string; position: number }

export interface PlanEintrag {
  id: string;
  datum: string;
  slot_id: string;
  angebot_id: string | null;
  angebot_name: string | null;
  angebot_kategorie: string | null;
  freitext: string | null;
  notiz: string | null;
  erstellt_von: string | null;
  created_at: string;
}

export interface AngebotKurz {
  id: string;
  name: string;
  kategorie: string;
  dauer: string | null;
  gruppe: string | null;
  wetter: string | null;
  alter_gruppen: string[];
}

export const sortiereSlots = (slots: Slot[]): Slot[] =>
  [...slots].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'de'));

/** Gruppiert die Einträge nach Tag und Slot; innerhalb einer Zelle in der Reihenfolge des Eintragens. */
export function zellen(eintraege: PlanEintrag[]): Map<string, PlanEintrag[]> {
  const m = new Map<string, PlanEintrag[]>();
  for (const e of [...eintraege].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))) {
    const k = zellenSchluessel(e.datum, e.slot_id);
    m.set(k, [...(m.get(k) ?? []), e]);
  }
  return m;
}

export const zellenSchluessel = (datum: string, slotId: string) => `${datum}|${slotId}`;

/** Anzeigename eines Eintrags: Programmpunkt aus dem Katalog oder Freitext. */
export const eintragTitel = (e: Pick<PlanEintrag, 'angebot_name' | 'freitext'>): string =>
  e.angebot_name ?? e.freitext ?? '(gelöschter Programmpunkt)';

/**
 * Wer darf einen Eintrag ändern oder löschen? Leitung und Koordination alle, TeamerInnen nur eigene.
 * (Die Datenbank erzwingt dieselbe Regel; hier entscheidet sie, welche Knöpfe erscheinen.)
 */
export function darfEintragAendern(rolle: RolleInFreizeit, e: Pick<PlanEintrag, 'erstellt_von'>, ichId: string): boolean {
  if (istLeitungOderKoordination(rolle)) return true;
  return rolle === 'teamer' && e.erstellt_von !== null && e.erstellt_von === ichId;
}

export const darfEintragen = (rolle: RolleInFreizeit) => rolle !== 'gast';
export const darfFreitext = istLeitungOderKoordination;
export const darfSlotsVerwalten = istLeitungOderKoordination;

export const ABEND = 'Abend';
export const kannAbendHinzufuegen = (slots: Slot[]) => !slots.some((s) => s.name.toLowerCase() === ABEND.toLowerCase());

export const naechstePosition = (slots: Slot[]): number => (slots.length ? Math.max(...slots.map((s) => s.position)) + 1 : 1);

/**
 * Vertauscht einen Slot mit seinem Nachbarn. Liefert die zu speichernden Positionen
 * oder null, wenn der Slot schon am Rand steht.
 */
export function tauschPositionen(slots: Slot[], id: string, richtung: -1 | 1): { id: string; position: number }[] | null {
  const s = sortiereSlots(slots);
  const i = s.findIndex((x) => x.id === id);
  const j = i + richtung;
  if (i < 0 || j < 0 || j >= s.length) return null;
  // Positionen neu durchnummerieren, damit auch doppelte Positionen sauber getrennt werden
  const neu = s.map((x, idx) => ({ id: x.id, position: idx + 1 }));
  const a = neu[i]!; const b = neu[j]!;
  [a.position, b.position] = [b.position, a.position];
  return [a, b];
}

const normal = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');

/** Sucht Programmpunkte nach Name (ohne Beachtung von Groß-/Kleinschreibung und Umlauten) und Kategorie. */
export function filtereAngebote(angebote: AngebotKurz[], suche: string, kategorie: string | null): AngebotKurz[] {
  const begriffe = normal(suche).split(/\s+/).filter(Boolean);
  return angebote
    .filter((a) => (!kategorie || a.kategorie === kategorie) && begriffe.every((b) => normal(a.name).includes(b)))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
}
