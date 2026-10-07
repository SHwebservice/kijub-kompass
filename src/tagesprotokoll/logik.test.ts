import { describe, it, expect } from 'vitest';
import {
  verlaufBeiTagwechsel, vorlageFuer, aendereAnzahl, anteil, auswertungNachMonat, csvFeld, csvProtokolle, eingabeAus, fehlendeTage, protokollFaellig, fuerMich, gesamt, hatFaelligkeit, hatZustaendig, imArchiv, istLeer,
  istUeberfaellig, leeresProtokoll, liesAnzahl, oeffnungstage, sortiereAufgaben, summeAuswertung, validiereAufgabe, validiereProtokoll, waehlbareTage, zaehleJeArt,
  ortszeit, type Aufgabe, type Protokoll,
} from './logik';

// 2027-03-01 ist ein Montag
const MO_MI = [{ wochentag: 1, von: '15:00', bis: '19:00' }, { wochentag: 3, von: '15:00', bis: '19:00' }];

const aufgabe = (o: Partial<Aufgabe> & { id: string }): Aufgabe => ({
  treff_id: 't', art: 'todo', text: 'X', antwort: null, faellig_am: null, zustaendig: null, protokoll_datum: null, erledigt: false, erledigt_von: null, erledigt_am: null,
  erstellt_von: null, created_at: '2027-03-01T10:00:00Z', ...o,
});

describe('Zahlen', () => {
  it('Gesamtzahl ist die Summe aus m, w und d', () => {
    expect(gesamt({ anz_m: 3, anz_w: 4, anz_d: 1 })).toBe(8);
    expect(gesamt(leeresProtokoll())).toBe(0);
  });
  it('+ und − bleiben zwischen 0 und 500', () => {
    expect(aendereAnzahl(0, -1)).toBe(0);
    expect(aendereAnzahl(5, 1)).toBe(6);
    expect(aendereAnzahl(500, 1)).toBe(500);
  });
  it('getippte Zahlen: leer = 0, ungültig = null', () => {
    expect(liesAnzahl('')).toBe(0);
    expect(liesAnzahl(' 12 ')).toBe(12);
    expect(liesAnzahl('-1')).toBeNull();
    expect(liesAnzahl('1,5')).toBeNull();
    expect(liesAnzahl('abc')).toBeNull();
    expect(liesAnzahl('12345')).toBeNull();
  });
  it('Prüfung: Zahlen und Textlängen', () => {
    expect(validiereProtokoll(leeresProtokoll())).toEqual({});
    expect(validiereProtokoll({ ...leeresProtokoll(), anz_m: 501 }).anzahl).toMatch(/0 bis 500/);
    expect(validiereProtokoll({ ...leeresProtokoll(), anz_w: -1 }).anzahl).toBeDefined();
    expect(validiereProtokoll({ ...leeresProtokoll(), anz_d: 1.5 }).anzahl).toBeDefined();
    expect(validiereProtokoll({ ...leeresProtokoll(), verlauf: 'x'.repeat(5001) }).verlauf).toBeDefined();
    expect(validiereProtokoll({ ...leeresProtokoll(), vorkommnisse: 'x'.repeat(5001) }).vorkommnisse).toBeDefined();
  });
  it('leer = keine Kinder und kein Text', () => {
    expect(istLeer(leeresProtokoll())).toBe(true);
    expect(istLeer({ ...leeresProtokoll(), verlauf: '  ' })).toBe(true);
    expect(istLeer({ ...leeresProtokoll(), anz_d: 1 })).toBe(false);
    expect(istLeer({ ...leeresProtokoll(), vorkommnisse: 'Streit' })).toBe(false);
  });
  it('eingabeAus übernimmt nur die bearbeitbaren Felder', () => {
    const p: Protokoll = { id: 'p', treff_id: 't', datum: '2027-03-01', anz_m: 1, anz_w: 2, anz_d: 3, verlauf: 'v', vorkommnisse: 'k', erstellt_von: 'a', bearbeitet_von: 'b', updated_at: '' };
    expect(eingabeAus(p)).toEqual({ anz_m: 1, anz_w: 2, anz_d: 3, verlauf: 'v', vorkommnisse: 'k' });
  });
});

