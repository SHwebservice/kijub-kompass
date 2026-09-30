import { describe, it, expect, beforeAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { neueDb, person, als, fehler, type Person } from './harness';

/** Datenbankseite der Hinweise und Absprachen: Bearbeiten, Löschen, Bestätigen, Kommentieren – je Rolle. */
let db: PGlite;
let koord: Person, leitung: Person, leitung2: Person, teamer: Person, teamer2: Person, fremder: Person;
let fz: string, fz2: string, hinweis: string, absprache: string;
const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params);
const zahl = async (sql: string, p: unknown[] = []) => (await q<{ n: number }>(`select count(*)::int as n from ${sql}`, p)).rows[0]!.n;

beforeAll(async () => {
  db = await neueDb();
  koord = await person(db, 'Koord', { koordination: true, kategorie: 'Hauptamtliche*r' });
  leitung = await person(db, 'Leitung', { kategorie: 'Hauptamtliche*r' });
  leitung2 = await person(db, 'Leitung2', { kategorie: 'Hauptamtliche*r' });
  teamer = await person(db, 'Tom');
  teamer2 = await person(db, 'Tina');
  fremder = await person(db, 'Fremder');
  fz = (await q<{ id: string }>(`insert into freizeiten (name, start_datum, ende_datum) values ('F', current_date + 30, current_date + 34) returning id`)).rows[0]!.id;
  fz2 = (await q<{ id: string }>(`insert into freizeiten (name, start_datum, ende_datum) values ('Andere', current_date + 40, current_date + 44) returning id`)).rows[0]!.id;
  await q(`insert into freizeit_team values ($1, $2, 'leitung'), ($1, $3, 'teamer'), ($1, $4, 'teamer')`, [fz, leitung.id, teamer.id, teamer2.id]);
  await q(`insert into freizeit_team values ($1, $2, 'leitung')`, [fz2, leitung2.id]);
  hinweis = (await als(db, leitung, () => q<{ id: string }>(`insert into notizen (freizeit_id, art, text) values ($1, 'hinweis', 'Sonnencreme') returning id`, [fz]))).rows[0]!.id;
  absprache = (await als(db, leitung, () => q<{ id: string }>(`insert into notizen (freizeit_id, art, text) values ($1, 'absprache', 'Budget') returning id`, [fz]))).rows[0]!.id;
});

describe('Hinweise und Absprachen anlegen, ändern, löschen', () => {
  it('Verfasser ist automatisch die Leitung', async () => {
    const r = await q<{ erstellt_von: string }>('select erstellt_von from notizen where id = $1', [hinweis]);
    expect(r.rows[0]!.erstellt_von).toBe(leitung.id);
  });

  it('eine Tagesnotiz braucht einen Tag, eine Gesamtnotiz nicht', async () => {
    const msg = await als(db, leitung, () => fehler(() => q(`insert into notizen (freizeit_id, art, geltung, text) values ($1, 'hinweis', 'tag', 'x')`, [fz])));
    expect(msg).toMatch(/check/i);
    await als(db, leitung, () => q(`insert into notizen (freizeit_id, art, geltung, datum, text) values ($1, 'hinweis', 'tag', current_date + 31, 'Ausflug')`, [fz]));
  });

  it('die Leitung ändert Text und Geltung (auch von der Koordination verfasste Absprachen)', async () => {
    const r = await als(db, leitung, () => q(`update notizen set text = 'Sonnencreme und Mütze' where id = $1`, [hinweis]));
    expect(r.affectedRows).toBe(1);
    const k = await als(db, koord, () => q<{ id: string }>(`insert into notizen (freizeit_id, art, text) values ($1, 'absprache', 'Von der Koordination') returning id`, [fz]));
    const r2 = await als(db, leitung, () => q(`update notizen set text = 'angepasst' where id = $1`, [k.rows[0]!.id]));
    expect(r2.affectedRows).toBe(1);
  });

  it('TeamerInnen ändern oder löschen nichts', async () => {
    const r = await als(db, teamer, () => q(`update notizen set text = 'gehackt' where id = $1`, [hinweis]));
    expect(r.affectedRows).toBe(0);
    const d = await als(db, teamer, () => q('delete from notizen where id = $1', [hinweis]));
    expect(d.affectedRows).toBe(0);
  });

  it('die Leitung einer ANDEREN Freizeit ändert nichts und sieht nichts', async () => {
    const r = await als(db, leitung2, () => q(`update notizen set text = 'gehackt' where id = $1`, [hinweis]));
    expect(r.affectedRows).toBe(0);
    const l = await als(db, leitung2, () => q('select * from notizen where freizeit_id = $1', [fz]));
    expect(l.rows).toHaveLength(0);
    const msg = await als(db, leitung2, () => fehler(() => q(`insert into notizen (freizeit_id, art, text) values ($1, 'hinweis', 'fremd')`, [fz])));
    expect(msg).toMatch(/row-level security/i);
  });

  it('TeamerInnen sehen nur Hinweise, nie Absprachen', async () => {
    const r = await als(db, teamer, () => q<{ art: string }>('select art from notizen where freizeit_id = $1', [fz]));
    expect(new Set(r.rows.map((x) => x.art))).toEqual(new Set(['hinweis']));
  });
});

