import { supabase } from '../lib/supabase';
import { ApiFehler } from '../lib/fehler';
import type { Vorschau } from './ziele';

/** Wie viele und welche Personen erreicht eine manuelle Mitteilung? (nur Koordination; die Datenbank prüft das) */
export async function ladeVorschau(ziel: Record<string, string>): Promise<Vorschau> {
  const { data, error } = await supabase.rpc('fn_push_vorschau', { p_ziel: ziel });
  if (error) throw new ApiFehler(error);
  return data as Vorschau;
}