describe('Öffnungstage und fehlende Protokolle', () => {
  it('Öffnungstage im Zeitraum, jüngster zuerst', () => {
    expect(oeffnungstage(MO_MI, '2027-03-01', '2027-03-10')).toEqual(['2027-03-10', '2027-03-08', '2027-03-03', '2027-03-01']);
    expect(oeffnungstage([], '2027-03-01', '2027-03-10')).toEqual([]);
  });
  it('fehlend: Öffnungstage der letzten 14 Tage ohne Protokoll, heute eingeschlossen', () => {
    const p = [{ datum: '2027-03-08' }];
    expect(fehlendeTage(MO_MI, p, '2027-03-10')).toEqual(['2027-03-10', '2027-03-03', '2027-03-01']);
  });
  it('fehlend: nur der Zeitraum zählt, Feiertage nicht', () => {
    expect(fehlendeTage(MO_MI, [], '2027-03-17', 14, ['2027-03-15'])).toEqual(['2027-03-17', '2027-03-10', '2027-03-08']);
    expect(fehlendeTage(MO_MI, [], '2027-03-17', 2)).toEqual(['2027-03-17']);
  });
  it('fällig: geöffnet heute und die Öffnungszeit hat begonnen', () => {
    expect(protokollFaellig(MO_MI, '2027-03-01', '15:00')).toBe(true);
    expect(protokollFaellig(MO_MI, '2027-03-01', '14:59')).toBe(false);
    expect(protokollFaellig(MO_MI, '2027-03-01', '23:30')).toBe(true);
    expect(protokollFaellig(MO_MI, '2027-03-02', '17:00')).toBe(false);          // Dienstag: geschlossen
    expect(protokollFaellig([], '2027-03-01', '17:00')).toBe(false);
  });
  it('wählbare Tage: heute zuerst, ohne schon protokollierte', () => {
    expect(waehlbareTage([{ datum: '2027-03-09' }], '2027-03-10', 4)).toEqual(['2027-03-10', '2027-03-08', '2027-03-07']);
  });
});

describe('Vorlagen je Wochentag', () => {
  // 2027-03-01 ist ein Montag, 2027-03-03 ein Mittwoch, 2027-03-02 ein Dienstag (ohne Vorlage)
  const vorlagen = [{ wochentag: 1, text: 'Montag: Hausaufgaben' }, { wochentag: 3, text: 'Mittwoch: Kochen' }];

  it('vorlageFuer: die Vorlage des Wochentags, sonst leer', () => {
    expect(vorlageFuer('2027-03-01', vorlagen)).toBe('Montag: Hausaufgaben');
    expect(vorlageFuer('2027-03-02', vorlagen)).toBe('');
  });

  it('Tageswechsel: leeres Feld oder unveränderte Vorlage wird ersetzt, Geschriebenes bleibt', () => {
    expect(verlaufBeiTagwechsel('', '2027-03-02', '2027-03-03', vorlagen)).toBe('Mittwoch: Kochen');
    expect(verlaufBeiTagwechsel('Montag: Hausaufgaben', '2027-03-01', '2027-03-03', vorlagen)).toBe('Mittwoch: Kochen');
    expect(verlaufBeiTagwechsel('Montag: Hausaufgaben', '2027-03-01', '2027-03-02', vorlagen)).toBe('');
    expect(verlaufBeiTagwechsel('Montag: Hausaufgaben, dann Fußball', '2027-03-01', '2027-03-03', vorlagen)).toBe('Montag: Hausaufgaben, dann Fußball');
  });
});

describe('Auswertung', () => {
  const l = [
    { datum: '2027-03-01', anz_m: 4, anz_w: 5, anz_d: 0 },
    { datum: '2027-03-03', anz_m: 2, anz_w: 3, anz_d: 1 },
    { datum: '2027-04-05', anz_m: 0, anz_w: 1, anz_d: 0 },
  ];
  it('eine Zeile je Monat mit Summen und Durchschnitt je protokolliertem Tag', () => {
    expect(auswertungNachMonat(l)).toEqual([
      { monat: '2027-03-01', tage: 2, m: 6, w: 8, d: 1, gesamt: 15, schnitt: 7.5 },
      { monat: '2027-04-01', tage: 1, m: 0, w: 1, d: 0, gesamt: 1, schnitt: 1 },
    ]);
  });
  it('Gesamtsumme und leere Auswertung', () => {
    expect(summeAuswertung(l)).toMatchObject({ tage: 3, m: 6, w: 9, d: 1, gesamt: 16, schnitt: 5.3 });
    expect(auswertungNachMonat([])).toEqual([]);
    expect(summeAuswertung([]).schnitt).toBe(0);
  });
  it('Anteil in Prozent', () => {
    expect(anteil(1, 3)).toBe(33);
    expect(anteil(0, 0)).toBe(0);
  });
});

describe('CSV', () => {
  it('Felder mit Semikolon, Anführungszeichen und Zeilenumbruch werden gequotet', () => {
    expect(csvFeld('a;b')).toBe('"a;b"');
    expect(csvFeld('sagt "hi"')).toBe('"sagt ""hi"""');
    expect(csvFeld('eins\nzwei')).toBe('"eins\nzwei"');
    expect(csvFeld(5)).toBe('5');
  });
  it('schützt vor Formeln in Excel', () => {
    expect(csvFeld('=SUMME(A1)')).toBe("'=SUMME(A1)");
    expect(csvFeld('+49 6233')).toBe("'+49 6233");
    expect(csvFeld('@cmd')).toBe("'@cmd");
  });
  it('Datei mit BOM, Kopfzeile, sortiert nach Datum', () => {
    const csv = csvProtokolle([
      { datum: '2027-03-03', anz_m: 1, anz_w: 2, anz_d: 0, verlauf: 'Kicker', vorkommnisse: '' },
      { datum: '2027-03-01', anz_m: 4, anz_w: 5, anz_d: 1, verlauf: 'Basteln; Malen', vorkommnisse: 'Streit' },
    ], 'Kindertreff');
    expect(csv.startsWith('﻿Treff;Datum;männlich;weiblich;divers;Gesamt;Verlauf;Vorkommnisse\r\n')).toBe(true);
    const zeilen = csv.trim().split('\r\n');
    expect(zeilen[1]).toBe('Kindertreff;2027-03-01;4;5;1;10;"Basteln; Malen";Streit');
    expect(zeilen[2]).toBe('Kindertreff;2027-03-03;1;2;0;3;Kicker;');
  });
});

