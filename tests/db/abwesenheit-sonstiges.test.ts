import { describe, it, expect, beforeAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { neueDb, person, als, type Person } from './harness';

/** Migration 0039: Abwesenheit „Sonstiges“ (z. B. Fortbildung) – eintragen und im Stundennachweis richtig benennen. */
let db: PGlite;
let tl: Person, anna: Person;
let treff: string;
const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params);

beforeAll(async () => {
  db = await neueDb();
  tl = await person(db, 'Leitung', { kategorie: 'Hauptamtliche*r' });
  anna = await person(db, 'Anna', { kategorie: 'TZK' });
  treff = (await q<{ id: string }>(`insert into treffs (name) values ('Kindertreff') returning id`)).rows[0]!.id;
  await q(`insert into treff_team (treff_id, person_id, rolle) values ($1, $2, 'treffleitung'), ($1, $3, 'betreuerin')`, [treff, tl.id, anna.id]);
  await q(`insert into treff_oeffnungszeiten (treff_id, wochentag, von, bis) values ($1, 1, '15:00', '19:00'), ($1, 2, '15:00', '19:00')`, [treff]);
});

describe('Abwesenheit „Sonstiges“', () => {
  it('die Treffleitung trägt sie mit Notiz ein; der Nachweis zeigt „Sonstiges – Notiz“, Urlaub und krank wie bisher', async () => {
    // 2027-03-01 Mo, 02 Di
    await als(db, tl, () => q(`insert into abwesenheiten (person_id, datum, typ, notiz) values ($1, '2027-03-01', 'sonstiges', 'Fortbildung'), ($1, '2027-03-02', 'krank', null), ($1, '2027-03-08', 'urlaub', null)`, [anna.id]));
    const n = (await q<{ id: string }>(`insert into zeitnachweise (treff_id, person_id, monat) values ($1, $2, '2027-03-01') returning id`, [treff, anna.id])).rows[0]!.id;
    await als(db, tl, () => q(`select fn_nachweis_befuellen($1)`, [n]));
    const zeilen = (await q<{ datum: string; zeiten: string; stunden: string }>(`select to_char(datum, 'YYYY-MM-DD') as datum, zeiten, stunden::text from zeitnachweis_zeilen where nachweis_id = $1 order by datum`, [n])).rows;
    expect(zeilen.map((z) => [z.datum, z.zeiten])).toEqual([['2027-03-01', 'Sonstiges – Fortbildung'], ['2027-03-02', 'Krank'], ['2027-03-08', 'Urlaub']]);
    expect(Number(zeilen[0]!.stunden)).toBe(4);
  });
});
