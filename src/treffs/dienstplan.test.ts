import { describe, it, expect } from 'vitest';
import {
  abwesendeAm, abwesenheitsBloecke, addTage, darfWuenschen, dienstStunden, dienstZeit, eigenerWunsch, feiertagAm, isoWochentag, kalenderwoche, monatErster, monatTage, monatText,
  monatVersatz, montagVon, musterAlsJson, musterTage, offeneWuensche, tageImZeitraum, tageskarten, validiereAbwesenheit, validiereSonderdienst, wochenTage, wochenText, zuteilungsAenderung,
  type Dienst, type Tageskarte,
} from './dienstplan';

const dienst = (o: Partial<Dienst> & { id: string; datum: string }): Dienst => ({
  von: '15:00', bis: '19:00', ist_sonder: false, bezeichnung: null, personen: [], wuensche: [], ...o,
});
const oz = [{ wochentag: 1, von: '15:00', bis: '19:00' }, { wochentag: 3, von: '14:00', bis: '18:00' }];

describe('Kalender', () => {
  it('rechnet Tage und Wochentage', () => {
    expect(addTage('2027-02-28', 1)).toBe('2027-03-01');
    expect(addTage('2027-01-01', -1)).toBe('2026-12-31');
    expect(isoWochentag('2027-07-05')).toBe(1);
    expect(isoWochentag('2027-07-11')).toBe(7);
  });
  it('findet den Montag der Woche (auch am Sonntag)', () => {
    expect(montagVon('2027-07-07')).toBe('2027-07-05');
    expect(montagVon('2027-07-11')).toBe('2027-07-05');
    expect(montagVon('2027-07-05')).toBe('2027-07-05');
    expect(wochenTage('2027-07-05')).toHaveLength(7);
    expect(wochenTage('2027-07-05')[6]).toBe('2027-07-11');
  });
  it('kennt die ISO-Kalenderwoche, auch an Jahresgrenzen', () => {
    expect(kalenderwoche('2027-07-05')).toBe(27);
    expect(kalenderwoche('2026-02-16')).toBe(8);
    expect(kalenderwoche('2026-12-31')).toBe(53);      // 2026 hat 53 Wochen
    expect(kalenderwoche('2027-01-01')).toBe(53);      // gehört noch zu KW 53 von 2026
    expect(kalenderwoche('2027-01-04')).toBe(1);
  });
  it('schreibt die Woche lesbar', () => expect(wochenText('2027-07-05')).toBe('KW 27 · 05.07.–11.07.2027'));
  it('zählt Tage des Monats', () => {
    expect(monatTage('2027-02-15')).toHaveLength(28);
    expect(monatTage('2028-02-01')).toHaveLength(29);
    expect(monatTage('2027-07-31')[0]).toBe('2027-07-01');
    expect(monatErster('2027-07-31')).toBe('2027-07-01');
  });
  it('blättert Monate über die Jahresgrenze', () => {
    expect(monatVersatz('2027-12-15', 1)).toBe('2028-01-01');
    expect(monatVersatz('2027-01-31', -1)).toBe('2026-12-01');
    expect(monatText('2027-07-01')).toBe('Juli 2027');
  });
});

describe('tageskarten', () => {
  it('zeigt Öffnungstage, auch ohne Dienst', () => {
    const k = tageskarten(wochenTage('2027-07-05'), oz, []);
    expect(k.map((x) => x.datum)).toEqual(['2027-07-05', '2027-07-07']);
    expect(k[0]!.regulaer).toBeNull();
  });
  it('hängt Sonderdienste an und zeigt auch Schließtage damit', () => {
    const d = [
      dienst({ id: 'r', datum: '2027-07-05' }),
      dienst({ id: 's2', datum: '2027-07-05', ist_sonder: true, von: '20:00', bezeichnung: 'Nachtdienst' }),
      dienst({ id: 's1', datum: '2027-07-05', ist_sonder: true, von: '09:00', bezeichnung: 'Aufbau' }),
      dienst({ id: 's3', datum: '2027-07-10', ist_sonder: true, bezeichnung: 'Fest' }),
    ];
    const k = tageskarten(wochenTage('2027-07-05'), oz, d);
    expect(k.map((x) => x.datum)).toEqual(['2027-07-05', '2027-07-07', '2027-07-10']);
    expect(k[0]!.regulaer?.id).toBe('r');
    expect(k[0]!.sonder.map((s) => s.id)).toEqual(['s1', 's2']);
    expect(k[2]!.oeffnung).toBeNull();
  });
  it('nimmt keine Dienste anderer Wochen', () => {
    expect(tageskarten(wochenTage('2027-07-05'), [], [dienst({ id: 'x', datum: '2027-07-19' })])).toEqual([]);
  });
});

