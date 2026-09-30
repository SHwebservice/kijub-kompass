import { describe, it, expect, beforeAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { neueDb, person, als, fehler, type Person } from './harness';

/** Migration 0016: Tagesprotokoll und Notizen der Treffs. */
let db: PGlite;
let koord: Person, tl: Person, betr: Person, betr2: Person, fremd: Person;
let treff: string, anderer: string;

const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params);
const heute = async () => (await q<{ d: string }>(`select (now() at time zone 'Europe/Berlin')::date::text as d`)).rows[0]!.d;
const tagVor = async (n: number) => (await q<{ d: string }>(`select ((now() at time zone 'Europe/Berlin')::date - ${n})::text as d`)).rows[0]!.d;

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
});

describe('Tagesprotokoll', () => {
  it('jede Person des Treff-Teams legt an, liest und bearbeitet – auch Protokolle der anderen', async () => {
    const d = await tagVor(1);
    await als(db, betr, () => q(`insert into treff_protokolle (treff_id, datum, anz_m, anz_w, anz_d, verlauf) values ($1, $2, 5, 7, 1, 'Basteln')`, [treff, d]));
    const gelesen = await als(db, betr2, () => q<{ anz_w: number }>(`select anz_w from treff_protokolle where treff_id = $1 and datum = $2`, [treff, d]));
    expect(gelesen.rows[0]!.anz_w).toBe(7);
    await als(db, betr2, () => q(`update treff_protokolle set anz_w = 8, vorkommnisse = 'Streit um den Kicker' where treff_id = $1 and datum = $2`, [treff, d]));
    await als(db, tl, () => q(`update treff_protokolle set verlauf = 'Basteln und Kicker' where treff_id = $1 and datum = $2`, [treff, d]));
    const r = await q<{ erstellt_von: string; bearbeitet_von: string; anz_w: number }>(`select erstellt_von, bearbeitet_von, anz_w from treff_protokolle where treff_id = $1 and datum = $2`, [treff, d]);
    expect(r.rows[0]).toEqual({ erstellt_von: betr.id, bearbeitet_von: tl.id, anz_w: 8 });
  });

  it('die Koordination darf alles lesen und schreiben', async () => {
    const d = await tagVor(2);
    await als(db, koord, () => q(`insert into treff_protokolle (treff_id, datum, anz_m) values ($1, $2, 3)`, [treff, d]));
    const r = await als(db, koord, () => q(`select 1 from treff_protokolle where treff_id = $1`, [treff]));
    expect(r.rows.length).toBeGreaterThan(1);
  });

  it('Außenstehende (auch aus einem anderen Treff) sehen nichts und schreiben nichts', async () => {
    const d = await tagVor(1);
    const r = await als(db, fremd, () => q(`select 1 from treff_protokolle`));
    expect(r.rows).toEqual([]);
    const msg = await als(db, fremd, () => fehler(() => q(`insert into treff_protokolle (treff_id, datum) values ($1, $2)`, [treff, d])));
    expect(msg).toBeTruthy();
    const msg2 = await als(db, fremd, () => fehler(() => q(`insert into treff_protokolle (treff_id, datum) values ($1, $2)`, [anderer, d])));
    expect(msg2).toMatch(/row-level security/i);
    await als(db, fremd, () => q(`update treff_protokolle set anz_m = 99 where treff_id = $1`, [treff]));
    const unveraendert = await q<{ n: number }>(`select count(*)::int as n from treff_protokolle where anz_m = 99`);
    expect(unveraendert.rows[0]!.n).toBe(0);
  });

  it('nicht angemeldet: kein Zugriff', async () => {
    const msg = await als(db, 'anon', () => fehler(() => q(`select * from treff_protokolle`)));
    expect(msg).toMatch(/permission denied/i);
  });

  it('pro Treff und Tag nur ein Protokoll', async () => {
    const d = await tagVor(1);
    const msg = await als(db, betr, () => fehler(() => q(`insert into treff_protokolle (treff_id, datum) values ($1, $2)`, [treff, d])));
    expect(msg).toMatch(/duplicate|unique/i);
  });

  it('nicht für einen Tag in der Zukunft, Zahlen nur von 0 bis 500', async () => {
    const morgen = (await q<{ d: string }>(`select ((now() at time zone 'Europe/Berlin')::date + 1)::text as d`)).rows[0]!.d;
    expect(await als(db, betr, () => fehler(() => q(`insert into treff_protokolle (treff_id, datum) values ($1, $2)`, [treff, morgen])))).toMatch(/Zukunft/);
    const d = await tagVor(10);
    expect(await als(db, betr, () => fehler(() => q(`insert into treff_protokolle (treff_id, datum, anz_m) values ($1, $2, -1)`, [treff, d])))).toMatch(/check/i);
    expect(await als(db, betr, () => fehler(() => q(`insert into treff_protokolle (treff_id, datum, anz_d) values ($1, $2, 501)`, [treff, d])))).toMatch(/check/i);
  });

  it('heute darf geschrieben werden (Ortszeit)', async () => {
    const h = await heute();
    await als(db, betr, () => q(`insert into treff_protokolle (treff_id, datum, anz_m) values ($1, $2, 1)`, [treff, h]));
  });

  it('Treff, Datum und Verfasser lassen sich nicht umschreiben', async () => {
    const d = await tagVor(1); const andererTag = await tagVor(20);
    expect(await als(db, betr, () => fehler(() => q(`update treff_protokolle set datum = $2 where treff_id = $1 and datum = $3`, [treff, andererTag, d])))).toMatch(/nicht ändern/);
    expect(await als(db, betr, () => fehler(() => q(`update treff_protokolle set treff_id = $2 where treff_id = $1 and datum = $3`, [treff, anderer, d])))).toMatch(/nicht ändern|row-level/i);
    await als(db, betr2, () => q(`update treff_protokolle set erstellt_von = $3 where treff_id = $1 and datum = $2`, [treff, d, betr2.id]));
    expect((await q<{ erstellt_von: string }>(`select erstellt_von from treff_protokolle where treff_id = $1 and datum = $2`, [treff, d])).rows[0]!.erstellt_von).toBe(betr.id);
  });

  it('Verfasser beim Anlegen ist immer die angemeldete Person', async () => {
    const d = await tagVor(30);
    await als(db, betr, () => q(`insert into treff_protokolle (treff_id, datum, erstellt_von) values ($1, $2, $3)`, [treff, d, betr2.id]));
    expect((await q<{ erstellt_von: string }>(`select erstellt_von from treff_protokolle where treff_id = $1 and datum = $2`, [treff, d])).rows[0]!.erstellt_von).toBe(betr.id);
  });

  it('löschen dürfen nur Treffleitung und Koordination', async () => {
    const d = await tagVor(30);
    await als(db, betr, () => q(`delete from treff_protokolle where treff_id = $1 and datum = $2`, [treff, d]));
    expect((await q(`select 1 from treff_protokolle where treff_id = $1 and datum = $2`, [treff, d])).rows.length).toBe(1);
    await als(db, tl, () => q(`delete from treff_protokolle where treff_id = $1 and datum = $2`, [treff, d]));
    expect((await q(`select 1 from treff_protokolle where treff_id = $1 and datum = $2`, [treff, d])).rows.length).toBe(0);
  });

  it('wird mit der Person nicht blockiert: Verfasser wird leer, das Protokoll bleibt', async () => {
    const weg = await person(db, 'Weg', { kategorie: 'TZK' });
    await q(`insert into treff_team values ($1, $2, 'betreuerin')`, [treff, weg.id]);
    const d = await tagVor(40);
    await als(db, weg, () => q(`insert into treff_protokolle (treff_id, datum) values ($1, $2)`, [treff, d]));
    await q(`delete from treff_team where person_id = $1`, [weg.id]);
    await q(`delete from personen where id = $1`, [weg.id]);
    expect((await q<{ erstellt_von: string | null }>(`select erstellt_von from treff_protokolle where treff_id = $1 and datum = $2`, [treff, d])).rows[0]!.erstellt_von).toBeNull();
  });
});

