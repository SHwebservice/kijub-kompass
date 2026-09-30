import { describe, it, expect } from 'vitest';
import { MAX_TEXT, MAX_TITEL, reichweiteText, validiereMitteilung, zielJson } from './ziele';

describe('zielJson', () => {
  it('übersetzt die Gruppen in das Format der Datenbank', () => {
    expect(zielJson({ art: 'alle', id: '', rolle: '' })).toEqual({ art: 'alle' });
    expect(zielJson({ art: 'koordination', id: '', rolle: '' })).toEqual({ art: 'koordination' });
    expect(zielJson({ art: 'leitungen', id: '', rolle: '' })).toEqual({ art: 'kategorie', kategorie: 'leitung' });
    expect(zielJson({ art: 'teamer', id: '', rolle: '' })).toEqual({ art: 'kategorie', kategorie: 'teamer' });
  });
  it('Freizeit und Treff brauchen eine Auswahl; die Rolle ist optional', () => {
    expect(zielJson({ art: 'freizeit', id: '', rolle: '' })).toBeNull();
    expect(zielJson({ art: 'treff', id: '', rolle: '' })).toBeNull();
    expect(zielJson({ art: 'freizeit', id: 'f1', rolle: '' })).toEqual({ art: 'freizeit', id: 'f1' });
    expect(zielJson({ art: 'freizeit', id: 'f1', rolle: 'teamer' })).toEqual({ art: 'freizeit', id: 'f1', rolle: 'teamer' });
    expect(zielJson({ art: 'treff', id: 't1', rolle: 'treffleitung' })).toEqual({ art: 'treff', id: 't1', rolle: 'treffleitung' });
  });
  it('eine Auswahl von früher (id) stört bei den festen Gruppen nicht', () => {
    expect(zielJson({ art: 'alle', id: 'f1', rolle: 'leitung' })).toEqual({ art: 'alle' });
  });
});

describe('validiereMitteilung', () => {
  it('verlangt Titel und Text in den Grenzen der Datenbank', () => {
    expect(validiereMitteilung('Hallo', 'Text')).toEqual({});
    expect(validiereMitteilung(' ', 'Text').titel).toBeDefined();
    expect(validiereMitteilung('Hallo', '  ').text).toBeDefined();
    expect(validiereMitteilung('x'.repeat(MAX_TITEL), 'y'.repeat(MAX_TEXT))).toEqual({});
    expect(validiereMitteilung('x'.repeat(MAX_TITEL + 1), 'y').titel).toMatch(/80/);
    expect(validiereMitteilung('x', 'y'.repeat(MAX_TEXT + 1)).text).toMatch(/300/);
  });
  it('Leerzeichen am Rand zählen nicht mit', () => {
    expect(validiereMitteilung(` ${'x'.repeat(MAX_TITEL)} `, 'y')).toEqual({});
  });
});

describe('reichweiteText', () => {
  const v = (anzahl: number, mit: number) => ({ anzahl, mit_geraet: mit, personen: [] });
  it('beschreibt die Reichweite verständlich', () => {
    expect(reichweiteText(v(0, 0))).toBe('Diese Gruppe enthält niemanden (außer dir).');
    expect(reichweiteText(v(3, 0))).toBe('3 Personen – aber niemand hat Mitteilungen eingeschaltet.');
    expect(reichweiteText(v(1, 1))).toBe('1 Person – alle haben Mitteilungen eingeschaltet.');
    expect(reichweiteText(v(12, 7))).toBe('12 Personen – 7 davon haben Mitteilungen eingeschaltet.');
    expect(reichweiteText(v(4, 1))).toBe('4 Personen – 1 davon hat Mitteilungen eingeschaltet.');
  });
});