describe('Dienstzeit', () => {
  it('formatiert und rechnet', () => {
    expect(dienstZeit({ von: '15:00:00', bis: '19:00:00' })).toBe('15:00–19:00');
    expect(dienstZeit({ von: null, bis: null })).toBe('');
    expect(dienstStunden({ von: '14:00', bis: '17:30' })).toBe(3.5);
    expect(dienstStunden({ von: null, bis: null })).toBe(0);
  });
});

describe('Wünsche', () => {
  const karte = (o: Partial<Tageskarte> = {}): Tageskarte => ({ datum: '2027-07-05', oeffnung: oz[0]!, regulaer: null, sonder: [], ...o });
  const heute = '2027-07-01';

  it('BetreuerIn darf einen freien Öffnungstag wünschen', () => expect(darfWuenschen('betreuerin', karte(), 'ich', heute)).toBe(true));
  it('nicht Treffleitung, Koordination oder Gäste', () => {
    for (const r of ['treffleitung', 'koordination', 'gast'] as const) expect(darfWuenschen(r, karte(), 'ich', heute)).toBe(false);
  });
  it('nicht an Schließtagen und nicht in der Vergangenheit, aber heute', () => {
    expect(darfWuenschen('betreuerin', karte({ oeffnung: null }), 'ich', heute)).toBe(false);
    expect(darfWuenschen('betreuerin', karte({ datum: '2027-06-30' }), 'ich', heute)).toBe(false);
    expect(darfWuenschen('betreuerin', karte({ datum: heute }), 'ich', heute)).toBe(true);
  });
  it('nicht, wenn schon eingeteilt oder ein Wunsch offen/bestätigt ist; nach Ablehnung wieder', () => {
    const r = (o: Partial<Dienst>) => karte({ regulaer: dienst({ id: 'd', datum: '2027-07-05', ...o }) });
    expect(darfWuenschen('betreuerin', r({ personen: ['ich'] }), 'ich', heute)).toBe(false);
    expect(darfWuenschen('betreuerin', r({ wuensche: [{ person_id: 'ich', status: 'offen' }] }), 'ich', heute)).toBe(false);
    expect(darfWuenschen('betreuerin', r({ wuensche: [{ person_id: 'ich', status: 'bestaetigt' }] }), 'ich', heute)).toBe(false);
    expect(darfWuenschen('betreuerin', r({ wuensche: [{ person_id: 'ich', status: 'abgelehnt' }] }), 'ich', heute)).toBe(true);
    expect(darfWuenschen('betreuerin', r({ wuensche: [{ person_id: 'andere', status: 'offen' }] }), 'ich', heute)).toBe(true);
  });
  it('liest den eigenen Wunschstatus und sammelt offene Wünsche', () => {
    const k = [
      karte({ regulaer: dienst({ id: 'a', datum: '2027-07-05', wuensche: [{ person_id: 'ich', status: 'abgelehnt' }, { person_id: 'x', status: 'offen' }] }) }),
      karte({ datum: '2027-07-07', regulaer: dienst({ id: 'b', datum: '2027-07-07', wuensche: [{ person_id: 'y', status: 'offen' }, { person_id: 'z', status: 'bestaetigt' }] }) }),
    ];
    expect(eigenerWunsch(k[0]!, 'ich')).toBe('abgelehnt');
    expect(eigenerWunsch(k[0]!, 'niemand')).toBeNull();
    expect(offeneWuensche(k).map((w) => [w.datum, w.person_id])).toEqual([['2027-07-05', 'x'], ['2027-07-07', 'y']]);
  });
});

describe('Zuteilung, Feiertag, Abwesenheit', () => {
  it('ermittelt Änderungen', () => {
    expect(zuteilungsAenderung(['a', 'b'], ['b', 'c'])).toEqual({ hinzu: ['c'], weg: ['a'] });
    expect(zuteilungsAenderung([], [])).toEqual({ hinzu: [], weg: [] });
  });
  it('Feiertag: eigener Treff geht vor „alle“; fremder Treff zählt nicht', () => {
    const f = [
      { id: '1', treff_id: null, datum: '2027-07-05', bezeichnung: 'Alle' },
      { id: '2', treff_id: 't1', datum: '2027-07-05', bezeichnung: 'Eigener' },
      { id: '3', treff_id: 't2', datum: '2027-07-06', bezeichnung: 'Fremder' },
    ];
    expect(feiertagAm('2027-07-05', f, 't1')?.bezeichnung).toBe('Eigener');
    expect(feiertagAm('2027-07-05', f, 't9')?.bezeichnung).toBe('Alle');
    expect(feiertagAm('2027-07-06', f, 't1')).toBeNull();
  });
  it('filtert Abwesende je Tag', () => {
    const a = [{ id: '1', person_id: 'p', datum: '2027-07-05', typ: 'krank' as const, notiz: null }, { id: '2', person_id: 'q', datum: '2027-07-06', typ: 'urlaub' as const, notiz: null }];
    expect(abwesendeAm('2027-07-05', a).map((x) => x.person_id)).toEqual(['p']);
  });
});

