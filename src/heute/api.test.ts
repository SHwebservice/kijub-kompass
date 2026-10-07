import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
vi.mock('../lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { heuteDatenAus, ladeHeute, quittiereBesuch, type HeuteAnfrage } from './api';

const anfrage = (o: Partial<HeuteAnfrage> = {}): HeuteAnfrage => ({
  heute: '2027-07-07', notizFreizeiten: ['f1'], notizTreffs: ['t1'], teamFreizeiten: ['f1'], planFreizeiten: ['f1'], kachelTreffs: ['t1'], protokollTreffs: ['t2'], ...o,
});

beforeEach(() => { rpc.mockReset(); });

describe('heuteDatenAus', () => {
  it('eine leere Antwort ergibt einen leeren Stand (nichts fehlt, nichts ist undefined)', () => {
    expect(heuteDatenAus({})).toEqual({
      notizen: [], team: [], plan: [], bestand: [], orte: {}, wuensche: [], treffNamen: {}, bewerbungen: 0, vorschlaege: 0, nachweise: 0, fehler: 0,
      protokolliert: [], geschlossen: [], offeneNotizen: {}, seit: null, neu: [], neuGesamt: 0,
    });
  });

  it('übernimmt die Teile; Mengen werden zu Zahlen, „treff_namen“ und „neu_gesamt“ zu ihren Namen in der App', () => {
    const d = heuteDatenAus({
      notizen: [{ id: 'n' }], team: [{ freizeit_id: 'f', person_id: 'p', rolle: 'leitung' }], plan: [{ id: 'p1' }],
      bestand: [{ ort_id: 'o', name: 'Milch', einheit: 'l', rest: '3.5', status: 'knapp' }], orte: { o: 'Au' }, wuensche: [{ person_id: 'p', datum: '2027-07-09', treff_id: 't' }],
      treff_namen: { t: 'Treff' }, bewerbungen: 2, vorschlaege: '1', nachweise: 3, fehler: 4, protokolliert: ['t'], geschlossen: ['t3'], offene_notizen: { t: 5 },
      seit: '2027-07-07T10:00:00Z', neu: [{ zeit: 'z', art: 'hinweis', text: 'T', quelle: 'Q', url: '/u' }], neu_gesamt: 7,
    });
    expect(d.bestand[0]!.rest).toBe(3.5);
    expect(d).toMatchObject({ orte: { o: 'Au' }, treffNamen: { t: 'Treff' }, bewerbungen: 2, vorschlaege: 1, nachweise: 3, fehler: 4, protokolliert: ['t'], geschlossen: ['t3'], offeneNotizen: { t: 5 }, seit: '2027-07-07T10:00:00Z', neuGesamt: 7 });
    expect(d.notizen).toHaveLength(1);
    expect(d.neu[0]!.url).toBe('/u');
  });

  it('kaputte Teile werden ignoriert statt zu brechen', () => {
    const d = heuteDatenAus({ notizen: 'kaputt', orte: [1, 2], seit: 42, neu: null });
    expect(d.notizen).toEqual([]);
    expect(d.orte).toEqual({});
    expect(d.seit).toBeNull();
    expect(d.neu).toEqual([]);
  });
});

describe('ladeHeute', () => {
  it('schickt alles in EINEM Aufruf an fn_heute, mit den Schlüsseln der Datenbank', async () => {
    rpc.mockResolvedValue({ data: { bewerbungen: 2 }, error: null });
    const d = await ladeHeute(anfrage({ bestand: true, fehler: true, besuch: true, wuensche: 'alle' }));
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('fn_heute', {
      p_heute: '2027-07-07',
      p_anfrage: {
        notiz_freizeiten: ['f1'], notiz_treffs: ['t1'], team_freizeiten: ['f1'], plan_freizeiten: ['f1'], kachel_treffs: ['t1'], protokoll_treffs: ['t2'],
        bestand: true, nachweise: false, bewerbungen: false, vorschlaege: false, fehler: true, besuch: true, wuensche: 'alle',
      },
    });
    expect(d.bewerbungen).toBe(2);
  });

  it('Wünsche werden nur angefragt, wenn sie gewünscht sind; bestimmte Treffs werden durchgereicht', async () => {
    rpc.mockResolvedValue({ data: {}, error: null });
    await ladeHeute(anfrage());
    expect(rpc.mock.calls[0]![1].p_anfrage).not.toHaveProperty('wuensche');
    await ladeHeute(anfrage({ wuensche: ['t1'] }));
    expect(rpc.mock.calls[1]![1].p_anfrage.wuensche).toEqual(['t1']);
  });

  it('Fehler der Datenbank werden als Fehler geworfen', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'nope' } });
    await expect(ladeHeute(anfrage())).rejects.toMatchObject({ name: expect.any(String) });
  });

  it('eine leere Antwort (null) ergibt einen leeren Stand', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    expect((await ladeHeute(anfrage())).notizen).toEqual([]);
  });
});

describe('quittiereBesuch', () => {
  it('ruft fn_besuch_quittieren auf und wirft bei Fehlern', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await quittiereBesuch();
    expect(rpc).toHaveBeenCalledWith('fn_besuch_quittieren');
    rpc.mockResolvedValue({ data: null, error: { message: 'kaputt' } });
    await expect(quittiereBesuch()).rejects.toBeTruthy();
  });
});
