import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PGlite } from '@electric-sql/pglite';
import { neueDb } from './harness';

/**
 * Nachtrag-Dateien in supabase/: Sie bringen ein Projekt, dem einzelne Migrationen fehlen, auf denselben Stand wie ein sauberer Durchlauf.
 * Der Test baut beides nach und vergleicht Tabellen, Spalten, Funktionen, Regeln, Trigger und Berechtigungen.
 */
const datei = (n: string) => readFileSync(join(__dirname, '../../supabase', n), 'utf8').replace(/\r\n/g, '\n');

async function stand(db: PGlite) {
  const q = async <T>(sql: string) => (await db.query<T>(sql)).rows;
  return {
    spalten: await q(`select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema = 'public' order by 1, 2`),
    funktionen: await q(`select p.proname, pg_get_function_identity_arguments(p.oid) as args, pg_get_functiondef(p.oid) as def, p.prosecdef from pg_proc p where p.pronamespace = 'public'::regnamespace order by 1, 2`),
    regeln: await q(`select tablename, policyname, cmd, qual, with_check from pg_policies where schemaname = 'public' order by 1, 2`),
    trigger: await q(`select c.relname, t.tgname, pg_get_triggerdef(t.oid) as def from pg_trigger t join pg_class c on c.oid = t.tgrelid where not t.tgisinternal and c.relnamespace = 'public'::regnamespace order by 1, 2`),
    sichten: await q(`select viewname, definition from pg_views where schemaname = 'public' order by 1`),
    rechte: await q(`select grantee, table_name, privilege_type from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon', 'authenticated') order by 1, 2, 3`),
    funktionsrechte: await q(`select p.proname, pg_get_function_identity_arguments(p.oid) as args, has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('authenticated', p.oid, 'execute') as angemeldet, has_function_privilege('service_role', p.oid, 'execute') as service from pg_proc p where p.pronamespace = 'public'::regnamespace order by 1, 2`),
    indizes: await q(`select tablename, indexname from pg_indexes where schemaname = 'public' order by 1, 2`),
  };
}

describe('nachtrag-0017-0019-0020-0021.sql', () => {
  it('bringt ein Projekt mit 0018, aber ohne 0017, 0019, 0020 und 0021 auf den Stand eines sauberen Durchlaufs', async () => {
    const sauber = await neueDb({ ueberspringen: ['0022', '0023', '0024', '0025', '0026', '0027', '0028', '0029', '0030', '0031', '0032', '0033', '0034', '0035'] });   // die Nachtrag-Dateien reichen bis 0021
    const luecke = await neueDb({ ueberspringen: ['0017', '0019', '0020', '0021', '0022', '0023', '0024', '0025', '0026', '0027', '0028', '0029', '0030', '0031', '0032', '0033', '0034', '0035'] });
    // Ausgangslage wie beim Anwender: 0018 ist da, die Spalte aus 0017 fehlt
    const vorher = await luecke.query(`select 1 from information_schema.columns where table_name = 'bewerbungen' and column_name = 'entschieden_am'`);
    expect(vorher.rows).toHaveLength(0);
    await luecke.exec(datei('nachtrag-0017-0019-0020-0021.sql'));

    const a = await stand(sauber);
    const b = await stand(luecke);
    for (const k of Object.keys(a) as (keyof typeof a)[]) expect(b[k], k).toEqual(a[k]);
  });

  it('lässt sich nicht zweimal ausführen (der Abbruch richtet nichts an) und ändert dann nichts', async () => {
    const db = await neueDb({ ueberspringen: ['0017', '0019', '0020', '0021', '0022', '0023', '0024', '0025', '0026', '0027', '0028', '0029', '0030', '0031', '0032', '0033', '0034', '0035'] });
    await db.exec(datei('nachtrag-0017-0019-0020-0021.sql'));
    const vorher = await stand(db);
    await expect(db.exec(datei('nachtrag-0017-0019-0020-0021.sql'))).rejects.toThrow(/already exists/i);
    expect(await stand(db)).toEqual(vorher);
  });
});

describe('nachtrag-0011-bis-0021.sql', () => {
  it('bringt ein Projekt mit Stand 0010 auf den Stand eines sauberen Durchlaufs', async () => {
    const sauber = await neueDb({ ueberspringen: ['0022', '0023', '0024', '0025', '0026', '0027', '0028', '0029', '0030', '0031', '0032', '0033', '0034', '0035'] });   // die Nachtrag-Dateien reichen bis 0021
    const alt = await neueDb({ ueberspringen: ['0011', '0012', '0013', '0014', '0015', '0016', '0017', '0018', '0019', '0020', '0021', '0022', '0023', '0024', '0025', '0026', '0027', '0028', '0029', '0030', '0031', '0032', '0033', '0034', '0035'] });
    await alt.exec(datei('nachtrag-0011-bis-0021.sql'));
    const a = await stand(sauber);
    const b = await stand(alt);
    for (const k of Object.keys(a) as (keyof typeof a)[]) expect(b[k], k).toEqual(a[k]);
  });
});
