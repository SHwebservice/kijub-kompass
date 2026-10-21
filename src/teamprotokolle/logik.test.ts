import { describe, it, expect } from 'vitest';
import { bloecke, eingabeAus, gefuellteAbschnitte, istUngelesen, leeresProtokoll, nochNichtGelesen, ungeleseneJeTreff, validiere, verschiebe, wirklichGelesen, type Teamprotokoll } from './logik';

const eingabe = (o: Partial<ReturnType<typeof leeresProtokoll>> = {}) => ({ ...leeresProtokoll('2027-03-04'), titel: 'T', abschnitte: [{ titel: 'Termine', text: 'x' }], ...o });
const p = (o: Partial<Pick<Teamprotokoll, 'entwurf' | 'gelesen' | 'gemeldet_von' | 'erstellt_von'>> = {}) => ({ entwurf: false, gelesen: [], gemeldet_von: 'lea', erstellt_von: 'lea', ...o });

describe('Teamprotokolle: Prüfung', () => {
  it('Titel, Datum und Inhalt nötig – ein Entwurf darf noch leer sein', () => {
    expect(validiere(eingabe())).toEqual({});
    const leer = eingabe({ datum: '', titel: ' ', abschnitte: [{ titel: ' ', text: ' ' }] });
    expect(Object.keys(validiere(leer)).sort()).toEqual(['datum', 'inhalt', 'titel']);
    expect(Object.keys(validiere({ ...leer, titel: 'Entwurf', datum: '2027-03-04' }, true))).toEqual([]);
  });

  it('nur nächstes Treffen oder nur Aufgaben genügen als Inhalt; zu lange Überschrift wird beim Abschnitt gemeldet', () => {
    expect(validiere(eingabe({ abschnitte: [{ titel: '', text: '' }], naechstes_datum: '2027-03-18' }))).toEqual({});
    expect(validiere(eingabe({ abschnitte: [{ titel: '', text: '' }], aufgaben: '- Flyer' }))).toEqual({});
    expect(validiere(eingabe({ abschnitte: [{ titel: 'a', text: '' }, { titel: 'x'.repeat(201), text: 'y' }] })).abschnitte).toEqual({ 1: expect.stringMatching(/200 Zeichen/) });
  });

  it('leere Abschnitte fallen weg; altes Protokoll ohne Abschnitte bekommt einen leeren zum Bearbeiten', () => {
    expect(gefuellteAbschnitte([{ titel: ' Kasse ', text: '' }, { titel: '', text: ' ' }, { titel: '', text: 'Text' }])).toEqual([{ titel: 'Kasse', text: '' }, { titel: '', text: 'Text' }]);
    const alt = { art: 'sonstiges', datum: '2027-01-01', titel: 'A', abschnitte: [], naechstes_datum: null, naechstes_zeit: '18:30:00', aufgaben: '', anwesend: [] } as unknown as Teamprotokoll;
    expect(eingabeAus(alt)).toMatchObject({ abschnitte: [{ titel: '', text: '' }], naechstes_datum: '', naechstes_zeit: '18:30' });
  });

  it('verschieben bleibt in den Grenzen', () => {
    expect(verschiebe(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(verschiebe(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
  });
});

describe('Teamprotokolle: gelesen', () => {
  it('noch nicht gelesen: das Team ohne die meldende Person; Entwürfe liest niemand', () => {
    expect(nochNichtGelesen(p({ gelesen: ['ben'] }), ['lea', 'ben', 'ich'])).toEqual(['ich']);
    expect(nochNichtGelesen(p({ gemeldet_von: 'tk' }), ['lea', 'ich'])).toEqual(['lea', 'ich']);       // nach einer gemeldeten Änderung liest auch die Verfasserin erneut
    expect(nochNichtGelesen(p({ entwurf: true }), ['ben'])).toEqual([]);
  });

  it('ungelesen je Treff: selbst gemeldete und Entwürfe zählen nicht', () => {
    const l = [
      { treff_id: 't1', ...p() }, { treff_id: 't1', ...p({ gelesen: ['ich'] }) },
      { treff_id: 't2', ...p({ gemeldet_von: 'ich' }) }, { treff_id: 't2', ...p() }, { treff_id: 't2', ...p({ entwurf: true }) },
    ];
    expect(ungeleseneJeTreff(l, 'ich')).toEqual({ t1: 1, t2: 1 });
    expect(istUngelesen(p({ gemeldet_von: null, erstellt_von: 'ich' }), 'ich')).toBe(false);
  });

  it('„vor Eintritt“ gilt nicht als ungelesen, aber auch nicht als gelesen', () => {
    const x = { gelesen: ['ben', 'nina'], vorEintritt: ['nina'] };
    expect(istUngelesen(p(x), 'nina')).toBe(false);
    expect(wirklichGelesen(x)).toEqual(['ben']);
  });
});

describe('Teamprotokolle: Textblöcke', () => {
  it('Absätze und Aufzählungen; Leerzeilen trennen', () => {
    expect(bloecke('Wir haben beschlossen:\n- Sommerfest\n* Flyer\n• Kasse\n\nZweiter Absatz\nmit Zeile')).toEqual([
      { art: 'absatz', text: 'Wir haben beschlossen:' },
      { art: 'liste', punkte: ['Sommerfest', 'Flyer', 'Kasse'] },
      { art: 'absatz', text: 'Zweiter Absatz\nmit Zeile' },
    ]);
    expect(bloecke('- a\n\n- b')).toEqual([{ art: 'liste', punkte: ['a'] }, { art: 'liste', punkte: ['b'] }]);
    expect(bloecke('')).toEqual([]);
  });
});
