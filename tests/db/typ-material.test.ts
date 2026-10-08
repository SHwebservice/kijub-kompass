import { describe, it, expect, beforeAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { neueDb, person, als, fehler, type Person } from './harness';

/** Migration 0032: Freizeit-Typ, Abend nur bei Übernachtungsfreizeiten, Materialliste, Checkliste (zweite Durchsicht). */
let db: PGlite;
let fk: Person, fk2: Person, leitung: Person, teamer: Person, fremd: Person;
let fz: string, uebernachtung: string;

const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params);
type Punkt = { titel: string; faellig: string; auto_erfuellt: boolean; themen: string[]; termin_art: string | null; automatik: string | null };
const punkt = async (titel: string) =>
  (await als(db, leitung, () => q<{ r: Punkt[] }>(`select fn_checkliste($1::uuid[]) as r`, [[fz]]))).rows[0]!.r.find((p) => p.titel === titel)!;

beforeAll(async () => {
  db = await neueDb();
  fk = await person(db, 'FK', { kategorie: 'Hauptamtliche*r' });
  fk2 = await person(db, 'FK2', { kategorie: 'Hauptamtliche*r' });
  leitung = await person(db, 'Lea', { kategorie: 'Hauptamtliche*r' });
  teamer = await person(db, 'Tim', { kategorie: 'TeamerIn' });
  fremd = await person(db, 'Fremd', { kategorie: 'Hauptamtliche*r' });
  await q(`update personen set ist_freizeitkoordination = true where id in ($1, $2)`, [fk.id, fk2.id]);
  fz = (await q<{ id: string }>(`insert into freizeiten (name, start_datum, ende_datum, typ) values ('Themen', '2027-08-02', '2027-08-06', 1) returning id`)).rows[0]!.id;
  uebernachtung = (await q<{ id: string }>(`insert into freizeiten (name, start_datum, ende_datum, typ) values ('Zelten', '2027-08-02', '2027-08-06', 4) returning id`)).rows[0]!.id;
  await q(`insert into freizeit_team (freizeit_id, person_id, rolle) values ($1, $2, 'leitung'), ($1, $3, 'teamer'), ($4, $2, 'leitung')`, [fz, leitung.id, teamer.id, uebernachtung]);
});

describe('Freizeit-Typ und Abend-Abschnitt', () => {
  it('Typ nur 1 bis 4', async () => {
    expect(await fehler(() => q(`update freizeiten set typ = 5 where id = $1`, [fz]))).toMatch(/check/i);
  });

  it('Abend nur bei Übernachtungsfreizeiten (Typ 4); Vormittag und Nachmittag sind Standard', async () => {
    expect((await q<{ name: string }>(`select name from freizeit_slots where freizeit_id = $1 order by position`, [fz])).rows.map((r) => r.name)).toEqual(['Vormittag', 'Nachmittag']);
    expect(await als(db, leitung, () => fehler(() => q(`insert into freizeit_slots (freizeit_id, name, position) values ($1, 'Abend', 3)`, [fz])))).toMatch(/nur bei Übernachtungsfreizeiten/);
    await als(db, leitung, () => q(`insert into freizeit_slots (freizeit_id, name, position) values ($1, 'Abend', 3)`, [uebernachtung]));
    expect(await als(db, leitung, () => fehler(() => q(`update freizeit_slots set name = 'abend' where freizeit_id = $1 and name = 'Nachmittag'`, [fz])))).toMatch(/nur bei Übernachtungsfreizeiten/);
  });
});

