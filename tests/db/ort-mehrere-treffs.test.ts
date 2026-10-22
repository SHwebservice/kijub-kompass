import { describe, it, expect, beforeAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { neueDb } from './harness';

/** Migration 0040: Ein Ort kann für mehrere Treffs genutzt werden. */
let db: PGlite;
const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params);

beforeAll(async () => { db = await neueDb(); });

describe('Ort für mehrere Treffs', () => {
  it('Kindertreff und Jugendtreff am selben Ort; der Ort lässt sich dann nicht löschen', async () => {
    const ort = (await q<{ id: string }>(`insert into orte (name) values ('Jugendhaus') returning id`)).rows[0]!.id;
    await q(`insert into treffs (name, ort_id) values ('Kindertreff', $1), ('Jugendtreff', $1)`, [ort]);
    const n = (await q<{ n: number }>(`select count(*)::int as n from treffs where ort_id = $1`, [ort])).rows[0]!.n;
    expect(n).toBe(2);
    await expect(q(`delete from orte where id = $1`, [ort])).rejects.toThrow();
  });
});
