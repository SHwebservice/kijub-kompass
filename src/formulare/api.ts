import { supabase } from '../lib/supabase';
import { ApiFehler } from '../lib/fehler';
import { beispieleAus, normalisiereFormular, type FormularDaten, type FormularTyp } from './typen';

function pruefe<T>(r: { data: T | null; error: { code?: string; message: string } | null }): T {
  if (r.error) throw new ApiFehler(r.error);
  return r.data as T;
}

/** Beispiele für alle: die der Koordination, sonst die eingebauten. */
export async function holeBeispiele(): Promise<FormularDaten> {
  const r = pruefe(await supabase.from('inhalte').select('daten').eq('schluessel', 'formular_beispiele').maybeSingle()) as { daten: unknown } | null;
  return beispieleAus(r?.daten ?? null);
}

export async function speichereBeispiele(daten: FormularDaten, personId: string): Promise<void> {
  pruefe(await supabase.from('inhalte').upsert({ schluessel: 'formular_beispiele', daten, updated_by: personId, updated_at: new Date().toISOString() }));
}

/** Eigene gespeicherte Entwürfe (nie die Anwesenheitsliste – sie enthält Namen von Kindern). */
export async function holeEntwuerfe(personId: string): Promise<Partial<FormularDaten>> {
  const r = pruefe(await supabase.from('formular_entwuerfe').select('typ, daten').eq('person_id', personId)) as { typ: FormularTyp; daten: unknown }[];
  const out: Record<string, unknown> = {};
  for (const e of r) if (e.typ !== 'anwesenheit') out[e.typ] = normalisiereFormular(e.typ, e.daten);
  return out as Partial<FormularDaten>;
}

export async function speichereEntwurf(personId: string, typ: Exclude<FormularTyp, 'anwesenheit'>, daten: FormularDaten[FormularTyp]): Promise<void> {
  pruefe(await supabase.from('formular_entwuerfe').upsert({ person_id: personId, typ, daten, updated_at: new Date().toISOString() }));
}

export async function loescheEntwurf(personId: string, typ: Exclude<FormularTyp, 'anwesenheit'>): Promise<void> {
  pruefe(await supabase.from('formular_entwuerfe').delete().eq('person_id', personId).eq('typ', typ));
}
