import { describe, it, expect } from 'vitest';
import { berechneRollen, navigation, rollenBezeichnungen, type Ich } from './rollen';

const ich = (o: Partial<Ich> = {}): Ich => ({
  id: 'p1', vorname: 'A', nachname: 'B', mail: 'a@b.de', kategorie: 'TeamerIn', ist_koordination: false, ist_freizeitkoordination: false, ist_treffkoordination: false, ...o,
});
const BEIDE = { ist_koordination: true, ist_freizeitkoordination: true, ist_treffkoordination: true };
const NUR_FREIZEITEN = { ist_koordination: true, ist_freizeitkoordination: true };
const NUR_TREFFS = { ist_koordination: true, ist_treffkoordination: true };
const pfade = (r: ReturnType<typeof berechneRollen>) => navigation(r).map((n) => n.pfad);

describe('berechneRollen', () => {
  it('TeamerIn ohne Zuordnung: bewerbend, keine Treffs', () => {
    const r = berechneRollen(ich(), [], []);
    expect(r.bewerbend).toBe(true);
    expect(r.koordination).toBe(false);
    expect(pfade(r)).toEqual(['/', '/freizeiten', '/katalog', '/mehr']);
  });
  it('Hauptamtliche ohne Zuordnung bewerben sich nicht und sehen keine Freizeiten', () => {
    const r = berechneRollen(ich({ kategorie: 'Hauptamtliche*r' }), [], []);
    expect(r.bewerbend).toBe(false);
    expect(pfade(r)).toEqual(['/', '/katalog', '/mehr']);
  });
  it('Leitung einer Freizeit sieht Freizeiten', () => {
    const r = berechneRollen(ich({ kategorie: 'Hauptamtliche*r' }), [{ freizeit_id: 'f1', rolle: 'leitung' }], []);
    expect(r.leitungFreizeiten).toEqual(['f1']);
    expect(pfade(r)).toContain('/freizeiten');
    expect(rollenBezeichnungen(r)).toEqual(['Freizeitleitung']);
  });
  it('Koordination sieht alles', () => {
    const r = berechneRollen(ich({ ...BEIDE, kategorie: 'Hauptamtliche*r' }), [], []);
    expect(pfade(r)).toEqual(['/', '/freizeiten', '/treffs', '/katalog', '/mehr']);
    expect(r.darfTreffmappe).toBe(true);
  });
  it('Freizeitenkoordination sieht Freizeiten, aber keine Treffs und keine Treffmappe', () => {
    const r = berechneRollen(ich({ ...NUR_FREIZEITEN, kategorie: 'Hauptamtliche*r' }), [], []);
    expect([r.koordination, r.freizeitkoordination, r.treffkoordination]).toEqual([true, true, false]);
    expect(pfade(r)).toEqual(['/', '/freizeiten', '/katalog', '/mehr']);
    expect(r.darfTreffmappe).toBe(false);
    expect(rollenBezeichnungen(r)).toEqual(['Freizeitenkoordination']);
  });
  it('Treffkoordination sieht Treffs und die Treffmappe, aber keine Freizeiten', () => {
    const r = berechneRollen(ich({ ...NUR_TREFFS, kategorie: 'Hauptamtliche*r' }), [], []);
    expect([r.koordination, r.freizeitkoordination, r.treffkoordination]).toEqual([true, false, true]);
    expect(pfade(r)).toEqual(['/', '/treffs', '/katalog', '/mehr']);
    expect(r.darfTreffmappe).toBe(true);
    expect(rollenBezeichnungen(r)).toEqual(['Treffkoordination']);
  });
  it('beide Bereiche in einer Person', () => {
    const r = berechneRollen(ich({ ...BEIDE, kategorie: 'Hauptamtliche*r' }), [], []);
    expect(rollenBezeichnungen(r)).toEqual(['Koordination (Freizeiten und Treffs)']);
  });
  it('mehrere Rollen gleichzeitig (Leitung und Treffleitung)', () => {
    const r = berechneRollen(
      ich({ kategorie: 'Hauptamtliche*r' }),
      [{ freizeit_id: 'f1', rolle: 'leitung' }],
      [{ treff_id: 't1', rolle: 'treffleitung' }],
    );
    expect(rollenBezeichnungen(r)).toEqual(['Freizeitleitung', 'Treffleitung']);
    expect(pfade(r)).toContain('/treffs');
  });
  it('Treffmappe: Treffleitung und TZK-BetreuerIn ja, andere BetreuerIn nein', () => {
    const tl = berechneRollen(ich({ kategorie: 'Hauptamtliche*r' }), [], [{ treff_id: 't', rolle: 'treffleitung' }]);
    const tzk = berechneRollen(ich({ kategorie: 'TZK' }), [], [{ treff_id: 't', rolle: 'betreuerin' }]);
    const fsj = berechneRollen(ich({ kategorie: 'FSJ' }), [], [{ treff_id: 't', rolle: 'betreuerin' }]);
    expect([tl.darfTreffmappe, tzk.darfTreffmappe, fsj.darfTreffmappe]).toEqual([true, true, false]);
  });
  it('höchstens fünf Einträge in der mobilen Navigation', () => {
    const r = berechneRollen(
      ich({ ...BEIDE }),
      [{ freizeit_id: 'f', rolle: 'leitung' }],
      [{ treff_id: 't', rolle: 'treffleitung' }],
    );
    expect(navigation(r).length).toBeLessThanOrEqual(5);
  });
});

import { rolleInFreizeit, istLeitungOderKoordination } from './rollen';

describe('rolleInFreizeit', () => {
  const r = berechneRollen(ich(), [{ freizeit_id: 'f1', rolle: 'leitung' }, { freizeit_id: 'f2', rolle: 'teamer' }], []);
  it('unterscheidet Leitung, TeamerIn und Gast je Freizeit', () => {
    expect(rolleInFreizeit(r, 'f1')).toBe('leitung');
    expect(rolleInFreizeit(r, 'f2')).toBe('teamer');
    expect(rolleInFreizeit(r, 'f3')).toBe('gast');
  });
  it('Koordination gilt überall', () => {
    expect(rolleInFreizeit(berechneRollen(ich({ ...BEIDE }), [], []), 'irgendeine')).toBe('koordination');
  });
  it('nur die Freizeitenkoordination gilt in Freizeiten, die Treffkoordination nicht', () => {
    expect(rolleInFreizeit(berechneRollen(ich({ ...NUR_FREIZEITEN }), [], []), 'f')).toBe('koordination');
    expect(rolleInFreizeit(berechneRollen(ich({ ...NUR_TREFFS }), [], []), 'f')).toBe('gast');
  });
  it('Leitung und Koordination dürfen verwalten, andere nicht', () => {
    expect(['leitung', 'koordination', 'teamer', 'gast'].map((x) => istLeitungOderKoordination(x as never))).toEqual([true, true, false, false]);
  });
});
