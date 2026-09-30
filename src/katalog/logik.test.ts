import { describe, it, expect } from 'vitest';
import {
  aehnliche, alterText, ausDatenbankform, bewertungText, filterAktiv, filtere, formularAus, gruppiere, inDatenbankform, keinFilter, leeresAngebot, normal, sterne,
  validiereAngebot, type Angebot,
} from './logik';

const a = (o: Partial<Angebot> & { id: string }): Angebot => ({ ...leeresAngebot('bewegung'), name: `Spiel ${o.id}`, ...o });

const fangen = a({ id: 'fangen', name: 'Fangen', kategorie: 'bewegung', wetter: 'outdoor', alter_gruppen: ['6-8', '9-12'], umsetzung: 'Ein Kind fängt die anderen auf der Wiese', material: 'Leibchen' });
const schatz = a({ id: 'schatz', name: 'Schatzsuche im Wald', kategorie: 'highlight', wetter: 'outdoor', alter_gruppen: ['9-12'], material: 'Karte, Kiste, Süßigkeiten', umsetzung: 'Die Gruppe sucht mit der Karte den Schatz im Wald' });
const knoten = a({ id: 'knoten', name: 'Menschenknoten', kategorie: 'kennenlernen', wetter: 'beides', alter_gruppen: ['13-16'], umsetzung: 'Alle verknoten sich und lösen den Knoten wieder auf' });
const basteln = a({ id: 'basteln', name: 'Freundschaftsbänder', kategorie: 'kreativ', wetter: 'indoor', material: 'Garn, Schere' });
const alle = [fangen, schatz, knoten, basteln];

describe('Suchen und Filtern', () => {
  const keine = new Set<string>();
  it('normalisiert Umlaute und Großschreibung', () => expect(normal('Süße Straße ÄÖ')).toBe('susse strasse ao'));

  it('ohne Filter: alle, nach Name sortiert', () => {
    expect(filtere(alle, keinFilter, keine).map((x) => x.id)).toEqual(['fangen', 'basteln', 'knoten', 'schatz']);
    expect(filterAktiv(keinFilter)).toBe(false);
  });
  it('Suche über Name, Umsetzung und Material; alle Begriffe müssen vorkommen', () => {
    expect(filtere(alle, { ...keinFilter, suche: 'schatz' }, keine).map((x) => x.id)).toEqual(['schatz']);
    expect(filtere(alle, { ...keinFilter, suche: 'wiese' }, keine).map((x) => x.id)).toEqual(['fangen']);
    expect(filtere(alle, { ...keinFilter, suche: 'Schere garn' }, keine).map((x) => x.id)).toEqual(['basteln']);
    expect(filtere(alle, { ...keinFilter, suche: 'wald schere' }, keine)).toEqual([]);
    expect(filtere(alle, { ...keinFilter, suche: 'suesses' }, keine)).toEqual([]);
    expect(filterAktiv({ ...keinFilter, suche: ' x ' })).toBe(true);
  });
  it('findet „Süßigkeiten“ mit Umlaut und ß, in Groß- und Kleinschreibung', () => {
    expect(filtere(alle, { ...keinFilter, suche: 'süßigkeiten' }, keine).map((x) => x.id)).toEqual(['schatz']);
    expect(filtere(alle, { ...keinFilter, suche: 'SÜSSIGKEITEN' }, keine).map((x) => x.id)).toEqual(['schatz']);
  });
  it('Kategorie, Wetter und Alter', () => {
    expect(filtere(alle, { ...keinFilter, kategorie: 'highlight' }, keine).map((x) => x.id)).toEqual(['schatz']);
    expect(filtere(alle, { ...keinFilter, wetter: 'outdoor' }, keine).map((x) => x.id)).toEqual(['fangen', 'schatz']);
    expect(filtere(alle, { ...keinFilter, wetter: 'beides' }, keine).map((x) => x.id)).toEqual(['knoten']);
    expect(filtere(alle, { ...keinFilter, alter: '9-12' }, keine).map((x) => x.id)).toEqual(['fangen', 'schatz']);
    expect(filtere(alle, { ...keinFilter, alter: '13-16', wetter: 'beides', kategorie: 'kennenlernen' }, keine).map((x) => x.id)).toEqual(['knoten']);
  });
  it('nur Favoriten', () => {
    expect(filtere(alle, { ...keinFilter, nurFavoriten: true }, new Set(['basteln', 'fangen'])).map((x) => x.id)).toEqual(['fangen', 'basteln']);
    expect(filtere(alle, { ...keinFilter, nurFavoriten: true }, keine)).toEqual([]);
  });
  it('gruppiert in der Reihenfolge der Kategorien; leere fehlen', () => {
    const g = gruppiere(alle);
    expect(g.map((x) => x.kategorie)).toEqual(['kennenlernen', 'bewegung', 'kreativ', 'highlight']);
    expect(g[1]!.eintraege).toEqual([fangen]);
    expect(gruppiere([])).toEqual([]);
  });
});

