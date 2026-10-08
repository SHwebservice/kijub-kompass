import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PGlite } from '@electric-sql/pglite';
import { neueDb, person, als, type Person } from './harness';
import { baueImportPlan, type ImportPlan } from '../../src/import/kijuko';
import { beispielBackup } from '../fixtures/kijuko';

/**
 * Umstieg KiJuKo 2.1 → KiJuKo 3: KiJuKo 3 übernimmt die IDs der alten Sicherung. Ein Import der neuen
 * Exportdatei nach einem Import der alten Sicherung erkennt deshalb alles wieder und legt nichts doppelt an.
 */
let db: PGlite;
let koord: Person;
const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params);

async function lauf(plan: ImportPlan) {
  const r = await als(db, koord, () => q<{ r: { zaehler: Record<string, Record<string, number>>; konflikte: unknown[] } }>(
    'select fn_kijuko_import($1::jsonb, true, $2::jsonb, $3::jsonb) as r',
    [JSON.stringify(plan), '{}', JSON.stringify({ name: 'KiJuKo-Kompass.json', sha256: 'abc', backup_datum: '2027-01-01' })]));
  return r.rows[0]!.r;
}
const zahl = async (sql: string, p: unknown[] = []) => (await q<{ n: number }>(`select count(*)::int as n from ${sql}`, p)).rows[0]!.n;

/** Dieselben Daten, wie KiJuKo 3 sie nach „Altdaten übernehmen“ exportiert (Leitung jetzt auch eine Ehrenamtliche). */
function export3() {
  const p = (id: string, vorname: string, nachname: string, email: string, beschaeftigungsart: string, hauptamt = false, extra = {}) =>
    ({ id, vorname, nachname, email, telefon: '', ernaehrung: '', allergien: '', notiz: '', beschaeftigungsart, hauptamt, aktiv: true, ...extra });
  return {
    format: 'kijuko-kompass', version: 1, programm: 'KiJuKo 3', erstelltAm: '2027-01-01T00:00:00Z',
    orte: [
      { id: 'L1', name: 'Mörscher Au', adresse: 'Au 1, 67227 Frankenthal', lieferstelleNr: '5' },
      { id: 'L2', name: 'Kindertreff Mörsch', adresse: 'Dorfstr. 2', lieferstelleNr: '' },
      { id: 'L3', name: 'Strandbad', adresse: '', lieferstelleNr: '' },
    ],
    personen: [
      p('H1', 'Hanna', 'Leiter', 'hanna@kijuko.example', 'Hauptamt', true, { telefon: '0171 111' }),
      p('H2', 'Hugo', 'Zweit', 'hugo@kijuko.example', 'Hauptamt', true),
      p('H4', 'Maria', 'Muster', 'maria@kijuko.example', 'Hauptamt', true),
      p('S1', 'Anna', 'Adler', 'anna@kijuko.example', 'TeamerIn', false, { telefon: '0170 1', ernaehrung: 'Vegetarisch' }),
      p('S2', 'Ben', 'Baum', 'ben@kijuko.example', 'TZK', false, { ernaehrung: 'Mischkost', allergien: 'Nüsse', notiz: 'kann Gitarre' }),
      p('S3', 'Cleo', 'Clever', 'Cleo@KiJuKo.Example', 'Praktikum bezahlt', false, { ernaehrung: 'Vegan' }),
      p('S6', 'Inge', 'Inaktiv', 'inge@kijuko.example', 'FSJ', false, { aktiv: false }),
      p('S7', 'Kurt', 'Komisch', 'kurt@kijuko.example', 'TeamerIn'),
    ],
    freizeiten: [
      { id: 'P1', name: 'Sommer-Sause 1', von: '2027-07-05', bis: '2027-07-09', status: 'Geplant', ortId: 'L1', kennziffer: 'F27S1', serieId: 'SER1',
        ferien: { art: 'Sommer', nummer: 1 }, arbeitsbeginn: '07:30', arbeitsende: '17:00', altersgruppe: '6-11', maxTeilnehmende: 48,
        leitung: ['H1', 'S1'], team: ['S2', 'S3'] },
      { id: 'P4', name: 'Ohne Ort', von: '2027-10-11', bis: '2027-10-15', status: 'Geplant', ortId: '', kennziffer: '', serieId: '',
        ferien: { art: 'Herbst', nummer: 2 }, arbeitsbeginn: '', arbeitsende: '', altersgruppe: '8-12', maxTeilnehmende: null,
        leitung: ['H4'], team: ['S1'] },
      { id: 'P2', name: 'Oster-Woche', von: '2027-03-29', bis: '2027-04-02', status: 'Abgesagt', ortId: 'L2', kennziffer: '', serieId: '',
        ferien: null, arbeitsbeginn: '', arbeitsende: '', altersgruppe: '', maxTeilnehmende: 20, leitung: [], team: [] },
    ],
    verpflegung: [{ freizeitId: 'P1', datum: '2027-07-05', mischkost: 40, vegetarisch: 5, allergiker: 2 }],
    material: [
      { id: 'M1', freizeitId: 'P1', name: 'Bälle', einheit: 'Stück', menge: 10, notiz: '' },
      { id: 'M3', freizeitId: 'P1', name: 'Kleber', einheit: 'Packung', menge: 4, notiz: 'bunt' },
    ],
  };
}