describe('Notizen und Listen', () => {
  it('das Team legt an, bearbeitet und erledigt – mit Vermerk, wer und wann', async () => {
    const id = (await als(db, betr, () => q<{ id: string }>(`insert into treff_aufgaben (treff_id, art, text) values ($1, 'einkauf', 'Saft') returning id`, [treff]))).rows[0]!.id;
    await als(db, betr2, () => q(`update treff_aufgaben set erledigt = true where id = $1`, [id]));
    const r = await q<{ erstellt_von: string; erledigt_von: string; erledigt_am: string | null }>(`select erstellt_von, erledigt_von, erledigt_am::text from treff_aufgaben where id = $1`, [id]);
    expect(r.rows[0]!.erstellt_von).toBe(betr.id);
    expect(r.rows[0]!.erledigt_von).toBe(betr2.id);
    expect(r.rows[0]!.erledigt_am).not.toBeNull();
    await als(db, tl, () => q(`update treff_aufgaben set erledigt = false where id = $1`, [id]));
    const z = await q<{ erledigt_von: string | null; erledigt_am: string | null }>(`select erledigt_von, erledigt_am from treff_aufgaben where id = $1`, [id]);
    expect(z.rows[0]).toEqual({ erledigt_von: null, erledigt_am: null });
  });

  it('beim Anlegen lässt sich „erledigt“ nicht vortäuschen', async () => {
    const id = (await als(db, betr, () => q<{ id: string }>(`insert into treff_aufgaben (treff_id, text, erledigt, erledigt_von, erledigt_am) values ($1, 'X', true, $2, now()) returning id`, [treff, tl.id]))).rows[0]!.id;
    const r = await q<{ erledigt: boolean; erledigt_von: string | null }>(`select erledigt, erledigt_von from treff_aufgaben where id = $1`, [id]);
    expect(r.rows[0]).toEqual({ erledigt: false, erledigt_von: null });
  });

  it('zuständig nur aus dem Team des Treffs', async () => {
    expect(await als(db, betr, () => fehler(() => q(`insert into treff_aufgaben (treff_id, text, zustaendig) values ($1, 'X', $2)`, [treff, fremd.id])))).toMatch(/Team des Treffs/);
    await als(db, betr, () => q(`insert into treff_aufgaben (treff_id, text, zustaendig, faellig_am) values ($1, 'Flyer drucken', $2, current_date)`, [treff, betr2.id]));
  });

  it('leerer oder zu langer Text wird abgelehnt', async () => {
    expect(await als(db, betr, () => fehler(() => q(`insert into treff_aufgaben (treff_id, text) values ($1, '   ')`, [treff])))).toMatch(/check/i);
    expect(await als(db, betr, () => fehler(() => q(`insert into treff_aufgaben (treff_id, text) values ($1, $2)`, [treff, 'x'.repeat(1001)])))).toMatch(/check/i);
  });

  it('Außenstehende sehen und ändern nichts; ein Treff lässt sich nicht wechseln', async () => {
    const r = await als(db, fremd, () => q(`select 1 from treff_aufgaben`));
    expect(r.rows).toEqual([]);
    expect(await als(db, fremd, () => fehler(() => q(`insert into treff_aufgaben (treff_id, text) values ($1, 'X')`, [treff])))).toMatch(/row-level security/i);
    const id = (await q<{ id: string }>(`select id from treff_aufgaben limit 1`)).rows[0]!.id;
    expect(await als(db, koord, () => fehler(() => q(`update treff_aufgaben set treff_id = $2 where id = $1`, [id, anderer])))).toMatch(/anderen Treff/);
  });

  it('die Koordination hat Zugriff auf alle', async () => {
    const r = await als(db, koord, () => q(`select 1 from treff_aufgaben`));
    expect(r.rows.length).toBeGreaterThan(0);
  });
});

