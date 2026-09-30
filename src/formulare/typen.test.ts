import { describe, it, expect } from 'vitest';
import {
  BEISPIELE, beispieleAus, druckTitel, leer, neueAnwesenheitZeile, normalisiereFormular, statusWert, stundenSumme, tagEntfernen, tagHinzufuegen, TYPEN, typInfo,
} from './typen';

describe('Typen', () => {
  it('fünf Vordrucke; nur die Anwesenheitsliste (Kindernamen) wird nie gespeichert', () => {
    expect(TYPEN.map((t) => t.id)).toEqual(['anwesenheit', 'tagesbericht', 'unfallbericht', 'bescheinigung', 'stundenmeldung']);
    expect(TYPEN.filter((t) => t.nurLokal).map((t) => t.id)).toEqual(['anwesenheit']);
    expect(typInfo('bescheinigung').pdf).toBe('Bescheinigung_Abholen.pdf');
  });
  it('die Beispiele sind in sich stimmig: je Zeile so viele Felder wie Tage', () => {
    const a = BEISPIELE.anwesenheit;
    expect(a.rows.every((r) => r.status.length === a.days.length)).toBe(true);
  });
  it('leere Vordrucke sind wirklich leer', () => {
    expect(leer('tagesbericht')).toEqual({ freizeitGruppe: '', teamer: '', datum: '', bericht: '', fehlendeKinder: '', unterschrift: '' });
    expect(leer('bescheinigung').regelung).toBe('abgeholt');
    expect(leer('stundenmeldung').rows).toHaveLength(1);
    expect(leer('anwesenheit').rows[0]!.status).toHaveLength(leer('anwesenheit').days.length);
  });
  it('leere Vordrucke sind unabhängige Kopien', () => {
    leer('stundenmeldung').rows[0]!.datum = 'x';
    expect(leer('stundenmeldung').rows[0]!.datum).toBe('');
  });
});

describe('normalisiereFormular', () => {
  it('Unbrauchbares ergibt den leeren Vordruck', () => {
    for (const t of ['tagesbericht', 'unfallbericht', 'bescheinigung', 'stundenmeldung'] as const) {
      expect(normalisiereFormular(t, null)).toEqual(leer(t));
      expect(normalisiereFormular(t, 'kaputt')).toEqual(leer(t));
    }
    expect(normalisiereFormular('anwesenheit', 7)).toEqual(leer('anwesenheit'));
  });
  it('übernimmt Texte, verwirft falsche Typen', () => {
    const d = normalisiereFormular('tagesbericht', { freizeitGruppe: 'A', teamer: 5, datum: '2027-01-01', bericht: null });
    expect(d).toMatchObject({ freizeitGruppe: 'A', teamer: '', datum: '2027-01-01', bericht: '' });
  });
  it('Bescheinigung: nur „allein“ oder „abgeholt“', () => {
    expect(normalisiereFormular('bescheinigung', { regelung: 'allein' }).regelung).toBe('allein');
    expect(normalisiereFormular('bescheinigung', { regelung: 'egal' }).regelung).toBe('abgeholt');
  });
  it('Anwesenheit: Zeilen werden auf die Tageszahl gebracht', () => {
    const d = normalisiereFormular('anwesenheit', { days: ['1.7', '2.7', '3.7'], rows: [{ name: 'A', status: ['X'] }, { name: 'B', status: ['X', 'E', 'U', 'Z', 'Z'] }, 5] });
    expect(d.days).toHaveLength(3);
    expect(d.rows).toHaveLength(3);
    expect(d.rows[0]!.status).toEqual(['X', '', '']);
    expect(d.rows[1]!.status).toEqual(['X', 'E', 'U']);
    expect(d.rows[2]).toEqual({ name: '', status: ['', '', ''] });
  });
  it('Stundenmeldung: ohne Zeilen bleibt eine leere Zeile', () => {
    expect(normalisiereFormular('stundenmeldung', { rows: [] }).rows).toHaveLength(1);
    expect(normalisiereFormular('stundenmeldung', { rows: [{ datum: '1.7.', stunden: '4' }] }).rows[0]).toMatchObject({ datum: '1.7.', stunden: '4', vormittag: '' });
  });
  it('die Beispiele überstehen das Einlesen unverändert', () => {
    for (const t of ['anwesenheit', 'tagesbericht', 'unfallbericht', 'bescheinigung', 'stundenmeldung'] as const) {
      expect(normalisiereFormular(t, BEISPIELE[t])).toEqual(BEISPIELE[t]);
    }
  });
});

describe('beispieleAus', () => {
  it('ohne Gespeichertes gelten die eingebauten Beispiele (als Kopie)', () => {
    const b = beispieleAus(null);
    expect(b).toEqual(BEISPIELE);
    b.tagesbericht.teamer = 'x';
    expect(BEISPIELE.tagesbericht.teamer).toBe('Miriam Mustermann');
  });
  it('gespeicherte Typen ersetzen das Beispiel, fehlende bleiben', () => {
    const b = beispieleAus({ tagesbericht: { teamer: 'Neu' } });
    expect(b.tagesbericht.teamer).toBe('Neu');
    expect(b.tagesbericht.bericht).toBe('');
    expect(b.unfallbericht).toEqual(BEISPIELE.unfallbericht);
  });
});

describe('Stunden und Anwesenheit', () => {
  it('summiert mit Komma und Punkt', () => {
    expect(stundenSumme([{ stunden: '7,5' }, { stunden: '7.5' }, { stunden: '4' }])).toBe(19);
    expect(stundenSumme([{ stunden: 'abc' }, { stunden: '' }, { stunden: '0,1' }, { stunden: '0,2' }])).toBe(0.3);
    expect(stundenSumme([])).toBe(0);
  });
  it('Tagesspalten hinzufügen und entfernen halten die Zeilen passend', () => {
    const a = { massnahme: '', teamerGruppe: '', days: ['1', '2'], rows: [{ name: 'A', status: ['X', 'E'] }, neueAnwesenheitZeile(['1', '2'])] };
    const mehr = tagHinzufuegen(a);
    expect(mehr.days).toHaveLength(3);
    expect(mehr.rows.every((r) => r.status.length === 3)).toBe(true);
    const weniger = tagEntfernen(mehr, 0);
    expect(weniger.days).toEqual(['2', '']);
    expect(weniger.rows[0]!.status).toEqual(['E', '']);
    expect(tagEntfernen({ ...a, days: ['1'], rows: [{ name: 'A', status: ['X'] }] }, 0).days).toEqual(['1']);   // letzte Spalte bleibt
  });
  it('Status: groß, höchstens zwei Zeichen', () => {
    expect(statusWert(' e ')).toBe('E');
    expect(statusWert('xyz')).toBe('XY');
    expect(statusWert('')).toBe('');
  });
  it('Druck-Titel mit Datum, sonst ohne', () => {
    expect(druckTitel('tagesbericht', { ...leer('tagesbericht'), datum: '2027-08-15' })).toBe('Tagesbericht_2027-08-15');
    expect(druckTitel('bescheinigung', leer('bescheinigung'))).toBe('Bescheinigung-Abholen');
    expect(druckTitel('anwesenheit', leer('anwesenheit'))).toBe('Anwesenheitsliste');
  });
});
