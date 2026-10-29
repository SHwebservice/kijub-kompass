import { describe, it, expect, beforeAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { neueDb, person, als, fehler, type Person } from './harness';

/** Migration 0041: Mitteilung „Ersatz gesucht“ an die Personen, die an dem Tag frei sind. */
let db: PGlite;
let tl: Person, anna: Person, ben: Person, carla: Person, dora: Person;
let treff: string, tag: string;
const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params);
type Push = { empfaenger: string[]; titel: string; text: string; url: string };
const vorbereiten = (wer: Person, datum: string) => als(db, wer, () => q<{ p: Push }>(`select fn_push_vorbereiten('ersatz_gesucht', $1, $2::jsonb) as p`, [treff, JSON.stringify({ datum })]));

beforeAll(async () => {
  db = await neueDb();
  tl = await person(db, 'Leitung', { kategorie: 'Hauptamtliche*r' });
  anna = await person(db, 'Anna', { kategorie: 'TZK' });
  ben = await person(db, 'Ben', { kategorie: 'TZK' });
  carla = await person(db, 'Carla', { kategorie: 'TZK' });
  dora = await person(db, 'Dora', { kategorie: 'TZK' });
  treff = (await q<{ id: string }>(`insert into treffs (name) values ('Kindertreff') returning id`)).rows[0]!.id;
  await q(`insert into treff_team (treff_id, person_id, rolle) values ($1, $2, 'treffleitung'), ($1, $3, 'betreuerin'), ($1, $4, 'betreuerin'), ($1, $5, 'betreuerin'), ($1, $6, 'betreuerin')`,
    [treff, tl.id, anna.id, ben.id, carla.id, dora.id]);
  // ein Montag in der Zukunft
  tag = (await q<{ d: string }>(`select to_char(current_date + (8 - extract(isodow from current_date)::int) + 7, 'YYYY-MM-DD') as d`)).rows[0]!.d;
  await q(`insert into treff_oeffnungszeiten (treff_id, wochentag, von, bis) values ($1, 1, '15:00', '19:00')`, [treff]);
  const d = (await q<{ id: string }>(`insert into dienste (treff_id, datum, von, bis) values ($1, $2, '15:00', '19:00') returning id`, [treff, tag])).rows[0]!.id;
  await q(`insert into dienst_zuteilungen (dienst_id, person_id) values ($1, $2)`, [d, anna.id]);                 // Anna ist eingeteilt
  await q(`insert into abwesenheiten (person_id, datum, typ) values ($1, $2, 'krank')`, [ben.id, tag]);           // Ben ist krank
  await q(`insert into dienst_verhinderungen (treff_id, person_id, datum) values ($1, $2, $3)`, [treff, carla.id, tag]);   // Carla kann nicht
});

describe('Ersatz gesucht', () => {
  it('geht nur an die Freien: nicht eingeteilt, nicht abwesend, ohne „kann nicht“, nicht an die fragende Person', async () => {
    const p = (await vorbereiten(tl, tag)).rows[0]!.p;
    expect(p.empfaenger).toEqual([dora.id]);
    expect(p.titel).toBe('Ersatz gesucht · Kindertreff');
    expect(p.text).toMatch(/^Wer kann am Mo \d\d\.\d\d\. \(15:00–19:00 Uhr\) einspringen\?/);
    expect(p.url).toBe(`/treffs/${treff}/dienstplan?datum=${tag}`);
  });

  it('nur Treffleitung und Treffkoordination, nur Öffnungstage ab heute', async () => {
    expect(await fehler(() => vorbereiten(anna, tag))).toMatch(/nicht zulässig/);
    expect(await fehler(() => vorbereiten(tl, '2000-01-03'))).toMatch(/nicht zulässig/);
    const dienstag = (await q<{ d: string }>(`select to_char($1::date + 1, 'YYYY-MM-DD') as d`, [tag])).rows[0]!.d;
    expect(await fehler(() => vorbereiten(tl, dienstag))).toMatch(/nicht zulässig/);
  });

  it('andere Arten laufen unverändert weiter (z. B. Dienstplan veröffentlicht aus 0036)', async () => {
    expect(await als(db, tl, () => fehler(() => q(`select fn_push_vorbereiten('dienstplan_veroeffentlicht', $1, '{"monat":"2031-01-01"}'::jsonb)`, [treff])))).toMatch(/nicht zulässig/);
  });
});
