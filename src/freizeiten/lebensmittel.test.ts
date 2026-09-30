import { describe, it, expect } from 'vitest';
import { parseMenge, formatMenge, artikelListe, standardTag, type Eingang, type Verbrauch } from './lebensmittel';

const f = { id: 'f1', start_datum: '2027-07-05', ende_datum: '2027-07-09' };
const ein = (o: Partial<Eingang> & { id: string; name: string; menge: number }): Eingang => ({ einheit: null, datum: '2027-07-01', freizeit_id: 'f1', ...o });
const ver = (o: Partial<Verbrauch> & { id: string; name: string; menge: number }): Verbrauch => ({ datum: '2027-07-05', freizeit_id: 'f1', ...o });

describe('parseMenge', () => {
  it('akzeptiert Komma und Punkt, Leerzeichen ringsum', () => {
    expect(parseMenge('1,5')).toBe(1.5);
    expect(parseMenge(' 2.25 ')).toBe(2.25);
    expect(parseMenge('100')).toBe(100);
    expect(parseMenge('1 000')).toBe(1000);
  });
  it('lehnt ungültige und nicht positive Werte ab', () => {
    for (const t of ['', 'abc', '0', '-3', '1,2,3', '1e5', '0,0', ',5']) expect(parseMenge(t), t).toBeNull();
  });
});

describe('formatMenge', () => {
  it('deutsche Schreibweise ohne überflüssige Nullen', () => {
    expect(formatMenge(1.5)).toBe('1,5');
    expect(formatMenge(100)).toBe('100');
    expect(formatMenge(0.125)).toBe('0,125');
    expect(formatMenge(1234.5)).toBe('1.234,5');
  });
});

describe('artikelListe', () => {
  it('summiert Eingänge und Verbrauch je Artikel (Schreibweise egal) und berechnet die Ampel', () => {
    const a = artikelListe(
      [ein({ id: '1', name: 'Milch', menge: 60, einheit: 'l' }), ein({ id: '2', name: ' milch ', menge: 40 })],
      [ver({ id: 'v1', name: 'Milch', menge: 30 }), ver({ id: 'v2', name: 'MILCH', menge: 50, datum: '2027-07-06' })],
      f,
    );
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ name: 'Milch', einheit: 'l', erhalten: 100, verbraucht: 80, rest: 20, status: 'knapp', prozent: 20 });
  });

  it('kritische Artikel zuerst (leer, knapp, dann ok), sonst alphabetisch', () => {
    const a = artikelListe(
      [ein({ id: '1', name: 'Butter', menge: 10 }), ein({ id: '2', name: 'Apfel', menge: 10 }), ein({ id: '3', name: 'Zucker', menge: 10 }), ein({ id: '4', name: 'Käse', menge: 10 })],
      [ver({ id: 'v1', name: 'Zucker', menge: 10 }), ver({ id: 'v2', name: 'Käse', menge: 8 })],
      f,
    );
    expect(a.map((x) => `${x.name}:${x.status}`)).toEqual(['Zucker:leer', 'Käse:knapp', 'Apfel:ok', 'Butter:ok']);
  });

  it('Verbrauch ohne Eingang erzeugt keinen Artikel (nichts zu verwalten)', () => {
    expect(artikelListe([], [ver({ id: 'v', name: 'Milch', menge: 5 })], f)).toEqual([]);
  });

  it('Hochrechnung: nur aus dem Verbrauch dieser Freizeit, nicht aus dem anderer Freizeiten am selben Ort', () => {
    const a = artikelListe(
      [ein({ id: '1', name: 'Milch', menge: 100 })],
      [ver({ id: 'v1', name: 'Milch', menge: 10, datum: '2027-07-05' }), ver({ id: 'v2', name: 'Milch', menge: 500, datum: '2027-07-06', freizeit_id: 'andere' })],
      f,
    );
    expect(a[0]!.verbraucht).toBe(510);            // Bestand gilt für den Ort
    expect(a[0]!.status).toBe('leer');
    expect(a[0]!.prognose).toBeNull();
    const b = artikelListe(
      [ein({ id: '1', name: 'Milch', menge: 1000 })],
      [ver({ id: 'v1', name: 'Milch', menge: 10, datum: '2027-07-05' }), ver({ id: 'v2', name: 'Milch', menge: 500, datum: '2027-07-06', freizeit_id: 'andere' })],
      f,
    );
    expect(b[0]!.prognose).toEqual({ bedarf: 40, resttage: 4, reicht: true });
  });

  it('Hochrechnung warnt, wenn der Rest nicht reicht', () => {
    const a = artikelListe([ein({ id: '1', name: 'Milch', menge: 60 })], [ver({ id: 'v1', name: 'Milch', menge: 20, datum: '2027-07-05' })], f);
    expect(a[0]!.prognose).toEqual({ bedarf: 80, resttage: 4, reicht: false });
  });

  it('die Einheit kommt vom ersten Eingang, der eine hat', () => {
    expect(artikelListe([ein({ id: '1', name: 'Reis', menge: 5 }), ein({ id: '2', name: 'Reis', menge: 5, einheit: 'kg' })], [], f)[0]!.einheit).toBe('kg');
    expect(artikelListe([ein({ id: '1', name: 'Reis', menge: 5 })], [], f)[0]!.einheit).toBe('');
  });

  it('Eingänge chronologisch, Verbrauch neueste zuerst', () => {
    const a = artikelListe(
      [ein({ id: '2', name: 'Reis', menge: 1, datum: '2027-07-03' }), ein({ id: '1', name: 'Reis', menge: 1, datum: '2027-07-01' })],
      [ver({ id: 'a', name: 'Reis', menge: 1, datum: '2027-07-05' }), ver({ id: 'b', name: 'Reis', menge: 1, datum: '2027-07-07' })],
      f,
    );
    expect(a[0]!.eingaenge.map((e) => e.id)).toEqual(['1', '2']);
    expect(a[0]!.verbrauch.map((v) => v.id)).toEqual(['b', 'a']);
  });
});

describe('standardTag', () => {
  it('heute, wenn in der Freizeit; sonst Start oder Ende', () => {
    expect(standardTag(f, '2027-07-07')).toBe('2027-07-07');
    expect(standardTag(f, '2027-06-01')).toBe('2027-07-05');
    expect(standardTag(f, '2027-08-01')).toBe('2027-07-09');
  });
});
