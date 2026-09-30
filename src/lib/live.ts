import { useEffect, useRef } from 'react';
import { supabase } from './supabase';

/**
 * Ruft `beiAenderung` auf, sobald sich eine der Tabellen ändert (Supabase Realtime).
 * Mehrere schnell aufeinanderfolgende Änderungen werden zu einem Aufruf zusammengefasst.
 * Geliefert werden nur Änderungen, die die angemeldete Person laut Zugriffsregeln sehen darf.
 * Fällt die Verbindung aus, bleibt die Seite benutzbar – sie lädt dann nur nicht von selbst nach.
 */
export function useLive(tabellen: string[], beiAenderung: () => void, verzoegerungMs = 300): void {
  const aufruf = useRef(beiAenderung);
  useEffect(() => { aufruf.current = beiAenderung; });
  const schluessel = tabellen.join(',');

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ausloesen = () => {
      clearTimeout(timer);
      timer = setTimeout(() => aufruf.current(), verzoegerungMs);
    };
    const kanal = supabase.channel(`live-${schluessel}-${Math.random().toString(36).slice(2, 8)}`);
    for (const tabelle of schluessel.split(',').filter(Boolean)) {
      kanal.on('postgres_changes', { event: '*', schema: 'public', table: tabelle }, ausloesen);
    }
    kanal.subscribe();
    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(kanal);
    };
  }, [schluessel, verzoegerungMs]);
}
