import { describe, it, expect } from 'vitest';
import {
  anzahlJeThema, bereinigeFrage, ergebnisText, fragenZu, istMehrfach, istNeuerBestwert, istRichtig, markierung, mischeAntworten, mischen, prozent, themaVon,
  THEMEN, validiereFrage, type Frage, type FrageEingabe,
} from './logik';
import { STANDARDFRAGEN } from './standardfragen';

/** Einfacher, wiederholbarer Zufall für die Tests. */
const folge = (werte: number[]) => { let i = 0; return () => werte[i++ % werte.length]!; };

describe('Standardfragen', () => {
  it('35 Fragen, alle Themen vorhanden, jede Frage in sich stimmig', () => {
    expect(STANDARDFRAGEN).toHaveLength(35);
    expect(new Set(STANDARDFRAGEN.map((f) => f.thema))).toEqual(new Set(THEMEN.map((t) => t.id)));
    for (const f of STANDARDFRAGEN) {
      expect(validiereFrage(bereinigeFrage(f))).toBeNull();
      expect(f.korrekt.every((k) => k >= 0 && k < f.antworten.length)).toBe(true);
    }
  });
  it('jedes Thema hat mindestens vier Fragen', () => {
    const n = anzahlJeThema(STANDARDFRAGEN);
    for (const t of THEMEN) expect(n[t.id]).toBeGreaterThanOrEqual(4);
  });
});

describe('mischen', () => {
  it('ändert das Original nicht und behält alle Elemente', () => {
    const l = [1, 2, 3, 4, 5];
    const m = mischen(l, folge([0.1, 0.9, 0.5, 0.3]));
    expect(l).toEqual([1, 2, 3, 4, 5]);
    expect([...m].sort()).toEqual([1, 2, 3, 4, 5]);
  });
  it('mit Zufall 0 rotiert deterministisch', () => {
    expect(mischen([1, 2, 3], () => 0)).toEqual([2, 3, 1]);
  });
  it('leere und einelementige Listen', () => {
    expect(mischen([])).toEqual([]);
    expect(mischen([7])).toEqual([7]);
  });
});

describe('Antworten', () => {
  const f = { antworten: ['A', 'B', 'C', 'D'], korrekt: [1] };
  it('die richtige Antwort bleibt nach dem Mischen richtig markiert', () => {
    for (const z of [0, 0.3, 0.6, 0.99]) {
      const m = mischeAntworten(f, () => z);
      expect(m.filter((a) => a.korrekt).map((a) => a.text)).toEqual(['B']);
      expect(m).toHaveLength(4);
    }
  });
  it('Mehrfachfragen erkennt man an mehreren richtigen', () => {
    expect(istMehrfach({ korrekt: [0, 2] })).toBe(true);
    expect(istMehrfach({ korrekt: [1] })).toBe(false);
  });
  it('richtig nur bei genau den richtigen Antworten', () => {
    const a = [{ text: 'a', korrekt: true }, { text: 'b', korrekt: false }, { text: 'c', korrekt: true }];
    expect(istRichtig(a, [0, 2])).toBe(true);
    expect(istRichtig(a, [2, 0, 0])).toBe(true);
    expect(istRichtig(a, [0])).toBe(false);
    expect(istRichtig(a, [0, 1, 2])).toBe(false);
    expect(istRichtig(a, [])).toBe(false);
  });
  it('Markierungen nach der Auswertung', () => {
    expect(markierung({ text: 'x', korrekt: true }, true)).toBe('richtig');
    expect(markierung({ text: 'x', korrekt: false }, true)).toBe('falsch');
    expect(markierung({ text: 'x', korrekt: true }, false)).toBe('verpasst');
    expect(markierung({ text: 'x', korrekt: false }, false)).toBe('neutral');
  });
});

