import { konfiguriert, supabase } from '../lib/supabase';
import { VERSION } from '../version';
import { erzeugeMelder } from './melden';

/** Der Melder der laufenden App: sendet an die Datenbank (nur wenn Supabase eingerichtet ist). Scheitert das Senden, merkt niemand etwas. */
export const meldeFehler = erzeugeMelder({
  version: VERSION,
  pfad: () => window.location.pathname,
  senden: async (version, seite, meldung, stapel) => {
    if (!konfiguriert) return;
    await supabase.rpc('fn_fehler_melden', { p_version: version, p_seite: seite, p_meldung: meldung, p_stapel: stapel });
  },
});
