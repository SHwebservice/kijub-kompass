import { describe, it, expect, beforeAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { neueDb, person, als, fehler, type Person } from './harness';

/** Migration 0024: Der Dienstplan eines Monats lässt sich in einem Schritt gezielt ändern (Personen hinzufügen und entfernen). */
let db: PGlite;
let tl: Person, tk: Person, fk: Person, andereTl: Person, anna: Person, ben: Person, carla: Person, fremd: Person;
let treff: string, anderer: string;
let montag: string, mittwoch: string, dienstag: string, naechsterMonatTag: string;

const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params);
const MONAT = `date_trunc('month', current_date + interval '40 days')::date`;
type Paar = { datum: string; person: string };
const wende = async (wer: Person, zuteilen: Paar[], entfernen: Paar[] = [], t = treff) =>
  (await als(db, wer, () => q<{ r: { zugeteilt: number; entfernt: number } }>(`select fn_dienstplan_anwenden($1, ${MONAT}, $2::jsonb, $3::jsonb) as r`, [t, JSON.stringify(zuteilen), JSON.stringify(entfernen)]))).rows[0]!.r;
const personenAm = async (datum: string) => (await q<{ person_id: string }>(
  `select z.person_id from dienste d join dienst_zuteilungen z on z.dienst_id = d.id where d.treff_id = $1 and d.datum = $2 and not d.ist_sonder order by 1`, [treff, datum])).rows.map((r) => r.person_id).sort();

beforeAll(async () => {
  db = await neueDb();
  tl = await person(db, 'Leitung', { kategorie: 'Hauptamtliche*r' });
  andereTl = await person(db, 'Andere', { kategorie: 'Hauptamtliche*r' });
  tk = await person(db, 'TK', { kategorie: 'Hauptamtliche*r' });
  fk = await person(db, 'FK', { kategorie: 'Hauptamtliche*r' });
  anna = await person(db, 'Anna', { kategorie: 'TZK' });
  ben = await person(db, 'Ben', { kategorie: 'TZK' });
  carla = await person(db, 'Carla', { kategorie: 'TZK' });
  fremd = await person(db, 'Fremd', { kategorie: 'TZK' });
  await q(`update personen set ist_treffkoordination = true where id = $1`, [tk.id]);
  await q(`update personen set ist_freizeitkoordination = true where id = $1`, [fk.id]);
  treff = (await q<{ id: string }>(`insert into treffs (name) values ('Kindertreff') returning id`)).rows[0]!.id;
  anderer = (await q<{ id: string }>(`insert into treffs (name) values ('Anderer') returning id`)).rows[0]!.id;
  await q(`insert into treff_oeffnungszeiten (treff_id, wochentag, von, bis) values ($1, 1, '15:00', '19:00'), ($1, 3, '14:00', '18:00')`, [treff]);
  await q(`insert into treff_team (treff_id, person_id, rolle) values ($1, $2, 'treffleitung'), ($1, $3, 'betreuerin'), ($1, $4, 'betreuerin'), ($1, $5, 'betreuerin')`, [treff, tl.id, anna.id, ben.id, carla.id]);
  await q(`insert into treff_team (treff_id, person_id, rolle) values ($1, $2, 'treffleitung'), ($1, $3, 'betreuerin')`, [anderer, andereTl.id, fremd.id]);
  const tag = async (isodow: number) => (await q<{ d: string }>(
    `select to_char(d, 'YYYY-MM-DD') as d from generate_series(${MONAT}, ${MONAT} + interval '27 days', interval '1 day') g(d) where extract(isodow from d) = $1 order by d limit 1`, [isodow])).rows[0]!.d;
  [montag, dienstag, mittwoch] = [await tag(1), await tag(2), await tag(3)];
  naechsterMonatTag = (await q<{ d: string }>(`select to_char(${MONAT} + interval '1 month', 'YYYY-MM-DD') as d`)).rows[0]!.d;
});

