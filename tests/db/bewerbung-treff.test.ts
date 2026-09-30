import { describe, it, expect, beforeAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { neueDb, person, als, fehler, type Person } from './harness';

/** Migration 0021: Bewerbung mit Rollenwahl annehmen; Aufräumen, wenn jemand aus einem Treff entfernt wird. */
let db: PGlite;
let fk: Person, tk: Person, bewerber: Person, bewerber2: Person, team: Person, tl: Person, betr: Person;
let fz: string, treff: string;

const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params);
const rolleIn = async (p: Person) => (await q<{ rolle: string }>(`select rolle::text from freizeit_team where freizeit_id = $1 and person_id = $2`, [fz, p.id])).rows[0]?.rolle ?? null;
const neueBewerbung = async (p: Person) => (await q<{ id: string }>(`insert into bewerbungen (person_id, freizeit_id) values ($1, $2) returning id`, [p.id, fz])).rows[0]!.id;

beforeAll(async () => {
  db = await neueDb();
  fk = await person(db, 'FK', { kategorie: 'Hauptamtliche*r' });
  tk = await person(db, 'TK', { kategorie: 'Hauptamtliche*r' });
  await q(`update personen set ist_freizeitkoordination = true where id = $1`, [fk.id]);
  await q(`update personen set ist_treffkoordination = true where id = $1`, [tk.id]);
  bewerber = await person(db, 'Bewerber');
  bewerber2 = await person(db, 'Bewerber2');
  team = await person(db, 'Teamer');
  tl = await person(db, 'Treffleitung', { kategorie: 'Hauptamtliche*r' });
  betr = await person(db, 'Betreuer', { kategorie: 'TZK' });
  fz = (await q<{ id: string }>(`insert into freizeiten (name, start_datum, ende_datum) values ('Sommer', current_date + 30, current_date + 34) returning id`)).rows[0]!.id;
  treff = (await q<{ id: string }>(`insert into treffs (name) values ('Kindertreff') returning id`)).rows[0]!.id;
  await q(`insert into treff_team values ($1, $2, 'treffleitung'), ($1, $3, 'betreuerin')`, [treff, tl.id, betr.id]);
});

describe('Bewerbung annehmen mit Rolle', () => {
  it('ohne Angabe: TeamerIn (wie bisher)', async () => {
    const b = await neueBewerbung(bewerber);
    await als(db, fk, () => q(`select fn_bewerbung_annehmen($1)`, [b]));
    expect(await rolleIn(bewerber)).toBe('teamer');
  });

  it('mit Rolle Leitung: als Leitung zugeordnet', async () => {
    const b = await neueBewerbung(bewerber2);
    await als(db, fk, () => q(`select fn_bewerbung_annehmen($1, 'leitung')`, [b]));
    expect(await rolleIn(bewerber2)).toBe('leitung');
  });

  it('ist die Person schon im Team: Leitung stuft hoch, TeamerIn stuft nie herab', async () => {
    await q(`insert into freizeit_team values ($1, $2, 'teamer')`, [fz, team.id]);
    const b = await neueBewerbung(team);
    await als(db, fk, () => q(`select fn_bewerbung_annehmen($1, 'leitung')`, [b]));
    expect(await rolleIn(team)).toBe('leitung');
    await q(`update bewerbungen set status = 'offen' where id = $1`, [b]);
    await als(db, fk, () => q(`select fn_bewerbung_annehmen($1, 'teamer')`, [b]));
    expect(await rolleIn(team)).toBe('leitung');
  });

  it('nur die Freizeitenkoordination; eine falsche Rolle ist ungültig; doppelte Entscheidung nicht möglich', async () => {
    const b = await neueBewerbung(await person(db, 'Dritter'));
    expect(await als(db, tk, () => fehler(() => q(`select fn_bewerbung_annehmen($1, 'leitung')`, [b])))).toMatch(/Nur die Koordination/);
    expect(await als(db, fk, () => fehler(() => q(`select fn_bewerbung_annehmen($1, 'chef')`, [b])))).toMatch(/invalid input value/i);
    await als(db, fk, () => q(`select fn_bewerbung_annehmen($1)`, [b]));
    expect(await als(db, fk, () => fehler(() => q(`select fn_bewerbung_annehmen($1)`, [b])))).toMatch(/bereits entschieden/);
  });

  it('die Mitteilung nennt die Rolle', async () => {
    const leit = await person(db, 'Leiter');
    const b1 = await neueBewerbung(leit);
    await als(db, fk, () => q(`select fn_bewerbung_annehmen($1, 'leitung')`, [b1]));
    const r1 = (await als(db, fk, () => q<{ r: { text: string } }>(`select fn_push_vorbereiten('bewerbung_angenommen', $1) as r`, [b1]))).rows[0]!.r;
    expect(r1.text).toMatch(/^Du bist als Leitung dabei: Sommer/);
    await q('delete from mitteilungen_log');
    const t = await person(db, 'Teamerin');
    const b2 = await neueBewerbung(t);
    await als(db, fk, () => q(`select fn_bewerbung_annehmen($1)`, [b2]));
    const r2 = (await als(db, fk, () => q<{ r: { text: string } }>(`select fn_push_vorbereiten('bewerbung_angenommen', $1) as r`, [b2]))).rows[0]!.r;
    expect(r2.text).toMatch(/^Du bist dabei: Sommer/);
  });
});

