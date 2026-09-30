import { supabase } from '../lib/supabase';

/** Ergebnis eines Versands (nur Zahlen – Personen und Geräte bleiben der Funktion vorbehalten). */
export interface PushErgebnis { empfaenger: number; geraete: number; gesendet: number; entfernt: number; fehlgeschlagen: number }

export class PushFehler extends Error {
  status: number | undefined;
  constructor(meldung: string, status?: number) { super(meldung); this.name = 'PushFehler'; this.status = status; }
}

/** Liest die Meldung, die die Edge Function im Fehlerfall mitschickt. */
async function meldungAus(fehler: unknown): Promise<PushFehler> {
  const antwort = (fehler as { context?: Response } | null)?.context;
  if (antwort && typeof antwort.json === 'function') {
    try {
      const k = (await antwort.json()) as { fehler?: string };
      if (k.fehler) return new PushFehler(k.fehler, antwort.status);
    } catch { /* keine lesbare Antwort */ }
  }
  return new PushFehler('Die Mitteilung konnte nicht gesendet werden.');
}

/** Löst eine Mitteilung aus und wartet auf das Ergebnis; Fehler werden als PushFehler geworfen. */
export async function sendeMitteilung(art: string, ref?: string | null, extra?: Record<string, unknown>): Promise<PushErgebnis> {
  const { data, error } = await supabase.functions.invoke('push-senden', { body: { art, ref: ref ?? null, extra: extra ?? {} } });
  if (error) throw await meldungAus(error);
  return data as PushErgebnis;
}

/**
 * Löst eine Mitteilung aus, ohne zu warten und ohne die Bedienung zu stören: Die eigentliche Handlung (Hinweis, Wunsch …) ist
 * dann schon gespeichert; scheitert nur die Mitteilung, merkt niemand etwas außer der Konsole.
 */
export function sendePush(art: string, ref?: string | null, extra?: Record<string, unknown>): void {
  void sendeMitteilung(art, ref, extra).catch((e: unknown) => console.warn('Mitteilung nicht gesendet:', e instanceof Error ? e.message : e));
}
