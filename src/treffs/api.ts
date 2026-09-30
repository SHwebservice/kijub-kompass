import { supabase } from '../lib/supabase';
import { ApiFehler } from '../lib/fehler';
import type { Notiz } from '../freizeiten/notizen';
import type { NotizWerte } from '../freizeiten/api';
import type { Abwesenheit, Dienst, Feiertag, SonderEingabe, StatistikZeile, Muster, WunschStatus } from './dienstplan';
import { musterAlsJson } from './dienstplan';
import type { Nachweis, NachweisStatus, NachweisZeile } from './nachweis';
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

export async function legeTreffAbspracheAn(treffId: string, w: NotizWerte): Promise<string> {
  return (pruefe(await supabase.from('notizen').insert({
    treff_id: treffId, art: 'absprache', geltung: w.geltung, datum: w.geltung === 'tag' ? w.datum : null, text: w.text.trim(),
  }).select('id').single()) as { id: string }).id;
}

/* ───── Dienstplan ───── */

export async function listeDienste(treffId: string, von: string, bis: string): Promise<Dienst[]> {
  const r = pruefe(await supabase.from('dienste')
    .select('id, datum, von, bis, ist_sonder, bezeichnung, dienst_zuteilungen(person_id), dienst_wuensche(person_id, status)')
    .eq('treff_id', treffId).gte('datum', von).lte('datum', bis).order('datum')) as unknown as
    (Omit<Dienst, 'personen' | 'wuensche'> & { dienst_zuteilungen: { person_id: string }[]; dienst_wuensche: { person_id: string; status: WunschStatus }[] })[];
  return r.map(({ dienst_zuteilungen, dienst_wuensche, ...d }) => ({
    ...d, von: d.von?.slice(0, 5) ?? null, bis: d.bis?.slice(0, 5) ?? null,
    personen: (dienst_zuteilungen ?? []).map((z) => z.person_id), wuensche: dienst_wuensche ?? [],
  }));
}

export async function listeFeiertage(treffId: string, von: string, bis: string): Promise<Feiertag[]> {
  return pruefe(await supabase.from('feiertage').select('id, treff_id, datum, bezeichnung')
    .or(`treff_id.eq.${treffId},treff_id.is.null`).gte('datum', von).lte('datum', bis).order('datum')) as Feiertag[];
}

/** Abwesenheiten, die die angemeldete Person sehen darf (eigene; Treffleitung und Koordination die ihres Teams). */
export async function listeAbwesenheiten(von: string, bis: string): Promise<Abwesenheit[]> {
  return pruefe(await supabase.from('abwesenheiten').select('id, person_id, datum, typ, notiz')
    .gte('datum', von).lte('datum', bis).order('datum')) as Abwesenheit[];
}

/** Legt den regulären Dienst eines Öffnungstags an, falls es ihn noch nicht gibt, und gibt seine ID zurück. */
export async function dienstSicherstellen(treffId: string, datum: string): Promise<string> {
  return pruefe(await supabase.rpc('fn_dienst_sicherstellen', { p_treff: treffId, p_datum: datum })) as string;
}

export async function setzeZuteilung(dienstId: string, hinzu: string[], weg: string[]): Promise<void> {
  if (weg.length) pruefe(await supabase.from('dienst_zuteilungen').delete().eq('dienst_id', dienstId).in('person_id', weg));
  if (hinzu.length) pruefe(await supabase.from('dienst_zuteilungen').insert(hinzu.map((person_id) => ({ dienst_id: dienstId, person_id }))));
}

export async function wuenscheDienst(treffId: string, datum: string): Promise<void> {
  pruefe(await supabase.rpc('fn_dienst_wunsch', { p_treff: treffId, p_datum: datum }));
}

export async function wunschZuruecknehmen(dienstId: string, personId: string): Promise<void> {
  pruefe(await supabase.from('dienst_wuensche').delete().eq('dienst_id', dienstId).eq('person_id', personId));
}

export async function entscheideWunsch(dienstId: string, personId: string, bestaetigen: boolean): Promise<void> {
  pruefe(await supabase.rpc('fn_wunsch_entscheiden', { p_dienst: dienstId, p_person: personId, p_bestaetigen: bestaetigen }));
}