describe('Ergebnis', () => {
  it('Text nach Anteil', () => {
    expect(ergebnisText(5, 5).titel).toBe('Perfekt!');
    expect(ergebnisText(4, 5).titel).toBe('Sehr gut!');
    expect(ergebnisText(3, 5).titel).toBe('Gut gemacht!');
    expect(ergebnisText(2, 5).titel).toBe('Noch etwas üben');
    expect(ergebnisText(1, 5).titel).toBe('Weitermachen!');
    expect(ergebnisText(0, 0).titel).toBe('Weitermachen!');
  });
  it('Bestwert: nur bei höherem Anteil, auch wenn sich die Fragenzahl geändert hat', () => {
    expect(istNeuerBestwert({ richtig: 1, gesamt: 5 }, undefined)).toBe(true);
    expect(istNeuerBestwert({ richtig: 4, gesamt: 5 }, { bester_wert: 3, gesamt: 5 })).toBe(true);
    expect(istNeuerBestwert({ richtig: 3, gesamt: 5 }, { bester_wert: 3, gesamt: 5 })).toBe(false);
    expect(istNeuerBestwert({ richtig: 3, gesamt: 5 }, { bester_wert: 4, gesamt: 5 })).toBe(false);
    expect(istNeuerBestwert({ richtig: 4, gesamt: 8 }, { bester_wert: 3, gesamt: 5 })).toBe(false);     // 50 % < 60 %
    expect(istNeuerBestwert({ richtig: 5, gesamt: 6 }, { bester_wert: 3, gesamt: 5 })).toBe(true);      // 83 % > 60 %
    expect(istNeuerBestwert({ richtig: 0, gesamt: 0 }, { bester_wert: 1, gesamt: 5 })).toBe(false);
  });
  it('Prozent', () => {
    expect(prozent(3, 4)).toBe(75);
    expect(prozent(1, 3)).toBe(33);
    expect(prozent(0, 0)).toBe(0);
  });
});

describe('Fragen pflegen', () => {
  const basis: FrageEingabe = { thema: 'regeln', frage: ' Frage? ', antworten: [' A ', '', 'B', '  ', 'C'], korrekt: [2, 4], erklaerung: ' Weil. ' };

  it('bereinigt leere Antworten und rechnet die richtigen um', () => {
    const b = bereinigeFrage(basis);
    expect(b).toEqual({ thema: 'regeln', frage: 'Frage?', antworten: ['A', 'B', 'C'], korrekt: [1, 2], erklaerung: 'Weil.' });
    expect(validiereFrage(b)).toBeNull();
  });
  it('eine als richtig markierte leere Antwort fällt weg', () => {
    const b = bereinigeFrage({ ...basis, korrekt: [1, 2] });
    expect(b.korrekt).toEqual([1]);
  });
  it('meldet fehlende Angaben', () => {
    expect(validiereFrage(bereinigeFrage({ ...basis, frage: ' ' }))).toMatch(/Frage eingeben/);
    expect(validiereFrage(bereinigeFrage({ ...basis, antworten: ['A', '', '', '', ''], korrekt: [0] }))).toMatch(/mindestens 2 Antworten/);
    expect(validiereFrage(bereinigeFrage({ ...basis, korrekt: [] }))).toMatch(/richtige Antwort/);
    expect(validiereFrage(bereinigeFrage({ ...basis, korrekt: [0, 2, 4] }))).toMatch(/Nicht alle/);
    expect(validiereFrage({ ...bereinigeFrage(basis), antworten: ['1', '2', '3', '4', '5', '6', '7'], korrekt: [0] })).toMatch(/Höchstens 6/);
  });
  it('filtert und zählt nach Thema', () => {
    const fragen: Frage[] = [
      { id: '1', thema: 'regeln', frage: 'a', antworten: ['x', 'y'], korrekt: [0], erklaerung: '' },
      { id: '2', thema: 'aufsicht', frage: 'b', antworten: ['x', 'y'], korrekt: [0], erklaerung: '' },
      { id: '3', thema: 'regeln', frage: 'c', antworten: ['x', 'y'], korrekt: [0], erklaerung: '' },
    ];
    expect(fragenZu(fragen, 'regeln').map((f) => f.id)).toEqual(['1', '3']);
    expect(fragenZu(fragen, null)).toHaveLength(3);
    expect(anzahlJeThema(fragen)).toEqual({ regeln: 2, aufsicht: 1 });
    expect(themaVon('schwimmen')?.label).toBe('Schwimmen & Wasser');
    expect(themaVon('gibtsnicht')).toBeUndefined();
  });
});
