import { supabase } from '../lib/supabase';
import { ApiFehler } from '../lib/fehler';
import type { Ferienzeitraum, FreizeitFarbeId, FreizeitTyp } from './logik';
import type { AngebotKurz, PlanEintrag, Slot } from './plan';
import type { Geltung, Notiz, NotizArt } from './notizen';
import type { Eingang, Verbrauch } from './lebensmittel';

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
  /** Gewählte Farbe (Migration 0026); null = automatisch aus der ID. */
  farbe: FreizeitFarbeId | null;
  /** false = für Bewerbungen geschlossen (Migration 0030). */
  bewerbung_offen: boolean;
  /** 1 Themen-, 2 Betreuungs-, 3 Groß-, 4 Übernachtungsfreizeit; null = noch nicht festgelegt (Migration 0032). */
  typ: FreizeitTyp | null;
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
  /** '' = automatisch */
  farbe: FreizeitFarbeId | '';
  bewerbung_offen: boolean;
  typ: FreizeitTyp | '';
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
  /** Gehört zum Küchenteam (aus KiJuKo) */
  kueche?: boolean;
}

export interface PersonKurz { id: string; vorname: string; nachname: string; kategorie: string; aktiv: boolean }

export interface OffeneBewerbung {
  id: string;
  notiz: string | null;
  created_at: string;
  person: { vorname: string; nachname: string; mail: string; kategorie: string };
  freizeit: { id: string; name: string; start_datum: string; ende_datum: string };
}

export interface VerpflegungZeile {
  datum: string | null; mischkost: number; vegetarisch: number; allergiker: number;
  menue_mischkost: string | null; menue_vegetarisch: string | null; dessert: string | null;
}
export interface SonderkostZeile { text: string; anzahl: number }
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
  farbe: (r.farbe as FreizeitFarbeId | null | undefined) ?? null,
  bewerbung_offen: r.bewerbung_offen !== false,
  typ: (r.typ as FreizeitTyp | null | undefined) ?? null,
});

const LISTE = 'id, name, status, ferienzeitraum, ferienwoche, start_datum, ende_datum, ort_id, max_teilnehmende, alter_von, alter_bis, farbe, bewerbung_offen, typ, orte(name), freizeit_tags(tag)';

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
    farbe: f.farbe || null, bewerbung_offen: f.bewerbung_offen, typ: f.typ === '' ? null : f.typ,
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
    .select('person_id, rolle, vorname, nachname, kategorie, mail, telefon, ernaehrung, notizen, tzk_regeltage, tzk_max_stunden, kueche')
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

export async function bewerbungAnnehmen(id: string, rolle: 'teamer' | 'leitung' = 'teamer'): Promise<void> {
  pruefe(await supabase.rpc('fn_bewerbung_annehmen', { p_id: id, p_rolle: rolle }));
}

export async function bewerbungAblehnen(id: string): Promise<void> {
  pruefe(await supabase.rpc('fn_bewerbung_ablehnen', { p_id: id }));
}

/** Bewerbungsfrist in Tagen vor Beginn (0 bis 90); ändert nur die Freizeitenkoordination. */
export async function speichereVorlaufTage(tage: number): Promise<void> {
  pruefe(await supabase.from('einstellungen').update({ wert: tage }).eq('schluessel', 'bewerbung_vorlauf_tage'));
}

/* ───── Bewerbung für eine Ferienzeit (Migration 0030) ───── */

export interface ZeitraumBewerbung {
  id: string;
  person_id: string;
  jahr: number;
  ferienzeitraum: Ferienzeitraum;
  wochen: number[];
  notiz: string | null;
  status: 'offen' | 'erledigt';
  created_at: string;
}
export interface OffeneZeitraumBewerbung extends ZeitraumBewerbung { person: { vorname: string; nachname: string; kategorie: string } }

const ZEITRAUM = 'id, person_id, jahr, ferienzeitraum, wochen, notiz, status, created_at';

export async function meineZeitraumBewerbungen(personId: string): Promise<ZeitraumBewerbung[]> {
  return pruefe(await supabase.from('bewerbungen_zeitraum').select(ZEITRAUM).eq('person_id', personId).order('jahr').order('ferienzeitraum')) as ZeitraumBewerbung[];
}

