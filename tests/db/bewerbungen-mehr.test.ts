import { describe, it, expect, beforeAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { neueDb, person, als, fehler, type Person } from './harness';

/** Migration 0030: Bewerbungsfrist einstellbar, Freizeiten schließen, Bewerbung für eine Ferienzeit. */
let db: PGlite;
let fk: Person, tk: Person, teamer: Person, teamer2: Person, haupt: Person;
let offen: string, voll: string;

const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params);
const jahr = async () => (await q<{ j: number }>(`select extract(year from current_date)::int as j`)).rows[0]!.j;
const bewerbe = (wer: Person, f: string) => als(db, wer, () => q(`insert into bewerbungen (person_id, freizeit_id) values ($1, $2)`, [wer.id, f]));
const zeitraum = async (wer: Person, j: number, fz: string, wochen: number[] = [], notiz: string | null = null) =>
  (await als(db, wer, () => q<{ id: string }>(`insert into bewerbungen_zeitraum (person_id, jahr, ferienzeitraum, wochen, notiz) values ($1, $2, $3, $4::smallint[], $5) returning id`,
    [wer.id, j, fz, `{${wochen.join(',')}}`, notiz]))).rows[0]!.id;

beforeAll(async () => {
  db = await neueDb();
  fk = await person(db, 'FK', { kategorie: 'Hauptamtliche*r' });
  tk = await person(db, 'TK', { kategorie: 'Hauptamtliche*r' });
  haupt = await person(db, 'Haupt', { kategorie: 'Hauptamtliche*r' });
  teamer = await person(db, 'Tina', { kategorie: 'TeamerIn' });
  teamer2 = await person(db, 'Tom', { kategorie: 'TeamerIn' });
  await q(`update personen set ist_freizeitkoordination = true where id = $1`, [fk.id]);
  await q(`update personen set ist_treffkoordination = true where id = $1`, [tk.id]);
  offen = (await q<{ id: string }>(`insert into freizeiten (name, start_datum, ende_datum) values ('Offen', current_date + 30, current_date + 34) returning id`)).rows[0]!.id;
  voll = (await q<{ id: string }>(`insert into freizeiten (name, start_datum, ende_datum, bewerbung_offen) values ('Voll', current_date + 30, current_date + 34, false) returning id`)).rows[0]!.id;
});

describe('Bewerbungsfrist', () => {
  it('nur die Freizeitenkoordination ändert sie, 0 bis 90 ganze Tage', async () => {
    await als(db, fk, () => q(`update einstellungen set wert = '14'::jsonb where schluessel = 'bewerbung_vorlauf_tage'`));
    expect((await q<{ w: number }>(`select (wert #>> '{}')::int as w from einstellungen where schluessel = 'bewerbung_vorlauf_tage'`)).rows[0]!.w).toBe(14);
    const r = await als(db, tk, () => q(`update einstellungen set wert = '3'::jsonb where schluessel = 'bewerbung_vorlauf_tage'`));
    expect(r.affectedRows ?? 0).toBe(0);                                                                         // Treffkoordination: keine Zeile sichtbar zum Ändern
    for (const w of ['-1', '91', '2.5', '"7"']) {
      expect(await als(db, fk, () => fehler(() => q(`update einstellungen set wert = $1::jsonb where schluessel = 'bewerbung_vorlauf_tage'`, [w])))).toMatch(/check/i);
    }
  });

  it('die Frist gilt beim Bewerben', async () => {
    const bald = (await q<{ id: string }>(`insert into freizeiten (name, start_datum, ende_datum) values ('Bald', current_date + 10, current_date + 12) returning id`)).rows[0]!.id;
    expect(await fehler(() => bewerbe(teamer, bald))).toMatch(/row-level security/i);                           // 14 Tage Vorlauf
    await als(db, fk, () => q(`update einstellungen set wert = '7'::jsonb where schluessel = 'bewerbung_vorlauf_tage'`));
    await bewerbe(teamer, bald);
  });
});

describe('Freizeit für Bewerbungen schließen', () => {
  it('geschlossene Freizeit nimmt keine Bewerbung an, offene schon; wieder öffnen geht', async () => {
    expect(await fehler(() => bewerbe(teamer, voll))).toMatch(/row-level security/i);
    await bewerbe(teamer, offen);
    await als(db, fk, () => q(`update freizeiten set bewerbung_offen = true where id = $1`, [voll]));
    await bewerbe(teamer2, voll);
  });
});

