import { describe, it, expect } from 'vitest';
import { leeresFormular, validiereFreizeit, formularAusDetail } from './formular';
import type { FreizeitDetailDaten } from './api';

const gueltig = () => ({ ...leeresFormular(), name: 'Sommer 1', start_datum: '2027-07-05', ende_datum: '2027-07-09' });

describe('validiereFreizeit', () => {
  it('Minimalangaben (Name, Start, Ende) genügen', () => {
    expect(validiereFreizeit(gueltig())).toEqual({});
  });
  it('Pflichtfelder', () => {
    const e = validiereFreizeit(leeresFormular());
    expect(Object.keys(e).sort()).toEqual(['ende_datum', 'name', 'start_datum']);
    expect(validiereFreizeit({ ...gueltig(), name: '   ' }).name).toBeDefined();
  });
  it('Ende vor Start und zu lange Dauer', () => {
    expect(validiereFreizeit({ ...gueltig(), ende_datum: '2027-07-04' }).ende_datum).toMatch(/nicht vor dem Start/);
    expect(validiereFreizeit({ ...gueltig(), ende_datum: '2027-07-05' })).toEqual({});
    expect(validiereFreizeit({ ...gueltig(), ende_datum: '2027-12-31' }).ende_datum).toMatch(/höchstens 61 Tage/);
  });
  it('Ferienwoche nur mit Ferienzeit und im erlaubten Bereich', () => {
    expect(validiereFreizeit({ ...gueltig(), ferienwoche: 2 }).ferienwoche).toMatch(/zuerst die Ferienzeit/);
    expect(validiereFreizeit({ ...gueltig(), ferienzeitraum: 'ostern', ferienwoche: 3 }).ferienwoche).toMatch(/Wochen 1 bis 2/);
    expect(validiereFreizeit({ ...gueltig(), ferienzeitraum: 'sommer', ferienwoche: 6 })).toEqual({});
    expect(validiereFreizeit({ ...gueltig(), ferienzeitraum: 'sommer', ferienwoche: 7 }).ferienwoche).toMatch(/Wochen 1 bis 6/);
    expect(validiereFreizeit({ ...gueltig(), ferienzeitraum: 'sommer', ferienwoche: 0 }).ferienwoche).toBeDefined();
  });
  it('Alter, Teilnehmende, Arbeitszeit', () => {
    expect(validiereFreizeit({ ...gueltig(), alter_von: 10, alter_bis: 6 }).alter_bis).toBeDefined();
    expect(validiereFreizeit({ ...gueltig(), alter_von: 6, alter_bis: 6 })).toEqual({});
    expect(validiereFreizeit({ ...gueltig(), alter_von: -1 }).alter_von).toBeDefined();
    expect(validiereFreizeit({ ...gueltig(), max_teilnehmende: 0 }).max_teilnehmende).toBeDefined();
    expect(validiereFreizeit({ ...gueltig(), arbeitsbeginn: '17:00', arbeitsende: '07:30' }).arbeitsende).toBeDefined();
    expect(validiereFreizeit({ ...gueltig(), arbeitsbeginn: '07:30', arbeitsende: '17:00' })).toEqual({});
    expect(validiereFreizeit({ ...gueltig(), arbeitsbeginn: '07:30' })).toEqual({});
  });
});

describe('formularAusDetail', () => {
  it('übernimmt Werte und macht aus null leere Felder', () => {
    const d = {
      id: 'x', name: 'A', status: 'abgesagt', ferienzeitraum: 'sommer', ferienwoche: 2, start_datum: '2027-07-05', ende_datum: '2027-07-09',
      ort_id: 'o1', ort_name: 'Au', max_teilnehmende: null, alter_von: 6, alter_bis: null, tags: ['Küche'], farbe: null, bewerbung_offen: false,
      arbeitsbeginn: '07:30', arbeitsende: null, adresse_abw: null, ort_adresse: null, kijuko_entfallen_am: null,
    } satisfies FreizeitDetailDaten;
    expect(formularAusDetail(d)).toEqual({
      name: 'A', status: 'abgesagt', ferienzeitraum: 'sommer', ferienwoche: 2, start_datum: '2027-07-05', ende_datum: '2027-07-09',
      arbeitsbeginn: '07:30', arbeitsende: '', alter_von: 6, alter_bis: '', max_teilnehmende: '', ort_id: 'o1', tags: ['Küche'], farbe: '', bewerbung_offen: false,
    });
    expect(formularAusDetail({ ...d, farbe: 'petrol' }).farbe).toBe('petrol');
  });
});
