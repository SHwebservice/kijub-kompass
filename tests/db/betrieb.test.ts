import { describe, it, expect, beforeAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { neueDb, als, fehler } from './harness';

/** Migration 0014: das Lebenszeichen für die Datenbank (Keep-alive). */
let db: PGlite;

beforeAll(async () => { db = await neueDb(); });

describe('fn_ping', () => {
  it('ist ohne Anmeldung aufrufbar und gibt nur „ok“ zurück', async () => {
    const r = await als(db, 'anon', () => db.query<{ fn_ping: string }>('select fn_ping()'));
    expect(r.rows).toEqual([{ fn_ping: 'ok' }]);
  });
  it('gilt auch für Angemeldete', async () => {
    const r = await als(db, null, () => db.query<{ fn_ping: string }>('select fn_ping()'));
    expect(r.rows[0]!.fn_ping).toBe('ok');
  });
  it('ist die einzige Funktion im Schema public, die anonym ausgeführt werden darf', async () => {
    const r = await db.query<{ proname: string }>(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
          and p.prokind = 'f' and p.proname not like 'pg%' order by 1`);
    expect(r.rows.map((x) => x.proname)).toEqual(['fn_ping']);
  });
  it('anonym bleiben Tabellen und andere Funktionen gesperrt', async () => {
    expect(await als(db, 'anon', () => fehler(() => db.query('select * from personen')))).toMatch(/permission denied/i);
    expect(await als(db, 'anon', () => fehler(() => db.query('select ist_koord()')))).toMatch(/permission denied/i);
  });
});