describe('fn_protokoll_erinnerungen', () => {
  /** Öffnungszeit, die vor `minutenVorbei` Minuten endete, am heutigen Wochentag (Ortszeit). */
  async function oeffne(t: string, minutenVorbei: number) {
    await q(`delete from treff_oeffnungszeiten where treff_id = $1`, [t]);
    const bis = (await q<{ b: string }>(`select ((now() at time zone 'Europe/Berlin') - make_interval(mins => $1))::time(0)::text as b`, [minutenVorbei])).rows[0]!.b;
    const tag = (await q<{ w: number }>(`select extract(isodow from (now() at time zone 'Europe/Berlin'))::int as w`)).rows[0]!.w;
    await q(`insert into treff_oeffnungszeiten values ($1, $2, '00:00', $3)`, [t, tag, bis]);
  }
  type Plan = { treff: string; empfaenger: string[]; titel: string; text: string; url: string }[];
  const erinnere = async () => (await q<{ r: Plan }>(`select fn_protokoll_erinnerungen() as r`)).rows[0]!.r;

  // Zeitfenster: Öffnungszeit seit 15 Minuten bis 3 Stunden vorbei. Kurz nach Mitternacht (Ortszeit) ist der Test nicht aussagekräftig.
  const nachMitternacht = async () => (await q<{ m: number }>(`select extract(hour from (now() at time zone 'Europe/Berlin'))::int * 60 + extract(minute from (now() at time zone 'Europe/Berlin'))::int as m`)).rows[0]!.m < 30;

  it('meldet einen Treff, dessen Öffnung vor 30 Minuten endete, und bittet Treffleitung und heute Eingeteilte', async () => {
    if (await nachMitternacht()) return;
    await q(`delete from treff_protokolle where treff_id = $1 and datum = $2`, [treff, await heute()]);
    await oeffne(treff, 30);
    const d = (await q<{ id: string }>(`insert into dienste (treff_id, datum) values ($1, $2) returning id`, [treff, await heute()])).rows[0]!.id;
    await q(`insert into dienst_zuteilungen values ($1, $2)`, [d, betr.id]);
    const r = await erinnere();
    expect(r).toHaveLength(1);
    expect(r[0]!.treff).toBe(treff);
    expect(new Set(r[0]!.empfaenger)).toEqual(new Set([tl.id, betr.id]));
    expect(r[0]!.titel).toBe('Tagesprotokoll fehlt · Kindertreff');
    expect(r[0]!.url).toBe(`/treffs/${treff}/protokoll`);
  });

  it('erinnert pro Tag nur einmal', async () => {
    if (await nachMitternacht()) return;
    expect(await erinnere()).toEqual([]);
  });

  it('nicht, wenn das Protokoll schon da ist, die Öffnung noch läuft oder zu lange her ist', async () => {
    if (await nachMitternacht()) return;
    await q(`delete from mitteilungen_log where art = 'protokoll_erinnerung'`);
    await oeffne(treff, 5);
    expect(await erinnere()).toEqual([]);
    await oeffne(treff, 200);
    expect(await erinnere()).toEqual([]);
    await oeffne(treff, 30);
    await q(`insert into treff_protokolle (treff_id, datum) values ($1, $2) on conflict do nothing`, [treff, await heute()]);
    expect(await erinnere()).toEqual([]);
  });

  it('nicht an einem Feiertag', async () => {
    if (await nachMitternacht()) return;
    await q(`delete from treff_protokolle where treff_id = $1 and datum = $2`, [treff, await heute()]);
    await q(`delete from mitteilungen_log where art = 'protokoll_erinnerung'`);
    await q(`insert into feiertage (treff_id, datum, bezeichnung) values (null, $1, 'Feiertag')`, [await heute()]);
    expect(await erinnere()).toEqual([]);
    await q(`delete from feiertage`);
    expect(await erinnere()).toHaveLength(1);
  });

  it('ist nur mit dem Service-Schlüssel aufrufbar', async () => {
    for (const p of [koord, betr] as const) {
      expect(await als(db, p, () => fehler(() => q(`select fn_protokoll_erinnerungen()`)))).toMatch(/permission denied/i);
    }
    expect(await als(db, 'anon', () => fehler(() => q(`select fn_protokoll_erinnerungen()`)))).toMatch(/permission denied/i);
  });
});