beforeEach(async () => {
  db = await neueDb();
  koord = await person(db, 'Koord', { koordination: true, kategorie: 'Hauptamtliche*r' });
});

describe('Exportdatei aus KiJuKo 3', () => {
  it('legt beim Erstimport alles an', async () => {
    const e = await lauf(baueImportPlan(export3()));
    expect(e.zaehler.personen).toMatchObject({ neu: 8 });
    expect(e.zaehler.freizeiten).toMatchObject({ neu: 3 });
    expect(await zahl(`freizeit_team t join personen p on p.id = t.person_id where p.kijuko_id = 'S1' and t.rolle = 'leitung'`)).toBe(1);
  });

  it('nach der alten Sicherung: nichts doppelt, Ehrenamtliche wird Leitung, Essenszahlen werden ersetzt', async () => {
    await lauf(baueImportPlan(beispielBackup()));
    const personen = await zahl('personen'); const freizeiten = await zahl('freizeiten'); const orte = await zahl('orte');

    const e = await lauf(baueImportPlan(export3()));
    expect(e.zaehler.personen?.neu ?? 0).toBe(0);
    expect(e.zaehler.freizeiten?.neu ?? 0).toBe(0);
    expect(await zahl('personen')).toBe(personen);
    expect(await zahl('freizeiten')).toBe(freizeiten);
    expect(await zahl('orte')).toBe(orte);
    expect(e.konflikte).toEqual([]);

    expect((await q<{ rolle: string }>(`select t.rolle::text as rolle from freizeit_team t join personen p on p.id = t.person_id
      join freizeiten f on f.id = t.freizeit_id where p.kijuko_id = 'S1' and f.kijuko_id = 'P1'`)).rows[0]?.rolle).toBe('leitung');
    const v = await q<{ datum: string | null; mischkost: number }>(`select v.datum::text as datum, v.mischkost from freizeit_verpflegung v
      join freizeiten f on f.id = v.freizeit_id where f.kijuko_id = 'P1' order by v.datum`);
    expect(v.rows).toEqual([{ datum: '2027-07-05', mischkost: 40 }]);

    // Ein zweiter Lauf mit derselben Datei ändert nichts
    const z = await lauf(baueImportPlan(export3()));
    for (const art of ['orte', 'personen', 'freizeiten', 'zuteilungen', 'verpflegung', 'material']) {
      expect((z.zaehler[art]?.neu ?? 0) + (z.zaehler[art]?.geaendert ?? 0), art).toBe(0);
    }
  });
});

