import { describe, it, expect } from 'vitest';
import {
  erfuellt, faelligRelativ, gruppeVon, standJeFreizeit, standVon, terminAusEingabe, terminText, themenAusText, validiereEigenen, validiereVorlage, vorlageFaelligText,
  zuTun, type Punkt,
} from './logik';

const HEUTE = '2027-06-10';
const p = (o: Partial<Punkt>): Punkt => ({
  freizeit_id: 'f1', art: 'vorlage', id: Math.random().toString(36), titel: 'x', beschreibung: '', faellig: null, ziel: null, automatik: null,
  auto_erfuellt: false, status: 'offen', notiz: '', geaendert_von: null, geaendert_am: null, ...o,
});

describe('Checkliste: erfüllt und zu tun', () => {
  it('abgehakt oder automatisch erkannt ist erfüllt; „nicht relevant“ schaltet die Automatik ab', () => {
    expect(erfuellt(p({ status: 'erledigt' }))).toBe(true);
    expect(erfuellt(p({ auto_erfuellt: true }))).toBe(true);
    expect(erfuellt(p({ status: 'nicht_relevant', auto_erfuellt: true }))).toBe(false);
    expect(zuTun(p({}))).toBe(true);
    expect(zuTun(p({ status: 'nicht_relevant' }))).toBe(false);
  });

  it('Gruppen: überfällig, in 7 Tagen, später (auch ohne Datum), fertig', () => {
    expect(gruppeVon(p({ faellig: '2027-06-09' }), HEUTE)).toBe('ueberfaellig');
    expect(gruppeVon(p({ faellig: HEUTE }), HEUTE)).toBe('bald');
    expect(gruppeVon(p({ faellig: '2027-06-17' }), HEUTE)).toBe('bald');
    expect(gruppeVon(p({ faellig: '2027-06-18' }), HEUTE)).toBe('spaeter');
    expect(gruppeVon(p({ faellig: null }), HEUTE)).toBe('spaeter');
    expect(gruppeVon(p({ faellig: '2027-06-01', auto_erfuellt: true }), HEUTE)).toBe('fertig');
    expect(gruppeVon(p({ faellig: '2027-06-01', status: 'nicht_relevant' }), HEUTE)).toBe('fertig');
  });

  it('Stand: „nicht relevant“ zählt nicht mit; je Freizeit getrennt', () => {
    const l = [p({ status: 'erledigt' }), p({ auto_erfuellt: true }), p({ faellig: '2027-06-01' }), p({ faellig: '2027-06-12' }), p({ status: 'nicht_relevant' }), p({ freizeit_id: 'f2' })];
    expect(standVon(l.filter((x) => x.freizeit_id === 'f1'), HEUTE)).toEqual({ erledigt: 2, gesamt: 4, ueberfaellig: 1, bald: 1 });
    expect(standJeFreizeit(l, HEUTE).f2).toEqual({ erledigt: 0, gesamt: 1, ueberfaellig: 0, bald: 0 });
  });
});

describe('Checkliste: Texte und Prüfungen', () => {
  it('Fälligkeit relativ zu heute', () => {
    expect(faelligRelativ(HEUTE, HEUTE)).toBe('heute');
    expect(faelligRelativ('2027-06-11', HEUTE)).toBe('morgen');
    expect(faelligRelativ('2027-06-15', HEUTE)).toBe('in 5 Tagen');
    expect(faelligRelativ('2027-06-09', HEUTE)).toBe('seit gestern überfällig');
    expect(faelligRelativ('2027-06-07', HEUTE)).toBe('seit 3 Tagen überfällig');
  });

  it('Fälligkeit der Vorlage in Worten', () => {
    expect(vorlageFaelligText(-42, 'start')).toBe('6 Wochen vor Beginn');
    expect(vorlageFaelligText(-7, 'start')).toBe('1 Woche vor Beginn');
    expect(vorlageFaelligText(-3, 'start')).toBe('3 Tage vor Beginn');
    expect(vorlageFaelligText(1, 'ende')).toBe('1 Tag nach Ende');
    expect(vorlageFaelligText(0, 'start')).toBe('am ersten Tag');
    expect(vorlageFaelligText(0, 'ende')).toBe('am letzten Tag');
  });

  it('Vorlage und eigener Punkt brauchen einen Titel; Tage ganzzahlig im Jahr', () => {
    const v = { titel: 'Bus', beschreibung: '', bezug: 'start' as const, tage: -10 as number | '', ziel: '' as const, automatik: '' as const };
    expect(validiereVorlage(v)).toEqual({});
    expect(validiereVorlage({ ...v, titel: ' ' }).titel).toBeTruthy();
    expect(validiereVorlage({ ...v, tage: '' }).tage).toBeTruthy();
    expect(validiereVorlage({ ...v, tage: 400 }).tage).toBeTruthy();
    expect(validiereVorlage({ ...v, tage: 1.5 }).tage).toBeTruthy();
    expect(validiereEigenen({ titel: '', beschreibung: '', faellig_am: '' }).titel).toBeTruthy();
    expect(validiereEigenen({ titel: 'Kanus', beschreibung: '', faellig_am: '' })).toEqual({});
  });
});

describe('Checkliste: Termine, Ferienbeginn, Themen (0031)', () => {
  it('Fälligkeit relativ zum Ferienbeginn in Worten', () => {
    expect(vorlageFaelligText(-28, 'ferien')).toBe('4 Wochen vor Ferienbeginn');
    expect(vorlageFaelligText(0, 'ferien')).toBe('am ersten Ferientag');
  });

  it('Termin: Text in Ortszeit, Eingabe nur mit Datum und Uhrzeit', () => {
    const iso = terminAusEingabe('2027-07-22', '18:05')!;
    expect(iso).toBe(new Date('2027-07-22T18:05:00').toISOString());
    expect(terminText(iso)).toBe('Donnerstag, 22.07.2027, 18:05 Uhr');
    expect(terminAusEingabe('2027-07-22', '')).toBeNull();
    expect(terminAusEingabe('', '18:00')).toBeNull();
  });

  it('Themen aus dem Textfeld; Termin-Automatik braucht eine Termin-Art', () => {
    expect(themenAusText(' Mappe \n\n Allergien ')).toEqual(['Mappe', 'Allergien']);
    const v = { titel: 'Vortreffen', beschreibung: '', bezug: 'start' as const, tage: -10 as number | '', ziel: '' as const, automatik: 'termin' as const };
    expect(validiereVorlage(v).automatik).toBeTruthy();
    expect(validiereVorlage({ ...v, termin_art: 'hinweis' })).toEqual({});
    expect(validiereVorlage({ ...v, termin_art: 'hinweis', themen: Array.from({ length: 21 }, (_, i) => `T${i}`).join('\n') }).themen).toBeTruthy();
  });
});
