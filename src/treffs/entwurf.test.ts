import { describe, it, expect } from 'vitest';
import { aenderungen, eingeteilt, LEERER_ENTWURF, mitEntwurf, setze, stundenVon, umschalten, zeileFuellen, konfliktAm } from './entwurf';
import { tageskarten, type Abwesenheit, type Dienst, type Feiertag } from './dienstplan';

// März 2027: Mo 1., Mi 3., Mo 8., Mi 10.; Di 2. ist kein Öffnungstag, hat aber einen Sonderdienst
const oeffnung = [{ wochentag: 1, von: '15:00', bis: '19:00' }, { wochentag: 3, von: '14:00', bis: '17:30' }];
const tage = ['2027-03-01', '2027-03-02', '2027-03-03', '2027-03-08', '2027-03-10'];
const dienst = (o: Partial<Dienst> & { id: string; datum: string }): Dienst => ({ von: '15:00', bis: '19:00', ist_sonder: false, bezeichnung: null, personen: [], wuensche: [], ...o });
const dienste = [
  dienst({ id: 'a', datum: '2027-03-01', personen: ['anna'] }),
  dienst({ id: 's', datum: '2027-03-02', von: '10:00', bis: '12:00', ist_sonder: true, bezeichnung: 'Ausflug', personen: ['anna'] }),
];
const karten = tageskarten(tage, oeffnung, dienste);
const urlaub: Abwesenheit[] = [{ id: 'u', person_id: 'ben', datum: '2027-03-08', typ: 'urlaub', notiz: null }];
const feiertage: Feiertag[] = [{ id: 'f', treff_id: null, datum: '2027-03-10', bezeichnung: 'Stadtfest' }];

describe('Entwurf der Einsatz-Matrix', () => {
  it('schaltet Zellen um und merkt sich nur Abweichungen vom gespeicherten Stand', () => {
    let e = umschalten(karten, LEERER_ENTWURF, '2027-03-03', 'ben');
    expect(eingeteilt(karten, e, '2027-03-03', 'ben')).toBe(true);
    e = umschalten(karten, e, '2027-03-01', 'anna');
    expect(eingeteilt(karten, e, '2027-03-01', 'anna')).toBe(false);
    expect(aenderungen(e)).toEqual({ zuteilen: [{ datum: '2027-03-03', person: 'ben' }], entfernen: [{ datum: '2027-03-01', person: 'anna' }] });
    e = umschalten(karten, umschalten(karten, e, '2027-03-03', 'ben'), '2027-03-01', 'anna');   // zurückgeklickt
    expect(e.size).toBe(0);
  });

  it('nur Öffnungstage sind bearbeitbar; derselbe Stand gibt denselben Entwurf zurück', () => {
    expect(setze(karten, LEERER_ENTWURF, '2027-03-02', 'ben', true)).toBe(LEERER_ENTWURF);       // Sonderdienst an Schließtag
    expect(setze(karten, LEERER_ENTWURF, '2027-03-01', 'anna', true)).toBe(LEERER_ENTWURF);      // schon eingeteilt
  });

  it('erkennt Konflikte: Urlaub, Krankheit, Feiertag', () => {
    expect(konfliktAm('2027-03-08', 'ben', urlaub, feiertage, 't1')).toBe('Urlaub');
    expect(konfliktAm('2027-03-10', 'ben', urlaub, feiertage, 't1')).toBe('Feiertag: Stadtfest');
    expect(konfliktAm('2027-03-03', 'ben', urlaub, feiertage, 't1')).toBeNull();
  });

  it('Zeile füllen: alle Öffnungstage ohne Konflikt, Konflikttage werden gezählt', () => {
    const r = zeileFuellen(karten, LEERER_ENTWURF, 'ben', urlaub, feiertage, 't1');
    expect(aenderungen(r.entwurf).zuteilen.map((p) => p.datum)).toEqual(['2027-03-01', '2027-03-03']);
    expect(r.ausgelassen).toBe(2);
  });

  it('Zeile füllen ein zweites Mal leert die Zeile – auch einzeln eingeteilte Konflikttage', () => {
    let e = zeileFuellen(karten, LEERER_ENTWURF, 'ben', urlaub, feiertage, 't1').entwurf;
    e = umschalten(karten, e, '2027-03-08', 'ben');                                               // trotz Urlaub
    const r = zeileFuellen(karten, e, 'ben', urlaub, feiertage, 't1');
    expect(r.entwurf.size).toBe(0);
    expect(r.ausgelassen).toBe(0);
  });

  it('Zeile leeren nimmt auch gespeicherte Einteilungen heraus', () => {
    const r = zeileFuellen(karten, LEERER_ENTWURF, 'anna', [], [], 't1');                          // füllt erst den Rest
    const leer = zeileFuellen(karten, r.entwurf, 'anna', [], [], 't1').entwurf;
    expect(aenderungen(leer)).toEqual({ zuteilen: [], entfernen: [{ datum: '2027-03-01', person: 'anna' }] });
  });

  it('mitEntwurf zeigt den Stand nach dem Speichern; ein neuer Tag bekommt die Öffnungszeit', () => {
    const e = setze(karten, setze(karten, LEERER_ENTWURF, '2027-03-03', 'ben', true), '2027-03-01', 'anna', false);
    const neu = mitEntwurf(karten, e);
    expect(neu.find((k) => k.datum === '2027-03-03')!.regulaer).toMatchObject({ von: '14:00', bis: '17:30', personen: ['ben'] });
    expect(neu.find((k) => k.datum === '2027-03-01')!.regulaer!.personen).toEqual([]);
    expect(mitEntwurf(karten, LEERER_ENTWURF)).toBe(karten);
  });

  it('Stunden: reguläre Dienste und Sonderdienste', () => {
    expect(stundenVon(karten, 'anna')).toBe(6);                                                    // 4 h + 2 h Ausflug
    const e = setze(karten, LEERER_ENTWURF, '2027-03-03', 'anna', true);
    expect(stundenVon(mitEntwurf(karten, e), 'anna')).toBe(9.5);
  });
});
