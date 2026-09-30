import { describe, it, expect } from 'vitest';
import {
  bereinige, faqTrifft, hervorheben, iconVon, istGleich, istZurueckgestuft, kachelTrifft, neueKachel, normalisiere, ordneKacheln, validiereMappe, verschiebe,
} from './logik';
import { ICON_WAHL, MAX_KACHELN, TEAMERMAPPE_STANDARD, TREFFMAPPE_STANDARD, type Kachel } from './standard';

const kachel = (o: Partial<Kachel> = {}): Kachel => ({ title: 'T', desc: 'D', icon: 'herz', tags: [], items: ['a'], ...o });

describe('Standardtexte', () => {
  it('Teamermappe: 8 Kacheln, 3 Kodex-Punkte, 10 Fragen, Notfalltext', () => {
    expect(TEAMERMAPPE_STANDARD.sections).toHaveLength(8);
    expect(TEAMERMAPPE_STANDARD.standards).toHaveLength(3);
    expect(TEAMERMAPPE_STANDARD.faqs).toHaveLength(10);
    expect(TEAMERMAPPE_STANDARD.emergencyText).toMatch(/Ruhe bewahren/);
    expect(TEAMERMAPPE_STANDARD.sections.length).toBeLessThanOrEqual(MAX_KACHELN);
  });
  it('Treffmappe: 5 Kacheln, keine Schlagworte', () => {
    expect(TREFFMAPPE_STANDARD.sections).toHaveLength(5);
    expect(TREFFMAPPE_STANDARD.sections.every((s) => s.tags.length === 0)).toBe(true);
  });
  it('alle Kachel-Symbole sind gültig; die Schlagworte sind die der Datenbank', () => {
    const ids = ICON_WAHL.map((i) => i.id);
    for (const s of [...TEAMERMAPPE_STANDARD.sections, ...TREFFMAPPE_STANDARD.sections]) expect(ids).toContain(s.icon);
    const tags = TEAMERMAPPE_STANDARD.sections.flatMap((s) => s.tags);
    expect(new Set(tags)).toEqual(new Set(['Gelbes T-Shirt', 'Schwimmen/Wasser']));
  });
});

describe('normalisiere', () => {
  it('ohne gespeicherte Daten gilt der Standard (als Kopie)', () => {
    const d = normalisiere(null, 'teamermappe');
    expect(d).toEqual(TEAMERMAPPE_STANDARD);
    d.sections[0]!.title = 'verändert';
    expect(TEAMERMAPPE_STANDARD.sections[0]!.title).toBe('Aufsichtspflicht');
  });
  it('fehlende Teile kommen aus dem Standard, vorhandene bleiben', () => {
    const d = normalisiere({ sections: [{ title: 'Eigene', desc: 'x', icon: 'info', tags: ['Küche'], items: ['p'] }] }, 'treffmappe');
    expect(d.sections).toHaveLength(1);
    expect(d.sections[0]!.title).toBe('Eigene');
    expect(d.faqs).toEqual(TREFFMAPPE_STANDARD.faqs);
    expect(d.emergencyText).toBe(TREFFMAPPE_STANDARD.emergencyText);
  });
  it('ergänzt fehlende oder unbekannte Symbole und Listen', () => {
    const d = normalisiere({ sections: [{ title: 'A' }, { title: 'B', icon: 'gibtsnicht', items: 'kaputt', tags: 5 }] }, 'teamermappe');
    expect(d.sections[0]).toMatchObject({ title: 'A', desc: '', items: [], tags: [], icon: ICON_WAHL[0]!.id });
    expect(d.sections[1]).toMatchObject({ icon: ICON_WAHL[1]!.id, items: [], tags: [] });
  });
  it('ignoriert Unbrauchbares und begrenzt die Kacheln', () => {
    const viele = Array.from({ length: 15 }, (_, i) => ({ title: `K${i}` }));
    expect(normalisiere({ sections: [...viele, 7, null] }, 'teamermappe').sections).toHaveLength(MAX_KACHELN);
    expect(normalisiere('text', 'teamermappe')).toEqual(TEAMERMAPPE_STANDARD);
    expect(normalisiere({ faqs: [{ q: 'a', a: 'b' }, 5, null] }, 'teamermappe').faqs).toEqual([{ q: 'a', a: 'b' }]);
  });
  it('kennt das Kodex-Symbol „Tür“, fällt sonst auf Herz zurück', () => {
    const d = normalisiere({ standards: [{ icon: 'tuer', title: 'A', text: 'x' }, { icon: '??', title: 'B', text: 'y' }] }, 'teamermappe');
    expect(d.standards.map((s) => s.icon)).toEqual(['tuer', 'herz']);
  });
  it('iconVon liefert bei Unbekanntem das erste Symbol', () => {
    expect(iconVon('team').emoji).toBe('👥');
    expect(iconVon('x').id).toBe(ICON_WAHL[0]!.id);
  });
});

