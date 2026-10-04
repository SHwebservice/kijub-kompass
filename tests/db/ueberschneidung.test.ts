import { describe, it, expect, beforeAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { neueDb, person, als, fehler, type Person } from './harness';

/** Migration 0023: Überschneidungen von Freizeiten bewusst akzeptieren (nur Freizeitenkoordination). */
let db: PGlite;
let fk: Person, tk: Person, leitung: Person, anna: Person, ben: Person;
let f1: string, f2: string, f3: string, a: string, b: string;

const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params);
const zahl = async (wer: Person) => (await als(db, wer, () => q<{ n: number }>(`select count(*)::int as n from freizeit_ueberschneidungen_ok`))).rows[0]!.n;
const akzeptiere = (wer: Person, person: Person, x: string, y: string, notiz: string | null = null) =>
  als(db, wer, () => q(`insert into freizeit_ueberschneidungen_ok (person_id, freizeit_a, freizeit_b, notiz) values ($1, $2, $3, $4)`, [person.id, x, y, notiz]));

beforeAll(async () => {
  db = await neueDb();
  fk = await person(db, 'FK', { kategorie: 'Hauptamtliche*r' });
  tk = await person(db, 'TK', { kategorie: 'Hauptamtliche*r' });
  leitung = await person(db, 'Leitung', { kategorie: 'Hauptamtliche*r' });
  anna = await person(db, 'Anna');
  ben = await person(db, 'Ben');
  await q(`update personen set ist_freizeitkoordination = true where id = $1`, [fk.id]);
  await q(`update personen set ist_treffkoordination = true where id = $1`, [tk.id]);
  const frei = async (name: string, von: number) => (await q<{ id: string }>(`insert into freizeiten (name, start_datum, ende_datum) values ($1, current_date + $2::int, current_date + $2::int + 4) returning id`, [name, von])).rows[0]!.id;
  [f1, f2, f3] = [await frei('Sommer 1', 10), await frei('Sommer 2', 12), await frei('Herbst', 60)];
  [a, b] = f1 < f2 ? [f1, f2] : [f2, f1];
  await q(`insert into freizeit_team (freizeit_id, person_id, rolle) values ($1, $2, 'leitung'), ($3, $2, 'teamer'), ($1, $4, 'teamer')`, [f1, anna.id, f2, leitung.id]);
});

describe('freizeit_ueberschneidungen_ok', () => {
  it('die Freizeitenkoordination akzeptiert eine Überschneidung; Datenbank setzt Person und Zeitpunkt', async () => {
    await akzeptiere(fk, anna, a, b, 'Anna ist nur am Wochenende dabei');
    const r = await q<{ akzeptiert_von: string; notiz: string; akzeptiert_am: string }>(`select akzeptiert_von, notiz, akzeptiert_am from freizeit_ueberschneidungen_ok`);
    expect(r.rows[0]!.akzeptiert_von).toBe(fk.id);
    expect(r.rows[0]!.notiz).toBe('Anna ist nur am Wochenende dabei');
    expect(await zahl(fk)).toBe(1);
  });

  it('der Browser kann „akzeptiert von“ nicht fälschen', async () => {
    await q(`delete from freizeit_ueberschneidungen_ok`);
    await als(db, fk, () => q(`insert into freizeit_ueberschneidungen_ok (person_id, freizeit_a, freizeit_b, akzeptiert_von) values ($1, $2, $3, $4)`, [anna.id, a, b, ben.id]));
    const r = await q<{ akzeptiert_von: string }>(`select akzeptiert_von from freizeit_ueberschneidungen_ok`);
    expect(r.rows[0]!.akzeptiert_von).toBe(fk.id);
  });

  it('Treffkoordination, Leitung und gewöhnliche Personen sehen und ändern nichts', async () => {
    for (const wer of [tk, leitung, anna]) {
      expect(await zahl(wer)).toBe(0);
      expect(await als(db, wer, () => fehler(() => akzeptiere(wer, anna, a, b)))).toMatch(/row-level security/i);
    }
    const r = await als(db, tk, () => q(`delete from freizeit_ueberschneidungen_ok`));
    expect(r.affectedRows).toBe(0);
    expect(await zahl(fk)).toBe(1);
  });

  it('nicht angemeldet geht gar nichts', async () => {
    expect(await als(db, 'anon', () => fehler(() => q(`select * from freizeit_ueberschneidungen_ok`)))).toMatch(/permission denied/i);
  });

  it('die Kennungen stehen sortiert: a < b', async () => {
    expect(await als(db, fk, () => fehler(() => akzeptiere(fk, ben, b, a)))).toMatch(/check constraint|freizeit_ueberschneidungen_ok_check/i);
  });

  it('zweimal dasselbe Paar geht nicht; ein anderes Paar derselben Person schon', async () => {
    expect(await als(db, fk, () => fehler(() => akzeptiere(fk, anna, a, b)))).toMatch(/duplicate key/i);
    const [x, y] = f1 < f3 ? [f1, f3] : [f3, f1];
    await akzeptiere(fk, anna, x, y);
    expect(await zahl(fk)).toBe(2);
  });

  it('die Freizeitenkoordination kann eine Akzeptanz zurücknehmen', async () => {
    const r = await als(db, fk, () => q(`delete from freizeit_ueberschneidungen_ok where person_id = $1 and freizeit_a = $2 and freizeit_b = $3`, [anna.id, a, b]));
    expect(r.affectedRows).toBe(1);
  });

  it('verlässt die Person eine der Freizeiten, entfällt die Akzeptanz für Paare mit dieser Freizeit', async () => {
    await q(`insert into freizeit_team (freizeit_id, person_id, rolle) values ($1, $2, 'teamer')`, [f3, anna.id]);
    await akzeptiere(fk, anna, a, b);
    expect(await zahl(fk)).toBe(2);                                                                                   // (Sommer 1, Sommer 2) und (Sommer 1, Herbst)
    await als(db, fk, () => q(`delete from freizeit_team where freizeit_id = $1 and person_id = $2`, [f3, anna.id]));      // betrifft nur das Paar mit „Herbst“
    expect(await zahl(fk)).toBe(1);
    await q(`delete from freizeit_team where freizeit_id = $1 and person_id = $2`, [f2, anna.id]);
    expect(await zahl(fk)).toBe(0);
  });

  it('wird die Person oder eine Freizeit gelöscht, verschwindet die Akzeptanz mit', async () => {
    await akzeptiere(fk, ben, a, b);
    await q(`delete from freizeiten where id = $1`, [f2]);
    expect(await zahl(fk)).toBe(0);
  });
});