/** Legt einen Sonderdienst an (id = null) oder ändert ihn; `alt` sind die bisher eingeteilten Personen. */
export async function speichereSonderdienst(treffId: string, id: string | null, w: SonderEingabe, personen: string[], alt: string[]): Promise<void> {
  const werte = { datum: w.datum, von: w.von, bis: w.bis, bezeichnung: w.bezeichnung.trim(), ist_sonder: true };
  let did = id;
  if (id) pruefe(await supabase.from('dienste').update(werte).eq('id', id));
  else did = (pruefe(await supabase.from('dienste').insert({ treff_id: treffId, ...werte }).select('id').single()) as { id: string }).id;
  await setzeZuteilung(did!, personen.filter((p) => !alt.includes(p)), alt.filter((p) => !personen.includes(p)));
}

export async function loescheDienst(id: string): Promise<void> {
  pruefe(await supabase.from('dienste').delete().eq('id', id));
}

export async function wendeMonatsmusterAn(treffId: string, monat: string, muster: Muster): Promise<number> {
  return pruefe(await supabase.rpc('fn_dienste_monatsmuster', { p_treff: treffId, p_monat: monat, p_muster: musterAlsJson(muster) })) as number;
}

export async function dienstStatistik(treffId: string, monat: string): Promise<StatistikZeile[]> {
  const r = pruefe(await supabase.rpc('fn_dienst_statistik', { p_treff: treffId, p_monat: monat })) as { person_id: string; dienste: number; stunden: number | string }[];
  return r.map((x) => ({ person_id: x.person_id, dienste: x.dienste, stunden: Number(x.stunden) }));
}

export interface DienstplanKommentar { id: string; person_id: string; text: string; created_at: string }

export async function listeDienstplanKommentare(treffId: string, wocheStart: string): Promise<DienstplanKommentar[]> {
  return pruefe(await supabase.from('dienstplan_kommentare').select('id, person_id, text, created_at')
    .eq('treff_id', treffId).eq('woche_start', wocheStart).order('created_at')) as DienstplanKommentar[];
}

export async function legeDienstplanKommentarAn(treffId: string, wocheStart: string, personId: string, text: string): Promise<string> {
  return (pruefe(await supabase.from('dienstplan_kommentare').insert({ treff_id: treffId, woche_start: wocheStart, person_id: personId, text: text.trim() }).select('id').single()) as { id: string }).id;
}

export async function loescheDienstplanKommentar(id: string): Promise<void> {
  pruefe(await supabase.from('dienstplan_kommentare').delete().eq('id', id));
}

/* ───── Abwesenheiten und Feiertage ───── */

/** Trägt Urlaub/Krank für alle genannten Tage ein; vorhandene Einträge derselben Person und Tage werden überschrieben. */
export async function speichereAbwesenheit(personId: string, tage: string[], typ: Abwesenheit['typ'], notiz: string): Promise<void> {
  pruefe(await supabase.from('abwesenheiten').upsert(tage.map((datum) => ({ person_id: personId, datum, typ, notiz: leer(notiz) })), { onConflict: 'person_id,datum' }));
}

export async function loescheAbwesenheiten(ids: string[]): Promise<void> {
  pruefe(await supabase.from('abwesenheiten').delete().in('id', ids));
}

export async function speichereFeiertag(treffId: string | null, datum: string, bezeichnung: string): Promise<void> {
  pruefe(await supabase.from('feiertage').insert({ treff_id: treffId, datum, bezeichnung: bezeichnung.trim() }));
}

export async function loescheFeiertag(id: string): Promise<void> {
  pruefe(await supabase.from('feiertage').delete().eq('id', id));
}

/* ───── Nachweis der Teilzeitkräfte ───── */