describe('fn_dienstplan_anwenden', () => {
  it('legt fehlende Dienste mit der Öffnungszeit des Wochentags an und teilt die Personen ein', async () => {
    const r = await wende(tl, [{ datum: montag, person: anna.id }, { datum: montag, person: ben.id }, { datum: mittwoch, person: anna.id }]);
    expect(r).toEqual({ zugeteilt: 3, entfernt: 0 });
    expect(await personenAm(montag)).toEqual([anna.id, ben.id].sort());
    const d = await q<{ von: string; bis: string }>(`select von, bis from dienste where treff_id = $1 and datum = $2`, [treff, mittwoch]);
    expect(d.rows[0]).toEqual({ von: '14:00:00', bis: '18:00:00' });
  });

  it('vorhandene Einteilungen bleiben; eine zweite und dritte Person kommt dazu', async () => {
    const r = await wende(tl, [{ datum: montag, person: carla.id }, { datum: montag, person: anna.id }]);      // Anna ist schon da
    expect(r.zugeteilt).toBe(1);
    expect(await personenAm(montag)).toEqual([anna.id, ben.id, carla.id].sort());
  });

  it('entfernt gezielt einzelne Personen, die anderen bleiben', async () => {
    const r = await wende(tl, [], [{ datum: montag, person: ben.id }, { datum: montag, person: fremd.id }]);       // Fremd war nie eingeteilt
    expect(r).toEqual({ zugeteilt: 0, entfernt: 1 });
    expect(await personenAm(montag)).toEqual([anna.id, carla.id].sort());
  });

  it('wiederholbar: dieselbe Liste ändert nichts mehr', async () => {
    const r = await wende(tl, [{ datum: montag, person: anna.id }, { datum: mittwoch, person: anna.id }]);
    expect(r).toEqual({ zugeteilt: 0, entfernt: 0 });
  });

  it('Sonderdienste bleiben unberührt', async () => {
    const s = (await q<{ id: string }>(`insert into dienste (treff_id, datum, von, bis, ist_sonder, bezeichnung) values ($1, $2, '10:00', '12:00', true, 'Fest') returning id`, [treff, montag])).rows[0]!.id;
    await q(`insert into dienst_zuteilungen (dienst_id, person_id) values ($1, $2)`, [s, anna.id]);
    await wende(tl, [], [{ datum: montag, person: anna.id }]);
    const rest = await q<{ n: number }>(`select count(*)::int as n from dienst_zuteilungen where dienst_id = $1`, [s]);
    expect(rest.rows[0]!.n).toBe(1);
    await wende(tl, [{ datum: montag, person: anna.id }]);
  });

  it('ganz oder gar nicht: ein ungültiger Eintrag macht alles rückgängig', async () => {
    const vorher = await personenAm(mittwoch);
    const msg = await als(db, tl, () => fehler(() => q(`select fn_dienstplan_anwenden($1, ${MONAT}, $2::jsonb)`, [treff, JSON.stringify([{ datum: mittwoch, person: ben.id }, { datum: mittwoch, person: fremd.id }])])));
    expect(msg).toMatch(/gehört nicht zu diesem Treff/);
    expect(await personenAm(mittwoch)).toEqual(vorher);
  });

  it('Tage außerhalb des Monats und Schließtage werden abgelehnt', async () => {
    const aus = await als(db, tl, () => fehler(() => q(`select fn_dienstplan_anwenden($1, ${MONAT}, $2::jsonb)`, [treff, JSON.stringify([{ datum: naechsterMonatTag, person: anna.id }])])));
    expect(aus).toMatch(/liegt nicht im Monat/);
    const zu = await als(db, tl, () => fehler(() => q(`select fn_dienstplan_anwenden($1, ${MONAT}, $2::jsonb)`, [treff, JSON.stringify([{ datum: dienstag, person: anna.id }])])));
    expect(zu).toMatch(/nicht geöffnet/);
    const entf = await als(db, tl, () => fehler(() => q(`select fn_dienstplan_anwenden($1, ${MONAT}, '[]'::jsonb, $2::jsonb)`, [treff, JSON.stringify([{ datum: naechsterMonatTag, person: anna.id }])])));
    expect(entf).toMatch(/liegt nicht im Monat/);
  });

  it('keine Listen: Fehler', async () => {
    const msg = await als(db, tl, () => fehler(() => q(`select fn_dienstplan_anwenden($1, ${MONAT}, '{}'::jsonb)`, [treff])));
    expect(msg).toMatch(/Arrays/);
  });

  it('die Treffleitung dieses Treffs und die Treffkoordination dürfen, alle anderen nicht', async () => {
    expect((await wende(tk, [{ datum: mittwoch, person: ben.id }])).zugeteilt).toBe(1);
    for (const wer of [anna, andereTl, fk]) {
      const msg = await als(db, wer, () => fehler(() => q(`select fn_dienstplan_anwenden($1, ${MONAT}, $2::jsonb)`, [treff, JSON.stringify([{ datum: mittwoch, person: ben.id }])])));
      expect(msg).toMatch(/Nur Treffleitung/);
    }
    expect(await als(db, 'anon', () => fehler(() => q(`select fn_dienstplan_anwenden($1, ${MONAT}, '[]'::jsonb)`, [treff])))).toMatch(/permission denied/i);
  });
});
