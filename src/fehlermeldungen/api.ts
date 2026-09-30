import { supabase } from '../lib/supabase';
import { ApiFehler } from '../lib/fehler';

/** Fehlermeldungen der App (nur die Koordination darf sie lesen und aufräumen – die Datenbank entscheidet). */

function pruefe<T>(r: { data: T | null; error: { code?: string; message: string } | null }): T {
  if (r.error) throw new ApiFehler(r.error);
  return r.data as T;
}

export interface Fehlermeldung {
  id: string;
  version: string;
  seite: string;
  meldung: string;
  stapel: string | null;
  anzahl: number;
  erstmals: string;
  zuletzt: string;
  erledigt: boolean;
}

export async function listeFehlermeldungen(): Promise<Fehlermeldung[]> {
  return pruefe(await supabase.from('fehlermeldungen').select('id, version, seite, meldung, stapel, anzahl, erstmals, zuletzt, erledigt')
    .order('zuletzt', { ascending: false }).limit(500)) as Fehlermeldung[];
}

export async function setzeFehlerErledigt(id: string, erledigt: boolean): Promise<void> {
  pruefe(await supabase.from('fehlermeldungen').update({ erledigt }).eq('id', id));
}

export async function loescheFehlermeldung(id: string): Promise<void> {
  pruefe(await supabase.from('fehlermeldungen').delete().eq('id', id));
}

export async function loescheErledigteFehler(): Promise<void> {
  pruefe(await supabase.from('fehlermeldungen').delete().eq('erledigt', true));
}