describe('Notizen und Listen', () => {
  it('Text ist Pflicht und begrenzt', () => {
    expect(validiereAufgabe({ art: 'todo', text: '  ', faellig_am: '', zustaendig: '' }).text).toBeDefined();
    expect(validiereAufgabe({ art: 'todo', text: 'x'.repeat(1001), faellig_am: '', zustaendig: '' }).text).toBeDefined();
    expect(validiereAufgabe({ art: 'einkauf', text: 'Saft', faellig_am: '', zustaendig: '' })).toEqual({});
  });
  it('Fälligkeit und Zuständigkeit nur bei To-do und Sonstiges', () => {
    expect([hatFaelligkeit('todo'), hatFaelligkeit('sonstiges'), hatFaelligkeit('einkauf'), hatFaelligkeit('frage')]).toEqual([true, true, false, false]);
    expect([hatZustaendig('todo'), hatZustaendig('einkauf'), hatZustaendig('frage')]).toEqual([true, false, false]);
  });
  it('überfällig: offen und Fälligkeit vor heute', () => {
    expect(istUeberfaellig(aufgabe({ id: 'a', faellig_am: '2027-03-01' }), '2027-03-02')).toBe(true);
    expect(istUeberfaellig(aufgabe({ id: 'a', faellig_am: '2027-03-02' }), '2027-03-02')).toBe(false);
    expect(istUeberfaellig(aufgabe({ id: 'a', faellig_am: '2027-03-01', erledigt: true }), '2027-03-02')).toBe(false);
    expect(istUeberfaellig(aufgabe({ id: 'a' }), '2027-03-02')).toBe(false);
  });
  it('Sortierung: Offene vor Erledigten, nach Fälligkeit, ohne Datum zuletzt und neueste zuerst', () => {
    const l = [
      aufgabe({ id: 'ohne-alt', created_at: '2027-03-01T10:00:00Z' }),
      aufgabe({ id: 'ohne-neu', created_at: '2027-03-02T10:00:00Z' }),
      aufgabe({ id: 'spaet', faellig_am: '2027-03-20' }),
      aufgabe({ id: 'frueh', faellig_am: '2027-03-05' }),
      aufgabe({ id: 'fertig-alt', erledigt: true, erledigt_am: '2027-03-01T10:00:00Z' }),
      aufgabe({ id: 'fertig-neu', erledigt: true, erledigt_am: '2027-03-03T10:00:00Z' }),
    ];
    expect(sortiereAufgaben(l).map((a) => a.id)).toEqual(['frueh', 'spaet', 'ohne-neu', 'ohne-alt', 'fertig-neu', 'fertig-alt']);
  });
  it('zählt offene Einträge je Art', () => {
    expect(zaehleJeArt([aufgabe({ id: '1' }), aufgabe({ id: '2', art: 'einkauf' }), aufgabe({ id: '3', art: 'einkauf' }), aufgabe({ id: '4', art: 'frage', erledigt: true })]))
      .toEqual({ todo: 1, einkauf: 2, frage: 0, sonstiges: 0 });
  });
  it('„für mich“: mir zugewiesen oder überfällig, nie Erledigtes', () => {
    const l = [
      aufgabe({ id: 'mein', zustaendig: 'ich' }),
      aufgabe({ id: 'fremd', zustaendig: 'andere' }),
      aufgabe({ id: 'ueber', faellig_am: '2027-03-01' }),
      aufgabe({ id: 'fertig', zustaendig: 'ich', erledigt: true }),
    ];
    expect(fuerMich(l, 'ich', '2027-03-02').map((a) => a.id)).toEqual(['mein', 'ueber']);
  });
  it('Archiv: erledigt vor mehr als 30 Tagen', () => {
    expect(imArchiv(aufgabe({ id: 'a', erledigt: true, erledigt_am: '2027-01-01T10:00:00Z' }), '2027-03-01')).toBe(true);
    expect(imArchiv(aufgabe({ id: 'a', erledigt: true, erledigt_am: '2027-02-20T10:00:00Z' }), '2027-03-01')).toBe(false);
    expect(imArchiv(aufgabe({ id: 'a' }), '2027-03-01')).toBe(false);
  });
});

describe('ortszeit', () => {
  it('Datum und Uhrzeit in Ortszeit, zweistellig', () => {
    const d = new Date(2027, 2, 2, 9, 5);      // 2. März 2027, 09:05 Ortszeit
    expect(ortszeit(d.toISOString())).toBe('02.03.2027 um 09:05 Uhr');
  });
});
