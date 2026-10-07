import { describe, it, expect, beforeAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { neueDb, person, als, fehler, type Person } from './harness';

/** Migration 0026: Schließzeiten der Treffs, Startseite (protokoll_treffs, geschlossen) und Farbe je Freizeit. */
let db: PGlite;
let tl: Person, tk: Person, fk: Person, andereTl: Person, betr: Person;
let treff: string, anderer: string;

const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params);
const tag = (n: number) => `current_date + ${n}`;
const dienst = async (n: number, sonder = false) => (await q<{ id: string }>(
  `insert into dienste (treff_id, datum, von, bis, ist_sonder, bezeichnung) values ($1, ${tag(n)}, '15:00', '19:00', $2, $3) returning id`,
  [treff, sonder, sonder ? 'Fest' : null])).rows[0]!.id;

beforeAll(async () => {
  db = await neueDb();
  tl = await person(db, 'Leitung', { kategorie: 'Hauptamtliche*r' });
  andereTl = await person(db, 'Andere', { kategorie: 'Hauptamtliche*r' });
  tk = await person(db, 'TK', { kategorie: 'Hauptamtliche*r' });
  fk = await person(db, 'FK', { kategorie: 'Hauptamtliche*r' });
  betr = await person(db, 'Betreuer', { kategorie: 'TZK' });
  await q(`update personen set ist_treffkoordination = true where id = $1`, [tk.id]);
  await q(`update personen set ist_freizeitkoordination = true where id = $1`, [fk.id]);
  treff = (await q<{ id: string }>(`insert into treffs (name) values ('Kindertreff') returning id`)).rows[0]!.id;
  anderer = (await q<{ id: string }>(`insert into treffs (name) values ('Anderer') returning id`)).rows[0]!.id;
  await q(`insert into treff_team (treff_id, person_id, rolle) values ($1, $2, 'treffleitung'), ($1, $3, 'betreuerin')`, [treff, tl.id, betr.id]);
  await q(`insert into treff_team (treff_id, person_id, rolle) values ($1, $2, 'treffleitung')`, [anderer, andereTl.id]);
  await q(`insert into treff_oeffnungszeiten (treff_id, wochentag, von, bis) select $1, w, '15:00', '19:00' from generate_series(1, 7) w`, [treff]);
});

describe('Schließzeiten: Rechte', () => {
  it('Treffleitung des Treffs und Treffkoordination legen an, ändern und löschen; Verfasser wird vermerkt', async () => {
    const id = (await als(db, tl, () => q<{ id: string }>(`insert into treff_schliesszeiten (treff_id, von, bis, grund) values ($1, ${tag(10)}, ${tag(20)}, 'Sommerpause') returning id`, [treff]))).rows[0]!.id;
    expect((await q<{ erstellt_von: string }>(`select erstellt_von from treff_schliesszeiten where id = $1`, [id])).rows[0]!.erstellt_von).toBe(tl.id);
    await als(db, tk, () => q(`update treff_schliesszeiten set grund = 'Renovierung', erstellt_von = $2 where id = $1`, [id, tk.id]));
    expect((await q(`select grund, erstellt_von from treff_schliesszeiten where id = $1`, [id])).rows[0]).toEqual({ grund: 'Renovierung', erstellt_von: tl.id });
    await als(db, tk, () => q(`delete from treff_schliesszeiten where id = $1`, [id]));
    expect((await q(`select 1 from treff_schliesszeiten`)).rows).toHaveLength(0);
  });

  it('BetreuerIn, Treffleitung anderer Treffs und Freizeitenkoordination dürfen nicht schreiben, aber lesen', async () => {
    for (const wer of [betr, andereTl, fk]) {
      expect(await als(db, wer, () => fehler(() => q(`insert into treff_schliesszeiten (treff_id, von, bis) values ($1, ${tag(1)}, ${tag(2)})`, [treff])))).toMatch(/row-level security/i);
    }
    await q(`insert into treff_schliesszeiten (treff_id, von, bis, grund) values ($1, ${tag(30)}, ${tag(31)}, 'Fortbildung')`, [treff]);
    expect((await als(db, betr, () => q(`select grund from treff_schliesszeiten`))).rows).toEqual([{ grund: 'Fortbildung' }]);
    expect(await als(db, 'anon', () => fehler(() => q(`select 1 from treff_schliesszeiten`)))).toMatch(/permission denied/i);
    await q(`delete from treff_schliesszeiten`);
  });

  it('Ende vor Beginn und mehr als ein Jahr sind nicht erlaubt', async () => {
    expect(await als(db, tl, () => fehler(() => q(`insert into treff_schliesszeiten (treff_id, von, bis) values ($1, ${tag(5)}, ${tag(4)})`, [treff])))).toMatch(/check/i);
    expect(await als(db, tl, () => fehler(() => q(`insert into treff_schliesszeiten (treff_id, von, bis) values ($1, ${tag(0)}, ${tag(400)})`, [treff])))).toMatch(/check/i);
  });
});