describe('Küche & Essen aus KiJuKo 3 (0033)', () => {
  const kuecheExport = (kueche: string[], sonderkost: { text: string; anzahl: number }[]) => ({
    format: 'kijuko-kompass', version: 1, programm: 'KiJuKo 3', erstelltAm: '2027-01-01T00:00:00Z',
    orte: [{ id: 'L1', name: 'Mörscher Au', adresse: '', lieferstelleNr: '' }],
    personen: [
      { id: 'K1', vorname: 'Kim', nachname: 'Test', email: 'kim@test.example', telefon: '', ernaehrung: '', beschaeftigungsart: 'TeamerIn', hauptamt: false, aktiv: true },
      { id: 'T1', vorname: 'Tim', nachname: 'Test', email: 'tim@test.example', telefon: '', ernaehrung: '', beschaeftigungsart: 'TeamerIn', hauptamt: false, aktiv: true },
    ],
    freizeiten: [{
      id: 'F9', name: 'Küchenfreizeit', von: '2027-07-05', bis: '2027-07-09', status: 'Geplant', ortId: 'L1', kennziffer: '', serieId: '',
      ferien: null, arbeitsbeginn: '', arbeitsende: '', altersgruppe: '', maxTeilnehmende: null, leitung: [], team: ['K1', 'T1'], kueche, sonderkost,
    }],
    verpflegung: [{ freizeitId: 'F9', datum: '2027-07-05', mischkost: 10, vegetarisch: 2, allergiker: 1, gerichte: { mischkost: 'Schnitzel', vegetarisch: 'Gemüsepfanne', dessert: 'Pudding' } }],
    material: [],
  });
  const vorschau = async (plan: ImportPlan) => (await als(db, koord, () => q<{ r: { zaehler: Record<string, Record<string, number>> } }>(
    'select fn_kijuko_import($1::jsonb, false) as r', [JSON.stringify(plan)]))).rows[0]!.r;

  it('Vorschau zählt, verändert aber nichts', async () => {
    const v = await vorschau(baueImportPlan(kuecheExport(['K1'], [{ text: 'Nüsse', anzahl: 2 }])));
    expect(v.zaehler.kueche).toMatchObject({ neu: 1 });
    expect(await zahl('freizeit_sonderkost')).toBe(0);
  });

  it('Küchenteam, Sonderkost und Gerichte; lesen dürfen Küchenteam und Koordination, andere TeamerInnen nicht', async () => {
    const kim = await person(db, 'Kim'); const tim = await person(db, 'Tim');
    await lauf(baueImportPlan(kuecheExport(['K1'], [{ text: 'Nüsse', anzahl: 2 }, { text: 'vegan', anzahl: 1 }])));

    const sieht = (wer: Person, sql: string) => als(db, wer, () => q(sql)).then((r) => r.rows);
    expect(await sieht(kim, 'select menue_mischkost, menue_vegetarisch, dessert from freizeit_verpflegung'))
      .toEqual([{ menue_mischkost: 'Schnitzel', menue_vegetarisch: 'Gemüsepfanne', dessert: 'Pudding' }]);
    expect(await sieht(kim, 'select text, anzahl from freizeit_sonderkost order by text'))
      .toEqual([{ text: 'Nüsse', anzahl: 2 }, { text: 'vegan', anzahl: 1 }]);
    expect(await sieht(tim, 'select * from freizeit_verpflegung')).toEqual([]);
    expect(await sieht(tim, 'select * from freizeit_sonderkost')).toEqual([]);
    expect(await sieht(koord, 'select * from freizeit_sonderkost')).toHaveLength(2);
    expect(await sieht(tim, `select vorname, kueche from v_team_freizeit order by vorname`))
      .toEqual([{ vorname: 'Kim', kueche: true }, { vorname: 'Tim', kueche: false }]);
    // Schreiben nur durch den Import
    await expect(als(db, koord, () => q(`insert into freizeit_sonderkost (freizeit_id, text, anzahl) select id, 'x', 1 from freizeiten`))).rejects.toThrow();

    // Nächster Export: Küchenteam gewechselt, Sonderkost geändert
    const e = await lauf(baueImportPlan(kuecheExport(['T1'], [{ text: 'Nüsse', anzahl: 3 }])));
    expect(e.zaehler.kueche).toMatchObject({ geaendert: 3, geloescht: 1 });
    expect(await sieht(tim, 'select text, anzahl from freizeit_sonderkost')).toEqual([{ text: 'Nüsse', anzahl: 3 }]);
    expect(await sieht(kim, 'select * from freizeit_sonderkost')).toEqual([]);

    // Unveränderter Lauf ändert nichts
    const z = await lauf(baueImportPlan(kuecheExport(['T1'], [{ text: 'Nüsse', anzahl: 3 }])));
    expect(z.zaehler.kueche ?? {}).toEqual({});
  });
});

