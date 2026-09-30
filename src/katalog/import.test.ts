import { describe, it, expect } from 'vitest';
import { ausWordHtml, lesJson, MAX_IMPORT, trenneDoppelte } from './import';
import { leeresAngebot } from './logik';

describe('lesJson', () => {
  it('liest eine Liste im neuen Format', () => {
    const r = lesJson(JSON.stringify([{ name: 'Fangen', kategorie: 'bewegung', dauer: '20 Min.', alter_gruppen: ['6-8'], wetter: 'outdoor', material: 'Leibchen' }]));
    expect(r.meldungen).toEqual([]);
    expect(r.eintraege[0]).toMatchObject({ name: 'Fangen', kategorie: 'bewegung', dauer: '20 Min.', alter_gruppen: ['6-8'], wetter: 'outdoor', material: 'Leibchen', raum: '' });
  });
  it('liest das alte Format (category, alter) aus einem Objekt mit „katalog“', () => {
    const r = lesJson(JSON.stringify({ katalog: [{ name: 'Wasserbomben', category: 'wasser', alter: ['6-8', '9-12'], wetter: 'outdoor' }] }));
    expect(r.eintraege[0]).toMatchObject({ kategorie: 'wasser', alter_gruppen: ['6-8', '9-12'] });
  });
  it('akzeptiert auch „angebote“, deutsche Kategorienamen und Alter als Text', () => {
    const r = lesJson(JSON.stringify({ angebote: [{ name: 'A', kategorie: 'Kreativangebote', alter: '6–8, 9 - 12; 20-30' }] }));
    expect(r.eintraege[0]).toMatchObject({ kategorie: 'kreativ', alter_gruppen: ['6-8', '9-12'] });
  });
  it('überspringt Einträge ohne Namen, mit unbekannter Kategorie oder ohne Inhalt – und sagt warum', () => {
    const r = lesJson(JSON.stringify([{ name: ' ', kategorie: 'planb' }, { name: 'B', kategorie: 'unsinn' }, 5, null, { name: 'C', kategorie: 'planb' }]));
    expect(r.eintraege.map((e) => e.name)).toEqual(['C']);
    expect(r.meldungen).toHaveLength(4);
    expect(r.meldungen[0]).toMatch(/Eintrag 1: ohne Namen/);
    expect(r.meldungen[1]).toMatch(/„B“.*„unsinn“ ist unbekannt/);
  });
  it('Zahlen werden zu Text, unbekanntes Wetter wird leer', () => {
    const r = lesJson(JSON.stringify([{ name: 'D', kategorie: 'highlight', dauer: 45, wetter: 'nass' }]));
    expect(r.eintraege[0]).toMatchObject({ dauer: '45', wetter: '' });
  });
  it('meldet kaputte Dateien und falsche Formen', () => {
    expect(lesJson('{kaputt').meldungen[0]).toMatch(/kein gültiges JSON/);
    expect(lesJson('{"x":1}').meldungen[0]).toMatch(/keine Liste/);
    expect(lesJson('42').meldungen[0]).toMatch(/keine Liste/);
    expect(lesJson('[]')).toEqual({ eintraege: [], meldungen: [] });
  });
  it('begrenzt die Anzahl', () => {
    const viele = Array.from({ length: MAX_IMPORT + 1 }, (_, i) => ({ name: `n${i}`, kategorie: 'planb' }));
    const r = lesJson(JSON.stringify(viele));
    expect(r.eintraege).toEqual([]);
    expect(r.meldungen[0]).toMatch(/höchstens 1000/);
  });
});

describe('trenneDoppelte', () => {
  const e = (name: string, kategorie: 'bewegung' | 'wasser' = 'bewegung') => ({ ...leeresAngebot(kategorie), name });
  it('erkennt gleiche Namen in gleicher Kategorie – Groß-/Kleinschreibung und Umlaute egal', () => {
    const r = trenneDoppelte([e('Fangen'), e('SCHÄTZE'), e('Neu')], [e('fangen'), e('Schätze')]);
    expect(r.doppelte.map((x) => x.name)).toEqual(['Fangen', 'SCHÄTZE']);
    expect(r.neu.map((x) => x.name)).toEqual(['Neu']);
  });
  it('gleicher Name in anderer Kategorie ist kein Doppel', () => {
    expect(trenneDoppelte([e('Fangen', 'wasser')], [e('Fangen', 'bewegung')]).neu).toHaveLength(1);
  });
  it('Doppel innerhalb der Datei zählen ebenfalls', () => {
    const r = trenneDoppelte([e('A'), e('a'), e('B')], []);
    expect(r.neu.map((x) => x.name)).toEqual(['A', 'B']);
    expect(r.doppelte).toHaveLength(1);
  });
});

describe('ausWordHtml', () => {
  const tabelle = `<table>
    <tr><th>Phase</th><th>Material</th><th>Ablauf</th><th>Personal</th><th>Zeit</th></tr>
    <tr><td>Vorbereitung</td><td>Karten\nStifte</td><td>Karten legen</td><td>2 Teamer</td><td>15 min</td></tr>
    <tr><td>Umsetzung</td><td>Seile</td><td>Gruppen bilden und spielen</td><td>1 Teamer</td><td>30 Min.</td></tr>
    <tr><td>Nachbereitung</td><td></td><td>Aufräumen</td><td></td><td>10 min</td></tr>
  </table>`;

  it('liest den Titel in Anführungszeichen und die Tabelle', () => {
    const r = ausWordHtml(`<h1>Workshop-Plan „Schatzjagd“</h1>${tabelle}`, 'x.docx');
    expect(r.name).toBe('Schatzjagd');
    expect(r.vorbereitung).toBe('Karten legen');
    expect(r.umsetzung).toBe('Gruppen bilden und spielen');
    expect(r.nachbereitung).toBe('Aufräumen');
    expect(r.material).toBe('Karten, Stifte\nSeile');
    expect(r.personal).toBe('2 Teamer');
    expect(r.dauer).toBe('55 Min.');
  });
  it('nimmt sonst eine Überschrift mit „Workshop“ oder „Plan“, zuletzt den Dateinamen', () => {
    expect(ausWordHtml('<h2>Workshop Kreativtag</h2>', 'a.docx').name).toBe('Workshop Kreativtag');
    expect(ausWordHtml('<p>Nur Text</p>', 'Mein Spiel.docx').name).toBe('Mein Spiel');
  });
  it('ohne Tabelle nur der Name', () => {
    expect(ausWordHtml('<p>„Kimspiel“</p>', 'a.docx')).toEqual({ name: 'Kimspiel' });
  });
  it('ohne Zeit- und Personalangaben fehlen diese Felder', () => {
    const r = ausWordHtml('<table><tr><th>a</th><th>b</th></tr><tr><td>Umsetzung</td><td>Ball</td></tr></table>', 'x.docx');
    expect(r).not.toHaveProperty('dauer');
    expect(r).not.toHaveProperty('personal');
    expect(r.umsetzung).toBe('Ball');
  });
  it('Zeilen mit nur einer Zelle werden ignoriert', () => {
    const r = ausWordHtml('<table><tr><th>a</th><th>b</th></tr><tr><td>nur eine</td></tr></table>', 'x.docx');
    expect(r.material).toBe('');
  });
});
