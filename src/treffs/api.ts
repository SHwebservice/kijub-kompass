import { supabase } from '../lib/supabase';
import { ApiFehler } from '../lib/fehler';
import type { Notiz } from '../freizeiten/notizen';
import type { NotizWerte } from '../freizeiten/api';
import { oeffnungszeitenAusTagen, sortiereOeffnungszeiten, type Oeffnungszeit, type TageEingabe, type TreffMitglied, type WochenprogrammEintrag } from './logik';

/** Dünne Schicht über Supabase für die Treffs. Rechte entscheidet die Datenbank (RLS), nicht diese Datei. */

function pruefe<T>(r: { data: T | null; error: { code?: string; message: string } | null }): T {
  if (r.error) throw new ApiFehler(r.error);
  return r.data as T;
}

const leer = (v: string): string | null => (v.trim() === '' ? null : v.trim());

/* ───── Typen ───── */

export interface TreffZeile {
  id: string;
  name: string;
  ort_id: string | null;
  ort_name: string | null;
  oeffnungszeiten: Oeffnungszeit[];
}

export interface TreffDetailDaten extends TreffZeile {
  adresse_abw: string | null;
  ort_adresse: string | null;
}

export interface TreffFormular { name: string; ort_id: string; adresse_abw: string; tage: TageEingabe }

export interface TreffTeamMitglied extends TreffMitglied {
  mail: string | null;
  telefon: string | null;
  tzk_regeltage: string | null;
  tzk_max_stunden: number | null;
}

type Roh = Record<string, unknown>;

const kurz = (z: string) => z.slice(0, 5);

const zeile = (r: Roh): TreffZeile => ({
  id: r.id as string,
  name: r.name as string,
  ort_id: (r.ort_id as string | null) ?? null,
  ort_name: (r.orte as { name: string } | null)?.name ?? null,
  oeffnungszeiten: sortiereOeffnungszeiten(
    ((r.treff_oeffnungszeiten as Oeffnungszeit[] | null) ?? []).map((o) => ({ wochentag: o.wochentag, von: kurz(o.von), bis: kurz(o.bis) })),
  ),
});

const LISTE = 'id, name, ort_id, orte(name), treff_oeffnungszeiten(wochentag, von, bis)';

/* ───── Treffs ───── */

export async function listeTreffs(): Promise<TreffZeile[]> {
  const r = pruefe(await supabase.from('treffs').select(LISTE).order('name')) as Roh[];
  return r.map(zeile);
}

export async function holeTreff(id: string): Promise<TreffDetailDaten | null> {
  const r = pruefe(await supabase.from('treffs').select(`${LISTE}, adresse_abw`).eq('id', id).maybeSingle()) as Roh | null;
  if (!r) return null;
  const ort = r.ort_id
    ? pruefe(await supabase.from('orte').select('adresse').eq('id', r.ort_id as string).maybeSingle()) as { adresse: string | null } | null
    : null;
  return { ...zeile(r), adresse_abw: (r.adresse_abw as string | null) ?? null, ort_adresse: ort?.adresse ?? null };
}

/** Legt an (id = null) oder ändert einen Treff samt Öffnungszeiten; gibt die ID zurück. */
export async function speichereTreff(id: string | null, f: TreffFormular): Promise<string> {
  const werte = { name: f.name.trim(), ort_id: f.ort_id || null, adresse_abw: leer(f.adresse_abw) };
  let tid = id;
  if (id) {
    pruefe(await supabase.from('treffs').update(werte).eq('id', id));
  } else {
    tid = (pruefe(await supabase.from('treffs').insert(werte).select('id').single()) as { id: string }).id;
  }
  const neu = oeffnungszeitenAusTagen(f.tage);
  const vorhanden = (pruefe(await supabase.from('treff_oeffnungszeiten').select('wochentag').eq('treff_id', tid!)) as { wochentag: number }[]).map((o) => o.wochentag);
  const weg = vorhanden.filter((w) => !neu.some((o) => o.wochentag === w));
  if (weg.length) pruefe(await supabase.from('treff_oeffnungszeiten').delete().eq('treff_id', tid!).in('wochentag', weg));
  if (neu.length) pruefe(await supabase.from('treff_oeffnungszeiten').upsert(neu.map((o) => ({ treff_id: tid!, ...o }))));
  return tid!;
}

