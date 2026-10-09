import { describe, it, expect, beforeAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { neueDb, person, als, fehler, type Person } from './harness';

/** Migration 0035: Teamprotokolle der Treffs. */
let db: PGlite;
let tl: Person, tk: Person, fk: Person, betr: Person, betr2: Person, fremd: Person;
let treff: string, anderer: string;

const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params);
const lege = async (wer: Person, titel = 'Teamsitzung März', anwesend: string[] = [], t = treff) =>
  (await als(db, wer, () => q<{ id: string }>(`insert into treff_teamprotokolle (treff_id, art, datum, titel, text, anwesend) values ($1, 'teambesprechung', '2027-03-04', $2, 'Neue Öffnungszeiten ab April.', $3::uuid[]) returning id`,
    [t, titel, `{${anwesend.join(',')}}`]))).rows[0]!.id;

beforeAll(async () => {
  db = await neueDb();
  tl = await person(db, 'Lea', { kategorie: 'Hauptamtliche*r' });
  tk = await person(db, 'TK', { kategorie: 'Hauptamtliche*r' });
  fk = await person(db, 'FK', { kategorie: 'Hauptamtliche*r' });
  betr = await person(db, 'Ben', { kategorie: 'TZK' });
  betr2 = await person(db, 'Bea', { kategorie: 'FSJ' });
  fremd = await person(db, 'Fremd', { kategorie: 'TZK' });
  await q(`update personen set ist_treffkoordination = true where id = $1`, [tk.id]);
  await q(`update personen set ist_freizeitkoordination = true where id = $1`, [fk.id]);
  treff = (await q<{ id: string }>(`insert into treffs (name) values ('Kindertreff') returning id`)).rows[0]!.id;
  anderer = (await q<{ id: string }>(`insert into treffs (name) values ('Anderer') returning id`)).rows[0]!.id;
  await q(`insert into treff_team (treff_id, person_id, rolle) values ($1, $2, 'treffleitung'), ($1, $3, 'betreuerin'), ($1, $4, 'betreuerin'), ($5, $6, 'betreuerin')`,
    [treff, tl.id, betr.id, betr2.id, anderer, fremd.id]);
});

describe('Teamprotokolle: anlegen und lesen', () => {
  it('die Treffleitung legt an; Verfasser und Zeit setzt die Datenbank', async () => {
    const id = await lege(tl, 'Teamsitzung März', [betr.id, tl.id, betr.id]);
    const r = (await q<{ erstellt_von: string; bearbeitet_von: string; anwesend: string[] }>(`select erstellt_von, bearbeitet_von, anwesend from treff_teamprotokolle where id = $1`, [id])).rows[0]!;
    expect(r.erstellt_von).toBe(tl.id);
    expect(r.bearbeitet_von).toBe(tl.id);
    expect(new Set(r.anwesend)).toEqual(new Set([betr.id, tl.id]));                                           // doppelte entfernt
  });

  it('das ganze Team und die Treffkoordination lesen; andere Treffs und die Freizeitenkoordination nicht', async () => {
    for (const wer of [tl, betr, betr2, tk]) expect((await als(db, wer, () => q(`select 1 from treff_teamprotokolle`))).rows.length).toBeGreaterThan(0);
    for (const wer of [fremd, fk]) expect((await als(db, wer, () => q(`select 1 from treff_teamprotokolle`))).rows).toHaveLength(0);
    expect(await als(db, 'anon', () => fehler(() => q(`select 1 from treff_teamprotokolle`)))).toMatch(/permission denied/i);
  });

  it('nur Treffleitung und Treffkoordination schreiben, ändern, löschen', async () => {
    for (const wer of [betr, fremd, fk]) expect(await fehler(() => lege(wer))).toMatch(/row-level security/i);
    const id = await lege(tk, 'Info von der Koordination');
    await als(db, tl, () => q(`update treff_teamprotokolle set text = 'ergänzt' where id = $1`, [id]));
    expect((await q(`select bearbeitet_von from treff_teamprotokolle where id = $1`, [id])).rows[0]).toEqual({ bearbeitet_von: tl.id });
    const r = await als(db, betr, () => q(`update treff_teamprotokolle set text = 'x' where id = $1`, [id]));
    expect(r.affectedRows ?? 0).toBe(0);
    await als(db, tl, () => q(`delete from treff_teamprotokolle where id = $1`, [id]));
  });

  it('anwesend nur aus dem Team; leerer Titel, falsche Art und Verschieben nicht erlaubt', async () => {
    expect(await fehler(() => lege(tl, 'x', [fremd.id]))).toMatch(/nur Personen aus dem Team/);
    expect(await als(db, tl, () => fehler(() => q(`insert into treff_teamprotokolle (treff_id, titel, text) values ($1, ' ', 'x')`, [treff])))).toMatch(/check/i);
    expect(await als(db, tl, () => fehler(() => q(`insert into treff_teamprotokolle (treff_id, art, titel, text) values ($1, 'gerücht', 't', 'x')`, [treff])))).toMatch(/check/i);
    const id = await lege(tl, 'Zum Verschieben');
    expect(await als(db, tk, () => fehler(() => q(`update treff_teamprotokolle set treff_id = $2 where id = $1`, [id, anderer])))).toMatch(/nicht in einen anderen Treff/);
  });
});

describe('Gelesen', () => {
  it('jede Person vermerkt nur sich selbst; die Treffleitung sieht, wer gelesen hat', async () => {
    const id = (await q<{ id: string }>(`select id from treff_teamprotokolle where titel = 'Teamsitzung März'`)).rows[0]!.id;
    await als(db, betr, () => q(`insert into treff_teamprotokoll_gelesen (protokoll_id, person_id) values ($1, $2)`, [id, betr.id]));
    expect(await als(db, betr, () => fehler(() => q(`insert into treff_teamprotokoll_gelesen (protokoll_id, person_id) values ($1, $2)`, [id, betr2.id])))).toMatch(/row-level security/i);
    expect(await als(db, fremd, () => fehler(() => q(`insert into treff_teamprotokoll_gelesen (protokoll_id, person_id) values ($1, $2)`, [id, fremd.id])))).toMatch(/row-level security/i);
    expect((await als(db, tl, () => q<{ person_id: string }>(`select person_id from treff_teamprotokoll_gelesen where protokoll_id = $1`, [id]))).rows).toEqual([{ person_id: betr.id }]);
    expect((await als(db, fremd, () => q(`select 1 from treff_teamprotokoll_gelesen`))).rows).toHaveLength(0);
  });
});

describe('Mitteilung', () => {
  it('neues Protokoll: an das Team ohne die verfassende Person, Link zum Reiter', async () => {
    const id = await lege(tl, 'Wichtige Info');
    const p = (await als(db, tl, () => q<{ p: { empfaenger: string[]; titel: string; text: string; url: string } }>(`select fn_push_vorbereiten('teamprotokoll', $1) as p`, [id]))).rows[0]!.p;
    expect(new Set(p.empfaenger)).toEqual(new Set([betr.id, betr2.id]));
    expect(p).toMatchObject({ titel: 'Neues Teamprotokoll · Kindertreff', text: 'Wichtige Info (04.03.2027) – bitte lesen.', url: `/treffs/${treff}/teamprotokolle` });
    expect(await als(db, betr, () => fehler(() => q(`select fn_push_vorbereiten('teamprotokoll', $1)`, [id])))).toMatch(/nicht zulässig/);
  });
});