describe('Lieferungen aus KiJuKo 3 (0033)', () => {
  const lieferExport = (lieferungen: unknown[], ortId = 'L1') => ({
    format: 'kijuko-kompass', version: 1, programm: 'KiJuKo 3', erstelltAm: '2027-01-01T00:00:00Z',
    orte: [{ id: 'L1', name: 'Mörscher Au', adresse: '', lieferstelleNr: '' }],
    personen: [{ id: 'P1', vorname: 'Lea', nachname: 'Test', email: 'lea@test.example', telefon: '', ernaehrung: '', beschaeftigungsart: 'Hauptamt', hauptamt: true, aktiv: true }],
    freizeiten: [{
      id: 'F7', name: 'Lieferfreizeit', von: '2027-07-05', bis: '2027-07-09', status: 'Geplant', ortId, kennziffer: '', serieId: '',
      ferien: null, arbeitsbeginn: '', arbeitsende: '', altersgruppe: '', maxTeilnehmende: null, leitung: ['P1'], team: [], kueche: [], sonderkost: [],
    }],
    verpflegung: [], material: [], lieferungen,
  });
  const toast = { id: 'l1', freizeitId: 'F7', art: 'lebensmittel', bezeichnung: 'Toastbrot', menge: 6, einheit: 'Packung', datum: '', notiz: '' };
  const kleber = { id: 'l2', freizeitId: 'F7', art: 'material', bezeichnung: 'Kleber', menge: 5, einheit: 'Stück', datum: '2027-07-01', notiz: 'im Schrank' };

  it('Lieferungen und Lebensmittel-Bestand; Eingänge aus KiJuKo ändert nur der Import', async () => {
    const lea = await person(db, 'Lea', { kategorie: 'Hauptamtliche*r' });
    const e1 = await lauf(baueImportPlan(lieferExport([toast, kleber])));
    expect(e1.zaehler.lieferungen).toMatchObject({ neu: 2 });

    const sieht = (sql: string) => als(db, lea, () => q(sql)).then((r) => r.rows);
    expect(await sieht('select bezeichnung, art from freizeit_lieferungen order by bezeichnung'))
      .toEqual([{ bezeichnung: 'Kleber', art: 'material' }, { bezeichnung: 'Toastbrot', art: 'lebensmittel' }]);
    // Nur Lebensmittel kommen in den Bestand; ohne Datum gilt der Beginn der Freizeit
    expect(await sieht(`select name, menge::int as menge, datum::text as datum, kijuko_id from lebensmittel_eingang`))
      .toEqual([{ name: 'Toastbrot', menge: 6, datum: '2027-07-05', kijuko_id: 'l1' }]);
    expect(await sieht(`select name, rest::int as rest from v_lebensmittel_bestand`)).toEqual([{ name: 'Toastbrot', rest: 6 }]);

    // Die Leitung kann den Eingang aus KiJuKo weder ändern noch löschen, eigene Eingänge aber schon
    await als(db, lea, () => q(`update lebensmittel_eingang set menge = 1 where kijuko_id = 'l1'`));
    await als(db, lea, () => q(`delete from lebensmittel_eingang where kijuko_id = 'l1'`));
    expect(await sieht(`select menge::int as menge from lebensmittel_eingang where kijuko_id = 'l1'`)).toEqual([{ menge: 6 }]);
    await expect(als(db, lea, () => q(`insert into lebensmittel_eingang (ort_id, name, menge, kijuko_id) select ort_id, 'x', 1, 'falsch' from freizeiten`))).rejects.toThrow();
    await als(db, lea, () => q(`insert into lebensmittel_eingang (ort_id, freizeit_id, name, menge) select ort_id, id, 'Saft', 3 from freizeiten`));
    await als(db, lea, () => q(`delete from lebensmittel_eingang where name = 'Saft'`));
    expect(await sieht(`select count(*)::int as n from lebensmittel_eingang`)).toEqual([{ n: 1 }]);

    // Nächster Export: Menge geändert, Kleber entfällt → Bestand und Liste folgen
    const e2 = await lauf(baueImportPlan(lieferExport([{ ...toast, menge: 8 }])));
    expect(e2.zaehler.lieferungen).toMatchObject({ geaendert: 1, geloescht: 1 });
    expect(await sieht(`select name, menge::int as menge from lebensmittel_eingang`)).toEqual([{ name: 'Toastbrot', menge: 8 }]);
    expect(await sieht(`select bezeichnung from freizeit_lieferungen`)).toEqual([{ bezeichnung: 'Toastbrot' }]);

    // Lebensmittel entfällt ganz → auch aus dem Bestand
    await lauf(baueImportPlan(lieferExport([])));
    expect(await zahl('lebensmittel_eingang')).toBe(0);
    expect(await zahl('freizeit_lieferungen')).toBe(0);
  });

  it('andere TeamerInnen sehen keine Lieferungen', async () => {
    const tim = await person(db, 'Tim');
    const exp = lieferExport([toast]);
    exp.personen.push({ id: 'T1', vorname: 'Tim', nachname: 'Test', email: 'tim@test.example', telefon: '', ernaehrung: '', beschaeftigungsart: 'TeamerIn', hauptamt: false, aktiv: true });
    exp.freizeiten[0]!.team = ['T1'] as never[];
    await lauf(baueImportPlan(exp));
    expect((await als(db, tim, () => q('select * from freizeit_lieferungen'))).rows).toEqual([]);
  });
});

