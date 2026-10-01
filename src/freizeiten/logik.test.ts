import { describe, it, expect } from 'vitest';
import {
  tageVonBis, tageZwischen, wochentagKurz, wochentagLang, formatDatum, formatKurz, zeitraumText, ferienText, phase,
  gruppiereNachFerien, darfBeworbenWerden, fruehesterBewerbungsstart, bestand, hochrechnung, sortiereTeam, heuteIso,
  tageBisStart, freizeitFarbe, formatTagLang, type FreizeitKurz,
} from './logik';

const fz = (o: Partial<FreizeitKurz> & { id: string }): FreizeitKurz => ({
  name: o.id, start_datum: '2027-07-05', ende_datum: '2027-07-09', status: 'geplant', ferienzeitraum: null, ferienwoche: null, ...o,
});

describe('Datum', () => {
  it('tageVonBis: einschließlich, über Monats- und Jahreswechsel, Schaltjahr', () => {
    expect(tageVonBis('2027-07-05', '2027-07-09')).toEqual(['2027-07-05', '2027-07-06', '2027-07-07', '2027-07-08', '2027-07-09']);
    expect(tageVonBis('2027-07-30', '2027-08-02')).toEqual(['2027-07-30', '2027-07-31', '2027-08-01', '2027-08-02']);
    expect(tageVonBis('2027-12-30', '2028-01-01')).toHaveLength(3);
    expect(tageVonBis('2028-02-28', '2028-03-01')).toEqual(['2028-02-28', '2028-02-29', '2028-03-01']);
    expect(tageVonBis('2027-07-05', '2027-07-05')).toEqual(['2027-07-05']);
    expect(tageVonBis('2027-07-09', '2027-07-05')).toEqual([]);
  });
  it('Sommerzeitwechsel verändert die Tageszahl nicht', () => {
    expect(tageZwischen('2027-03-27', '2027-03-29')).toBe(2);
    expect(tageZwischen('2027-10-30', '2027-11-01')).toBe(2);
  });
  it('Wochentage und Formate', () => {
    expect(wochentagKurz('2027-07-05')).toBe('Mo');
    expect(wochentagLang('2027-07-11')).toBe('Sonntag');
    expect(formatDatum('2027-07-05')).toBe('05.07.2027');
    expect(formatKurz('2027-07-05')).toBe('Mo 05.07.');
    expect(zeitraumText('2027-07-05', '2027-07-09')).toBe('05.07.2027 – 09.07.2027');
    expect(zeitraumText('2027-07-05', '2027-07-05')).toBe('05.07.2027');
  });
  it('heuteIso nutzt das lokale Datum', () => {
    expect(heuteIso(new Date(2027, 0, 5, 23, 59))).toBe('2027-01-05');
    expect(heuteIso(new Date(2027, 11, 31, 0, 0))).toBe('2027-12-31');
  });
});

describe('Ferien und Phasen', () => {
  it('ferienText', () => {
    expect(ferienText({ ferienzeitraum: 'sommer', ferienwoche: 3 })).toBe('Sommer · Woche 3');
    expect(ferienText({ ferienzeitraum: 'ostern', ferienwoche: null })).toBe('Ostern');
    expect(ferienText({ ferienzeitraum: null, ferienwoche: null })).toBe('');
  });
  it('phase: kommend, laufend (inkl. Start- und Endtag), vergangen', () => {
    const f = { start_datum: '2027-07-05', ende_datum: '2027-07-09' };
    expect(phase(f, '2027-07-04')).toBe('kommend');
    expect(phase(f, '2027-07-05')).toBe('laufend');
    expect(phase(f, '2027-07-09')).toBe('laufend');
    expect(phase(f, '2027-07-10')).toBe('vergangen');
    expect(tageBisStart(f, '2027-07-01')).toBe(4);
    expect(tageBisStart(f, '2027-07-07')).toBe(-2);
  });
  it('gruppiereNachFerien: Reihenfolge Ostern, Sommer, Herbst, Weitere; Sortierung nach Start; leere Gruppen fallen weg', () => {
    const g = gruppiereNachFerien([
      fz({ id: 'b', ferienzeitraum: 'sommer', start_datum: '2027-07-12' }),
      fz({ id: 'a', ferienzeitraum: 'sommer', start_datum: '2027-07-05' }),
      fz({ id: 'h', ferienzeitraum: 'herbst', start_datum: '2027-10-11' }),
      fz({ id: 'x', start_datum: '2027-01-01' }),
    ]);
    expect(g.map((x) => x.schluessel)).toEqual(['sommer', 'herbst', 'sonstige']);
    expect(g[0]!.eintraege.map((x) => x.id)).toEqual(['a', 'b']);
    expect(gruppiereNachFerien([])).toEqual([]);
  });
  it('Bewerbungsfrist: Vorlauf, abgesagte Freizeiten nie', () => {
    expect(fruehesterBewerbungsstart('2027-06-28', 7)).toBe('2027-07-05');
    expect(darfBeworbenWerden(fz({ id: 'a', start_datum: '2027-07-05' }), '2027-06-28', 7)).toBe(true);
    expect(darfBeworbenWerden(fz({ id: 'a', start_datum: '2027-07-04' }), '2027-06-28', 7)).toBe(false);
    expect(darfBeworbenWerden(fz({ id: 'a', start_datum: '2027-08-01', status: 'abgesagt' }), '2027-06-28', 7)).toBe(false);
  });
  it('freizeitFarbe ist stabil', () => {
    expect(freizeitFarbe('abc')).toBe(freizeitFarbe('abc'));
    expect(freizeitFarbe('abc')).not.toBe(freizeitFarbe('abd'));
    expect(freizeitFarbe('abc')).toMatch(/^hsl\(\d+ 55% 45%\)$/);
  });
});

