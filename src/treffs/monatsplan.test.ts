import { describe, it, expect } from 'vitest';
import { planeMonat, type PlanEingabe } from './monatsplan';
import type { Dienst } from './dienstplan';

// März 2027: Mo 1, 8, 15, 22, 29 · Mi 3, 10, 17, 24, 31
const MONAT = '2027-03-01';
const oeffnung = [{ wochentag: 1, von: '15:00', bis: '19:00' }, { wochentag: 3, von: '14:00', bis: '18:00' }];
const dienst = (datum: string, personen: string[], o: Partial<Dienst> = {}): Dienst => ({ id: `d-${datum}`, datum, von: '15:00', bis: '19:00', ist_sonder: false, bezeichnung: null, personen, wuensche: [], ...o });
const namen: Record<string, string> = { anna: 'Anna Adler', ben: 'Ben Baum', carla: 'Carla Cord' };

const plan = (o: Partial<PlanEingabe>) => planeMonat({
  monat: MONAT, treffId: 't1', oeffnungszeiten: oeffnung, muster: {}, modus: 'hinzufuegen', dienste: [], abwesenheiten: [], feiertage: [], erlaubt: new Set(), name: (id) => namen[id] ?? id, ...o,
});
const tage = (l: { datum: string }[]) => [...new Set(l.map((x) => x.datum))];

describe('planeMonat: Grundfall', () => {
  it('ohne Muster passiert nichts', () => {
    expect(plan({})).toEqual({ zuteilen: [], entfernen: [], schonDa: 0, konflikte: [], tage: [] });
  });

  it('eine Person mit festen Wochentagen: alle Öffnungstage dieser Wochentage im Monat', () => {
    const p = plan({ muster: { anna: [1] } });
    expect(tage(p.zuteilen)).toEqual(['2027-03-01', '2027-03-08', '2027-03-15', '2027-03-22', '2027-03-29']);
    expect(p.zuteilen.every((x) => x.person === 'anna')).toBe(true);
    expect(p.tage).toHaveLength(5);
  });

  it('Schließzeiten: an diesen Tagen wird nicht eingeteilt (kein Konflikt, einfach zu)', () => {
    const p = plan({ muster: { anna: [1] }, schliesszeiten: [{ id: 's', treff_id: 't1', von: '2027-03-06', bis: '2027-03-16', grund: '' }] });
    expect(tage(p.zuteilen)).toEqual(['2027-03-01', '2027-03-22', '2027-03-29']);
    expect(p.konflikte).toEqual([]);
  });

  it('mehrere Personen mit verschiedenen Wochentagen; zwei Personen am selben Tag', () => {
    const p = plan({ muster: { anna: [1, 3], ben: [3] } });
    expect(p.zuteilen.filter((x) => x.datum === '2027-03-03').map((x) => x.person)).toEqual(['anna', 'ben']);
    expect(p.zuteilen.filter((x) => x.datum === '2027-03-01').map((x) => x.person)).toEqual(['anna']);
    expect(p.zuteilen).toHaveLength(5 + 5 + 5);
  });

  it('Wochentage, an denen der Treff nicht öffnet, werden ignoriert', () => {
    expect(plan({ muster: { anna: [2, 6, 7] } }).zuteilen).toEqual([]);
  });

  it('eine Person ohne Wochentage ändert nichts', () => {
    expect(plan({ muster: { anna: [] } }).zuteilen).toEqual([]);
  });
});

describe('planeMonat: vorhandene Einteilungen bleiben', () => {
  it('wer schon eingetragen ist, wird nicht doppelt gezählt; weitere Personen kommen dazu', () => {
    const p = plan({ muster: { anna: [1], ben: [1] }, dienste: [dienst('2027-03-01', ['anna']), dienst('2027-03-08', ['carla'])] });
    expect(p.schonDa).toBe(1);
    expect(p.zuteilen.filter((x) => x.datum === '2027-03-01')).toEqual([{ datum: '2027-03-01', person: 'ben' }]);
    expect(p.zuteilen.filter((x) => x.datum === '2027-03-08').map((x) => x.person)).toEqual(['anna', 'ben']);   // Carla bleibt, beide kommen dazu
    expect(p.entfernen).toEqual([]);
  });

  it('Sonderdienste zählen nicht als Einteilung des Tages', () => {
    const p = plan({ muster: { anna: [1] }, dienste: [dienst('2027-03-01', ['anna'], { ist_sonder: true, bezeichnung: 'Fest' })] });
    expect(p.zuteilen.some((x) => x.datum === '2027-03-01')).toBe(true);
    expect(p.schonDa).toBe(0);
  });
});

