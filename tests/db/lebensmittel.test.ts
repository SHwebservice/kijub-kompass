import { describe, it, expect, beforeAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { neueDb, person, als, fehler, type Person } from './harness';

/** Lebensmittelbestand je Ort: gemeinsam für alle Freizeiten am Ort, nur für deren Leitungen und die Koordination. */
let db: PGlite;
let koord: Person, leitungA: Person, leitungB: Person, leitungC: Person, teamer: Person;
let ort: string, ortC: string, fzA: string, fzB: string, fzC: string;
const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params);

beforeAll(async () => {
  db = await neueDb();
  koord = await person(db, 'Koord', { koordination: true, kategorie: 'Hauptamtliche*r' });
  leitungA = await person(db, 'LeitungA', { kategorie: 'Hauptamtliche*r' });
  leitungB = await person(db, 'LeitungB', { kategorie: 'Hauptamtliche*r' });
  leitungC = await person(db, 'LeitungC', { kategorie: 'Hauptamtliche*r' });
  teamer = await person(db, 'Tom');
  ort = (await q<{ id: string }>(`insert into orte (name) values ('Mörscher Au') returning id`)).rows[0]!.id;
  ortC = (await q<{ id: string }>(`insert into orte (name) values ('Strandbad') returning id`)).rows[0]!.id;
  const fz = async (name: string, von: number, o: string) => (await q<{ id: string }>(
    `insert into freizeiten (name, ort_id, start_datum, ende_datum) values ($1, $2, current_date + $3::int, current_date + $3::int + 4) returning id`, [name, o, von])).rows[0]!.id;
  fzA = await fz('Woche 1', 30, ort);
  fzB = await fz('Woche 2', 37, ort);
  fzC = await fz('Andere', 30, ortC);
  await q(`insert into freizeit_team values ($1, $2, 'leitung'), ($1, $3, 'teamer')`, [fzA, leitungA.id, teamer.id]);
  await q(`insert into freizeit_team values ($1, $2, 'leitung')`, [fzB, leitungB.id]);
  await q(`insert into freizeit_team values ($1, $2, 'leitung')`, [fzC, leitungC.id]);
});

