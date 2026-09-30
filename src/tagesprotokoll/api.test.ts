import { describe, it, expect, vi, beforeEach } from 'vitest';

/** Ein nachgebauter Abfrage-Baukasten: jeder Aufruf der Kette wird protokolliert, das Ergebnis legt der Test fest. */
const protokoll: { ketten: { tabelle: string; schritte: [string, unknown[]][] }[] } = { ketten: [] };
let ergebnisse: Record<string, { data: unknown; error: { code?: string; message: string } | null }> = {};

function kette(tabelle: string) {
  const k = { tabelle, schritte: [] as [string, unknown[]][] };
  protokoll.ketten.push(k);
  const proxy: unknown = new Proxy({}, {
    get: (_z, name: string) => {
      if (name === 'then') {
        const letzter = k.schritte[k.schritte.length - 1]?.[0] ?? '';
        const r = ergebnisse[letzter] ?? { data: null, error: null };
        return (aufloesen: (x: unknown) => void) => aufloesen(r);
      }
      return (...args: unknown[]) => { k.schritte.push([name, args]); return proxy; };
    },
  });
  return proxy;
}
vi.mock('../lib/supabase', () => ({ supabase: { from: (t: string) => kette(t) } }));

import { holeProtokollDesTages, ProtokollKonflikt, speichereProtokoll } from './api';

const eingabe = { anz_m: 2, anz_w: 3, anz_d: 1, verlauf: '  Basteln  ', vorkommnisse: '' };
const schritt = (nr: number, name: string) => protokoll.ketten[nr]!.schritte.find(([n]) => n === name);
const aktuell = { id: 'p', treff_id: 't1', datum: '2027-03-01', updated_at: '2027-03-01T18:00:00+00:00' };

beforeEach(() => { protokoll.ketten = []; ergebnisse = {}; });

describe('speichereProtokoll', () => {
  it('ohne Prüfung: überschreibt (Upsert je Treff und Tag), Text wird getrimmt', async () => {
    await speichereProtokoll('t1', '2027-03-01', eingabe);
    expect(protokoll.ketten).toHaveLength(1);
    expect(schritt(0, 'upsert')![1]).toEqual([{ treff_id: 't1', datum: '2027-03-01', anz_m: 2, anz_w: 3, anz_d: 1, verlauf: 'Basteln', vorkommnisse: '' }, { onConflict: 'treff_id,datum' }]);
  });

  it('neues Protokoll (erwartet null): legt an; gibt es schon eines (23505) → Konflikt mit dem jetzigen Stand', async () => {
    await speichereProtokoll('t1', '2027-03-01', eingabe, { erwartet: null });
    expect(schritt(0, 'insert')).toBeDefined();
    protokoll.ketten = [];
    ergebnisse = { insert: { data: null, error: { code: '23505', message: 'duplicate' } }, maybeSingle: { data: aktuell, error: null } };
    const fehler = await speichereProtokoll('t1', '2027-03-01', eingabe, { erwartet: null }).catch((e: unknown) => e);
    expect(fehler).toBeInstanceOf(ProtokollKonflikt);
    expect((fehler as ProtokollKonflikt).aktuell).toEqual(aktuell);
  });

  it('anderer Fehler beim Anlegen bleibt ein normaler Fehler', async () => {
    ergebnisse = { insert: { data: null, error: { code: '42501', message: 'row-level security' } } };
    await expect(speichereProtokoll('t1', '2027-03-01', eingabe, { erwartet: null })).rejects.not.toBeInstanceOf(ProtokollKonflikt);
  });

  it('bestehendes Protokoll: ändert nur, wenn der Änderungszeitpunkt noch stimmt', async () => {
    ergebnisse = { select: { data: [{ id: 'p' }], error: null } };
    await speichereProtokoll('t1', '2027-03-01', eingabe, { erwartet: '2027-03-01T17:30:00+00:00' });
    const s = protokoll.ketten[0]!.schritte;
    expect(s.map(([n]) => n)).toEqual(['update', 'eq', 'eq', 'eq', 'select']);
    expect(s.filter(([n]) => n === 'eq').map(([, a]) => a)).toEqual([['treff_id', 't1'], ['datum', '2027-03-01'], ['updated_at', '2027-03-01T17:30:00+00:00']]);
  });

  it('hat inzwischen jemand geändert (keine Zeile getroffen): Konflikt mit dem jetzigen Stand; gelöscht: aktuell = null', async () => {
    ergebnisse = { select: { data: [], error: null }, maybeSingle: { data: aktuell, error: null } };
    const k = await speichereProtokoll('t1', '2027-03-01', eingabe, { erwartet: '2027-03-01T17:30:00+00:00' }).catch((e: unknown) => e) as ProtokollKonflikt;
    expect(k).toBeInstanceOf(ProtokollKonflikt);
    expect(k.aktuell).toEqual(aktuell);
    ergebnisse = { select: { data: [], error: null }, maybeSingle: { data: null, error: null } };
    const g = await speichereProtokoll('t1', '2027-03-01', eingabe, { erwartet: 'x' }).catch((e: unknown) => e) as ProtokollKonflikt;
    expect(g.aktuell).toBeNull();
  });

  it('Datenbankfehler beim Ändern werden als Fehler geworfen', async () => {
    ergebnisse = { select: { data: null, error: { code: '42501', message: 'nope' } } };
    await expect(speichereProtokoll('t1', '2027-03-01', eingabe, { erwartet: 'x' })).rejects.not.toBeInstanceOf(ProtokollKonflikt);
  });
});

describe('holeProtokollDesTages', () => {
  it('liest das Protokoll von Treff und Tag', async () => {
    ergebnisse = { maybeSingle: { data: aktuell, error: null } };
    expect(await holeProtokollDesTages('t1', '2027-03-01')).toEqual(aktuell);
  });
});
