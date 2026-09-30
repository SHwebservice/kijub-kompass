import { describe, it, expect, beforeAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { neueDb, person, als, fehler, type Person } from './harness';

/** Migration 0019: Fehlermeldungen der App – ohne Personendaten, gezählt, nur für die Koordination lesbar. */
let db: PGlite;
let koord: Person, normal: Person, inaktiv: Person;

const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params);
const melde = (wer: Person | 'anon', v: string, seite: string, meldung: string, stapel: string | null = null) =>
  als(db, wer, () => q('select fn_fehler_melden($1, $2, $3, $4)', [v, seite, meldung, stapel]));
const alle = async () => (await q<{ version: string; seite: string; meldung: string; stapel: string | null; anzahl: number; erledigt: boolean }>(
  `select version, seite, meldung, stapel, anzahl, erledigt from fehlermeldungen order by meldung`)).rows;

beforeAll(async () => {
  db = await neueDb();
  koord = await person(db, 'Koord', { koordination: true, kategorie: 'Hauptamtliche*r' });
  normal = await person(db, 'Normal');
  inaktiv = await person(db, 'Inaktiv', { aktiv: false });
});

describe('Melden', () => {
  it('jede angemeldete aktive Person darf melden; anonym und inaktiv nicht', async () => {
    await melde(normal, 'abc1234', '/heute', 'x is not defined');
    expect(await als(db, 'anon', () => fehler(() => q(`select fn_fehler_melden('v', '/', 'm')`)))).toMatch(/permission denied/i);
    expect(await melde(inaktiv, 'v', '/', 'm').then(() => '', (e: Error) => e.message)).toMatch(/Nicht angemeldet/);
    expect(await alle()).toHaveLength(1);
  });

  it('gleiche Fehler werden gezählt statt vervielfacht und wieder geöffnet', async () => {
    await melde(normal, 'abc1234', '/heute', 'x is not defined');
    await melde(koord, 'abc1234', '/heute', 'x is not defined');
    expect((await alle())[0]!.anzahl).toBe(3);
    await q(`update fehlermeldungen set erledigt = true`);
    await melde(normal, 'abc1234', '/heute', 'x is not defined');
    expect((await alle())[0]).toMatchObject({ anzahl: 4, erledigt: false });
  });

  it('andere Version, andere Seite oder andere Meldung sind eigene Einträge', async () => {
    await melde(normal, 'neu9999', '/heute', 'x is not defined');
    await melde(normal, 'abc1234', '/mehr', 'x is not defined');
    await melde(normal, 'abc1234', '/heute', 'y is not a function');
    expect(await alle()).toHaveLength(4);
  });

  it('Kennungen, Mail-Adressen und Telefonnummern werden entfernt – in Adresse, Meldung und Stapel', async () => {
    await q('delete from fehlermeldungen');
    await melde(normal, 'v1', '/treffs/123e4567-e89b-12d3-a456-426614174000/protokoll',
      'Fehler bei anna.adler@kijub-frankenthal.de (Tel. +49 6233 123456): Person 123e4567-e89b-12d3-a456-426614174000 fehlt',
      'at x (https://app.example/a.js:1:1)\nanna.adler@kijub-frankenthal.de 0171 1234567');
    const z = (await alle())[0]!;
    expect(z.seite).toBe('/treffs/:id/protokoll');
    expect(z.meldung).toBe('Fehler bei [mail] (Tel. [zahl]): Person :id fehlt');
    expect(z.stapel).toContain('[mail]');
    expect(z.stapel).toContain('[zahl]');
    expect(z.stapel).not.toMatch(/anna|123456|0171/);
  });

  it('zu lange Texte werden gekürzt, leere Meldungen ignoriert', async () => {
    await q('delete from fehlermeldungen');
    await melde(normal, 'v1', '/' + 'a'.repeat(500), 'm'.repeat(1000), 's'.repeat(5000));
    await melde(normal, 'v1', '/leer', '   ');
    const r = await alle();
    expect(r).toHaveLength(1);
    expect(r[0]!.seite.length).toBe(200);
    expect(r[0]!.meldung.length).toBe(400);
    expect(r[0]!.stapel!.length).toBe(1500);
  });

  it('höchstens 300 Meldungen pro Stunde insgesamt', async () => {
    await q('delete from fehlermeldungen');
    await q(`insert into fehlermeldungen (version, seite, meldung, anzahl) values ('v', '/', 'Flut', 300)`);
    await melde(normal, 'v', '/', 'noch eine');
    expect((await alle()).map((x) => x.meldung)).toEqual(['Flut']);
  });

  it('Einträge ohne Wiederholung werden nach 90 Tagen gelöscht', async () => {
    await q('delete from fehlermeldungen');
    await q(`insert into fehlermeldungen (version, seite, meldung, zuletzt) values ('v', '/', 'uralt', now() - interval '91 days'), ('v', '/', 'frisch', now() - interval '10 days')`);
    await melde(normal, 'v', '/', 'neu');
    expect((await alle()).map((x) => x.meldung)).toEqual(['frisch', 'neu']);
  });
});

describe('Lesen und Aufräumen', () => {
  it('nur die Koordination sieht die Meldungen und darf abhaken und löschen', async () => {
    const n = (await als(db, normal, () => q('select * from fehlermeldungen'))).rows.length;
    expect(n).toBe(0);
    expect((await als(db, koord, () => q('select * from fehlermeldungen'))).rows.length).toBeGreaterThan(0);
    const weg = await als(db, normal, () => q(`delete from fehlermeldungen`));
    expect(weg.affectedRows).toBe(0);
    await als(db, koord, () => q(`update fehlermeldungen set erledigt = true where meldung = 'neu'`));
    expect((await alle()).find((x) => x.meldung === 'neu')!.erledigt).toBe(true);
    await als(db, koord, () => q(`delete from fehlermeldungen where meldung = 'neu'`));
    expect((await alle()).map((x) => x.meldung)).not.toContain('neu');
  });

  it('direktes Einfügen ist niemandem erlaubt – nur über die Funktion', async () => {
    for (const wer of [normal, koord]) {
      expect(await als(db, wer, () => fehler(() => q(`insert into fehlermeldungen (version, seite, meldung) values ('v', '/', 'direkt')`)))).toMatch(/permission denied/i);
    }
  });

  it('die Hilfsfunktion zum Bereinigen ist von außen nicht aufrufbar', async () => {
    expect(await als(db, koord, () => fehler(() => q(`select fn_fehler_bereinigen('x')`)))).toMatch(/permission denied/i);
  });
});
