import { describe, it, expect } from 'vitest';
import { ausWordHtml } from './import';

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
