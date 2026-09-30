import { supabase } from '../lib/supabase';
import { ApiFehler } from '../lib/fehler';
import type { Ferienzeitraum } from './logik';

/** Dünne Schicht über Supabase für die Freizeiten. Rechte entscheidet die Datenbank (RLS), nicht diese Datei. */

function pruefe<T>(r: { data: T | null; error: { code?: string; message: string } | null }): T {
  if (r.error) throw new ApiFehler(r.error);
  return r.data as T;
}

/* ───── Typen ───── */

export interface FreizeitZeile {
  id: string;
  name: string;
  status: 'geplant' | 'abgesagt';
  ferienzeitraum: Ferienzeitraum | null;
  ferienwoche: number | null;
  start_datum: string;
  ende_datum: string;
  ort_id: string | null;
  ort_name: string | null;
  max_teilnehmende: number | null;
  alter_von: number | null;
  alter_bis: number | null;
  tags: string[];
}

export interface FreizeitDetailDaten extends FreizeitZeile {
  arbeitsbeginn: string | null;
  arbeitsende: string | null;
  adresse_abw: string | null;
  ort_adresse: string | null;
  kijuko_entfallen_am: string | null;
}

export interface FreizeitFormular {
  name: string;
  status: 'geplant' | 'abgesagt';
  ferienzeitraum: Ferienzeitraum | '';
  ferienwoche: number | '';
  start_datum: string;
  ende_datum: string;
  arbeitsbeginn: string;
  arbeitsende: string;
  alter_von: number | '';
  alter_bis: number | '';
  max_teilnehmende: number | '';
  ort_id: string;
  tags: string[];
}

export interface Ort { id: string; name: string; adresse: string | null; lieferstelle_nr: string | null; freizeiten: number; treffs: number }

export interface TeamMitglied {
  person_id: string;
  rolle: 'leitung' | 'teamer';
  vorname: string;
  nachname: string;
  kategorie: string;
  mail: string | null;
  telefon: string | null;
  ernaehrung: string | null;
  notizen: string | null;
  tzk_regeltage: string | null;
  tzk_max_stunden: number | null;
}

export interface PersonKurz { id: string; vorname: string; nachname: string; kategorie: string; aktiv: boolean }

export interface OffeneBewerbung {
  id: string;
  notiz: string | null;
  created_at: string;
  person: { vorname: string; nachname: string; mail: string; kategorie: string };
  freizeit: { id: string; name: string; start_datum: string; ende_datum: string };
}

export interface VerpflegungZeile { datum: string | null; mischkost: number; vegetarisch: number; allergiker: number }
export interface MaterialZeile { id: string; name: string; einheit: string | null; menge: number | null; notiz: string | null }

type Roh = Record<string, unknown>;

const zeile = (r: Roh): FreizeitZeile => ({
  id: r.id as string, name: r.name as string, status: r.status as FreizeitZeile['status'],
  ferienzeitraum: (r.ferienzeitraum as Ferienzeitraum | null) ?? null, ferienwoche: (r.ferienwoche as number | null) ?? null,
  start_datum: r.start_datum as string, ende_datum: r.ende_datum as string,
  ort_id: (r.ort_id as string | null) ?? null, ort_name: (r.orte as { name: string } | null)?.name ?? null,
  max_teilnehmende: (r.max_teilnehmende as number | null) ?? null,
  alter_von: (r.alter_von as number | null) ?? null, alter_bis: (r.alter_bis as number | null) ?? null,
  tags: ((r.freizeit_tags as { tag: string }[] | null) ?? []).map((t) => t.tag).sort(),
});

const LISTE = 'id, name, status, ferienzeitraum, ferienwoche, start_datum, ende_datum, ort_id, max_teilnehmende, alter_von, alter_bis, orte(name), freizeit_tags(tag)';

/* ───── Freizeiten ───── */

export async function listeFreizeiten(): Promise<FreizeitZeile[]> {
  const r = pruefe(await supabase.from('freizeiten').select(LISTE).order('start_datum').order('name'));
  return (r as Roh[]).map(zeile);
}

