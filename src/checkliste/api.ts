import { supabase } from '../lib/supabase';
import { ApiFehler } from '../lib/fehler';
import { themenAusText, type EigenerEingabe, type Punkt, type PunktStatus, type VorlageEingabe, type VorlagePunkt } from './logik';

/** Dünne Schicht über Supabase für die Checkliste der Freizeiten (Migration 0029). Rechte entscheidet die Datenbank. */

function pruefe<T>(r: { data: T | null; error: { code?: string; message: string } | null }): T {
  if (r.error) throw new ApiFehler(r.error);
  return r.data as T;
}

/** Punkte der Freizeiten, soweit die angemeldete Person sie sehen darf (Leitung der Freizeit, Freizeitenkoordination). */
export async function ladeCheckliste(freizeitIds: string[]): Promise<Punkt[]> {
  if (freizeitIds.length === 0) return [];
  return (pruefe(await supabase.rpc('fn_checkliste', { p_freizeiten: freizeitIds })) ?? []) as Punkt[];
}

/** Hakt ab, setzt „nicht relevant“ oder wieder offen; die Notiz bleibt, wenn keine neue angegeben ist. */
export async function setzeStatus(p: Pick<Punkt, 'freizeit_id' | 'art' | 'id' | 'notiz'>, status: PunktStatus, notiz = p.notiz): Promise<void> {
  if (p.art === 'eigen') {
    pruefe(await supabase.from('checkliste_eigene').update({ status, notiz: notiz.trim() }).eq('id', p.id));
    return;
  }
  pruefe(await supabase.from('checkliste_status').upsert({ freizeit_id: p.freizeit_id, vorlage_id: p.id, status, notiz: notiz.trim() }, { onConflict: 'freizeit_id,vorlage_id' }));
}

/**
 * Trägt den Termin eines Punktes ein (null = löschen). Die Datenbank legt dazu einen Hinweis für das Team bzw. eine Absprache mit der
 * Freizeitenkoordination an und ersetzt einen früheren; Ergebnis ist dessen ID (für die Mitteilung), null beim Löschen.
 */
export async function setzeTermin(p: Pick<Punkt, 'freizeit_id' | 'id'>, termin: string | null, text = ''): Promise<string | null> {
  return pruefe(await supabase.rpc('fn_checkliste_termin', { p_freizeit: p.freizeit_id, p_vorlage: p.id, p_termin: termin, p_text: text.trim() })) as string | null;
}

/** Abgehakte Themen eines Punktes (1-basiert); der Status des Punktes bleibt. */
export async function setzeThemen(p: Pick<Punkt, 'freizeit_id' | 'id' | 'status'>, erledigt: number[]): Promise<void> {
  pruefe(await supabase.from('checkliste_status').upsert({ freizeit_id: p.freizeit_id, vorlage_id: p.id, status: p.status, themen_erledigt: [...erledigt].sort((x, y) => x - y) },
    { onConflict: 'freizeit_id,vorlage_id' }));
}

export async function legeEigenenAn(freizeitId: string, e: EigenerEingabe): Promise<void> {
  pruefe(await supabase.from('checkliste_eigene').insert({
    freizeit_id: freizeitId, titel: e.titel.trim(), beschreibung: e.beschreibung.trim(), faellig_am: e.faellig_am || null,
  }));
}

export async function loescheEigenen(id: string): Promise<void> {
  pruefe(await supabase.from('checkliste_eigene').delete().eq('id', id));
}

/* ───── Standard-Checkliste (Freizeitenkoordination) ───── */

export async function listeVorlage(): Promise<VorlagePunkt[]> {
  return pruefe(await supabase.from('checkliste_vorlage').select('id, titel, beschreibung, bezug, tage, ziel, automatik, position, aktiv, termin_art, themen')
    .order('position').order('titel')) as VorlagePunkt[];
}

/** Legt an (id = null, ans Ende) oder ändert. */
export async function speichereVorlagePunkt(id: string | null, e: VorlageEingabe, position?: number): Promise<void> {
  const werte = {
    titel: e.titel.trim(), beschreibung: e.beschreibung.trim(), bezug: e.bezug, tage: e.tage === '' ? 0 : e.tage,
    ziel: e.ziel || null, automatik: e.automatik || null, termin_art: e.termin_art || null, themen: themenAusText(e.themen),
  };
  if (id) pruefe(await supabase.from('checkliste_vorlage').update(werte).eq('id', id));
  else pruefe(await supabase.from('checkliste_vorlage').insert({ ...werte, position: position ?? 0 }));
}

export async function setzeVorlageAktiv(id: string, aktiv: boolean): Promise<void> {
  pruefe(await supabase.from('checkliste_vorlage').update({ aktiv }).eq('id', id));
}

/** Neue Reihenfolge: Position 10, 20, 30 … in der Reihenfolge der IDs (nur geänderte werden geschrieben). */
export async function ordneVorlage(reihenfolge: Pick<VorlagePunkt, 'id' | 'position'>[]): Promise<void> {
  for (const [i, p] of reihenfolge.entries()) {
    const neu = (i + 1) * 10;
    if (p.position !== neu) pruefe(await supabase.from('checkliste_vorlage').update({ position: neu }).eq('id', p.id));
  }
}

/** Endgültig löschen – samt dem Stand dieses Punktes in allen Freizeiten. Lieber „deaktivieren“, wenn er früher galt. */
export async function loescheVorlagePunkt(id: string): Promise<void> {
  pruefe(await supabase.from('checkliste_vorlage').delete().eq('id', id));
}