describe('Ähnliche Programmpunkte', () => {
  it('findet den inhaltlich nächsten und nie sich selbst', () => {
    const wald = a({ id: 'wald', name: 'Waldspiele', umsetzung: 'Die Gruppe sucht im Wald Schätze mit der Karte', kategorie: 'bewegung' });
    const r = aehnliche(schatz, [...alle, wald]);
    expect(r[0]!.id).toBe('wald');
    expect(r.map((x) => x.id)).not.toContain('schatz');
  });
  it('ohne gemeinsame Wörter gibt es keine Treffer', () => {
    expect(aehnliche(basteln, [basteln, fangen, knoten])).toEqual([]);
  });
  it('begrenzt die Anzahl und ordnet absteigend', () => {
    const basis = a({ id: 'b', name: 'Ballspiel', umsetzung: 'Ball werfen fangen' });
    const viele = Array.from({ length: 6 }, (_, i) => a({ id: `x${i}`, name: `Ballspiel ${i}`, umsetzung: 'Ball werfen' + ' fangen'.repeat(i % 2) }));
    expect(aehnliche(basis, [basis, ...viele], 3)).toHaveLength(3);
    expect(aehnliche(basis, [basis, ...viele], 10).length).toBe(6);
  });
  it('ein Programmpunkt ohne Text hat keine Ähnlichen; ein unbekannter (noch nicht gespeicherter) geht auch', () => {
    expect(aehnliche(a({ id: 'leer', name: '' }), alle)).toEqual([]);
    expect(aehnliche(a({ id: 'neu', name: 'Schatzsuche', umsetzung: 'Schatz suchen' }), alle).map((x) => x.id)).toContain('schatz');
  });
  it('Füllwörter zählen nicht', () => {
    const x = a({ id: 'x', name: 'Aa', umsetzung: 'und der die das mit' });
    const y = a({ id: 'y', name: 'Bb', umsetzung: 'und der die das mit' });
    expect(aehnliche(x, [x, y])).toEqual([]);
  });
});

describe('Formular und Datenbank', () => {
  it('validiert Name, Kategorie und Länge', () => {
    expect(validiereAngebot({ ...leeresAngebot(), name: 'Spiel' })).toEqual({});
    expect(validiereAngebot(leeresAngebot()).name).toBeDefined();
    expect(validiereAngebot({ ...leeresAngebot(), name: 'x'.repeat(121) }).name).toMatch(/höchstens 120/);
    expect(validiereAngebot({ ...leeresAngebot(), name: 'x', kategorie: 'unbekannt' as never }).kategorie).toBeDefined();
    expect(validiereAngebot({ ...leeresAngebot(), name: 'x', umsetzung: 'y'.repeat(4001) }).lang).toBeDefined();
  });
  it('Leeres wird für die Datenbank zu null, Text gekürzt', () => {
    const d = inDatenbankform({ ...leeresAngebot('wasser'), name: ' Wasserbomben ', dauer: ' 30 Min. ', wetter: 'outdoor', alter_gruppen: ['6-8'] });
    expect(d).toMatchObject({ name: 'Wasserbomben', kategorie: 'wasser', dauer: '30 Min.', gruppe: null, wetter: 'outdoor', alter_gruppen: ['6-8'], material: null });
    expect(inDatenbankform(leeresAngebot()).wetter).toBeNull();
  });
  it('aus der Datenbank: null wird zu leerem Text, unbekanntes Wetter zu leer', () => {
    const x = ausDatenbankform({ id: '1', name: 'A', kategorie: 'planb', dauer: null, wetter: 'komisch', alter_gruppen: ['6-8', 5, null], material: 'M' });
    expect(x).toMatchObject({ id: '1', dauer: '', wetter: '', alter_gruppen: ['6-8'], material: 'M', raum: '' });
  });
  it('hin und zurück bleibt gleich', () => {
    expect(ausDatenbankform({ id: fangen.id, ...inDatenbankform(formularAus(fangen)) })).toEqual(fangen);
  });
  it('kleine Helfer', () => {
    expect(alterText('9-12')).toBe('9–12');
    expect(bewertungText(0, 0)).toBe('Noch nicht bewertet');
    expect(bewertungText(4.5, 2)).toBe('4,5 (2)');
    expect(sterne(3.6)).toBe('★★★★☆');
    expect(sterne(0)).toBe('☆☆☆☆☆');
    expect(sterne(9)).toBe('★★★★★');
  });
});