export async function holeFreizeit(id: string): Promise<FreizeitDetailDaten | null> {
  const r = pruefe(await supabase.from('freizeiten')
    .select(`${LISTE}, arbeitsbeginn, arbeitsende, adresse_abw, kijuko_entfallen_am`).eq('id', id).maybeSingle()) as Roh | null;
  if (!r) return null;
  const ort = r.ort_id
    ? pruefe(await supabase.from('orte').select('adresse').eq('id', r.ort_id as string).maybeSingle()) as { adresse: string | null } | null
    : null;
  return {
    ...zeile(r),
    arbeitsbeginn: ((r.arbeitsbeginn as string | null) ?? null)?.slice(0, 5) ?? null,
    arbeitsende: ((r.arbeitsende as string | null) ?? null)?.slice(0, 5) ?? null,
    adresse_abw: (r.adresse_abw as string | null) ?? null,
    ort_adresse: ort?.adresse ?? null,
    kijuko_entfallen_am: (r.kijuko_entfallen_am as string | null) ?? null,
  };
}

const num = (v: number | ''): number | null => (v === '' ? null : v);
const leer = (v: string): string | null => (v.trim() === '' ? null : v.trim());

/** Legt an (id = null) oder ändert; gibt die ID zurück. Schlagworte (Tags) werden mit abgeglichen. */
export async function speichereFreizeit(id: string | null, f: FreizeitFormular): Promise<string> {
  const werte = {
    name: f.name.trim(), status: f.status, ferienzeitraum: f.ferienzeitraum || null, ferienwoche: num(f.ferienwoche),
    start_datum: f.start_datum, ende_datum: f.ende_datum, arbeitsbeginn: leer(f.arbeitsbeginn), arbeitsende: leer(f.arbeitsende),
    alter_von: num(f.alter_von), alter_bis: num(f.alter_bis), max_teilnehmende: num(f.max_teilnehmende), ort_id: f.ort_id || null,
  };
  let fid = id;
  if (id) {
    pruefe(await supabase.from('freizeiten').update(werte).eq('id', id));
  } else {
    const r = pruefe(await supabase.from('freizeiten').insert(werte).select('id').single()) as { id: string };
    fid = r.id;
  }
  const vorhanden = (pruefe(await supabase.from('freizeit_tags').select('tag').eq('freizeit_id', fid!)) as { tag: string }[]).map((t) => t.tag);
  const weg = vorhanden.filter((t) => !f.tags.includes(t));
  const neu = f.tags.filter((t) => !vorhanden.includes(t));
  if (weg.length) pruefe(await supabase.from('freizeit_tags').delete().eq('freizeit_id', fid!).in('tag', weg));
  if (neu.length) pruefe(await supabase.from('freizeit_tags').insert(neu.map((tag) => ({ freizeit_id: fid!, tag }))));
  return fid!;
}

export async function loescheFreizeit(id: string): Promise<void> {
  pruefe(await supabase.from('freizeiten').delete().eq('id', id));
}

export async function listeTags(): Promise<string[]> {
  return (pruefe(await supabase.from('tags').select('name').order('name')) as { name: string }[]).map((t) => t.name);
}

export async function holeVorlaufTage(): Promise<number> {
  const r = pruefe(await supabase.from('einstellungen').select('wert').eq('schluessel', 'bewerbung_vorlauf_tage').maybeSingle()) as { wert: unknown } | null;
  const n = Number(r?.wert);
  return Number.isFinite(n) && n >= 0 ? n : 7;
}

/* ───── Orte ───── */

export async function listeOrte(): Promise<Ort[]> {
  const orte = pruefe(await supabase.from('orte').select('id, name, adresse, lieferstelle_nr').order('name')) as Omit<Ort, 'freizeiten' | 'treffs'>[];
  const fz = pruefe(await supabase.from('freizeiten').select('ort_id')) as { ort_id: string | null }[];
  const tf = pruefe(await supabase.from('treffs').select('ort_id')) as { ort_id: string | null }[];
  const zaehle = (l: { ort_id: string | null }[], id: string) => l.filter((x) => x.ort_id === id).length;
  return orte.map((o) => ({ ...o, freizeiten: zaehle(fz, o.id), treffs: zaehle(tf, o.id) }));
}