describe('Sonderdienst', () => {
  const ok = { datum: '2027-07-10', von: '09:00', bis: '12:00', bezeichnung: 'Aufbau' };
  it('akzeptiert vollständige Angaben', () => expect(validiereSonderdienst(ok)).toEqual({}));
  it('meldet Fehler', () => {
    expect(validiereSonderdienst({ ...ok, datum: '' }).datum).toBeDefined();
    expect(validiereSonderdienst({ ...ok, bezeichnung: ' ' }).bezeichnung).toBeDefined();
    expect(validiereSonderdienst({ ...ok, von: '12:00', bis: '09:00' }).zeit).toBeDefined();
  });
});

describe('Monatsmuster', () => {
  it('zählt nur Öffnungstage mit gewählten Personen', () => {
    // Juli 2027: Montage 5., 12., 19., 26.; Mittwoche 7., 14., 21., 28.
    expect(musterTage('2027-07-01', oz, { 1: ['a'] })).toEqual(['2027-07-05', '2027-07-12', '2027-07-19', '2027-07-26']);
    expect(musterTage('2027-07-01', oz, { 1: ['a'], 3: ['b'] })).toHaveLength(8);
    expect(musterTage('2027-07-01', oz, { 2: ['a'] })).toEqual([]);      // Dienstag ist kein Öffnungstag
    expect(musterTage('2027-07-01', oz, {})).toEqual([]);
  });
  it('wandelt in das JSON der Datenbankfunktion', () => {
    expect(musterAlsJson({ 1: ['a', 'b'], 3: [] })).toEqual({ '1': ['a', 'b'], '3': [] });
  });
});

describe('Abwesenheiten', () => {
  it('zählt Tage im Zeitraum', () => {
    expect(tageImZeitraum('2027-07-05', '2027-07-07')).toEqual(['2027-07-05', '2027-07-06', '2027-07-07']);
    expect(tageImZeitraum('2027-07-05', '2027-07-05')).toEqual(['2027-07-05']);
    expect(tageImZeitraum('2027-07-07', '2027-07-05')).toEqual([]);
    expect(tageImZeitraum('2027-02-27', '2027-03-01')).toHaveLength(3);
  });
  it('prüft die Eingabe', () => {
    const ok = { person_id: 'p', von: '2027-07-05', bis: '2027-07-09' };
    expect(validiereAbwesenheit(ok)).toEqual({});
    expect(validiereAbwesenheit({ ...ok, person_id: '' }).person).toBeDefined();
    expect(validiereAbwesenheit({ ...ok, von: '' }).zeitraum).toBeDefined();
    expect(validiereAbwesenheit({ ...ok, bis: '2027-07-01' }).zeitraum).toMatch(/nicht vor/);
    expect(validiereAbwesenheit({ ...ok, bis: '2029-01-01' }).zeitraum).toMatch(/Höchstens/);
  });
  it('fasst zusammenhängende Tage zu Blöcken zusammen', () => {
    const a = (id: string, person_id: string, datum: string, typ: 'urlaub' | 'krank' = 'urlaub') => ({ id, person_id, datum, typ, notiz: null });
    const b = abwesenheitsBloecke([
      a('1', 'p', '2027-07-06'), a('2', 'p', '2027-07-05'), a('3', 'p', '2027-07-07'),
      a('4', 'p', '2027-07-09'),                               // Lücke → neuer Block
      a('5', 'q', '2027-07-05'),
      a('6', 'p', '2027-07-08', 'krank'),                      // andere Art → eigener Block
    ]);
    expect(b.map((x) => [x.person_id, x.typ, x.von, x.bis, x.ids.length])).toEqual([
      ['p', 'urlaub', '2027-07-05', '2027-07-07', 3],
      ['q', 'urlaub', '2027-07-05', '2027-07-05', 1],
      ['p', 'krank', '2027-07-08', '2027-07-08', 1],
      ['p', 'urlaub', '2027-07-09', '2027-07-09', 1],
    ]);
  });
});
