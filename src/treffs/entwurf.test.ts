import { describe, it, expect } from 'vitest';
import {
  aenderungen, eingeteilt, konfliktAm, LEERER_ENTWURF, mitEntwurf, offeneWunschListe, setze, stundenVon, umschalten, vormonatUebernehmen, wochenDerKarten,
  wocheKopieren, zeileFuellen,
} from './entwurf';
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

  it('Vormonat übernehmen: n-ter Wochentag auf n-ten Wochentag, fünfter wie der letzte; nur Team, Konflikte ausgelassen', () => {
    // Februar 2027: Montage 1., 8., 15., 22. · Mittwoche 3., 10., 17., 24.; März 2027 hat fünf Montage und fünf Mittwoche
    const maerz = tageskarten(['2027-03-01', '2027-03-03', '2027-03-08', '2027-03-10', '2027-03-15', '2027-03-22', '2027-03-29', '2027-03-31'], oeffnung, []);
    const februar = [
      dienst({ id: 'f1', datum: '2027-02-01', personen: ['anna', 'weg'] }),     // 1. Montag; „weg“ ist nicht mehr im Team
      dienst({ id: 'f2', datum: '2027-02-08', personen: ['ben'] }),             // 2. Montag (Woche B)
      dienst({ id: 'f4', datum: '2027-02-22', personen: ['carla'] }),           // 4. = letzter Montag
      dienst({ id: 'f5', datum: '2027-02-03', personen: ['ben'] }),             // 1. Mittwoch
      dienst({ id: 'fs', datum: '2027-02-10', ist_sonder: true, bezeichnung: 'Fest', personen: ['anna'] }),
    ];
    const abw: Abwesenheit[] = [{ id: 'k', person_id: 'ben', datum: '2027-03-03', typ: 'krank', notiz: null }];
    const r = vormonatUebernehmen(maerz, LEERER_ENTWURF, '2027-02-01', februar, ['anna', 'ben', 'carla'], abw, [], 't1');
    expect(aenderungen(r.entwurf).zuteilen).toEqual([
      { datum: '2027-03-01', person: 'anna' }, { datum: '2027-03-08', person: 'ben' },
      { datum: '2027-03-22', person: 'carla' }, { datum: '2027-03-29', person: 'carla' },
    ]);
    expect(r.ausgelassen).toBe(1);                                              // Ben am 03.03. krank
  });

  it('Vormonat übernehmen lässt Vorhandenes stehen und zählt es nicht doppelt', () => {
    const r = vormonatUebernehmen(karten, LEERER_ENTWURF, '2027-02-01', [dienst({ id: 'f1', datum: '2027-02-01', personen: ['anna'] })], ['anna'], [], [], 't1');
    expect(r.entwurf.size).toBe(0);                                             // Anna steht am 01.03. schon im Plan
  });

  it('Woche kopieren: die Einteilung der Woche (mit Entwurf) kommt in den folgenden Wochen dazu', () => {
    const maerz = tageskarten(['2027-03-01', '2027-03-03', '2027-03-08', '2027-03-10', '2027-03-15', '2027-03-17'], oeffnung, [dienst({ id: 'a', datum: '2027-03-01', personen: ['anna'] })]);
    expect(wochenDerKarten(maerz)).toEqual(['2027-03-01', '2027-03-08', '2027-03-15']);
    const e = setze(maerz, LEERER_ENTWURF, '2027-03-03', 'ben', true);
    const r = wocheKopieren(maerz, e, '2027-03-01', [], feiertage.map((f) => ({ ...f, datum: '2027-03-15' })), 't1');
    expect(aenderungen(r.entwurf).zuteilen).toEqual([
      { datum: '2027-03-03', person: 'ben' }, { datum: '2027-03-08', person: 'anna' }, { datum: '2027-03-10', person: 'ben' }, { datum: '2027-03-17', person: 'ben' },
    ]);
    expect(r.ausgelassen).toBe(1);                                              // 15.03. Feiertag
  });

  it('offene Wünsche: getrennt nach mit und ohne Konflikt', () => {
    const k = tageskarten(tage, oeffnung, [
      dienst({ id: 'a', datum: '2027-03-01', wuensche: [{ person_id: 'ben', status: 'offen' }, { person_id: 'anna', status: 'abgelehnt' }] }),
      dienst({ id: 'b', datum: '2027-03-08', wuensche: [{ person_id: 'ben', status: 'offen' }, { person_id: 'carla', status: 'offen' }] }),
    ]);
    const l = offeneWunschListe(k, urlaub, [], 't1');
    expect(l.ohneKonflikt).toEqual([{ dienst: 'a', person: 'ben', datum: '2027-03-01' }, { dienst: 'b', person: 'carla', datum: '2027-03-08' }]);
    expect(l.mitKonflikt).toEqual([{ dienst: 'b', person: 'ben', datum: '2027-03-08' }]);
  });

  it('Stunden: reguläre Dienste und Sonderdienste', () => {
    expect(stundenVon(karten, 'anna')).toBe(6);                                                    // 4 h + 2 h Ausflug
    const e = setze(karten, LEERER_ENTWURF, '2027-03-03', 'anna', true);
    expect(stundenVon(mitEntwurf(karten, e), 'anna')).toBe(9.5);
  });
});
