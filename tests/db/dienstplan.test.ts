import { describe, it, expect, beforeAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { neueDb, person, als, fehler, type Person } from './harness';

/** Migration 0012: Dienstwünsche, Dienst anlegen, Zuteilungen nur für Personen des Treffs. */
let db: PGlite;
let koord: Person, tl: Person, betr: Person, betr2: Person, fremd: Person;
let treff: string, anderer: string;

const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params);
/** Nächster Tag mit der gewünschten ISO-Wochentagszahl, mindestens morgen. */
const naechster = (isodow: number) => `(current_date + 1 + ((${isodow} - extract(isodow from current_date + 1)::int + 7) % 7))`;
const datum = async (isodow: number) => (await q<{ d: string }>(`select ${naechster(isodow)}::text as d`)).rows[0]!.d;

beforeAll(async () => {
  db = await neueDb();
  koord = await person(db, 'Koord', { koordination: true, kategorie: 'Hauptamtliche*r' });
  tl = await person(db, 'Treffleitung', { kategorie: 'Hauptamtliche*r' });
  betr = await person(db, 'Betreuer', { kategorie: 'TZK' });
  betr2 = await person(db, 'Betreuer2', { kategorie: 'FSJ' });
  fremd = await person(db, 'Fremd', { kategorie: 'TZK' });
  treff = (await q<{ id: string }>(`insert into treffs (name) values ('Kindertreff') returning id`)).rows[0]!.id;
  anderer = (await q<{ id: string }>(`insert into treffs (name) values ('Anderer') returning id`)).rows[0]!.id;
  await q(`insert into treff_team values ($1, $2, 'treffleitung'), ($1, $3, 'betreuerin'), ($1, $4, 'betreuerin')`, [treff, tl.id, betr.id, betr2.id]);
  await q(`insert into treff_oeffnungszeiten values ($1, 1, '15:00', '19:00'), ($1, 3, '14:00', '18:00')`, [treff]);
});

describe('fn_dienst_sicherstellen', () => {
  it('legt den Dienst mit den Zeiten des Öffnungstags an und liefert danach dieselbe ID', async () => {
    const d = await datum(1);
    const a = await als(db, tl, () => q<{ id: string }>(`select fn_dienst_sicherstellen($1, $2) as id`, [treff, d]));
    const b = await als(db, koord, () => q<{ id: string }>(`select fn_dienst_sicherstellen($1, $2) as id`, [treff, d]));
    expect(b.rows[0]!.id).toBe(a.rows[0]!.id);
    const r = await q<{ von: string; bis: string; ist_sonder: boolean }>(`select von::text, bis::text, ist_sonder from dienste where id = $1`, [a.rows[0]!.id]);
    expect(r.rows[0]).toEqual({ von: '15:00:00', bis: '19:00:00', ist_sonder: false });
  });
  it('ist an einem Schließtag nicht möglich', async () => {
    const dienstag = await datum(2);
    const msg2 = await als(db, tl, () => fehler(() => q(`select fn_dienst_sicherstellen($1, $2)`, [treff, dienstag])));
    expect(msg2).toMatch(/nicht geöffnet/);
  });
  it('BetreuerIn und Außenstehende dürfen nicht', async () => {
    const d = await datum(3);
    const msg = await als(db, betr, () => fehler(() => q(`select fn_dienst_sicherstellen($1, $2)`, [treff, d])));
    expect(msg).toMatch(/Treffleitung/);
    const msg2 = await als(db, fremd, () => fehler(() => q(`select fn_dienst_sicherstellen($1, $2)`, [treff, d])));
    expect(msg2).toMatch(/Treffleitung/);
    const msg3 = await als(db, 'anon', () => fehler(() => q(`select fn_dienst_sicherstellen($1, $2)`, [treff, d])));
    expect(msg3).toMatch(/permission denied/i);
  });
});