describe('planeMonat: ersetzen', () => {
  it('entfernt Personen, die nicht im Muster stehen – nur an Tagen, die das Muster betrifft', () => {
    const p = plan({
      modus: 'ersetzen', muster: { anna: [1] },
      dienste: [dienst('2027-03-01', ['ben', 'anna']), dienst('2027-03-03', ['ben'])],        // Mittwoch kommt im Muster nicht vor
    });
    expect(p.entfernen).toEqual([{ datum: '2027-03-01', person: 'ben' }]);
    expect(p.zuteilen.some((x) => x.datum === '2027-03-01')).toBe(false);                      // Anna ist schon da
    expect(p.tage).toContain('2027-03-01');
  });

  it('im Modus „hinzufügen“ wird nie etwas entfernt', () => {
    expect(plan({ muster: { anna: [1] }, dienste: [dienst('2027-03-01', ['ben'])] }).entfernen).toEqual([]);
  });
});

describe('planeMonat: Konflikte entscheidet die Treffleitung', () => {
  const urlaub = [{ id: 'u', person_id: 'anna', datum: '2027-03-08', typ: 'urlaub' as const, notiz: null }, { id: 'k', person_id: 'anna', datum: '2027-03-15', typ: 'krank' as const, notiz: null }];

  it('Urlaub und Krankheit: ohne Erlaubnis wird die Person an diesem Tag nicht eingeteilt, der Konflikt wird gemeldet', () => {
    const p = plan({ muster: { anna: [1], ben: [1] }, abwesenheiten: urlaub });
    expect(p.zuteilen.some((x) => x.datum === '2027-03-08' && x.person === 'anna')).toBe(false);
    expect(p.zuteilen.some((x) => x.datum === '2027-03-08' && x.person === 'ben')).toBe(true);
    expect(p.konflikte.map((k) => k.text)).toEqual(['Anna Adler ist am Mo 08.03. im Urlaub', 'Anna Adler ist am Mo 15.03. krank']);
  });

  it('mit Erlaubnis wird trotzdem eingeteilt', () => {
    const p = plan({ muster: { anna: [1] }, abwesenheiten: urlaub, erlaubt: new Set(['abwesend:anna:2027-03-08']) });
    expect(p.zuteilen.some((x) => x.datum === '2027-03-08')).toBe(true);
    expect(p.zuteilen.some((x) => x.datum === '2027-03-15')).toBe(false);
  });

  it('Feiertag (seit 0027): der Treff ist zu – kein Konflikt, an diesem Tag wird nicht eingeteilt', () => {
    const feiertage = [{ id: 'f', treff_id: null, datum: '2027-03-01', bezeichnung: 'Fest' }];
    const p = plan({ muster: { anna: [1], ben: [1] }, feiertage });
    expect(p.zuteilen.some((x) => x.datum === '2027-03-01')).toBe(false);
    expect(p.zuteilen.filter((x) => x.datum === '2027-03-08')).toHaveLength(2);
    expect(p.konflikte).toEqual([]);
  });

  it('Feiertag und Urlaub am selben Tag: kein Konflikt (der Treff ist ohnehin zu)', () => {
    const feiertage = [{ id: 'f', treff_id: null, datum: '2027-03-08', bezeichnung: 'Fest' }];
    const p = plan({ muster: { anna: [1] }, feiertage, abwesenheiten: urlaub, erlaubt: new Set(['abwesend:anna:2027-03-08']) });
    expect(p.zuteilen.some((x) => x.datum === '2027-03-08')).toBe(false);
    expect(p.konflikte.map((k) => k.datum)).not.toContain('2027-03-08');
  });

  it('wer an einem Konflikt-Tag schon eingetragen ist, löst keinen Konflikt aus', () => {
    const p = plan({ muster: { anna: [1] }, abwesenheiten: urlaub, dienste: [dienst('2027-03-08', ['anna'])] });
    expect(p.konflikte.map((k) => k.datum)).toEqual(['2027-03-15']);
  });

  it('ein Feiertag nur für einen anderen Treff zählt nicht', () => {
    const p = plan({ muster: { anna: [1] }, feiertage: [{ id: 'f', treff_id: 'anderer', datum: '2027-03-01', bezeichnung: 'Fest' }] });
    expect(p.konflikte).toEqual([]);
    expect(p.zuteilen.some((x) => x.datum === '2027-03-01')).toBe(true);
  });
});