describe('Bestätigungen', () => {
  it('TeamerIn bestätigt einen Hinweis und nimmt es zurück; nicht für andere', async () => {
    await als(db, teamer, () => q('insert into notiz_bestaetigungen (notiz_id, person_id) values ($1, $2)', [hinweis, teamer.id]));
    const fremd = await als(db, teamer2, () => q('delete from notiz_bestaetigungen where notiz_id = $1 and person_id = $2', [hinweis, teamer.id]));
    expect(fremd.affectedRows).toBe(0);
    const eigen = await als(db, teamer, () => q('delete from notiz_bestaetigungen where notiz_id = $1 and person_id = $2', [hinweis, teamer.id]));
    expect(eigen.affectedRows).toBe(1);
  });

  it('die Leitung sieht, wer bestätigt hat', async () => {
    await als(db, teamer2, () => q('insert into notiz_bestaetigungen (notiz_id, person_id) values ($1, $2)', [hinweis, teamer2.id]));
    const r = await als(db, leitung, () => q<{ person_id: string }>('select person_id from notiz_bestaetigungen where notiz_id = $1', [hinweis]));
    expect(r.rows.map((x) => x.person_id)).toEqual([teamer2.id]);
  });

  it('Leitung und Koordination bestätigen Absprachen; eine Person nur einmal', async () => {
    await als(db, leitung, () => q('insert into notiz_bestaetigungen (notiz_id, person_id) values ($1, $2)', [absprache, leitung.id]));
    await als(db, koord, () => q('insert into notiz_bestaetigungen (notiz_id, person_id) values ($1, $2)', [absprache, koord.id]));
    const dup = await als(db, leitung, () => fehler(() => q('insert into notiz_bestaetigungen (notiz_id, person_id) values ($1, $2)', [absprache, leitung.id])));
    expect(dup).toMatch(/duplicate|unique/i);
  });

  it('eine gelöschte Notiz nimmt ihre Bestätigungen und Kommentare mit', async () => {
    const n = (await als(db, leitung, () => q<{ id: string }>(`insert into notizen (freizeit_id, art, text) values ($1, 'absprache', 'kurzlebig') returning id`, [fz]))).rows[0]!.id;
    await als(db, leitung, () => q('insert into notiz_bestaetigungen (notiz_id, person_id) values ($1, $2)', [n, leitung.id]));
    await als(db, leitung, () => q(`insert into notiz_kommentare (notiz_id, person_id, text) values ($1, $2, 'k')`, [n, leitung.id]));
    await als(db, leitung, () => q('delete from notizen where id = $1', [n]));
    expect(await zahl('notiz_bestaetigungen where notiz_id = $1', [n])).toBe(0);
    expect(await zahl('notiz_kommentare where notiz_id = $1', [n])).toBe(0);
  });
});

describe('Kommentare', () => {
  it('Leitung und Koordination kommentieren Absprachen, TeamerInnen nicht (auch keine Hinweise)', async () => {
    await als(db, leitung, () => q(`insert into notiz_kommentare (notiz_id, person_id, text) values ($1, $2, 'Stand?')`, [absprache, leitung.id]));
    await als(db, koord, () => q(`insert into notiz_kommentare (notiz_id, person_id, text) values ($1, $2, 'Klärung läuft')`, [absprache, koord.id]));
    const t = await als(db, teamer, () => fehler(() => q(`insert into notiz_kommentare (notiz_id, person_id, text) values ($1, $2, 'mitreden')`, [hinweis, teamer.id])));
    expect(t).toMatch(/row-level security/i);
    const l = await als(db, leitung, () => fehler(() => q(`insert into notiz_kommentare (notiz_id, person_id, text) values ($1, $2, 'zum Hinweis')`, [hinweis, leitung.id])));
    expect(l).toMatch(/row-level security/i);
  });

  it('nicht im Namen anderer', async () => {
    const msg = await als(db, leitung, () => fehler(() => q(`insert into notiz_kommentare (notiz_id, person_id, text) values ($1, $2, 'gefälscht')`, [absprache, koord.id])));
    expect(msg).toMatch(/row-level security/i);
  });

  it('die Leitung löscht eigene Kommentare, nicht die der Koordination; die Koordination alle', async () => {
    const ko = (await q<{ id: string }>(`select id from notiz_kommentare where person_id = $1`, [koord.id])).rows[0]!.id;
    const fremd = await als(db, leitung, () => q('delete from notiz_kommentare where id = $1', [ko]));
    expect(fremd.affectedRows).toBe(0);
    const eigen = await als(db, leitung, () => q('delete from notiz_kommentare where person_id = $1', [leitung.id]));
    expect(eigen.affectedRows).toBe(1);
    const k = await als(db, koord, () => q('delete from notiz_kommentare where id = $1', [ko]));
    expect(k.affectedRows).toBe(1);
  });

  it('TeamerInnen und Außenstehende sehen Kommentare der Absprachen nicht', async () => {
    await als(db, leitung, () => q(`insert into notiz_kommentare (notiz_id, person_id, text) values ($1, $2, 'intern')`, [absprache, leitung.id]));
    for (const p of [teamer, fremder]) {
      const r = await als(db, p, () => q('select * from notiz_kommentare'));
      expect(r.rows).toHaveLength(0);
    }
  });
});
