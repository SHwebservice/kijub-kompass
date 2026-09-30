import { describe, it, expect } from 'vitest';
import {
  darfInTreff, leereTage, oeffnungszeitenAusTagen, oeffnungszeitText, sortiereTreffTeam, stunden, tageAusOeffnungszeiten, validiereTreff,
  wochentagKuerzel, wochentagName,
} from './logik';
import { berechneRollen, rolleInTreff } from '../lib/rollen';

describe('Wochentage', () => {
  it('benennt ISO-Tage', () => {
    expect(wochentagName(1)).toBe('Montag');
    expect(wochentagName(7)).toBe('Sonntag');
    expect(wochentagKuerzel(3)).toBe('Mi');
  });
});

describe('Öffnungszeiten', () => {
  it('wandelt zwischen Liste und Formular und zurück', () => {
    const t = tageAusOeffnungszeiten([{ wochentag: 3, von: '14:00:00', bis: '18:30:00' }, { wochentag: 5, von: '15:00', bis: '19:00' }]);
    expect(t[3]).toEqual({ an: true, von: '14:00', bis: '18:30' });
    expect(t[1]!.an).toBe(false);
    expect(oeffnungszeitenAusTagen(t)).toEqual([
      { wochentag: 3, von: '14:00', bis: '18:30' }, { wochentag: 5, von: '15:00', bis: '19:00' },
    ]);
  });
  it('formatiert den Text', () => expect(oeffnungszeitText({ von: '15:00:00', bis: '19:00:00' })).toBe('15:00–19:00 Uhr'));
});

describe('stunden', () => {
  it('rechnet Stunden', () => {
    expect(stunden('15:00', '19:00')).toBe(4);
    expect(stunden('14:00', '17:30')).toBe(3.5);
    expect(stunden('14:00:00', '15:20:00')).toBe(1.33);
  });
  it('gibt bei ungültig oder umgekehrt 0', () => {
    expect(stunden('19:00', '15:00')).toBe(0);
    expect(stunden('x', '15:00')).toBe(0);
  });
});

describe('validiereTreff', () => {
  const basis = { name: 'Treff Nord', ort_id: '', adresse_abw: '', tage: leereTage() };
  it('verlangt einen Namen', () => expect(validiereTreff({ ...basis, name: ' ' }).name).toBeDefined());
  it('ist ohne Öffnungstage in Ordnung', () => expect(validiereTreff(basis)).toEqual({}));
  it('prüft die Zeiten offener Tage', () => {
    const t = leereTage();
    t[2] = { an: true, von: '19:00', bis: '15:00' };
    expect(validiereTreff({ ...basis, tage: t }).tage).toMatch(/Dienstag/);
    t[2] = { an: true, von: '15:00', bis: '19:00' };
    expect(validiereTreff({ ...basis, tage: t })).toEqual({});
  });
  it('ignoriert die Zeiten geschlossener Tage', () => {
    const t = leereTage();
    t[2] = { an: false, von: 'kaputt', bis: '' };
    expect(validiereTreff({ ...basis, tage: t })).toEqual({});
  });
});

describe('Team', () => {
  it('sortiert Treffleitung zuerst, dann alphabetisch', () => {
    const l = sortiereTreffTeam([
      { rolle: 'betreuerin' as const, vorname: 'Zoe', nachname: 'Adler' },
      { rolle: 'treffleitung' as const, vorname: 'Tim', nachname: 'Wolf' },
      { rolle: 'betreuerin' as const, vorname: 'Ben', nachname: 'Adler' },
    ]);
    expect(l.map((m) => m.vorname)).toEqual(['Tim', 'Ben', 'Zoe']);
  });
  it('kennt die zulässigen Kategorien', () => {
    expect(darfInTreff('TZK')).toBe(true);
    expect(darfInTreff('TeamerIn')).toBe(false);
  });
});

describe('rolleInTreff', () => {
  const ich = { id: 'i', vorname: 'A', nachname: 'B', mail: 'a@b.de', kategorie: 'TZK' as const, ist_koordination: false };
  const r = berechneRollen(ich, [], [{ treff_id: 't1', rolle: 'treffleitung' }, { treff_id: 't2', rolle: 'betreuerin' }]);
  it('unterscheidet die Rollen', () => {
    expect(rolleInTreff(r, 't1')).toBe('treffleitung');
    expect(rolleInTreff(r, 't2')).toBe('betreuerin');
    expect(rolleInTreff(r, 't3')).toBe('gast');
  });
  it('Koordination gilt überall', () => {
    expect(rolleInTreff(berechneRollen({ ...ich, ist_koordination: true }, [], []), 'x')).toBe('koordination');
  });
});