describe('Freizeit-Typ aus KiJuKo 3 und Wiederholbarkeit von 0034', () => {
  const typExport = (freizeittyp: string) => ({
    format: 'kijuko-kompass', version: 1, programm: 'KiJuKo 3', erstelltAm: '2027-01-01T00:00:00Z',
    orte: [], personen: [], verpflegung: [], material: [], lieferungen: [],
    freizeiten: [{ id: 'F5', name: 'Typfreizeit', von: '2027-07-05', bis: '2027-07-09', status: 'Geplant', ortId: '', kennziffer: '', serieId: '',
      ferien: null, arbeitsbeginn: '', arbeitsende: '', altersgruppe: '', maxTeilnehmende: null, leitung: [], team: [], kueche: [], sonderkost: [], freizeittyp }],
  });
  const typ = async () => (await q<{ typ: number | null }>(`select typ from freizeiten where kijuko_id = 'F5'`)).rows[0]?.typ;

  it('übernimmt den Typ; eine Kompass-Änderung bleibt mit Hinweis; leer und Typ 5 überschreiben nie', async () => {
    await lauf(baueImportPlan(typExport('4')));
    expect(await typ()).toBe(4);
    await lauf(baueImportPlan(typExport('2')));            // KiJuKo geändert, Kompass nicht angefasst
    expect(await typ()).toBe(2);
    await q(`update freizeiten set typ = 1 where kijuko_id = 'F5'`);
    await lauf(baueImportPlan(typExport('2')));            // KiJuKo unverändert → Kompass-Wert bleibt, kein Hinweis
    expect(await typ()).toBe(1);
    const r = await als(db, koord, () => q<{ r: { hinweise: string[] } }>('select fn_kijuko_import($1::jsonb, false) as r', [JSON.stringify(baueImportPlan(typExport('3')))]));
    expect(r.rows[0]!.r.hinweise.join(' ')).toMatch(/Freizeit-Typ im Kompass \(1\) weicht von KiJuKo \(3\) ab/);
    await lauf(baueImportPlan(typExport('5')));
    await lauf(baueImportPlan(typExport('')));
    expect(await typ()).toBe(1);
  });

  it('0034 lässt sich ein zweites Mal ausführen (z. B. nach einem Entwurf von 0033 mit Lieferungen) und ändert nichts', async () => {
    const sql = readFileSync(join(__dirname, '../../supabase/migrations/0034_kijuko_lieferungen_typ.sql'), 'utf8');
    const regeln = async () => (await q(`select tablename, policyname, qual, with_check from pg_policies where tablename in ('lebensmittel_eingang', 'freizeit_lieferungen') order by 1, 2`)).rows;
    const vorher = await regeln();
    await db.exec(sql);
    expect(await regeln()).toEqual(vorher);
  });
});
