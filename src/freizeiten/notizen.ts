import type { RolleInFreizeit } from '../lib/rollen';
import { istLeitungOderKoordination } from '../lib/rollen';

/**
 * Hinweise (für das ganze Team, TeamerInnen bestätigen „gesehen") und Absprachen (nur Leitung und Koordination,
 * werden bestätigt und kommentiert). Reine Fachlogik, gespiegelt aus den Datenbankregeln.
 */

export type NotizArt = 'hinweis' | 'absprache';
export type Geltung = 'gesamt' | 'tag';

export interface Bestaetigung { person_id: string; at: string }
export interface Kommentar { id: string; person_id: string; text: string; created_at: string }

export interface Notiz {
  id: string;
  art: NotizArt;
  geltung: Geltung;
  datum: string | null;
  text: string;
  erstellt_von: string | null;
  created_at: string;
  bestaetigungen: Bestaetigung[];
  kommentare: Kommentar[];
}

export const darfNotizSchreiben = istLeitungOderKoordination;

/** Hinweise bestätigen nur TeamerInnen; Absprachen Leitung und Koordination. */
export function darfBestaetigen(art: NotizArt, rolle: RolleInFreizeit): boolean {
  return art === 'hinweis' ? rolle === 'teamer' : istLeitungOderKoordination(rolle);
}

export const darfKommentieren = (art: NotizArt, rolle: RolleInFreizeit) => art === 'absprache' && istLeitungOderKoordination(rolle);

export const istBestaetigtVon = (n: Pick<Notiz, 'bestaetigungen'>, personId: string) => n.bestaetigungen.some((b) => b.person_id === personId);

/** Kommentare löscht der Verfasser selbst oder die Koordination. */
export const darfKommentarLoeschen = (k: Pick<Kommentar, 'person_id'>, rolle: RolleInFreizeit, ichId: string) =>
  rolle === 'koordination' || k.person_id === ichId;

const neuZuerst = (a: Notiz, b: Notiz) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id);

/** Erst alles, was für die ganze Freizeit gilt (neueste oben), dann je Tag aufsteigend. */
export function gruppiereNotizen(notizen: Notiz[]): { gesamt: Notiz[]; tage: { datum: string; notizen: Notiz[] }[] } {
  const gesamt = notizen.filter((n) => n.geltung === 'gesamt' || !n.datum).sort(neuZuerst);
  const proTag = new Map<string, Notiz[]>();
  for (const n of notizen.filter((x) => x.geltung === 'tag' && x.datum)) proTag.set(n.datum!, [...(proTag.get(n.datum!) ?? []), n]);
  const tage = [...proTag.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([datum, l]) => ({ datum, notizen: l.sort(neuZuerst) }));
  return { gesamt, tage };
}

/** Wer hat einen Hinweis schon gesehen? Grundlage sind die TeamerInnen der Freizeit (die Leitung bestätigt Hinweise nicht). */
export function bestaetigungsStand(
  n: Pick<Notiz, 'bestaetigungen'>,
  team: { person_id: string; rolle: 'leitung' | 'teamer' }[],
): { bestaetigt: number; gesamt: number; offen: string[] } {
  const teamer = team.filter((t) => t.rolle === 'teamer').map((t) => t.person_id);
  const gesehen = new Set(n.bestaetigungen.map((b) => b.person_id));
  return { bestaetigt: teamer.filter((p) => gesehen.has(p)).length, gesamt: teamer.length, offen: teamer.filter((p) => !gesehen.has(p)) };
}

export interface NotizEingabe { text: string; geltung: Geltung; datum: string }

/** Prüft die Eingabe; leere Meldung = in Ordnung. */
export function validiereNotiz(e: NotizEingabe, erlaubteTage: string[]): { text?: string; datum?: string } {
  const f: { text?: string; datum?: string } = {};
  if (!e.text.trim()) f.text = 'Bitte einen Text eingeben.';
  else if (e.text.trim().length > 2000) f.text = 'Der Text darf höchstens 2000 Zeichen lang sein.';
  if (e.geltung === 'tag') {
    if (!e.datum) f.datum = 'Bitte einen Tag wählen.';
    else if (!erlaubteTage.includes(e.datum)) f.datum = 'Der Tag liegt außerhalb der Freizeit.';
  }
  return f;
}

/** Namen der Bestätigenden, sortiert; unbekannte Personen als „Jemand". */
export function namenListe(ids: string[], namen: Record<string, string>): string {
  return ids.map((i) => namen[i] ?? 'Jemand').sort((a, b) => a.localeCompare(b, 'de')).join(', ');
}
