import { describe, it, expect } from 'vitest';
import { nochNichtGelesen, ungeleseneJeTreff, validiere } from './logik';

describe('Teamprotokolle: Fachlogik', () => {
  it('Prüfung: Titel, Inhalt und Datum nötig', () => {
    expect(validiere({ art: 'information', datum: '2027-03-04', titel: 'T', text: 'x', anwesend: [] })).toEqual({});
    expect(Object.keys(validiere({ art: 'information', datum: '', titel: ' ', text: ' ', anwesend: [] })).sort()).toEqual(['datum', 'text', 'titel']);
  });

  it('noch nicht gelesen: das Team ohne die verfassende Person', () => {
    expect(nochNichtGelesen({ gelesen: ['ben'], erstellt_von: 'lea' }, ['lea', 'ben', 'ich'])).toEqual(['ich']);
  });

  it('ungelesen je Treff: eigene Protokolle zählen nicht', () => {
    const l = [
      { treff_id: 't1', gelesen: [], erstellt_von: 'lea' }, { treff_id: 't1', gelesen: ['ich'], erstellt_von: 'lea' },
      { treff_id: 't2', gelesen: [], erstellt_von: 'ich' }, { treff_id: 't2', gelesen: [], erstellt_von: 'lea' },
    ];
    expect(ungeleseneJeTreff(l, 'ich')).toEqual({ t1: 1, t2: 1 });
  });
});