describe('Schließzeiten: Dienstplan', () => {
  let zu: string, offen: string, sonder: string;
  beforeAll(async () => {
    zu = await dienst(41); offen = await dienst(45); sonder = await dienst(42, true);
    await q(`insert into dienst_wuensche (dienst_id, person_id) values ($1, $2)`, [zu, betr.id]);          // Wunsch von vor der Schließzeit
    await q(`insert into treff_schliesszeiten (treff_id, von, bis, grund) values ($1, ${tag(40)}, ${tag(43)}, 'Pause')`, [treff]);
  });

  it('ist_geschlossen kennt die Tage der Schließzeit (einschließlich Beginn und Ende)', async () => {
    const r = await q<{ a: boolean; b: boolean; c: boolean; d: boolean }>(
      `select ist_geschlossen($1, ${tag(39)}) as a, ist_geschlossen($1, ${tag(40)}) as b, ist_geschlossen($1, ${tag(43)}) as c, ist_geschlossen($2, ${tag(41)}) as d`, [treff, anderer]);
    expect(r.rows[0]).toEqual({ a: false, b: true, c: true, d: false });
  });

  it('an Schließtagen lässt sich der reguläre Dienst nicht einteilen – auch nicht über fn_dienstplan_anwenden oder Wünsche', async () => {
    expect(await als(db, tl, () => fehler(() => q(`insert into dienst_zuteilungen (dienst_id, person_id) values ($1, $2)`, [zu, betr.id])))).toMatch(/geschlossen/);
    expect(await als(db, tl, () => fehler(() => q(`select fn_wuensche_bestaetigen($1, $2::jsonb)`, [treff, JSON.stringify([{ dienst: zu, person: betr.id }])])))).toMatch(/geschlossen/);
    await als(db, tl, () => q(`insert into dienst_zuteilungen (dienst_id, person_id) values ($1, $2)`, [offen, betr.id]));      // außerhalb geht es
  });

  it('wünschen geht an Schließtagen nicht; ablehnen eines alten Wunsches schon', async () => {
    expect(await als(db, betr, () => fehler(() => q(`select fn_dienst_wunsch($1, ${tag(41)})`, [treff])))).toMatch(/geschlossen/);
    await als(db, tl, () => q(`select fn_wunsch_entscheiden($1, $2, false)`, [zu, betr.id]));
    expect((await q(`select status::text from dienst_wuensche where dienst_id = $1`, [zu])).rows[0]).toEqual({ status: 'abgelehnt' });
    expect(await als(db, betr, () => fehler(() => q(`select fn_dienst_wunsch($1, ${tag(41)})`, [treff])))).toMatch(/geschlossen/);   // erneut wünschen: nein
  });

  it('Feiertage schließen den Treff ebenso (0027) – für diesen Treff oder alle, nicht für andere Treffs', async () => {
    const ft = await dienst(50);
    await q(`insert into feiertage (treff_id, datum, bezeichnung) values (null, ${tag(50)}, 'Feiertag'), ($1, ${tag(51)}, 'Anderswo')`, [anderer]);
    expect(await als(db, tl, () => fehler(() => q(`insert into dienst_zuteilungen (dienst_id, person_id) values ($1, $2)`, [ft, betr.id])))).toMatch(/geschlossen/);
    expect(await als(db, betr, () => fehler(() => q(`select fn_dienst_wunsch($1, ${tag(50)})`, [treff])))).toMatch(/geschlossen/);
    const r = await q<{ a: boolean; b: boolean }>(`select ist_geschlossen($1, ${tag(50)}) as a, ist_geschlossen($1, ${tag(51)}) as b`, [treff]);
    expect(r.rows[0]).toEqual({ a: true, b: false });
  });

  it('Sonderdienste bleiben in der Schließzeit möglich', async () => {
    await als(db, tl, () => q(`insert into dienst_zuteilungen (dienst_id, person_id) values ($1, $2)`, [sonder, betr.id]));
    expect((await q(`select 1 from dienst_zuteilungen where dienst_id = $1`, [sonder])).rows).toHaveLength(1);
  });
});

describe('fn_heute: Protokolle nur für protokoll_treffs, geschlossene Treffs', () => {
  const heute = async (wer: Person, anfrage: Record<string, unknown>) =>
    (await als(db, wer, () => q<{ r: { protokolliert: string[]; geschlossen: string[] } }>(`select fn_heute(current_date, $1::jsonb) as r`, [JSON.stringify(anfrage)]))).rows[0]!.r;

  beforeAll(async () => {
    await q(`insert into treff_protokolle (treff_id, datum) values ($1, current_date), ($2, current_date)`, [treff, anderer]);
  });

  it('ohne protokoll_treffs wie bisher (kachel_treffs); mit protokoll_treffs nur diese', async () => {
    expect((await heute(tk, { kachel_treffs: [treff, anderer] })).protokolliert.sort()).toEqual([treff, anderer].sort());
    expect((await heute(tk, { kachel_treffs: [treff, anderer], protokoll_treffs: [] })).protokolliert).toEqual([]);
    expect((await heute(tl, { kachel_treffs: [treff], protokoll_treffs: [treff] })).protokolliert).toEqual([treff]);
  });

  it('nennt Treffs, die heute wegen Schließzeit oder Feiertag geschlossen sind', async () => {
    expect((await heute(tl, { kachel_treffs: [treff], protokoll_treffs: [treff] })).geschlossen).toEqual([]);
    await q(`insert into treff_schliesszeiten (treff_id, von, bis) values ($1, current_date, current_date)`, [treff]);
    await q(`insert into feiertage (treff_id, datum, bezeichnung) values ($1, current_date, 'Stadtfest')`, [anderer]);
    expect((await heute(tk, { kachel_treffs: [treff, anderer], protokoll_treffs: [] })).geschlossen.sort()).toEqual([treff, anderer].sort());
  });
});

describe('Farbe je Freizeit', () => {
  it('nur Farben der Palette oder leer', async () => {
    const id = (await q<{ id: string }>(`insert into freizeiten (name, start_datum, ende_datum) values ('Zeltlager', current_date, current_date + 5) returning id`)).rows[0]!.id;
    await q(`update freizeiten set farbe = 'petrol' where id = $1`, [id]);
    await q(`update freizeiten set farbe = null where id = $1`, [id]);
    expect(await fehler(() => q(`update freizeiten set farbe = '#ff0000' where id = $1`, [id]))).toMatch(/check/i);
  });
});
