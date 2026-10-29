import { describe, it, expect } from 'vitest';
import { abwesenheitenJePerson, betroffeneDienste, blockAenderung, ersatzGesucht, freiePersonen, schnellwahl } from './abwesenheit';
import { tageskarten, type Abwesenheit, type Dienst } from './dienstplan';

// März 2027: Mo 1., Mi 3., Fr 5., Mo 8.
const dienst = (o: Partial<Dienst> & { id: string; datum: string }): Dienst => ({ von: '15:00', bis: '19:00', ist_sonder: false, bezeichnung: null, personen: [], wuensche: [], ...o });
const team = [
  { person_id: 'lea', vorname: 'Lea', nachname: 'Leitner', rolle: 'treffleitung' as const },
  { person_id: 'ben', vorname: 'Ben', nachname: 'Baum', rolle: 'betreuerin' as const, tzk_max_stunden: 6 },
  { person_id: 'anna', vorname: 'Anna', nachname: 'Adler', rolle: 'betreuerin' as const },
  { person_id: 'carla', vorname: 'Carla', nachname: 'Cord', rolle: 'betreuerin' as const },
];
const abw = (person_id: string, datum: string, typ: Abwesenheit['typ'] = 'urlaub', notiz: string | null = null): Abwesenheit => ({ id: `${person_id}-${datum}`, person_id, datum, typ, notiz });

describe('schnellwahl', () => {
  it('Mittwoch: nur dieser Tag, bis Freitag, ganze Woche, nächste Woche', () => {
    expect(schnellwahl('2027-03-03')).toEqual([
      { label: 'Nur dieser Tag', von: '2027-03-03', bis: '2027-03-03' },
      { label: 'Bis Freitag', von: '2027-03-03', bis: '2027-03-05' },
      { label: 'Ganze Woche', von: '2027-03-01', bis: '2027-03-07' },
      { label: 'Nächste Woche', von: '2027-03-08', bis: '2027-03-14' },
    ]);
  });
  it('ab Freitag kein „bis Freitag“', () => {
    expect(schnellwahl('2027-03-05').map((s) => s.label)).toEqual(['Nur dieser Tag', 'Ganze Woche', 'Nächste Woche']);
  });
});

describe('betroffeneDienste', () => {
  it('reguläre und Sonderdienste der Person im Zeitraum, nur ab heute, nach Datum', () => {
    const dienste = [
      dienst({ id: 'a', datum: '2027-03-01', personen: ['ben'] }),
      dienst({ id: 's', datum: '2027-03-05', ist_sonder: true, bezeichnung: 'Fest', personen: ['ben'] }),
      dienst({ id: 'b', datum: '2027-03-03', personen: ['ben', 'lea'] }),
      dienst({ id: 'c', datum: '2027-03-08', personen: ['ben'] }),
      dienst({ id: 'd', datum: '2027-03-03', personen: ['lea'] }),
    ];
    expect(betroffeneDienste(dienste, 'ben', '2027-03-01', '2027-03-07', '2027-03-02').map((d) => d.id)).toEqual(['b', 's']);
  });
});

describe('blockAenderung', () => {
  const block = { person_id: 'ben', typ: 'krank' as const, notiz: null, von: '2027-03-01', bis: '2027-03-03', ids: ['i1', 'i2', 'i3'] };
  it('neu: nur Tage', () => {
    expect(blockAenderung(null, 'ben', '2027-03-01', '2027-03-02')).toEqual({ tage: ['2027-03-01', '2027-03-02'], loeschen: [] });
  });
  it('verkürzen löscht die Tage außerhalb, verlängern schreibt dazu', () => {
    expect(blockAenderung(block, 'ben', '2027-03-02', '2027-03-05')).toEqual({ tage: ['2027-03-02', '2027-03-03', '2027-03-04', '2027-03-05'], loeschen: ['i1'] });
  });
  it('andere Person: alle alten Tage fallen weg', () => {
    expect(blockAenderung(block, 'anna', '2027-03-01', '2027-03-03').loeschen).toEqual(['i1', 'i2', 'i3']);
  });
});

describe('abwesenheitenJePerson', () => {
  it('laufend, kommend und vergangen je Person; „kann nicht“ und Fremde fehlen', () => {
    const liste = [abw('ben', '2027-03-02'), abw('ben', '2027-03-03'), abw('ben', '2027-03-10', 'sonstiges', 'Fortbildung'), abw('lea', '2027-02-20', 'krank'),
      abw('anna', '2027-03-03', 'verhindert'), abw('fremd', '2027-03-03')];
    const p = abwesenheitenJePerson(liste, team, '2027-03-03');
    expect(p.map((x) => x.name)).toEqual(['Lea Leitner', 'Ben Baum']);
    expect(p[1]!.laufend.map((b) => [b.von, b.bis])).toEqual([['2027-03-02', '2027-03-03']]);
    expect(p[1]!.kommend.map((b) => [b.von, b.notiz])).toEqual([['2027-03-10', 'Fortbildung']]);
    expect(p[0]!.vergangen).toHaveLength(1);
  });
});

describe('freiePersonen und ersatzGesucht', () => {
  const oeffnung = [{ wochentag: 1, von: '15:00', bis: '19:00' }, { wochentag: 3, von: '15:00', bis: '19:00' }];
  const karten = tageskarten(['2027-03-01', '2027-03-03'], oeffnung, [
    dienst({ id: 'a', datum: '2027-03-01', personen: ['ben', 'anna'] }),
    dienst({ id: 'b', datum: '2027-03-03', personen: ['lea'], wuensche: [{ person_id: 'carla', status: 'offen' }] }),
  ]);
  it('frei sind nicht Eingeteilte ohne Abwesenheit; Wunsch zuerst, über den Höchststunden hinten', () => {
    const k = freiePersonen(karten[1]!, karten, team, [abw('anna', '2027-03-03', 'verhindert')]);
    expect(k.map((x) => [x.person_id, x.wunsch, x.ueberMax])).toEqual([['carla', true, false], ['ben', false, true]]);
    expect(k[1]).toMatchObject({ stunden: 4, max: 6 });
  });
  it('Ersatz gesucht: Öffnungstag ab heute unter der Mindestbesetzung', () => {
    expect(ersatzGesucht(karten[1]!, 2, '2027-03-02')).toBe(true);
    expect(ersatzGesucht(karten[1]!, 1, '2027-03-02')).toBe(false);
    expect(ersatzGesucht(karten[0]!, 3, '2027-03-02')).toBe(false);            // vergangen
  });
});