describe('Bestand am Ort', () => {
  it('die Leitung trägt einen Wareneingang ein; Verfasser und Datum setzt die Datenbank', async () => {
    await als(db, leitungA, () => q(`insert into lebensmittel_eingang (ort_id, freizeit_id, name, menge, einheit) values ($1, $2, 'Milch', 100, 'l')`, [ort, fzA]));
    const r = await q<{ erstellt_von: string; datum: string }>('select erstellt_von, datum::text from lebensmittel_eingang');
    expect(r.rows[0]!.erstellt_von).toBe(leitungA.id);
    expect(r.rows[0]!.datum).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('Freizeiten nacheinander am selben Ort führen den Bestand gemeinsam fort', async () => {
    await als(db, leitungA, () => q(`insert into lebensmittel_verbrauch (ort_id, freizeit_id, name, menge, datum) values ($1, $2, 'Milch', 70, current_date + 30)`, [ort, fzA]));
    const b = await als(db, leitungB, () => q<{ rest: string; status: string }>(`select rest::text, status from v_lebensmittel_bestand where name = 'Milch'`));
    expect(b.rows[0]).toEqual({ rest: '30', status: 'ok' });
    await als(db, leitungB, () => q(`insert into lebensmittel_verbrauch (ort_id, freizeit_id, name, menge, datum) values ($1, $2, 'Milch', 10, current_date + 37)`, [ort, fzB]));
    const a = await als(db, leitungA, () => q<{ rest: string; status: string }>(`select rest::text, status from v_lebensmittel_bestand where name = 'Milch'`));
    expect(a.rows[0]).toEqual({ rest: '20', status: 'knapp' });
  });

  it('die Leitung einer Freizeit an einem ANDEREN Ort sieht und ändert nichts', async () => {
    const r = await als(db, leitungC, () => q('select * from lebensmittel_eingang'));
    expect(r.rows).toHaveLength(0);
    const v = await als(db, leitungC, () => q('select * from v_lebensmittel_bestand'));
    expect(v.rows).toHaveLength(0);
    const msg = await als(db, leitungC, () => fehler(() => q(`insert into lebensmittel_eingang (ort_id, name, menge) values ($1, 'Fremd', 1)`, [ort])));
    expect(msg).toMatch(/row-level security/i);
    const u = await als(db, leitungC, () => q(`update lebensmittel_eingang set menge = 1`));
    expect(u.affectedRows).toBe(0);
  });

  it('TeamerInnen lesen und schreiben nichts', async () => {
    const r = await als(db, teamer, () => q('select * from lebensmittel_eingang'));
    expect(r.rows).toHaveLength(0);
    const msg = await als(db, teamer, () => fehler(() => q(`insert into lebensmittel_verbrauch (ort_id, name, menge, datum) values ($1, 'Milch', 1, current_date)`, [ort])));
    expect(msg).toMatch(/row-level security/i);
  });

  it('Buchungen der anderen Freizeit am Ort darf die Leitung ändern und löschen (gemeinsamer Bestand)', async () => {
    const u = await als(db, leitungB, () => q(`update lebensmittel_eingang set menge = 120 where name = 'Milch'`));
    expect(u.affectedRows).toBe(1);
    const d = await als(db, leitungB, () => q(`delete from lebensmittel_verbrauch where freizeit_id = $1`, [fzA]));
    expect(d.affectedRows).toBe(1);
  });

  it('Menge: Eingang darf 0 sein, Verbrauch muss größer 0 sein, nichts Negatives', async () => {
    await als(db, leitungA, () => q(`insert into lebensmittel_eingang (ort_id, name, menge) values ($1, 'Null', 0)`, [ort]));
    for (const sql of [
      `insert into lebensmittel_eingang (ort_id, name, menge) values ($1, 'Neg', -1)`,
      `insert into lebensmittel_verbrauch (ort_id, name, menge, datum) values ($1, 'Neg', 0, current_date)`,
      `insert into lebensmittel_verbrauch (ort_id, name, menge, datum) values ($1, 'Neg', -2, current_date)`,
    ]) {
      const msg = await als(db, leitungA, () => fehler(() => q(sql, [ort])));
      expect(msg).toMatch(/check/i);
    }
  });

  it('Koordination sieht und ändert alles', async () => {
    const r = await als(db, koord, () => q('select * from lebensmittel_eingang'));
    expect(r.rows.length).toBeGreaterThan(0);
    await als(db, koord, () => q(`insert into lebensmittel_eingang (ort_id, name, menge) values ($1, 'Vom Büro', 5)`, [ortC]));
  });

  it('Ampel: knapp ab 25 %, leer bei 0 oder weniger, mit Verbrauch über Eingang', async () => {
    await als(db, koord, () => q(`insert into lebensmittel_eingang (ort_id, name, menge) values ($1, 'Mehl', 10)`, [ort]));
    const status = async (verbraucht: number) => {
      await q(`delete from lebensmittel_verbrauch where name = 'Mehl'`);
      if (verbraucht) await q(`insert into lebensmittel_verbrauch (ort_id, name, menge, datum) values ($1, 'Mehl', $2, current_date)`, [ort, verbraucht]);
      return (await als(db, koord, () => q<{ status: string }>(`select status from v_lebensmittel_bestand where name = 'Mehl'`))).rows[0]!.status;
    };
    expect([await status(0), await status(7.5), await status(7.6), await status(10), await status(12)]).toEqual(['ok', 'knapp', 'knapp', 'leer', 'leer']);
    expect(await status(7.4)).toBe('ok');
  });

  it('wird eine Freizeit gelöscht, bleibt der Bestand am Ort (ohne Zuordnung zur Freizeit)', async () => {
    await q('delete from freizeiten where id = $1', [fzA]);
    const r = await q<{ n: number; ohne: number }>(`select count(*)::int as n, count(*) filter (where freizeit_id is null)::int as ohne from lebensmittel_eingang where ort_id = $1`, [ort]);
    expect(r.rows[0]!.n).toBeGreaterThan(0);
    expect(r.rows[0]!.ohne).toBeGreaterThan(0);
  });
});
