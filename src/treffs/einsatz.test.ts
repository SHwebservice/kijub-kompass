import { describe, it, expect } from 'vitest';
import { baueEinsatz } from './einsatz';
import { tageskarten, type Abwesenheit, type Dienst, type Feiertag } from './dienstplan';

const mitglieder = [
  { person_id: 'ben', vorname: 'Ben', nachname: 'Baum', rolle: 'betreuerin' as const },
  { person_id: 'lea', vorname: 'Lea', nachname: 'Leitner', rolle: 'treffleitung' as const },
  { person_id: 'anna', vorname: 'Anna', nachname: 'Adler', rolle: 'betreuerin' as const },
];
// 2027-03-01 Mo, 03.03. Mi, 08.03. Mo, 10.03. Mi
const oeffnung = [{ wochentag: 1, von: '15:00', bis: '19:00' }, { wochentag: 3, von: '14:00', bis: '18:00' }];
const dienst = (o: Partial<Dienst> & { id: string; datum: string }): Dienst => ({ von: '15:00', bis: '19:00', ist_sonder: false, bezeichnung: null, personen: [], wuensche: [], ...o });
const tage = ['2027-03-01', '2027-03-02', '2027-03-03', '2027-03-08'];
const heute = '2027-03-02';

const bau = (dienste: Dienst[], extra: { abw?: Abwesenheit[]; feiertage?: Feiertag[]; wuensche?: boolean } = {}) =>
  baueEinsatz(tageskarten(tage, oeffnung, dienste), mitglieder, extra.abw ?? [], extra.feiertage ?? [], 't1', heute, extra.wuensche);

describe('baueEinsatz: Spalten', () => {
  it('eine Spalte je Öffnungstag (Tage ohne Dienst und Öffnung fehlen) mit Wochentag, Tag und Heute-Marke', () => {
    const { spalten } = bau([]);
    expect(spalten.map((s) => [s.datum, s.wochentag, s.tag, s.heute])).toEqual([['2027-03-01', 'Mo', 1, false], ['2027-03-03', 'Mi', 3, false], ['2027-03-08', 'Mo', 8, false]]);
  });

  it('Besetzung zählt verschiedene Personen aus regulärem Dienst und Sonderdiensten', () => {
    const { spalten } = bau([
      dienst({ id: 'a', datum: '2027-03-01', personen: ['ben', 'lea'] }),
      dienst({ id: 's', datum: '2027-03-01', ist_sonder: true, bezeichnung: 'Fest', personen: ['lea', 'anna'] }),
    ]);
    expect(spalten[0]!.besetzung).toBe(3);
  });

  it('unbesetzt: Öffnungstag heute oder später ohne jemanden – nicht in der Vergangenheit und nicht am Feiertag', () => {
    const { spalten } = bau([], { feiertage: [{ id: 'f', treff_id: null, datum: '2027-03-08', bezeichnung: 'Feiertag' }] });
    expect(spalten.map((s) => s.unbesetzt)).toEqual([false, true, false]);       // 01.03. vergangen, 03.03. offen, 08.03. Feiertag
    expect(spalten[2]!.feiertag).toBe('Feiertag');
  });

  it('besetzte Tage sind nicht unbesetzt', () => {
    const { spalten } = bau([dienst({ id: 'a', datum: '2027-03-03', personen: ['ben'] })]);
    expect(spalten[1]!.unbesetzt).toBe(false);
  });
});

describe('baueEinsatz: Zeilen', () => {
  it('Treffleitung zuerst, dann nach Nachname; Name als „Vorname Nachname“', () => {
    const { zeilen } = bau([]);
    expect(zeilen.map((z) => [z.name, z.leitung])).toEqual([['Lea Leitner', true], ['Anna Adler', false], ['Ben Baum', false]]);
  });

  it('Dienst, Sonderdienst, Abwesenheit je Tag und Zahl der Einsatztage', () => {
    const { zeilen } = bau(
      [dienst({ id: 'a', datum: '2027-03-01', personen: ['ben'] }), dienst({ id: 'b', datum: '2027-03-03', personen: ['ben', 'lea'] }),
        dienst({ id: 's', datum: '2027-03-03', ist_sonder: true, bezeichnung: 'Kinoabend', personen: ['ben'] })],
      { abw: [{ id: 'x', person_id: 'anna', datum: '2027-03-08', typ: 'urlaub', notiz: null }, { id: 'y', person_id: 'ben', datum: '2027-03-08', typ: 'krank', notiz: null }] },
    );
    const ben = zeilen.find((z) => z.person_id === 'ben')!;
    expect(ben.zellen.map((c) => c.dienst)).toEqual([true, true, false]);
    expect(ben.zellen[1]!.sonder).toEqual(['Kinoabend']);
    expect(ben.zellen.map((c) => c.abwesend)).toEqual([null, null, 'krank']);
    expect(ben.tage).toBe(2);                                                           // zwei Tage, der Sonderdienst fällt auf einen davon
    expect(zeilen.find((z) => z.person_id === 'anna')!.zellen[2]!.abwesend).toBe('urlaub');
    expect(zeilen.find((z) => z.person_id === 'lea')!.tage).toBe(1);
  });

  it('Sonderdienst an einem Schließtag bekommt eine eigene Spalte', () => {
    const { spalten, zeilen } = bau([dienst({ id: 's', datum: '2027-03-02', ist_sonder: true, bezeichnung: 'Putztag', personen: ['anna'] })]);
    expect(spalten.map((s) => s.datum)).toEqual(['2027-03-01', '2027-03-02', '2027-03-03', '2027-03-08']);
    expect(zeilen.find((z) => z.person_id === 'anna')!.zellen[1]!.sonder).toEqual(['Putztag']);
  });

  it('Wünsche nur, wenn danach gefragt wird; nur offene', () => {
    const d = dienst({ id: 'a', datum: '2027-03-01', wuensche: [{ person_id: 'ben', status: 'offen' }, { person_id: 'anna', status: 'abgelehnt' }] });
    expect(bau([d], { wuensche: true }).zeilen.find((z) => z.person_id === 'ben')!.zellen[0]!.wunsch).toBe(true);
    expect(bau([d], { wuensche: true }).zeilen.find((z) => z.person_id === 'anna')!.zellen[0]!.wunsch).toBe(false);
    expect(bau([d]).zeilen.find((z) => z.person_id === 'ben')!.zellen[0]!.wunsch).toBe(false);
  });
});
