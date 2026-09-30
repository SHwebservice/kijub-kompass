import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS = join(__dirname, '../../supabase/migrations');

/**
 * Baut eine frische Postgres-Datenbank (PGlite) mit einer Attrappe für Supabase-Auth
 * (auth.users, auth.uid()) und spielt alle Migrationen der Reihe nach ein.
 */
export async function neueDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;
    create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant select on auth.users to authenticated;
  `);
  const dateien = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
  for (const datei of dateien) {
    try {
      await db.exec(readFileSync(join(MIGRATIONS, datei), 'utf8'));
    } catch (e) {
      throw new Error(`Migration ${datei} fehlgeschlagen: ${(e as Error).message}`, { cause: e });
    }
  }
  return db;
}

export interface Person {
  id: string;
  uid: string;
  mail: string;
}

/** Legt Person + Konto an (Verknüpfung über die Mail-Adresse, wie im Betrieb). */
export async function person(
  db: PGlite,
  vorname: string,
  opts: { kategorie?: string; koordination?: boolean; aktiv?: boolean; ohneKonto?: boolean } = {},
): Promise<Person> {
  const mail = `${vorname.toLowerCase()}@test.example`;
  const p = await db.query<{ id: string }>(
    `insert into personen (vorname, nachname, mail, kategorie, ist_koordination, aktiv)
     values ($1, 'Test', $2, $3::kategorie, $4, $5) returning id`,
    [vorname, mail, opts.kategorie ?? 'TeamerIn', opts.koordination ?? false, opts.aktiv ?? true],
  );
  let uid = '';
  if (!opts.ohneKonto) {
    const u = await db.query<{ id: string }>(`insert into auth.users (email) values ($1) returning id`, [mail]);
    uid = u.rows[0]!.id;
  }
  return { id: p.rows[0]!.id, uid, mail };
}

/** Führt fn mit den Rechten der angemeldeten Person (oder anonym) aus. */
export async function als<T>(db: PGlite, wer: Person | null | 'anon', fn: () => Promise<T>): Promise<T> {
  if (wer === 'anon') {
    await db.exec(`set role anon; select set_config('request.jwt.claim.sub', '', false);`);
  } else {
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${wer?.uid ?? ''}', false);`);
  }
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

/** Erwartet einen Datenbankfehler (Rechte/Regel) und liefert dessen Text. */
export async function fehler(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error('Es wurde ein Fehler erwartet, aber die Anweisung war erfolgreich');
}
