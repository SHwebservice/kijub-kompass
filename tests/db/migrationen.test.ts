import { describe, it, expect } from 'vitest';
import { neueDb } from './harness';

describe('Migrationen', () => {
  it('laufen auf einer leeren Datenbank durch', async () => {
    const db = await neueDb();
    const r = await db.query<{ n: number }>(
      `select count(*)::int as n from pg_tables where schemaname = 'public'`);
    expect(r.rows[0]!.n).toBeGreaterThan(30);
  });

  it('haben auf jeder Tabelle Row Level Security eingeschaltet', async () => {
    const db = await neueDb();
    const r = await db.query<{ tablename: string }>(
      `select c.relname as tablename from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
    expect(r.rows).toEqual([]);
  });
});