/** Nachweise des Monats, die die angemeldete Person sehen darf (eigene; Treffleitung und Koordination alle des Treffs). */
export async function listeNachweise(treffId: string, monat: string): Promise<Nachweis[]> {
  const r = pruefe(await supabase.from('zeitnachweise')
    .select('id, person_id, monat, status, unterschrift, freigegeben_von, zeitnachweis_zeilen(id, datum, zeiten, stunden, quelle)')
    .eq('treff_id', treffId).eq('monat', monat)) as unknown as
    (Omit<Nachweis, 'zeilen'> & { zeitnachweis_zeilen: (Omit<NachweisZeile, 'stunden'> & { stunden: number | string | null })[] })[];
  return r.map(({ zeitnachweis_zeilen, ...n }) => ({
    ...n, zeilen: (zeitnachweis_zeilen ?? []).map((z) => ({ ...z, stunden: z.stunden === null ? null : Number(z.stunden) })),
  }));
}

/** Legt den eigenen Nachweis an und befüllt ihn aus dem Dienstplan; gibt die ID zurück. */
export async function legeNachweisAn(treffId: string, personId: string, monat: string): Promise<string> {
  const id = (pruefe(await supabase.from('zeitnachweise').insert({ treff_id: treffId, person_id: personId, monat }).select('id').single()) as { id: string }).id;
  pruefe(await supabase.rpc('fn_nachweis_befuellen', { p_nachweis: id }));
  return id;
}

/** Ersetzt die aus Dienstplan und Abwesenheiten erzeugten Zeilen; manuelle bleiben. */
export async function befuelleNachweis(id: string): Promise<void> {
  pruefe(await supabase.rpc('fn_nachweis_befuellen', { p_nachweis: id }));
}

export interface ZeilenWerte { datum: string; zeiten: string | null; stunden: number | null }

/** Neue Zeile (id = null) oder Änderung; geänderte Zeilen zählen danach als manuell und überstehen das Aktualisieren. */
export async function speichereZeile(nachweisId: string, id: string | null, w: ZeilenWerte): Promise<void> {
  const werte = { datum: w.datum, zeiten: w.zeiten, stunden: w.stunden, quelle: 'manuell' };
  if (id) pruefe(await supabase.from('zeitnachweis_zeilen').update(werte).eq('id', id));
  else pruefe(await supabase.from('zeitnachweis_zeilen').insert({ nachweis_id: nachweisId, ...werte }));
}

export async function loescheZeile(id: string): Promise<void> {
  pruefe(await supabase.from('zeitnachweis_zeilen').delete().eq('id', id));
}

export async function speichereUnterschrift(id: string, text: string): Promise<void> {
  pruefe(await supabase.from('zeitnachweise').update({ unterschrift: leer(text) }).eq('id', id));
}

export async function setzeNachweisStatus(id: string, status: NachweisStatus, unterschrift?: string): Promise<void> {
  pruefe(await supabase.from('zeitnachweise').update(unterschrift === undefined ? { status } : { status, unterschrift: leer(unterschrift) }).eq('id', id));
}

export async function loescheNachweis(id: string): Promise<void> {
  pruefe(await supabase.from('zeitnachweise').delete().eq('id', id));
}

/* ───── Meine Dienste (für die Startseite) ───── */

export interface MeinDienst {
  id: string;
  datum: string;
  von: string | null;
  bis: string | null;
  ist_sonder: boolean;
  bezeichnung: string | null;
  treff_id: string;
  treff_name: string;
}

export async function listeMeineDienste(personId: string, von: string, bis: string): Promise<MeinDienst[]> {
  const r = pruefe(await supabase.from('dienst_zuteilungen')
    .select('dienste!inner(id, datum, von, bis, ist_sonder, bezeichnung, treff_id, treffs(name))')
    .eq('person_id', personId).gte('dienste.datum', von).lte('dienste.datum', bis)) as unknown as
    { dienste: Omit<MeinDienst, 'treff_name'> & { treffs: { name: string } | null } }[];
  return r.map(({ dienste: { treffs, ...d } }) => ({ ...d, von: d.von?.slice(0, 5) ?? null, bis: d.bis?.slice(0, 5) ?? null, treff_name: treffs?.name ?? '' }))
    .sort((a, b) => a.datum.localeCompare(b.datum) || (a.von ?? '').localeCompare(b.von ?? ''));
}