describe('Entfernen aus einem Treff räumt künftige Dienste auf', () => {
  const dienst = async (tage: number) => (await q<{ id: string }>(`insert into dienste (treff_id, datum) values ($1, (now() at time zone 'Europe/Berlin')::date + $2::int) returning id`, [treff, tage])).rows[0]!.id;
  const dienste = async (p: Person) => (await q<{ n: number }>(`select count(*)::int as n from dienst_zuteilungen where person_id = $1`, [p.id])).rows[0]!.n;

  it('künftige Zuteilungen und offene Wünsche verschwinden, vergangene Dienste bleiben', async () => {
    const vergangen = await dienst(-5); const heute = await dienst(0); const bald = await dienst(3); const spaeter = await dienst(10);
    for (const d of [vergangen, heute, bald]) await q(`insert into dienst_zuteilungen values ($1, $2)`, [d, betr.id]);
    await q(`insert into dienst_wuensche (dienst_id, person_id) values ($1, $2)`, [spaeter, betr.id]);
    await q(`insert into dienst_zuteilungen values ($1, $2)`, [bald, tl.id]);

    await als(db, tk, () => q(`delete from treff_team where treff_id = $1 and person_id = $2`, [treff, betr.id]));

    expect(await dienste(betr)).toBe(1);                                          // nur der vergangene bleibt
    expect((await q<{ dienst_id: string }>(`select dienst_id from dienst_zuteilungen where person_id = $1`, [betr.id])).rows[0]!.dienst_id).toBe(vergangen);
    expect((await q(`select 1 from dienst_wuensche where person_id = $1`, [betr.id])).rows).toHaveLength(0);
    expect(await dienste(tl)).toBe(1);                                            // andere Personen bleiben unberührt
  });

  it('gilt auch bei Löschen der Person aus dem Team über andere Wege; andere Treffs bleiben unberührt', async () => {
    const anderer = (await q<{ id: string }>(`insert into treffs (name) values ('Anderer') returning id`)).rows[0]!.id;
    await q(`insert into treff_team values ($1, $2, 'betreuerin'), ($3, $2, 'betreuerin')`, [treff, betr.id, anderer]);
    const d1 = await dienst(4);
    const d2 = (await q<{ id: string }>(`insert into dienste (treff_id, datum) values ($1, (now() at time zone 'Europe/Berlin')::date + 4) returning id`, [anderer])).rows[0]!.id;
    await q(`insert into dienst_zuteilungen values ($1, $3), ($2, $3)`, [d1, d2, betr.id]);
    await q(`delete from treff_team where treff_id = $1 and person_id = $2`, [treff, betr.id]);
    const r = await q<{ dienst_id: string }>(`select dienst_id from dienst_zuteilungen where person_id = $1 and dienst_id in ($2, $3)`, [betr.id, d1, d2]);
    expect(r.rows.map((x) => x.dienst_id)).toEqual([d2]);
  });

  it('eine Rollenänderung im Treff löscht nichts', async () => {
    const d = await dienst(6);
    await q(`insert into dienst_zuteilungen values ($1, $2)`, [d, tl.id]);
    await q(`update treff_team set rolle = 'betreuerin' where treff_id = $1 and person_id = $2`, [treff, tl.id]);
    expect((await q(`select 1 from dienst_zuteilungen where dienst_id = $1 and person_id = $2`, [d, tl.id])).rows).toHaveLength(1);
  });

  it('die Aufräum-Funktion ist von außen nicht aufrufbar', async () => {
    expect(await als(db, tk, () => fehler(() => q(`select fn_treff_team_aufraeumen()`)))).toMatch(/permission denied/i);
  });
});