describe('Bewerbung für eine Ferienzeit', () => {
  it('TeamerIn bewirbt sich für Sommer (Wochen sortiert, doppelte entfernt); Hauptamtliche nicht', async () => {
    const j = await jahr();
    const id = await zeitraum(teamer, j, 'sommer', [3, 1, 3], 'gern mit Tom');
    expect((await q(`select wochen, status from bewerbungen_zeitraum where id = $1`, [id])).rows[0]).toEqual({ wochen: [1, 3], status: 'offen' });
    expect(await fehler(() => zeitraum(haupt, j, 'sommer'))).toMatch(/row-level security/i);
  });

  it('Woche passt zur Ferienzeit; Jahr nur dieses oder nächstes; je Ferienzeit nur eine', async () => {
    const j = await jahr();
    expect(await fehler(() => zeitraum(teamer2, j, 'herbst', [3]))).toMatch(/check/i);
    expect(await fehler(() => zeitraum(teamer2, j + 2, 'herbst'))).toMatch(/row-level security/i);
    await zeitraum(teamer2, j + 1, 'ostern', [2]);
    expect(await fehler(() => zeitraum(teamer2, j + 1, 'ostern'))).toMatch(/duplicate|unique/i);
  });

  it('sehen: die Person selbst und die Freizeitenkoordination', async () => {
    expect((await als(db, teamer, () => q(`select 1 from bewerbungen_zeitraum`))).rows).toHaveLength(1);
    expect((await als(db, fk, () => q(`select 1 from bewerbungen_zeitraum`))).rows).toHaveLength(2);
    expect((await als(db, tk, () => q(`select 1 from bewerbungen_zeitraum`))).rows).toHaveLength(0);
  });

  it('die Person ändert Wochen und Notiz, solange offen, und zieht zurück; Status setzt sie nicht', async () => {
    const id = (await q<{ id: string }>(`select id from bewerbungen_zeitraum where person_id = $1`, [teamer2.id])).rows[0]!.id;
    await als(db, teamer2, () => q(`update bewerbungen_zeitraum set wochen = '{1,2}', notiz = 'doch beide' where id = $1`, [id]));
    expect(await als(db, teamer2, () => fehler(() => q(`update bewerbungen_zeitraum set status = 'erledigt' where id = $1`, [id])))).toMatch(/row-level security/i);
    await als(db, teamer2, () => q(`delete from bewerbungen_zeitraum where id = $1`, [id]));
    expect((await q(`select 1 from bewerbungen_zeitraum where id = $1`, [id])).rows).toHaveLength(0);
  });

  it('zuordnen: Team mit Rolle und angenommene Bewerbung (für die Mitteilung); nur die Freizeitenkoordination', async () => {
    const id = (await q<{ id: string }>(`select id from bewerbungen_zeitraum where person_id = $1`, [teamer.id])).rows[0]!.id;
    expect(await als(db, tk, () => fehler(() => q(`select fn_zeitraum_zuordnen($1, $2, 'teamer')`, [id, offen])))).toMatch(/Nur die Freizeitenkoordination/);
    const b = (await als(db, fk, () => q<{ b: string }>(`select fn_zeitraum_zuordnen($1, $2, 'leitung') as b`, [id, offen]))).rows[0]!.b;
    expect((await q(`select status::text, entschieden_von from bewerbungen where id = $1`, [b])).rows[0]).toEqual({ status: 'angenommen', entschieden_von: fk.id });
    expect((await q(`select rolle::text from freizeit_team where freizeit_id = $1 and person_id = $2`, [offen, teamer.id])).rows[0]).toEqual({ rolle: 'leitung' });
    const push = (await als(db, fk, () => q<{ p: { empfaenger: string[]; text: string } }>(`select fn_push_vorbereiten('bewerbung_angenommen', $1) as p`, [b]))).rows[0]!.p;
    expect(push.empfaenger).toEqual([teamer.id]);
    expect(push.text).toMatch(/als Leitung dabei: Offen/);
    expect((await q(`select status from bewerbungen_zeitraum where id = $1`, [id])).rows[0]).toEqual({ status: 'offen' });     // bleibt offen bis „erledigt“
  });

  it('erledigt markieren vermerkt wer und wann', async () => {
    const id = (await q<{ id: string }>(`select id from bewerbungen_zeitraum where person_id = $1`, [teamer.id])).rows[0]!.id;
    await als(db, fk, () => q(`update bewerbungen_zeitraum set status = 'erledigt' where id = $1`, [id]));
    const r = (await q<{ erledigt_von: string; erledigt: boolean }>(`select erledigt_von, erledigt_am is not null as erledigt from bewerbungen_zeitraum where id = $1`, [id])).rows[0]!;
    expect(r).toEqual({ erledigt_von: fk.id, erledigt: true });
  });

  it('Mitteilung „neue Bewerbung“ an die Freizeitenkoordination, nur für die eigene frische Bewerbung', async () => {
    const j = await jahr();
    const id = await zeitraum(teamer2, j, 'herbst', [2]);
    const p = (await als(db, teamer2, () => q<{ p: { empfaenger: string[]; text: string; url: string } }>(`select fn_push_vorbereiten('bewerbung_zeitraum', $1) as p`, [id]))).rows[0]!.p;
    expect(p).toMatchObject({ empfaenger: [fk.id], url: '/bewerbungen' });
    expect(p.text).toMatch(new RegExp(`bewirbt sich für Herbst ${j} \\(Woche 2\\)\\.`));
    expect(await als(db, teamer, () => fehler(() => q(`select fn_push_vorbereiten('bewerbung_zeitraum', $1)`, [id])))).toMatch(/nicht zulässig/);
  });

  it('Startseite: offene Zeitraum-Bewerbungen zählen bei „Bewerbungen“ mit', async () => {
    const r = (await als(db, fk, () => q<{ r: { bewerbungen: number } }>(`select fn_heute(current_date, '{"bewerbungen": true}'::jsonb) as r`))).rows[0]!.r;
    const einzeln = (await q<{ n: number }>(`select count(*)::int as n from bewerbungen where status = 'offen'`)).rows[0]!.n;
    expect(r.bewerbungen).toBe(einzeln + 1);                                                                      // Herbst-Bewerbung von Tom
  });
});