describe('Suche', () => {
  it('findet in Titel, Beschreibung und Punkten, ohne Beachtung der Großschreibung', () => {
    const k = kachel({ title: 'Schwimmen', desc: 'Regeln am Wasser', items: ['Neonband für Nichtschwimmer'] });
    expect(kachelTrifft(k, 'schwimm')).toBe(true);
    expect(kachelTrifft(k, 'WASSER')).toBe(true);
    expect(kachelTrifft(k, 'neonband')).toBe(true);
    expect(kachelTrifft(k, 'Handy')).toBe(false);
    expect(kachelTrifft(k, '  ')).toBe(true);
  });
  it('findet in Fragen und Antworten', () => {
    expect(faqTrifft({ q: 'Kopfläuse?', a: 'Leitung informieren' }, 'leitung')).toBe(true);
    expect(faqTrifft({ q: 'Kopfläuse?', a: 'Leitung informieren' }, 'Reise')).toBe(false);
  });
  it('hebt Treffer hervor, auch mehrfach und am Rand', () => {
    expect(hervorheben('Wasser und wasser', 'wasser')).toEqual([
      { text: 'Wasser', treffer: true }, { text: ' und ', treffer: false }, { text: 'wasser', treffer: true },
    ]);
    expect(hervorheben('abc', 'x')).toEqual([{ text: 'abc', treffer: false }]);
    expect(hervorheben('abc', '')).toEqual([{ text: 'abc', treffer: false }]);
    expect(hervorheben('', 'a')).toEqual([{ text: '', treffer: false }]);
  });
  it('Sonderzeichen der Suche sind harmlos (kein regulärer Ausdruck)', () => {
    expect(hervorheben('a.b (c)', '(c)')).toEqual([{ text: 'a.b ', treffer: false }, { text: '(c)', treffer: true }]);
  });
});

describe('Zurückstufen', () => {
  it('ohne Schlagworte der Kachel oder ohne Signal nie', () => {
    expect(istZurueckgestuft({ tags: [] }, ['Küche'])).toBe(false);
    expect(istZurueckgestuft({ tags: ['Küche'] }, [])).toBe(false);
  });
  it('gestuft, wenn keines der Schlagworte zu den eigenen Freizeiten passt', () => {
    expect(istZurueckgestuft({ tags: ['Schwimmen/Wasser'] }, ['Küche'])).toBe(true);
    expect(istZurueckgestuft({ tags: ['Schwimmen/Wasser', 'Küche'] }, ['Küche'])).toBe(false);
  });
  it('zurückgestufte rücken ans Ende, sonst bleibt die Reihenfolge', () => {
    const s = [kachel({ title: 'A', tags: ['Wasser'] }), kachel({ title: 'B' }), kachel({ title: 'C', tags: ['Küche'] }), kachel({ title: 'D', tags: ['Wasser'] })];
    const o = ordneKacheln(s, ['Küche']);
    expect(o.map((x) => x.kachel.title)).toEqual(['B', 'C', 'A', 'D']);
    expect(o.map((x) => x.zurueckgestuft)).toEqual([false, false, true, true]);
    expect(o.map((x) => x.index)).toEqual([1, 2, 0, 3]);
  });
});

describe('Bearbeiten', () => {
  it('verschiebt innerhalb der Grenzen', () => {
    expect(verschiebe([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
    expect(verschiebe([1, 2, 3], 2, -1)).toEqual([1, 3, 2]);
    const l = [1, 2, 3];
    expect(verschiebe(l, 0, -1)).toBe(l);
    expect(verschiebe(l, 2, 1)).toBe(l);
  });
  it('neue Kacheln bekommen der Reihe nach ein anderes Symbol', () => {
    expect(neueKachel(0).icon).toBe(ICON_WAHL[0]!.id);
    expect(neueKachel(11).icon).toBe(ICON_WAHL[1]!.id);
  });
  it('bereinigt Leerzeichen, leere Punkte und leere Fragen', () => {
    const d = bereinige({
      sections: [kachel({ title: ' A ', desc: ' d ', items: [' x ', '  ', ''] })],
      standards: [{ icon: 'herz', title: ' K ', text: ' t ' }],
      faqs: [{ q: ' ', a: '' }, { q: ' F ', a: ' A ' }],
      emergencyText: '  Notfall ',
    });
    expect(d.sections[0]).toMatchObject({ title: 'A', desc: 'd', items: ['x'] });
    expect(d.standards[0]).toMatchObject({ title: 'K', text: 't' });
    expect(d.faqs).toEqual([{ q: 'F', a: 'A' }]);
    expect(d.emergencyText).toBe('Notfall');
  });
  it('prüft Titel, Fragen und Kodex', () => {
    const gut = { ...TREFFMAPPE_STANDARD };
    expect(validiereMappe(gut)).toBeNull();
    expect(validiereMappe({ ...gut, sections: [kachel({ title: '' })] })).toMatch(/Kachel 1 hat keinen Titel/);
    expect(validiereMappe({ ...gut, faqs: [{ q: 'nur Frage', a: '' }] })).toMatch(/Frage 1 braucht Frage und Antwort/);
    expect(validiereMappe({ ...gut, standards: [{ icon: 'herz', title: '', text: '' }] })).toMatch(/Kodex-Eintrag 1/);
    expect(validiereMappe({ ...gut, sections: Array.from({ length: 11 }, () => kachel()) })).toMatch(/Höchstens 10/);
  });
  it('erkennt Änderungen', () => {
    expect(istGleich(TREFFMAPPE_STANDARD, structuredClone(TREFFMAPPE_STANDARD))).toBe(true);
    expect(istGleich(TREFFMAPPE_STANDARD, { ...TREFFMAPPE_STANDARD, emergencyText: 'x' })).toBe(false);
  });
});