/** Legt die Bewerbung an; Ergebnis: ihre ID (für die Mitteilung an die Freizeitenkoordination). */
export async function zeitraumBewerben(personId: string, jahr: number, ferienzeitraum: Ferienzeitraum, wochen: number[], notiz: string): Promise<string> {
  return (pruefe(await supabase.from('bewerbungen_zeitraum').insert({ person_id: personId, jahr, ferienzeitraum, wochen, notiz: leer(notiz) }).select('id').single()) as { id: string }).id;
}

export async function zeitraumZurueckziehen(id: string): Promise<void> {
  pruefe(await supabase.from('bewerbungen_zeitraum').delete().eq('id', id));
}

export async function offeneZeitraumBewerbungen(): Promise<OffeneZeitraumBewerbung[]> {
  return pruefe(await supabase.from('bewerbungen_zeitraum').select(`${ZEITRAUM}, person:personen!person_id(vorname, nachname, kategorie)`)
    .eq('status', 'offen').order('jahr').order('ferienzeitraum').order('created_at')) as unknown as OffeneZeitraumBewerbung[];
}

/** Ordnet die Person einer Freizeit zu; Ergebnis: ID der dabei angenommenen Bewerbung (für „Bewerbung angenommen“). */
export async function zeitraumZuordnen(id: string, freizeitId: string, rolle: 'teamer' | 'leitung'): Promise<string> {
  return pruefe(await supabase.rpc('fn_zeitraum_zuordnen', { p_zeitraum: id, p_freizeit: freizeitId, p_rolle: rolle })) as string;
}

export async function zeitraumErledigt(id: string): Promise<void> {
  pruefe(await supabase.from('bewerbungen_zeitraum').update({ status: 'erledigt' }).eq('id', id));
}

/* ───── Materialliste der Leitung (Migration 0032) ───── */

export interface MaterialPosten { id: string; name: string; menge: string; notiz: string; erstellt_von: string | null; created_at: string }
export interface MaterialAbgabe { abgegeben_von: string | null; abgegeben_am: string }
export interface MaterialEingabe { name: string; menge: string; notiz: string }

export async function listeMaterialliste(freizeitId: string): Promise<MaterialPosten[]> {
  return pruefe(await supabase.from('freizeit_materialliste').select('id, name, menge, notiz, erstellt_von, created_at').eq('freizeit_id', freizeitId).order('created_at')) as MaterialPosten[];
}

export async function legeMaterialAn(freizeitId: string, e: MaterialEingabe): Promise<void> {
  pruefe(await supabase.from('freizeit_materialliste').insert({ freizeit_id: freizeitId, name: e.name.trim(), menge: e.menge.trim(), notiz: e.notiz.trim() }));
}

export async function aendereMaterial(id: string, e: MaterialEingabe): Promise<void> {
  pruefe(await supabase.from('freizeit_materialliste').update({ name: e.name.trim(), menge: e.menge.trim(), notiz: e.notiz.trim() }).eq('id', id));
}

export async function loescheMaterial(id: string): Promise<void> {
  pruefe(await supabase.from('freizeit_materialliste').delete().eq('id', id));
}

export async function holeMaterialAbgabe(freizeitId: string): Promise<MaterialAbgabe | null> {
  return pruefe(await supabase.from('materialliste_abgabe').select('abgegeben_von, abgegeben_am').eq('freizeit_id', freizeitId).maybeSingle()) as MaterialAbgabe | null;
}

/** Gibt die Liste an die Freizeitenkoordination ab (auch erneut nach Änderungen). */
export async function gibMateriallisteAb(freizeitId: string): Promise<void> {
  pruefe(await supabase.rpc('fn_materialliste_abgeben', { p_freizeit: freizeitId }));
}

/* ───── Verpflegung und Material (aus KiJuKo, nur lesbar) ───── */

export async function holeVerpflegung(freizeitId: string): Promise<VerpflegungZeile[]> {
  return pruefe(await supabase.from('freizeit_verpflegung').select('datum, mischkost, vegetarisch, allergiker, menue_mischkost, menue_vegetarisch, dessert')
    .eq('freizeit_id', freizeitId).order('datum', { nullsFirst: true })) as VerpflegungZeile[];
}

export interface LieferungZeile {
  id: string; art: 'lebensmittel' | 'material' | 'ausstattung'; bezeichnung: string; menge: number;
  einheit: string | null; datum: string | null; notiz: string | null;
}

