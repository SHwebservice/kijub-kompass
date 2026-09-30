import { describe, it, expect, beforeAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { neueDb, person, als, fehler, type Person } from './harness';

/** Migration 0013: Kommentare im Katalog mit Namen – für alle aktiven Personen, auch ohne gemeinsames Team. */
let db: PGlite;
let koord: Person, anna: Person, ben: Person, inaktiv: Person;
let angebot: string;

const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params);

beforeAll(async () => {
  db = await neueDb();
  koord = await person(db, 'Koord', { koordination: true, kategorie: 'Hauptamtliche*r' });
  anna = await person(db, 'Anna');
  ben = await person(db, 'Ben', { kategorie: 'TZK' });
  inaktiv = await person(db, 'Inaktiv', { aktiv: false });
  angebot = (await q<{ id: string }>(`insert into angebote (name, kategorie) values ('Fangen', 'bewegung') returning id`)).rows[0]!.id;
  await als(db, anna, () => q(`insert into angebot_kommentare (angebot_id, person_id, text) values ($1, $2, 'Hat allen Spaß gemacht')`, [angebot, anna.id]));
});

describe('v_angebot_kommentare', () => {
  it('aktive Personen sehen Kommentare anderer mit Namen, ohne ein Team zu teilen', async () => {
    const r = await als(db, ben, () => q<{ vorname: string; nachname: string; text: string }>('select vorname, nachname, text from v_angebot_kommentare'));
    expect(r.rows).toEqual([{ vorname: 'Anna', nachname: 'Test', text: 'Hat allen Spaß gemacht' }]);
  });
  it('die Sicht gibt aus dem Personenprofil nur Vor- und Nachname heraus', async () => {
    const r = await als(db, ben, () => q('select * from v_angebot_kommentare'));
    expect(Object.keys(r.rows[0]!).sort()).toEqual(['angebot_id', 'created_at', 'id', 'nachname', 'person_id', 'text', 'vorname']);
  });
  it('Inaktive und Anonyme sehen nichts', async () => {
    const i = await als(db, inaktiv, () => q('select * from v_angebot_kommentare'));
    expect(i.rows).toHaveLength(0);
    const msg = await als(db, 'anon', () => fehler(() => q('select * from v_angebot_kommentare')));
    expect(msg).toMatch(/permission denied/i);
  });
  it('schreiben geht weiterhin nur über die Tabelle, und nur als man selbst', async () => {
    const msg = await als(db, ben, () => fehler(() => q(`insert into angebot_kommentare (angebot_id, person_id, text) values ($1, $2, 'x')`, [angebot, anna.id])));
    expect(msg).toMatch(/row-level security/i);
    const viewMsg = await als(db, ben, () => fehler(() => q(`insert into v_angebot_kommentare (angebot_id, person_id, text) values ($1, $2, 'x')`, [angebot, ben.id])));
    expect(viewMsg).toBeTruthy();
  });
  it('Löschen: Verfasser und Koordination, nicht andere', async () => {
    const id = (await als(db, ben, () => q<{ id: string }>(`insert into angebot_kommentare (angebot_id, person_id, text) values ($1, $2, 'von Ben') returning id`, [angebot, ben.id]))).rows[0]!.id;
    const fremd = await als(db, anna, () => q(`delete from angebot_kommentare where id = $1`, [id]));
    expect(fremd.affectedRows).toBe(0);
    const k = await als(db, koord, () => q(`delete from angebot_kommentare where id = $1`, [id]));
    expect(k.affectedRows).toBe(1);
  });
});
