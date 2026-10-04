import { describe, it, expect, beforeAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { neueDb, person, als, fehler, type Person } from './harness';

/** Migration 0022: Treffleitung und Treffkoordination lassen die Nachweise der Teilzeitkräfte eines Monats erstellen. */
let db: PGlite;
let tl: Person, tk: Person, fk: Person, tzk1: Person, tzk2: Person, hauptamt: Person, fremd: Person, treff: string, anderer: string;

const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params);
const monat = `date_trunc('month', current_date)::date`;
const erstelle = async (wer: Person, t: string, person: string | null = null) =>
  (await als(db, wer, () => q<{ n: number }>(`select fn_nachweise_erstellen($1, ${monat}, $2) as n`, [t, person]))).rows[0]!.n;
const anzahl = async (t: string) => (await q<{ n: number }>(`select count(*)::int as n from zeitnachweise where treff_id = $1 and monat = ${monat}`, [t])).rows[0]!.n;

beforeAll(async () => {
  db = await neueDb();
  tl = await person(db, 'Leitung', { kategorie: 'Hauptamtliche*r' });
  tk = await person(db, 'TK', { kategorie: 'Hauptamtliche*r' });
  fk = await person(db, 'FK', { kategorie: 'Hauptamtliche*r' });
  tzk1 = await person(db, 'Anna', { kategorie: 'TZK' });
  tzk2 = await person(db, 'Ben', { kategorie: 'TZK' });
  hauptamt = await person(db, 'Hans', { kategorie: 'Hauptamtliche*r' });
  fremd = await person(db, 'Fremd', { kategorie: 'TZK' });
  await q(`update personen set ist_freizeitkoordination = true where id = $1`, [fk.id]);
  await q(`update personen set ist_treffkoordination = true where id = $1`, [tk.id]);
  treff = (await q<{ id: string }>(`insert into treffs (name) values ('Kindertreff') returning id`)).rows[0]!.id;
  anderer = (await q<{ id: string }>(`insert into treffs (name) values ('Anderer Treff') returning id`)).rows[0]!.id;
  await q(`insert into treff_team (treff_id, person_id, rolle) values ($1, $2, 'treffleitung'), ($1, $3, 'betreuerin'), ($1, $4, 'betreuerin'), ($1, $5, 'betreuerin')`, [treff, tl.id, tzk1.id, tzk2.id, hauptamt.id]);
  await q(`insert into treff_team (treff_id, person_id, rolle) values ($1, $2, 'betreuerin')`, [anderer, fremd.id]);
  const dienst = (await q<{ id: string }>(`insert into dienste (treff_id, datum, von, bis) values ($1, current_date, '15:00', '18:30') returning id`, [treff])).rows[0]!.id;
  await q(`insert into dienst_zuteilungen (dienst_id, person_id) values ($1, $2)`, [dienst, tzk1.id]);
});

describe('fn_nachweise_erstellen', () => {
  it('die Treffleitung erstellt die Nachweise aller Teilzeitkräfte – nicht für Hauptamtliche und nicht für andere Treffs', async () => {
    expect(await erstelle(tl, treff)).toBe(2);
    const wer = await q<{ person_id: string }>(`select person_id from zeitnachweise where treff_id = $1 order by person_id`, [treff]);
    expect(wer.rows.map((r) => r.person_id).sort()).toEqual([tzk1.id, tzk2.id].sort());
    expect(await anzahl(anderer)).toBe(0);
  });

  it('die Nachweise sind Entwürfe und aus dem Dienstplan befüllt', async () => {
    const z = await q<{ status: string; zeiten: string; stunden: string; quelle: string }>(
      `select n.status, z.zeiten, z.stunden, z.quelle from zeitnachweise n join zeitnachweis_zeilen z on z.nachweis_id = n.id where n.person_id = $1`, [tzk1.id]);
    expect(z.rows).toHaveLength(1);
    expect(z.rows[0]).toMatchObject({ status: 'entwurf', quelle: 'dienst', zeiten: '15:00 - 18:30' });
    expect(Number(z.rows[0]!.stunden)).toBe(3.5);
    const leer = await q<{ n: number }>(`select count(*)::int as n from zeitnachweis_zeilen z join zeitnachweise n on n.id = z.nachweis_id where n.person_id = $1`, [tzk2.id]);
    expect(leer.rows[0]!.n).toBe(0);
  });

  it('wiederholbar: vorhandene Nachweise bleiben unverändert, es entstehen keine doppelten', async () => {
    await q(`update zeitnachweise set status = 'eingereicht', unterschrift = 'Anna Test' where person_id = $1`, [tzk1.id]);
    expect(await erstelle(tl, treff)).toBe(0);
    expect(await anzahl(treff)).toBe(2);
    const n = await q<{ status: string; unterschrift: string }>(`select status, unterschrift from zeitnachweise where person_id = $1`, [tzk1.id]);
    expect(n.rows[0]).toEqual({ status: 'eingereicht', unterschrift: 'Anna Test' });
  });

  it('für eine einzelne Person, auch wenn sie nicht TZK ist; nicht für Personen außerhalb des Treffs', async () => {
    expect(await erstelle(tl, treff, hauptamt.id)).toBe(1);
    expect(await erstelle(tl, treff, fremd.id)).toBe(0);
    expect(await anzahl(treff)).toBe(3);
  });

  it('die Treffkoordination darf es in jedem Treff, die Freizeitenkoordination und gewöhnliche Mitglieder nicht', async () => {
    expect(await erstelle(tk, anderer)).toBe(1);
    expect((await als(db, fk, () => fehler(() => q(`select fn_nachweise_erstellen($1, ${monat})`, [treff])))).toString()).toMatch(/Nur Treffleitung/);
    expect((await als(db, tzk1, () => fehler(() => q(`select fn_nachweise_erstellen($1, ${monat})`, [treff])))).toString()).toMatch(/Nur Treffleitung/);
    expect((await als(db, tl, () => fehler(() => q(`select fn_nachweise_erstellen($1, ${monat})`, [anderer])))).toString()).toMatch(/Nur Treffleitung/);
  });

  it('nicht angemeldet geht es nicht', async () => {
    const msg = await als(db, 'anon', () => fehler(() => q(`select fn_nachweise_erstellen($1, ${monat})`, [treff])));
    expect(msg).toMatch(/permission denied/i);
  });

  it('der Monat wird auf den Ersten gesetzt; ein anderer Monat erstellt eigene Nachweise', async () => {
    const n = (await als(db, tl, () => q<{ n: number }>(`select fn_nachweise_erstellen($1, (${monat} - interval '1 month' + interval '9 days')::date) as n`, [treff]))).rows[0]!.n;
    expect(n).toBe(2);
    const m = await q<{ monat: string }>(`select distinct to_char(monat, 'DD') as monat from zeitnachweise`);
    expect(m.rows.map((r) => r.monat)).toEqual(['01']);
  });
});