/** Was die Koordination zur Freizeit bringt (aus KiJuKo; Leitung, Küchenteam, Koordination). */
export async function holeLieferungen(freizeitId: string): Promise<LieferungZeile[]> {
  return pruefe(await supabase.from('freizeit_lieferungen').select('id, art, bezeichnung, menge, einheit, datum, notiz')
    .eq('freizeit_id', freizeitId).order('datum', { nullsFirst: true }).order('bezeichnung')) as LieferungZeile[];
}

/** Sonderkost ohne Namen (Leitung, Küchenteam, Koordination). */
export async function holeSonderkost(freizeitId: string): Promise<SonderkostZeile[]> {
  return pruefe(await supabase.from('freizeit_sonderkost').select('text, anzahl')
    .eq('freizeit_id', freizeitId).order('anzahl', { ascending: false }).order('text')) as SonderkostZeile[];
}

export async function holeMaterial(freizeitId: string): Promise<MaterialZeile[]> {
  return pruefe(await supabase.from('freizeit_material').select('id, name, einheit, menge, notiz')
    .eq('freizeit_id', freizeitId).order('name')) as MaterialZeile[];
}

/* ───── Wochenplan ───── */


export async function listeSlots(freizeitId: string): Promise<Slot[]> {
  return pruefe(await supabase.from('freizeit_slots').select('id, name, position').eq('freizeit_id', freizeitId).order('position')) as Slot[];
}

export async function listeEintraege(freizeitId: string): Promise<PlanEintrag[]> {
  const r = pruefe(await supabase.from('plan_eintraege')
    .select('id, datum, slot_id, angebot_id, freitext, notiz, erstellt_von, created_at, angebote(name, kategorie)')
    .eq('freizeit_id', freizeitId).order('created_at')) as unknown as (Omit<PlanEintrag, 'angebot_name' | 'angebot_kategorie'> & { angebote: { name: string; kategorie: string } | null })[];
  return r.map(({ angebote, ...rest }) => ({ ...rest, angebot_name: angebote?.name ?? null, angebot_kategorie: angebote?.kategorie ?? null }));
}

export async function listeAngebote(): Promise<AngebotKurz[]> {
  return pruefe(await supabase.from('angebote').select('id, name, kategorie, dauer, gruppe, wetter, alter_gruppen').order('name')) as AngebotKurz[];
}

export interface EintragWerte { angebot_id: string | null; freitext: string | null; notiz: string | null }

export async function trageEin(freizeitId: string, datum: string, slotId: string, w: EintragWerte): Promise<void> {
  pruefe(await supabase.from('plan_eintraege').insert({ freizeit_id: freizeitId, datum, slot_id: slotId, ...w }));
}

export async function aendereEintrag(id: string, w: Partial<EintragWerte>): Promise<void> {
  pruefe(await supabase.from('plan_eintraege').update(w).eq('id', id));
}

export async function loescheEintrag(id: string): Promise<void> {
  pruefe(await supabase.from('plan_eintraege').delete().eq('id', id));
}

export async function slotHinzufuegen(freizeitId: string, name: string, position: number): Promise<void> {
  pruefe(await supabase.from('freizeit_slots').insert({ freizeit_id: freizeitId, name, position }));
}

export async function slotPositionen(aenderungen: { id: string; position: number }[]): Promise<void> {
  for (const a of aenderungen) pruefe(await supabase.from('freizeit_slots').update({ position: a.position }).eq('id', a.id));
}

/** Namen von Personen (nur solche, die man sehen darf: das eigene Team bzw. alle für die Koordination). */
export async function holeNamen(ids: string[]): Promise<Record<string, string>> {
  if (!ids.length) return {};
  const r = pruefe(await supabase.from('v_personen_namen').select('id, vorname, nachname').in('id', ids)) as { id: string; vorname: string; nachname: string }[];
  return Object.fromEntries(r.map((p) => [p.id, `${p.vorname} ${p.nachname}`]));
}

/* ───── Hinweise und Absprachen ───── */


export async function listeNotizen(freizeitId: string): Promise<Notiz[]> {
  const r = pruefe(await supabase.from('notizen')
    .select('id, art, geltung, datum, text, erstellt_von, created_at, notiz_bestaetigungen(person_id, at), notiz_kommentare(id, person_id, text, created_at)')
    .eq('freizeit_id', freizeitId).order('created_at', { ascending: false })) as unknown as
    (Omit<Notiz, 'bestaetigungen' | 'kommentare'> & { notiz_bestaetigungen: Notiz['bestaetigungen']; notiz_kommentare: Notiz['kommentare'] })[];
  return r.map(({ notiz_bestaetigungen, notiz_kommentare, ...n }) => ({
    ...n, bestaetigungen: notiz_bestaetigungen ?? [],
    kommentare: [...(notiz_kommentare ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at)),
  }));
}

