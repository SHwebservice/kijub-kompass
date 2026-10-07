import { describe, it, expect, beforeAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { neueDb, person, als, fehler, type Person } from './harness';

/** Migration 0025: mehrere Wünsche auf einmal bestätigen; wer eingeteilt wird, dessen offener Wunsch gilt als bestätigt. */
let db: PGlite;
let tl: Person, tk: Person, fk: Person, andereTl: Person, anna: Person, ben: Person, carla: Person;
let treff: string, anderer: string;
let d1: string, d2: string, d3: string, fremderDienst: string;

const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params);
type W = { dienst: string; person: string };
const bestaetige = async (wer: Person, liste: W[], t = treff) =>
  (await als(db, wer, () => q<{ n: number }>(`select fn_wuensche_bestaetigen($1, $2::jsonb) as n`, [t, JSON.stringify(liste)]))).rows[0]!.n;
const status = async (dienst: string, p: Person) =>
  (await q<{ status: string; entschieden_von: string | null }>(`select status::text, entschieden_von from dienst_wuensche where dienst_id = $1 and person_id = $2`, [dienst, p.id])).rows[0];
const eingeteilt = async (dienst: string, p: Person) =>
  (await q(`select 1 from dienst_zuteilungen where dienst_id = $1 and person_id = $2`, [dienst, p.id])).rows.length === 1;
const wunsch = (dienst: string, p: Person) => q(`insert into dienst_wuensche (dienst_id, person_id) values ($1, $2)`, [dienst, p.id]);

beforeAll(async () => {
  db = await neueDb();
  tl = await person(db, 'Leitung', { kategorie: 'Hauptamtliche*r' });
  andereTl = await person(db, 'Andere', { kategorie: 'Hauptamtliche*r' });
  tk = await person(db, 'TK', { kategorie: 'Hauptamtliche*r' });
  fk = await person(db, 'FK', { kategorie: 'Hauptamtliche*r' });
  anna = await person(db, 'Anna', { kategorie: 'TZK' });
  ben = await person(db, 'Ben', { kategorie: 'TZK' });
  carla = await person(db, 'Carla', { kategorie: 'TZK' });
  await q(`update personen set ist_treffkoordination = true where id = $1`, [tk.id]);
  await q(`update personen set ist_freizeitkoordination = true where id = $1`, [fk.id]);
  treff = (await q<{ id: string }>(`insert into treffs (name) values ('Kindertreff') returning id`)).rows[0]!.id;
  anderer = (await q<{ id: string }>(`insert into treffs (name) values ('Anderer') returning id`)).rows[0]!.id;
  await q(`insert into treff_team (treff_id, person_id, rolle) values ($1, $2, 'treffleitung'), ($1, $3, 'betreuerin'), ($1, $4, 'betreuerin'), ($1, $5, 'betreuerin')`, [treff, tl.id, anna.id, ben.id, carla.id]);
  await q(`insert into treff_team (treff_id, person_id, rolle) values ($1, $2, 'treffleitung'), ($1, $3, 'betreuerin')`, [anderer, andereTl.id, anna.id]);
  const dienst = async (t: string, tage: number) => (await q<{ id: string }>(
    `insert into dienste (treff_id, datum, von, bis) values ($1, current_date + $2::int, '15:00', '19:00') returning id`, [t, tage])).rows[0]!.id;
  [d1, d2, d3, fremderDienst] = [await dienst(treff, 7), await dienst(treff, 8), await dienst(treff, 9), await dienst(anderer, 7)];
  await wunsch(d1, anna); await wunsch(d1, ben); await wunsch(d2, anna); await wunsch(d3, carla); await wunsch(fremderDienst, anna);
});

describe('fn_wuensche_bestaetigen', () => {
  it('bestätigt die Wünsche der Liste und teilt die Personen ein', async () => {
    expect(await bestaetige(tl, [{ dienst: d1, person: anna.id }, { dienst: d1, person: ben.id }])).toBe(2);
    expect(await status(d1, anna)).toEqual({ status: 'bestaetigt', entschieden_von: tl.id });
    expect(await eingeteilt(d1, anna)).toBe(true);
    expect(await eingeteilt(d1, ben)).toBe(true);
    expect(await status(d2, anna)).toMatchObject({ status: 'offen' });                       // nicht in der Liste
  });

  it('bereits beantwortete Wünsche werden übersprungen', async () => {
    await q(`update dienst_wuensche set status = 'abgelehnt' where dienst_id = $1 and person_id = $2`, [d3, carla.id]);
    expect(await bestaetige(tl, [{ dienst: d1, person: anna.id }, { dienst: d3, person: carla.id }])).toBe(0);
    expect(await eingeteilt(d3, carla)).toBe(false);
    await q(`update dienst_wuensche set status = 'offen' where dienst_id = $1 and person_id = $2`, [d3, carla.id]);
  });

  it('ganz oder gar nicht: ein Dienst eines anderen Treffs macht alles rückgängig', async () => {
    const msg = await als(db, tl, () => fehler(() => q(`select fn_wuensche_bestaetigen($1, $2::jsonb)`,
      [treff, JSON.stringify([{ dienst: d2, person: anna.id }, { dienst: fremderDienst, person: anna.id }])])));
    expect(msg).toMatch(/gehört nicht zu diesem Treff/);
    expect(await status(d2, anna)).toMatchObject({ status: 'offen' });
    expect(await eingeteilt(d2, anna)).toBe(false);
  });

  it('keine Liste: Fehler', async () => {
    expect(await als(db, tl, () => fehler(() => q(`select fn_wuensche_bestaetigen($1, '{}'::jsonb)`, [treff])))).toMatch(/Array/);
  });

  it('die Treffleitung dieses Treffs und die Treffkoordination dürfen, alle anderen nicht', async () => {
    expect(await bestaetige(tk, [{ dienst: d2, person: anna.id }])).toBe(1);
    for (const wer of [anna, andereTl, fk]) {
      const msg = await als(db, wer, () => fehler(() => q(`select fn_wuensche_bestaetigen($1, $2::jsonb)`, [treff, JSON.stringify([{ dienst: d3, person: carla.id }])])));
      expect(msg).toMatch(/Nur Treffleitung/);
    }
    expect(await als(db, 'anon', () => fehler(() => q(`select fn_wuensche_bestaetigen($1, '[]'::jsonb)`, [treff])))).toMatch(/permission denied/i);
  });
});

describe('Einteilen erfüllt einen offenen Wunsch', () => {
  it('Zuteilen (auch über fn_dienstplan_anwenden) setzt den Wunsch auf bestätigt', async () => {
    await als(db, tl, () => q(`insert into dienst_zuteilungen (dienst_id, person_id) values ($1, $2)`, [d3, carla.id]));
    expect(await status(d3, carla)).toEqual({ status: 'bestaetigt', entschieden_von: tl.id });
  });

  it('ein abgelehnter Wunsch bleibt abgelehnt, wenn die Person doch eingeteilt wird', async () => {
    const d4 = (await q<{ id: string }>(`insert into dienste (treff_id, datum, von, bis) values ($1, current_date + 10, '15:00', '19:00') returning id`, [treff])).rows[0]!.id;
    await wunsch(d4, ben);
    await q(`update dienst_wuensche set status = 'abgelehnt' where dienst_id = $1 and person_id = $2`, [d4, ben.id]);
    await als(db, tl, () => q(`insert into dienst_zuteilungen (dienst_id, person_id) values ($1, $2)`, [d4, ben.id]));
    expect(await status(d4, ben)).toMatchObject({ status: 'abgelehnt' });
  });
});