describe('Materialliste', () => {
  it('Leitung und Freizeitenkoordination schreiben; TeamerIn und Fremde nicht', async () => {
    await als(db, leitung, () => q(`insert into freizeit_materialliste (freizeit_id, name, menge) values ($1, 'Bastelpapier', '5 Pakete'), ($1, 'Bälle', '10')`, [fz]));
    expect((await als(db, fk, () => q(`select 1 from freizeit_materialliste where freizeit_id = $1`, [fz]))).rows).toHaveLength(2);
    for (const wer of [teamer, fremd]) {
      expect(await als(db, wer, () => fehler(() => q(`insert into freizeit_materialliste (freizeit_id, name) values ($1, 'x')`, [fz])))).toMatch(/row-level security/i);
      expect((await als(db, wer, () => q(`select 1 from freizeit_materialliste`))).rows).toHaveLength(0);
    }
  });

  it('abgeben hakt den Punkt ab und meldet es der Freizeitenkoordination; leere Liste geht nicht', async () => {
    const titel = 'Materialliste geschrieben und an die Freizeitenkoordination abgegeben';
    expect((await punkt(titel)).auto_erfuellt).toBe(false);
    expect(await als(db, leitung, () => fehler(() => q(`select fn_materialliste_abgeben($1)`, [uebernachtung])))).toMatch(/noch leer/);
    expect(await als(db, teamer, () => fehler(() => q(`select fn_materialliste_abgeben($1)`, [fz])))).toMatch(/Nur die Leitung/);
    await als(db, leitung, () => q(`select fn_materialliste_abgeben($1)`, [fz]));
    expect((await q(`select abgegeben_von from materialliste_abgabe where freizeit_id = $1`, [fz])).rows[0]).toEqual({ abgegeben_von: leitung.id });
    expect((await punkt(titel)).auto_erfuellt).toBe(true);
    const p = (await als(db, leitung, () => q<{ p: { empfaenger: string[]; text: string; url: string } }>(`select fn_push_vorbereiten('materialliste', $1) as p`, [fz]))).rows[0]!.p;
    expect(new Set(p.empfaenger)).toEqual(new Set([fk.id, fk2.id]));
    expect(p.text).toMatch(/hat die Materialliste abgegeben \(2 Positionen\)/);
    expect(p.url).toBe(`/freizeiten/${fz}/material`);
    expect(await als(db, fremd, () => fehler(() => q(`select fn_push_vorbereiten('materialliste', $1)`, [fz])))).toMatch(/nicht zulässig/);
  });

  it('die Abgabe schreibt niemand direkt', async () => {
    expect(await als(db, leitung, () => fehler(() => q(`insert into materialliste_abgabe (freizeit_id) values ($1)`, [uebernachtung])))).toMatch(/permission denied/i);
  });
});

describe('Standard-Checkliste nach der zweiten Durchsicht', () => {
  it('Fälligkeiten: Materialliste 4 Wochen vorher, Übergabe 2 Wochen, Leitungsmappe 4 Tage, Material 3 Tage; Nachbesprechung letzter Tag; Nachgespräch 4 Wochen nach Ende', async () => {
    expect((await punkt('Materialliste geschrieben und an die Freizeitenkoordination abgegeben')).faellig).toBe('2027-07-05');
    expect((await punkt('Übergabe der Räumlichkeiten')).faellig).toBe('2027-07-19');
    expect((await punkt('Leitungsmappe überprüft')).faellig).toBe('2027-07-29');
    expect((await punkt('Material überprüft')).faellig).toBe('2027-07-30');
    expect((await punkt('Nachbesprechung mit dem Team')).faellig).toBe('2027-08-06');
    const nach = await punkt('Nachgespräch mit der Freizeitenkoordination');
    expect(nach).toMatchObject({ faellig: '2027-09-03', termin_art: 'absprache', automatik: 'termin' });
  });

  it('Übergabe hat eine eigene Checkliste; Lebensmittel ist nur noch eine Erinnerung', async () => {
    expect((await punkt('Übergabe der Räumlichkeiten')).themen).toHaveLength(11);
    expect((await punkt('Lebensmittel kontrollieren')).automatik).toBeNull();
  });

  it('Wochenplan: Vormittag und Nachmittag an jedem Tag – der Abend zählt nicht', async () => {
    const slots = Object.fromEntries((await q<{ id: string; name: string }>(`select id, name from freizeit_slots where freizeit_id = $1`, [fz])).rows.map((r) => [r.name, r.id]));
    for (const tag of ['2027-08-02', '2027-08-03', '2027-08-04', '2027-08-05', '2027-08-06']) {
      await q(`insert into plan_eintraege (freizeit_id, datum, slot_id, freitext) values ($1, $2, $3, 'A'), ($1, $2, $4, 'B')`, [fz, tag, slots.Vormittag, slots.Nachmittag]);
    }
    expect((await punkt('Wochenplan steht')).auto_erfuellt).toBe(true);
  });
});
