import { describe, it, expect } from 'vitest';
import {
  baueImportPlan, ImportFormatFehler, parseAlter, parseWoche, deDatumZuIso, uhrzeit, istDatum, hauptamtlicheName, text,
} from './kijuko';
import { beispielBackup, kopie, PRIVAT } from '../../tests/fixtures/kijuko';

describe('Einzelne Umwandlungen', () => {
  it('Alter: gültige Spannen, sonst keine Angabe', () => {
    expect(parseAlter('6-11')).toEqual({ alter_von: 6, alter_bis: 11 });
    expect(parseAlter(' 9 - 12 ')).toEqual({ alter_von: 9, alter_bis: 12 });
    for (const v of ['0', '-', '', '12-6', '0-5', 'abc', undefined, 7]) expect(parseAlter(v)).toEqual({});
  });
  it('Ferienwoche muss zur Ferienzeit passen', () => {
    expect(parseWoche('Sommer - Woche 6', 'sommer')).toBe(6);
    expect(parseWoche('Sommer - Woche 7', 'sommer')).toBeUndefined();
    expect(parseWoche('Ostern - Woche 3', 'ostern')).toBeUndefined();
    expect(parseWoche('Herbst - Woche 2', 'herbst')).toBe(2);
    expect(parseWoche('Sommer - Woche 1', undefined)).toBeUndefined();
  });
  it('Datum und Uhrzeit', () => {
    expect(deDatumZuIso('05.07.2027')).toBe('2027-07-05');
    expect(deDatumZuIso('31.02.2027')).toBeUndefined();
    expect(deDatumZuIso('kaputt')).toBeUndefined();
    expect(istDatum('2027-02-29')).toBe(false);
    expect(istDatum('2028-02-29')).toBe(true);
    expect(uhrzeit('7:30')).toBe('07:30');
    expect(uhrzeit('25:00')).toBeUndefined();
    expect(uhrzeit(undefined)).toBeUndefined();
  });
  it('Namen der Hauptamtlichen (im Feld "name" steht meist nur der Nachname)', () => {
    expect(hauptamtlicheName('Hanna', 'Leiter')).toEqual({ vorname: 'Hanna', nachname: 'Leiter' });
    expect(hauptamtlicheName('Hanna', 'Hanna Leiter')).toEqual({ vorname: 'Hanna', nachname: 'Leiter' });
    expect(hauptamtlicheName(undefined, 'Maria Muster')).toEqual({ vorname: 'Maria', nachname: 'Muster' });
    expect(hauptamtlicheName(undefined, 'Einzeln')).toBeNull();
    expect(hauptamtlicheName(undefined, undefined)).toBeNull();
  });
  it('text() trimmt, faltet Leerzeichen und macht aus Leerem nichts', () => {
    expect(text('  a   b ')).toBe('a b');
    expect(text('   ')).toBeUndefined();
    expect(text(5)).toBe('5');
    expect(text(null)).toBeUndefined();
  });
});