export async function speichereOrt(id: string | null, o: { name: string; adresse: string; lieferstelle_nr: string }): Promise<void> {
  const werte = { name: o.name.trim(), adresse: leer(o.adresse), lieferstelle_nr: leer(o.lieferstelle_nr) };
  if (id) pruefe(await supabase.from('orte').update(werte).eq('id', id));
  else pruefe(await supabase.from('orte').insert(werte));
}

export async function loescheOrt(id: string): Promise<void> {
  pruefe(await supabase.from('orte').delete().eq('id', id));
}

/* ───── Team ───── */

export async function holeTeam(freizeitId: string): Promise<TeamMitglied[]> {
  return pruefe(await supabase.from('v_team_freizeit')
    .select('person_id, rolle, vorname, nachname, kategorie, mail, telefon, ernaehrung, notizen, tzk_regeltage, tzk_max_stunden')
    .eq('freizeit_id', freizeitId)) as TeamMitglied[];
}

export async function listePersonen(): Promise<PersonKurz[]> {
  return pruefe(await supabase.from('personen').select('id, vorname, nachname, kategorie, aktiv').order('nachname').order('vorname')) as PersonKurz[];
}

export async function teamHinzufuegen(freizeitId: string, personId: string, rolle: 'leitung' | 'teamer'): Promise<void> {
  pruefe(await supabase.from('freizeit_team').insert({ freizeit_id: freizeitId, person_id: personId, rolle }));
}

export async function teamRolleAendern(freizeitId: string, personId: string, rolle: 'leitung' | 'teamer'): Promise<void> {
  pruefe(await supabase.from('freizeit_team').update({ rolle }).eq('freizeit_id', freizeitId).eq('person_id', personId));
}

export async function teamEntfernen(freizeitId: string, personId: string): Promise<void> {
  pruefe(await supabase.from('freizeit_team').delete().eq('freizeit_id', freizeitId).eq('person_id', personId));
}

/* ───── Bewerbungen ───── */

export async function meineBewerbungen(): Promise<{ freizeit_id: string; status: 'offen' | 'angenommen' | 'abgelehnt' }[]> {
  return pruefe(await supabase.from('bewerbungen').select('freizeit_id, status')) as never;
}

export async function bewerben(freizeitId: string, personId: string, notiz: string): Promise<void> {
  pruefe(await supabase.from('bewerbungen').insert({ freizeit_id: freizeitId, person_id: personId, notiz: leer(notiz) }));
}

export async function bewerbungZurueckziehen(freizeitId: string, personId: string): Promise<void> {
  pruefe(await supabase.from('bewerbungen').delete().eq('freizeit_id', freizeitId).eq('person_id', personId).eq('status', 'offen'));
}

export async function offeneBewerbungen(): Promise<OffeneBewerbung[]> {
  return pruefe(await supabase.from('bewerbungen')
    .select('id, notiz, created_at, person:personen!person_id(vorname, nachname, mail, kategorie), freizeit:freizeiten!freizeit_id(id, name, start_datum, ende_datum)')
    .eq('status', 'offen').order('created_at')) as unknown as OffeneBewerbung[];
}

export async function bewerbungAnnehmen(id: string): Promise<void> {
  pruefe(await supabase.rpc('fn_bewerbung_annehmen', { p_id: id }));
}

export async function bewerbungAblehnen(id: string): Promise<void> {
  pruefe(await supabase.rpc('fn_bewerbung_ablehnen', { p_id: id }));
}

/* ───── Verpflegung und Material (aus KiJuKo, nur lesbar) ───── */

export async function holeVerpflegung(freizeitId: string): Promise<VerpflegungZeile[]> {
  return pruefe(await supabase.from('freizeit_verpflegung').select('datum, mischkost, vegetarisch, allergiker')
    .eq('freizeit_id', freizeitId).order('datum', { nullsFirst: true })) as VerpflegungZeile[];
}

export async function holeMaterial(freizeitId: string): Promise<MaterialZeile[]> {
  return pruefe(await supabase.from('freizeit_material').select('id, name, einheit, menge, notiz')
    .eq('freizeit_id', freizeitId).order('name')) as MaterialZeile[];
}