describe('fn_dienst_wunsch', () => {
  it('BetreuerIn wünscht einen Öffnungstag; der Dienst entsteht dabei', async () => {
    const d = await datum(3);
    await als(db, betr, () => q(`select fn_dienst_wunsch($1, $2)`, [treff, d]));
    const r = await als(db, betr, () => q<{ status: string }>(
      `select w.status from dienst_wuensche w join dienste x on x.id = w.dienst_id where x.treff_id = $1 and x.datum = $2`, [treff, d]));
    expect(r.rows).toEqual([{ status: 'offen' }]);
  });
  it('ist idempotent (zweimal wünschen ändert nichts)', async () => {
    const d = await datum(3);
    await als(db, betr, () => q(`select fn_dienst_wunsch($1, $2)`, [treff, d]));
    const r = await q<{ c: number }>(`select count(*)::int as c from dienst_wuensche w join dienste x on x.id = w.dienst_id where x.datum = $1`, [d]);
    expect(r.rows[0]!.c).toBe(1);
  });
  it('Schließtag, Vergangenheit und Fremde werden abgelehnt', async () => {
    const dienstag = await datum(2);
    expect(await als(db, betr, () => fehler(() => q(`select fn_dienst_wunsch($1, $2)`, [treff, dienstag])))).toMatch(/nicht geöffnet/);
    const gestern = (await q<{ d: string }>(`select (current_date - ((extract(isodow from current_date)::int + 6) % 7 + 7))::text as d`)).rows[0]!.d;
    expect(await als(db, betr, () => fehler(() => q(`select fn_dienst_wunsch($1, $2)`, [treff, gestern])))).toMatch(/vergangene/);
    const mo = await datum(1);
    expect(await als(db, fremd, () => fehler(() => q(`select fn_dienst_wunsch($1, $2)`, [treff, mo])))).toMatch(/aus dem Treff/);
    expect(await als(db, betr, () => fehler(() => q(`select fn_dienst_wunsch($1, $2)`, [anderer, mo])))).toMatch(/aus dem Treff/);
  });
  it('wer schon eingeteilt ist, kann nicht wünschen', async () => {
    const mo = await datum(1);
    const id = (await als(db, tl, () => q<{ id: string }>(`select fn_dienst_sicherstellen($1, $2) as id`, [treff, mo]))).rows[0]!.id;
    await als(db, tl, () => q(`insert into dienst_zuteilungen values ($1, $2)`, [id, betr2.id]));
    expect(await als(db, betr2, () => fehler(() => q(`select fn_dienst_wunsch($1, $2)`, [treff, mo])))).toMatch(/schon eingeteilt/);
  });
  it('ein abgelehnter Wunsch kann erneut gestellt werden, ein bestätigter bleibt', async () => {
    const d = await datum(3);
    const id = (await q<{ id: string }>(`select id from dienste where treff_id = $1 and datum = $2`, [treff, d])).rows[0]!.id;
    await als(db, tl, () => q(`select fn_wunsch_entscheiden($1, $2, false)`, [id, betr.id]));
    await als(db, betr, () => q(`select fn_dienst_wunsch($1, $2)`, [treff, d]));
    const r = await q<{ status: string; entschieden_von: string | null }>(`select status, entschieden_von from dienst_wuensche where dienst_id = $1 and person_id = $2`, [id, betr.id]);
    expect(r.rows[0]).toEqual({ status: 'offen', entschieden_von: null });
    await als(db, tl, () => q(`select fn_wunsch_entscheiden($1, $2, true)`, [id, betr.id]));
    await als(db, betr, () => fehler(() => q(`select fn_dienst_wunsch($1, $2)`, [treff, d])));
    const s = await q<{ status: string }>(`select status from dienst_wuensche where dienst_id = $1 and person_id = $2`, [id, betr.id]);
    expect(s.rows[0]!.status).toBe('bestaetigt');
  });
});

describe('fn_wunsch_entscheiden', () => {
  it('Bestätigen teilt ein und merkt sich, wer entschieden hat; Ablehnen nicht', async () => {
    const d = await datum(3);
    const id = (await q<{ id: string }>(`select id from dienste where treff_id = $1 and datum = $2`, [treff, d])).rows[0]!.id;
    const zugeteilt = await q<{ person_id: string }>(`select person_id from dienst_zuteilungen where dienst_id = $1`, [id]);
    expect(zugeteilt.rows.map((x) => x.person_id)).toContain(betr.id);
    const w = await q<{ entschieden_von: string }>(`select entschieden_von from dienst_wuensche where dienst_id = $1 and person_id = $2`, [id, betr.id]);
    expect(w.rows[0]!.entschieden_von).toBe(tl.id);

    await als(db, betr2, () => q(`select fn_dienst_wunsch($1, $2)`, [treff, d]));
    await als(db, koord, () => q(`select fn_wunsch_entscheiden($1, $2, false)`, [id, betr2.id]));
    const z = await q<{ person_id: string }>(`select person_id from dienst_zuteilungen where dienst_id = $1`, [id]);
    expect(z.rows.map((x) => x.person_id)).not.toContain(betr2.id);
  });
  it('nur Treffleitung oder Koordination; ein beantworteter Wunsch lässt sich nicht erneut beantworten', async () => {
    const d = await datum(3);
    const id = (await q<{ id: string }>(`select id from dienste where treff_id = $1 and datum = $2`, [treff, d])).rows[0]!.id;
    expect(await als(db, betr, () => fehler(() => q(`select fn_wunsch_entscheiden($1, $2, true)`, [id, betr.id])))).toMatch(/Treffleitung/);
    expect(await als(db, tl, () => fehler(() => q(`select fn_wunsch_entscheiden($1, $2, true)`, [id, betr.id])))).toMatch(/bereits beantwortet/);
  });
});

describe('Zuteilungen nur für Personen des Treffs', () => {
  it('Treffleitung kann Fremde nicht einteilen', async () => {
    const mo = await datum(1);
    const id = (await q<{ id: string }>(`select id from dienste where treff_id = $1 and datum = $2`, [treff, mo])).rows[0]!.id;
    expect(await als(db, tl, () => fehler(() => q(`insert into dienst_zuteilungen values ($1, $2)`, [id, fremd.id])))).toMatch(/gehört nicht zu diesem Treff/);
    expect(await als(db, koord, () => fehler(() => q(`insert into dienst_zuteilungen values ($1, $2)`, [id, koord.id])))).toMatch(/gehört nicht zu diesem Treff/);
  });
  it('Teammitglieder lassen sich einteilen und wieder austeilen', async () => {
    const mo = await datum(1);
    const id = (await q<{ id: string }>(`select id from dienste where treff_id = $1 and datum = $2`, [treff, mo])).rows[0]!.id;
    await als(db, tl, () => q(`insert into dienst_zuteilungen values ($1, $2) on conflict do nothing`, [id, tl.id]));
    const del = await als(db, tl, () => q(`delete from dienst_zuteilungen where dienst_id = $1 and person_id = $2`, [id, tl.id]));
    expect(del.affectedRows).toBe(1);
  });
});
