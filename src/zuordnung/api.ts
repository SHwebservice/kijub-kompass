import { supabase } from '../lib/supabase';
import { ApiFehler } from '../lib/fehler';
import type { Kategorie } from '../lib/rollen';
import type { FreizeitRolle, FreizeitTeamZeile, TreffRolle, TreffTeamZeile } from './logik';

/** Dünne Schicht über Supabase für die Zuordnung von Personen zu Freizeiten und Treffs. Rechte entscheidet die Datenbank (RLS). */

function pruefe<T>(r: { data: T | null; error: { code?: string; message: string } | null }): T {
  if (r.error) throw new ApiFehler(r.error);
  return r.data as T;
}

export interface PersonZeile {
  id: string;
  vorname: string;
  nachname: string;
  mail: string;
  kategorie: Kategorie;
  aktiv: boolean;
  ist_freizeitkoordination: boolean;
  ist_treffkoordination: boolean;
  auth_user_id: string | null;
  eingeladen_am: string | null;
}

export async function listePersonenVoll(): Promise<PersonZeile[]> {
  return pruefe(await supabase.from('personen')
    .select('id, vorname, nachname, mail, kategorie, aktiv, ist_freizeitkoordination, ist_treffkoordination, auth_user_id, eingeladen_am')
    .order('nachname').order('vorname')) as PersonZeile[];
}

export async function listeFreizeitTeams(): Promise<FreizeitTeamZeile[]> {
  return pruefe(await supabase.from('freizeit_team').select('freizeit_id, person_id, rolle').limit(20000)) as FreizeitTeamZeile[];
}

export async function listeTreffTeams(): Promise<TreffTeamZeile[]> {
  return pruefe(await supabase.from('treff_team').select('treff_id, person_id, rolle').limit(20000)) as TreffTeamZeile[];
}

/** Setzt die Rolle einer Person in einer Freizeit; null nimmt sie heraus. */
export async function setzeFreizeitRolle(freizeitId: string, personId: string, rolle: FreizeitRolle | null): Promise<void> {
  if (rolle === null) pruefe(await supabase.from('freizeit_team').delete().eq('freizeit_id', freizeitId).eq('person_id', personId));
  else pruefe(await supabase.from('freizeit_team').upsert({ freizeit_id: freizeitId, person_id: personId, rolle }, { onConflict: 'freizeit_id,person_id' }));
}

export async function setzeTreffRolle(treffId: string, personId: string, rolle: TreffRolle | null): Promise<void> {
  if (rolle === null) pruefe(await supabase.from('treff_team').delete().eq('treff_id', treffId).eq('person_id', personId));
  else pruefe(await supabase.from('treff_team').upsert({ treff_id: treffId, person_id: personId, rolle }, { onConflict: 'treff_id,person_id' }));
}

/** Ordnet mehrere Personen auf einmal mit derselben Rolle zu (alle oder keine). */
export async function freizeitTeamHinzufuegen(freizeitId: string, personIds: string[], rolle: FreizeitRolle): Promise<void> {
  if (!personIds.length) return;
  pruefe(await supabase.from('freizeit_team').insert(personIds.map((p) => ({ freizeit_id: freizeitId, person_id: p, rolle }))));
}

export async function treffTeamHinzufuegenViele(treffId: string, personIds: string[], rolle: TreffRolle): Promise<void> {
  if (!personIds.length) return;
  pruefe(await supabase.from('treff_team').insert(personIds.map((p) => ({ treff_id: treffId, person_id: p, rolle }))));
}

export type Bereich = 'freizeiten' | 'treffs';

/** Macht eine Person zur Koordination eines Bereichs oder nimmt es zurück. Die letzte aktive Person je Bereich ist durch die Datenbank geschützt. */
export async function setzeKoordination(personId: string, bereich: Bereich, an: boolean): Promise<void> {
  const spalte = bereich === 'freizeiten' ? 'ist_freizeitkoordination' : 'ist_treffkoordination';
  pruefe(await supabase.from('personen').update({ [spalte]: an }).eq('id', personId));
}

/* ───── Überschneidungen akzeptieren (Migration 0023, nur Freizeitenkoordination) ───── */

export interface UeberschneidungFreigabe {
  person_id: string;
  freizeit_a: string;
  freizeit_b: string;
  notiz: string | null;
  akzeptiert_von: string | null;
  akzeptiert_am: string;
}

const geordnet = (x: string, y: string): [string, string] => (x < y ? [x, y] : [y, x]);

export async function listeUeberschneidungsFreigaben(): Promise<UeberschneidungFreigabe[]> {
  return pruefe(await supabase.from('freizeit_ueberschneidungen_ok').select('person_id, freizeit_a, freizeit_b, notiz, akzeptiert_von, akzeptiert_am').limit(20000)) as UeberschneidungFreigabe[];
}

/** Die Überschneidung zweier Freizeiten für diese Person akzeptieren; die Warnung entfällt. */
export async function akzeptiereUeberschneidung(personId: string, freizeitX: string, freizeitY: string, notiz: string | null): Promise<void> {
  const [a, b] = geordnet(freizeitX, freizeitY);
  pruefe(await supabase.from('freizeit_ueberschneidungen_ok').upsert(
    { person_id: personId, freizeit_a: a, freizeit_b: b, notiz: notiz?.trim() ? notiz.trim() : null }, { onConflict: 'person_id,freizeit_a,freizeit_b' }));
}

/** Nimmt die Akzeptanz zurück; die Warnung erscheint wieder. */
export async function widerrufeUeberschneidung(personId: string, freizeitX: string, freizeitY: string): Promise<void> {
  const [a, b] = geordnet(freizeitX, freizeitY);
  pruefe(await supabase.from('freizeit_ueberschneidungen_ok').delete().eq('person_id', personId).eq('freizeit_a', a).eq('freizeit_b', b));
}