export async function loescheTreff(id: string): Promise<void> {
  pruefe(await supabase.from('treffs').delete().eq('id', id));
}

/* ───── Team ───── */

export async function holeTreffTeam(treffId: string): Promise<TreffTeamMitglied[]> {
  return pruefe(await supabase.from('v_team_treff')
    .select('person_id, rolle, vorname, nachname, kategorie, mail, telefon, tzk_regeltage, tzk_max_stunden')
    .eq('treff_id', treffId)) as TreffTeamMitglied[];
}

export async function treffTeamHinzufuegen(treffId: string, personId: string, rolle: TreffMitglied['rolle']): Promise<void> {
  pruefe(await supabase.from('treff_team').insert({ treff_id: treffId, person_id: personId, rolle }));
}

export async function treffTeamRolleAendern(treffId: string, personId: string, rolle: TreffMitglied['rolle']): Promise<void> {
  pruefe(await supabase.from('treff_team').update({ rolle }).eq('treff_id', treffId).eq('person_id', personId));
}

export async function treffTeamEntfernen(treffId: string, personId: string): Promise<void> {
  pruefe(await supabase.from('treff_team').delete().eq('treff_id', treffId).eq('person_id', personId));
}

/* ───── Wochenprogramm ───── */

export async function holeWochenprogramm(treffId: string): Promise<WochenprogrammEintrag[]> {
  const r = pruefe(await supabase.from('treff_plan_eintraege')
    .select('wochentag, angebot_id, freitext, notiz, angebote(name)').eq('treff_id', treffId).order('wochentag')) as unknown as
    (Omit<WochenprogrammEintrag, 'angebot_name'> & { angebote: { name: string } | null })[];
  return r.map(({ angebote, ...e }) => ({ ...e, angebot_name: angebote?.name ?? null }));
}

export interface ProgrammWerte { angebot_id: string | null; freitext: string | null; notiz: string | null }

export async function speichereProgrammpunkt(treffId: string, wochentag: number, w: ProgrammWerte): Promise<void> {
  pruefe(await supabase.from('treff_plan_eintraege').upsert({ treff_id: treffId, wochentag, ...w }));
}

export async function loescheProgrammpunkt(treffId: string, wochentag: number): Promise<void> {
  pruefe(await supabase.from('treff_plan_eintraege').delete().eq('treff_id', treffId).eq('wochentag', wochentag));
}

/* ───── Absprachen (Bestätigen, Bearbeiten und Löschen laufen über die Funktionen der Freizeiten) ───── */

export async function listeTreffAbsprachen(treffId: string): Promise<Notiz[]> {
  const r = pruefe(await supabase.from('notizen')
    .select('id, art, geltung, datum, text, erstellt_von, created_at, notiz_bestaetigungen(person_id, at)')
    .eq('treff_id', treffId).order('created_at', { ascending: false })) as unknown as
    (Omit<Notiz, 'bestaetigungen' | 'kommentare'> & { notiz_bestaetigungen: Notiz['bestaetigungen'] })[];
  return r.map(({ notiz_bestaetigungen, ...n }) => ({ ...n, bestaetigungen: notiz_bestaetigungen ?? [], kommentare: [] }));
}

export async function legeTreffAbspracheAn(treffId: string, w: NotizWerte): Promise<void> {
  pruefe(await supabase.from('notizen').insert({
    treff_id: treffId, art: 'absprache', geltung: w.geltung, datum: w.geltung === 'tag' ? w.datum : null, text: w.text.trim(),
  }));
}