describe('Lebensmittel', () => {
  it('Bestand: ok, knapp (≤ 25 %), leer (≤ 0), Prozent begrenzt', () => {
    expect(bestand(100, 0)).toEqual({ rest: 100, status: 'ok', prozent: 100 });
    expect(bestand(100, 74)).toMatchObject({ rest: 26, status: 'ok' });
    expect(bestand(100, 75)).toMatchObject({ rest: 25, status: 'knapp', prozent: 25 });
    expect(bestand(100, 100)).toMatchObject({ rest: 0, status: 'leer', prozent: 0 });
    expect(bestand(100, 120)).toMatchObject({ rest: -20, status: 'leer', prozent: 0 });
    expect(bestand(0, 0)).toMatchObject({ status: 'leer', prozent: 0 });
  });
  it('Bestand rundet Kommafehler weg', () => {
    expect(bestand(0.3, 0.1).rest).toBe(0.2);
  });
  const tage = tageVonBis('2027-07-05', '2027-07-09');
  it('Hochrechnung: Durchschnitt pro vergangenem Tag × Resttage', () => {
    const h = hochrechnung([{ datum: '2027-07-05', menge: 10 }, { datum: '2027-07-06', menge: 20 }], tage, 40);
    expect(h).toEqual({ bedarf: 45, resttage: 3, reicht: false });
    expect(hochrechnung([{ datum: '2027-07-05', menge: 10 }], tage, 100)).toEqual({ bedarf: 40, resttage: 4, reicht: true });
  });
  it('Hochrechnung: Tage ohne Verbrauch zwischen zwei Verbrauchstagen zählen mit', () => {
    const h = hochrechnung([{ datum: '2027-07-05', menge: 12 }, { datum: '2027-07-07', menge: 12 }], tage, 10);
    expect(h).toEqual({ bedarf: 16, resttage: 2, reicht: false });
  });
  it('Hochrechnung: nichts zu berechnen ohne Verbrauch oder ohne Resttage', () => {
    expect(hochrechnung([], tage, 10)).toBeNull();
    expect(hochrechnung([{ datum: '2027-07-09', menge: 5 }], tage, 10)).toBeNull();
    expect(hochrechnung([{ datum: '2027-07-05', menge: 0 }], tage, 10)).toBeNull();
    expect(hochrechnung([{ datum: '2027-07-05', menge: 5 }], [], 10)).toBeNull();
  });
});

describe('Team', () => {
  it('Leitung zuerst, dann Nachname', () => {
    const s = sortiereTeam([
      { rolle: 'teamer', nachname: 'Adler', vorname: 'A' },
      { rolle: 'leitung', nachname: 'Zorn', vorname: 'Z' },
      { rolle: 'teamer', nachname: 'Ärmel', vorname: 'B' },
      { rolle: 'leitung', nachname: 'Berg', vorname: 'B' },
    ]);
    expect(s.map((x) => x.nachname)).toEqual(['Berg', 'Zorn', 'Adler', 'Ärmel']);
  });
});

describe('formatTagLang', () => {
  it('Wochentag, Tag ohne führende Null und ausgeschriebener Monat', () => {
    expect(formatTagLang('2027-07-05')).toBe('Mo., 5. Juli');
    expect(formatTagLang('2026-10-01')).toBe('Do., 1. Oktober');
    expect(formatTagLang('2027-12-31')).toBe('Fr., 31. Dezember');
  });
});