export interface NotizWerte { geltung: Geltung; datum: string | null; text: string }

/** Legt einen Hinweis oder eine Absprache an und gibt die ID zurück (für die Mitteilung an das Team). */
export async function legeNotizAn(freizeitId: string, art: NotizArt, w: NotizWerte): Promise<string> {
  return (pruefe(await supabase.from('notizen').insert({ freizeit_id: freizeitId, art, geltung: w.geltung, datum: w.geltung === 'tag' ? w.datum : null, text: w.text.trim() }).select('id').single()) as { id: string }).id;
}

export async function aendereNotiz(id: string, w: NotizWerte): Promise<void> {
  pruefe(await supabase.from('notizen').update({ geltung: w.geltung, datum: w.geltung === 'tag' ? w.datum : null, text: w.text.trim() }).eq('id', id));
}

export async function loescheNotiz(id: string): Promise<void> {
  pruefe(await supabase.from('notizen').delete().eq('id', id));
}

export async function bestaetige(notizId: string, personId: string): Promise<void> {
  pruefe(await supabase.from('notiz_bestaetigungen').insert({ notiz_id: notizId, person_id: personId }));
}

export async function bestaetigungZurueck(notizId: string, personId: string): Promise<void> {
  pruefe(await supabase.from('notiz_bestaetigungen').delete().eq('notiz_id', notizId).eq('person_id', personId));
}

export async function kommentiere(notizId: string, personId: string, text: string): Promise<void> {
  pruefe(await supabase.from('notiz_kommentare').insert({ notiz_id: notizId, person_id: personId, text: text.trim() }));
}

export async function loescheKommentar(id: string): Promise<void> {
  pruefe(await supabase.from('notiz_kommentare').delete().eq('id', id));
}

/* ───── Lebensmittel (Bestand je Ort) ───── */


const zahlen = <T extends { menge: unknown }>(r: T[]): (T & { menge: number })[] => r.map((x) => ({ ...x, menge: Number(x.menge) }));

export async function listeEingaenge(ortId: string): Promise<Eingang[]> {
  return zahlen(pruefe(await supabase.from('lebensmittel_eingang').select('id, name, menge, einheit, datum, freizeit_id, kijuko_id').eq('ort_id', ortId).order('datum')) as Eingang[]);
}

export async function listeVerbrauch(ortId: string): Promise<Verbrauch[]> {
  return zahlen(pruefe(await supabase.from('lebensmittel_verbrauch').select('id, name, menge, datum, freizeit_id').eq('ort_id', ortId).order('datum')) as Verbrauch[]);
}

export async function trageEingangEin(ortId: string, freizeitId: string, w: { name: string; menge: number; einheit: string; datum: string }): Promise<void> {
  pruefe(await supabase.from('lebensmittel_eingang').insert({ ort_id: ortId, freizeit_id: freizeitId, name: w.name.trim(), menge: w.menge, einheit: leer(w.einheit), datum: w.datum }));
}

export async function aendereEingang(id: string, menge: number): Promise<void> {
  pruefe(await supabase.from('lebensmittel_eingang').update({ menge }).eq('id', id));
}

export async function loescheEingang(id: string): Promise<void> {
  pruefe(await supabase.from('lebensmittel_eingang').delete().eq('id', id));
}

export async function trageVerbrauchEin(ortId: string, freizeitId: string, w: { name: string; menge: number; datum: string }): Promise<void> {
  pruefe(await supabase.from('lebensmittel_verbrauch').insert({ ort_id: ortId, freizeit_id: freizeitId, name: w.name.trim(), menge: w.menge, datum: w.datum }));
}

export async function aendereVerbrauch(id: string, w: { menge: number; datum: string }): Promise<void> {
  pruefe(await supabase.from('lebensmittel_verbrauch').update(w).eq('id', id));
}

export async function loescheVerbrauch(id: string): Promise<void> {
  pruefe(await supabase.from('lebensmittel_verbrauch').delete().eq('id', id));
}
