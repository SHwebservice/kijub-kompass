import { describe, it, expect } from 'vitest';
import {
  darfEigenenNachweisFuehren, darfEinreichen, darfFreigabeAufheben, darfFreigeben, darfNachweisLoeschen, darfZeilenBearbeiten, darfZurueckgeben, dateiname,
  parseZeiten, sortiereZeilen, stundenWert, summe, validiereZeile, type NachweisZeile,
} from './nachweis';

const z = (o: Partial<NachweisZeile> & { id: string; datum: string }): NachweisZeile => ({ zeiten: null, stunden: null, quelle: 'manuell', ...o });

describe('parseZeiten', () => {
  it('liest verschiedene Schreibweisen', () => {
    expect(parseZeiten('14:00 - 17:30')).toEqual({ von: '14:00', bis: '17:30', stunden: 3.5 });
    expect(parseZeiten('9:00–12:00')).toEqual({ von: '09:00', bis: '12:00', stunden: 3 });
    expect(parseZeiten('15:00 bis 19:00 Uhr')).toEqual({ von: '15:00', bis: '19:00', stunden: 4 });
    expect(parseZeiten('14:00 - 18:00 (Feiertag: Fronleichnam)')?.stunden).toBe(4);
  });
  it('gibt null, wenn keine gültige Zeit erkennbar ist', () => {
    expect(parseZeiten('Urlaub')).toBeNull();
    expect(parseZeiten('')).toBeNull();
    expect(parseZeiten('19:00 - 15:00')).toBeNull();
    expect(parseZeiten('25:00 - 26:00')).toBeNull();
  });
});

describe('Zeilen', () => {
  it('sortiert nach Tag, dann Dienst, manuell, Abwesenheit', () => {
    const s = sortiereZeilen([
      z({ id: 'a', datum: '2027-07-07', quelle: 'abwesenheit' }), z({ id: 'b', datum: '2027-07-05', quelle: 'manuell' }),
      z({ id: 'c', datum: '2027-07-07', quelle: 'dienst' }), z({ id: 'd', datum: '2027-07-05', quelle: 'dienst' }),
    ]);
    expect(s.map((x) => x.id)).toEqual(['d', 'b', 'c', 'a']);
  });
  it('summiert ohne Rundungsfehler und ignoriert leere Stunden', () => {
    expect(summe([{ stunden: 0.1 }, { stunden: 0.2 }, { stunden: null }, { stunden: 3.5 }])).toBe(3.8);
    expect(summe([])).toBe(0);
  });
  it('wandelt Stundeneingaben', () => {
    expect(stundenWert('3,5')).toBe(3.5);
    expect(stundenWert('4')).toBe(4);
    expect(stundenWert(' ')).toBeNull();
  });
});

describe('validiereZeile', () => {
  it('verlangt einen Tag im Monat und sinnvolle Stunden', () => {
    expect(validiereZeile({ datum: '2027-07-05', zeiten: '', stunden: '3,5' }, '2027-07-01')).toEqual({});
    expect(validiereZeile({ datum: '', zeiten: '', stunden: '' }, '2027-07-01').datum).toBeDefined();
    expect(validiereZeile({ datum: '2027-08-01', zeiten: '', stunden: '' }, '2027-07-01').datum).toMatch(/nicht in diesem Monat/);
    expect(validiereZeile({ datum: '2027-07-05', zeiten: '', stunden: '25' }, '2027-07-01').stunden).toBeDefined();
    expect(validiereZeile({ datum: '2027-07-05', zeiten: '', stunden: '-1' }, '2027-07-01').stunden).toBeDefined();
    expect(validiereZeile({ datum: '2027-07-05', zeiten: '', stunden: 'abc' }, '2027-07-01').stunden).toBeDefined();
  });
});

describe('dateiname', () => {
  it('baut JJ_MM_Nachname_Vorname', () => {
    expect(dateiname('2027-07-01', 'Anna', 'Adler')).toBe('27_07_Adler_Anna');
    expect(dateiname('2027-12-01', 'Anna Lena', 'von Müller')).toBe('27_12_von-Müller_Anna-Lena');
    expect(dateiname('2027-01-01', 'Jo', "O'Brien/Test")).toBe('27_01_OBrienTest_Jo');
  });
});

describe('Rechte in der Oberfläche', () => {
  it('nur TZK im Treff führen einen eigenen Nachweis', () => {
    expect(darfEigenenNachweisFuehren('TZK', 'betreuerin')).toBe(true);
    expect(darfEigenenNachweisFuehren('TZK', 'treffleitung')).toBe(true);
    expect(darfEigenenNachweisFuehren('FSJ', 'betreuerin')).toBe(false);
    expect(darfEigenenNachweisFuehren('TZK', 'koordination')).toBe(false);
    expect(darfEigenenNachweisFuehren('TZK', 'gast')).toBe(false);
  });
  it('Zeilen bearbeiten: Person nur im Entwurf, Leitung bis zur Freigabe, danach niemand', () => {
    expect(darfZeilenBearbeiten('entwurf', 'betreuerin', true)).toBe(true);
    expect(darfZeilenBearbeiten('eingereicht', 'betreuerin', true)).toBe(false);
    expect(darfZeilenBearbeiten('entwurf', 'betreuerin', false)).toBe(false);
    expect(darfZeilenBearbeiten('eingereicht', 'treffleitung', false)).toBe(true);
    expect(darfZeilenBearbeiten('entwurf', 'koordination', false)).toBe(true);
    expect(darfZeilenBearbeiten('freigegeben', 'koordination', false)).toBe(false);
    expect(darfZeilenBearbeiten('freigegeben', 'betreuerin', true)).toBe(false);
  });
  it('Einreichen nur der Eigentümer im Entwurf; Freigeben und Zurückgeben nur Leitung bei Eingereichtem', () => {
    expect(darfEinreichen('entwurf', true)).toBe(true);
    expect(darfEinreichen('entwurf', false)).toBe(false);
    expect(darfEinreichen('eingereicht', true)).toBe(false);
    expect(darfFreigeben('eingereicht', 'treffleitung')).toBe(true);
    expect(darfFreigeben('eingereicht', 'betreuerin')).toBe(false);
    expect(darfFreigeben('entwurf', 'treffleitung')).toBe(false);
    expect(darfZurueckgeben('eingereicht', 'koordination')).toBe(true);
    expect(darfZurueckgeben('freigegeben', 'koordination')).toBe(false);
    expect(darfFreigabeAufheben('freigegeben', 'treffleitung')).toBe(true);
    expect(darfFreigabeAufheben('freigegeben', 'betreuerin')).toBe(false);
  });
  it('Löschen: Person den Entwurf, Koordination alles', () => {
    expect(darfNachweisLoeschen('entwurf', 'betreuerin', true)).toBe(true);
    expect(darfNachweisLoeschen('eingereicht', 'betreuerin', true)).toBe(false);
    expect(darfNachweisLoeschen('freigegeben', 'koordination', false)).toBe(true);
    expect(darfNachweisLoeschen('entwurf', 'treffleitung', false)).toBe(false);
  });
});
