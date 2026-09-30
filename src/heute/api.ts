import { supabase } from '../lib/supabase';
import { ApiFehler } from '../lib/fehler';
import type { BestandZeile, OffeneNotiz, PlanPunkt, TeamZeile, WunschZeile } from './logik';

/** Abfragen für die Startseite „Heute“. Rechte entscheidet die Datenbank: jede Person bekommt nur, was sie sehen darf. */

function pruefe<T>(r: { data: T | null; error: { code?: string; message: string } | null }): T {
  if (r.error) throw new ApiFehler(r.error);
  return r.data as T;
}

const liste = (ids: string[]) => `(${ids.join(',')})`;

/** Hinweise und Absprachen der genannten Freizeiten und Treffs samt Bestätigungen (für „Das wartet auf dich“). */
export async function listeNotizenFuerHeute(freizeitIds: string[], treffIds: string[]): Promise<OffeneNotiz[]> {
  if (!freizeitIds.length && !treffIds.length) return [];
  const bedingungen = [freizeitIds.length ? `freizeit_id.in.${liste(freizeitIds)}` : '', treffIds.length ? `treff_id.in.${liste(treffIds)}` : ''].filter(Boolean).join(',');
  const r = pruefe(await supabase.from('notizen')
    .select('id, art, geltung, datum, text, created_at, freizeit_id, treff_id, freizeiten(name), treffs(name), notiz_bestaetigungen(person_id)')
    .or(bedingungen).order('created_at', { ascending: false }).limit(200)) as unknown as
    { id: string; art: 'hinweis' | 'absprache'; geltung: 'gesamt' | 'tag'; datum: string | null; text: string; created_at: string; freizeit_id: string | null; treff_id: string | null;
      freizeiten: { name: string } | null; treffs: { name: string } | null; notiz_bestaetigungen: { person_id: string }[] }[];
  return r.map((n) => ({
    id: n.id, art: n.art, geltung: n.geltung, datum: n.datum, text: n.text, created_at: n.created_at, freizeit_id: n.freizeit_id, treff_id: n.treff_id,
    quelle: n.freizeiten?.name ?? n.treffs?.name ?? '', bestaetigt_von: (n.notiz_bestaetigungen ?? []).map((b) => b.person_id),
  }));
}

/** Teams (Person und Rolle je Freizeit) – für „wer hat einen Hinweis noch nicht gesehen“ und „Freizeit ohne Leitung“. */
export async function listeTeamZeilen(freizeitIds?: string[]): Promise<TeamZeile[]> {
  let q = supabase.from('freizeit_team').select('freizeit_id, person_id, rolle');
  if (freizeitIds) { if (!freizeitIds.length) return []; q = q.in('freizeit_id', freizeitIds); }
  return pruefe(await q) as TeamZeile[];
}

/** Was heute im Wochenplan der genannten Freizeiten steht. */
export async function listePlanHeute(freizeitIds: string[], datum: string): Promise<PlanPunkt[]> {
  if (!freizeitIds.length) return [];
  const r = pruefe(await supabase.from('plan_eintraege')
    .select('id, freizeit_id, freitext, angebote(name), freizeit_slots(name, position)')
    .in('freizeit_id', freizeitIds).eq('datum', datum)) as unknown as
    { id: string; freizeit_id: string; freitext: string | null; angebote: { name: string } | null; freizeit_slots: { name: string; position: number } | null }[];
  return r.map((e) => ({ id: e.id, freizeit_id: e.freizeit_id, titel: e.angebote?.name ?? e.freitext ?? '', slot: e.freizeit_slots?.name ?? '', position: e.freizeit_slots?.position ?? 0 }));
}

/** Lebensmittel mit Ampel „knapp“ oder „leer“ (nur Leitung und Koordination sehen Bestände). */
export async function listeKnappeLebensmittel(): Promise<BestandZeile[]> {
  const r = pruefe(await supabase.from('v_lebensmittel_bestand').select('ort_id, name, einheit, rest, status').in('status', ['knapp', 'leer'])) as
    { ort_id: string; name: string; einheit: string | null; rest: number | string; status: 'knapp' | 'leer' }[];
  return r.map((x) => ({ ...x, rest: Number(x.rest) }));
}

/** Offene Dienstwünsche ab einem Tag für die genannten Treffs (Treffleitung und Koordination sehen sie). */
export async function listeOffeneWuensche(treffIds: string[] | null, ab: string): Promise<WunschZeile[]> {
  if (treffIds && !treffIds.length) return [];
  let q = supabase.from('dienst_wuensche').select('person_id, dienste!inner(datum, treff_id)').eq('status', 'offen').gte('dienste.datum', ab);
  if (treffIds) q = q.in('dienste.treff_id', treffIds);
  const r = pruefe(await q) as unknown as { person_id: string; dienste: { datum: string; treff_id: string } }[];
  return r.map((w) => ({ person_id: w.person_id, datum: w.dienste.datum, treff_id: w.dienste.treff_id }));
}

/** Treffs mit Namen (für Beschriftungen). */
export async function listeTreffNamen(): Promise<Record<string, string>> {
  const r = pruefe(await supabase.from('treffs').select('id, name')) as { id: string; name: string }[];
  return Object.fromEntries(r.map((t) => [t.id, t.name]));
}

/** Namen von Orten (für Beschriftungen der Lebensmittel). */
export async function listeOrtNamen(): Promise<Record<string, string>> {
  const r = pruefe(await supabase.from('orte').select('id, name')) as { id: string; name: string }[];
  return Object.fromEntries(r.map((o) => [o.id, o.name]));
}

/** Wie viele Nachweise der Teilzeitkräfte warten auf Prüfung? (Treffleitung: die des eigenen Treffs, Koordination: alle) */
export async function zaehleEingereichteNachweise(): Promise<number> {
  const { count, error } = await supabase.from('zeitnachweise').select('id', { count: 'exact', head: true }).eq('status', 'eingereicht');
  if (error) throw new ApiFehler(error);
  return count ?? 0;
}