describe('baueImportPlan', () => {
  const plan = baueImportPlan(beispielBackup());

  it('lehnt Dateien ab, die keine KiJuKo-Sicherung sind', () => {
    expect(() => baueImportPlan({ foo: 1 })).toThrow(ImportFormatFehler);
    expect(() => baueImportPlan(null)).toThrow(ImportFormatFehler);
    expect(() => baueImportPlan([])).toThrow(ImportFormatFehler);
  });

  it('übernimmt alle Orte inklusive Lieferstelle', () => {
    expect(plan.orte.map((o) => o.name)).toEqual(['Mörscher Au', 'Kindertreff Mörsch', 'Strandbad']);
    expect(plan.orte[0]!.lieferstelle_nr).toBe('5');
    expect(plan.orte[2]!.adresse).toBeUndefined();
  });

  it('macht aus Hauptamtlichen und Ehrenamtlichen Personen; überspringt Unvollständige mit Grund', () => {
    const namen = plan.personen.map((p) => `${p.vorname} ${p.nachname}`);
    expect(namen).toEqual(expect.arrayContaining(['Hanna Leiter', 'Hugo Zweit', 'Maria Muster', 'Anna Adler', 'Ben Baum', 'Cleo Clever', 'Inge Inaktiv', 'Kurt Komisch']));
    expect(plan.personen.find((p) => p.nachname === 'Leiter')!.kategorie).toBe('Hauptamtliche*r');
    const gruende = plan.uebersprungen.map((u) => `${u.art}|${u.grund}`);
    expect(gruende).toContain('Hauptamtliche|Keine gültige Mail-Adresse');
    expect(gruende).toContain('Person|Keine gültige Mail-Adresse');
    expect(gruende).toContain('Person|Mail-Adresse steht schon bei einer anderen Person im Import');
  });

  it('normalisiert Mails (Leerzeichen) und erkennt Duplikate ohne Beachtung der Schreibweise', () => {
    expect(plan.personen.find((p) => p.nachname === 'Clever')!.mail).toBe('Cleo@KiJuKo.Example');
    expect(plan.personen.filter((p) => p.mail.toLowerCase() === 'hanna@kijuko.example')).toHaveLength(1);
  });

  it('Kategorie, Ernährung, Notizen, Inaktiv', () => {
    const ben = plan.personen.find((p) => p.nachname === 'Baum')!;
    expect(ben).toMatchObject({ kategorie: 'TZK', ernaehrung: 'Mischkost', notizen: 'Allergien: Nüsse\nkann Gitarre' });
    expect(plan.personen.find((p) => p.nachname === 'Inaktiv')!.aktiv).toBe(false);
    expect(plan.personen.find((p) => p.nachname === 'Adler')).not.toHaveProperty('aktiv');
    expect(plan.personen.find((p) => p.nachname === 'Komisch')!.kategorie).toBe('TeamerIn');
    expect(plan.hinweise.join(' ')).toMatch(/Unbekannte Kategorie „Sonderstatus"/);
  });

  it('Freizeiten: Felder, Status, Alter, Woche, Zeiten; ungültige werden übersprungen', () => {
    const p1 = plan.freizeiten.find((f) => f.kijuko_id === 'P1')!;
    expect(p1).toMatchObject({
      name: 'Sommer-Sause 1', status: 'geplant', ferienzeitraum: 'sommer', ferienwoche: 1, alter_von: 6, alter_bis: 11,
      arbeitsbeginn: '07:30', arbeitsende: '17:00', max_teilnehmende: 48, ort_kijuko_id: 'L1', kijuko_code: 'F27S1',
      kijuko_serie_id: 'SER1', start_datum: '2027-07-05', ende_datum: '2027-07-09',
    });
    const p2 = plan.freizeiten.find((f) => f.kijuko_id === 'P2')!;
    expect(p2.status).toBe('abgesagt');
    expect(p2.ferienwoche).toBeUndefined();
    expect(p2.alter_von).toBeUndefined();
    expect(plan.freizeiten.find((f) => f.kijuko_id === 'P3')).toBeUndefined();
    expect(plan.uebersprungen.some((u) => u.name === 'Kaputte Daten')).toBe(true);
    expect(plan.freizeiten.find((f) => f.kijuko_id === 'P4')!.ort_kijuko_id).toBeUndefined();
  });

  it('Leitung stammt aus den Hauptamtlichen (auch bei abweichender Namensschreibung im Feld)', () => {
    expect(plan.freizeiten.find((f) => f.kijuko_id === 'P1')!.leitung_kijuko_ids).toEqual(['H1', 'H2']);
    expect(plan.freizeiten.find((f) => f.kijuko_id === 'P4')!.leitung_kijuko_ids).toEqual(['H4']);
    expect(plan.freizeiten.find((f) => f.kijuko_id === 'P2')!.leitung_kijuko_ids).toEqual([]);
  });

  it('Zuteilungen: doppelte Mail zählt für die kept Person, fehlende/unbekannte entfallen', () => {
    const paare = plan.zuteilungen.map((z) => `${z.freizeit_kijuko_id}:${z.person_kijuko_id}`).sort();
    expect(paare).toEqual(['P1:H1', 'P1:S1', 'P1:S2', 'P1:S3', 'P4:S1'].sort());
  });

  it('Verpflegung: Gesamtwerte (Allergiker summiert) und gültige Tageswerte', () => {
    const v = plan.verpflegung;
    expect(v.find((x) => x.datum === null)).toMatchObject({ freizeit_kijuko_id: 'P1', mischkost: 50, vegetarisch: 3, allergiker: 3 });
    expect(v.filter((x) => x.datum !== null).map((x) => x.datum)).toEqual(['2027-07-05', '2027-07-06']);
  });

  it('Material: Beispielzeile wird gemeldet statt übernommen', () => {
    expect(plan.material.map((m) => m.name)).toEqual(['Bälle', 'Kleber']);
    expect(plan.uebersprungen.some((u) => u.art === 'Material' && /Beispielzeile/.test(u.grund))).toBe(true);
    expect(plan.material[1]).toMatchObject({ einheit: 'Packung', menge: 4, notiz: 'bunt' });
  });

  it('Datensparsamkeit: private Felder und nicht gewollte Bereiche kommen nicht in den Plan', () => {
    const json = JSON.stringify(plan);
    for (const p of PRIVAT) expect(json).not.toContain(p);
    expect(json).not.toContain('Nicht importieren');
    expect(json).not.toContain('birthDate');
    expect(Object.keys(plan).sort()).toEqual(['freizeiten', 'hinweise', 'kueche', 'lieferungen', 'material', 'orte', 'personen', 'sonderkost', 'uebersprungen', 'verpflegung', 'version', 'zuteilungen']);
  });

  it('ist tolerant gegenüber fehlenden Bereichen', () => {
    const b = kopie(beispielBackup());
    delete b.cateringEntries; delete b.materialNeeds; delete b.hauptamtliche; delete b.allocations;
    const p = baueImportPlan(b);
    expect(p.verpflegung).toEqual([]);
    expect(p.freizeiten.every((f) => f.leitung_kijuko_ids.length === 0)).toBe(true);
  });
});
