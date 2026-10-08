import { describe, it, expect, beforeAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { neueDb, person, als, fehler, type Person } from './harness';

/** Migration 0031: überarbeitete Standard-Checkliste, Fälligkeit ab Ferienbeginn, Termine mit Hinweis bzw. Absprache, Themen. */
let db: PGlite;
let fk: Person, leitung: Person, teamer: Person, fremd: Person;
let fz: string;

const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params);
type Punkt = { titel: string; faellig: string; auto_erfuellt: boolean; termin: string | null; termin_art: string | null; themen: string[]; themen_erledigt: number[] };
const liste = async (wer: Person = leitung) => (await als(db, wer, () => q<{ r: Punkt[] }>(`select fn_checkliste($1::uuid[]) as r`, [[fz]]))).rows[0]!.r;
const punkt = async (titel: string) => (await liste()).find((p) => p.titel === titel)!;
const vid = async (titel: string) => (await q<{ id: string }>(`select id from checkliste_vorlage where titel = $1`, [titel])).rows[0]!.id;
const termin = (wer: Person, titel: string, wann: string | null, text = '') => als(db, wer, async () =>
  (await q<{ n: string | null }>(`select fn_checkliste_termin($1, $2, $3::timestamptz, $4) as n`, [fz, await vid(titel), wann, text])).rows[0]!.n);

beforeAll(async () => {
  db = await neueDb();
  fk = await person(db, 'FK', { kategorie: 'Hauptamtliche*r' });
  leitung = await person(db, 'Lea', { kategorie: 'Hauptamtliche*r' });
  teamer = await person(db, 'Tim', { kategorie: 'TeamerIn' });
  fremd = await person(db, 'Fremd', { kategorie: 'Hauptamtliche*r' });
  await q(`update personen set ist_freizeitkoordination = true where id = $1`, [fk.id]);
  // Sommer-Woche 5: Freizeit Mittwoch, 4. August 2027 (Woche ab Montag, 2. August) → Ferienbeginn Montag, 5. Juli 2027
  fz = (await q<{ id: string }>(`insert into freizeiten (name, start_datum, ende_datum, ferienzeitraum, ferienwoche) values ('Zeltlager', '2027-08-04', '2027-08-08', 'sommer', 5) returning id`)).rows[0]!.id;
  await q(`insert into freizeit_team (freizeit_id, person_id, rolle) values ($1, $2, 'leitung'), ($1, $3, 'teamer')`, [fz, leitung.id, teamer.id]);
});

describe('Standard-Checkliste nach der Durchsicht', () => {
  it('enthält genau diese Punkte in dieser Reihenfolge', async () => {
    const r = await q<{ titel: string }>(`select titel from checkliste_vorlage where aktiv order by position`);
    expect(r.rows.map((x) => x.titel)).toEqual([                                                             // Stand nach 0032
      'Vorgespräch mit der Freizeitenkoordination', 'Materialliste geschrieben und an die Freizeitenkoordination abgegeben', 'Vortreffen mit dem Team',
      'Wochenplan steht', 'Übergabe der Räumlichkeiten', 'Lebensmittel kontrollieren', 'Leitungsmappe überprüft', 'Material überprüft',
      'Nachbesprechung mit dem Team', 'Nachgespräch mit der Freizeitenkoordination',
    ]);
  });

  it('Vorgespräch: 4 Wochen vor Ferienbeginn (nicht vor Beginn der Freizeit); Vortreffen: 10 Tage vor Beginn', async () => {
    expect((await punkt('Vorgespräch mit der Freizeitenkoordination')).faellig).toBe('2027-06-07');
    expect((await punkt('Vortreffen mit dem Team')).faellig).toBe('2027-07-25');
  });

  it('ohne Ferienwoche gilt der Start der Freizeit als Ferienbeginn', async () => {
    await q(`update freizeiten set ferienwoche = null where id = $1`, [fz]);
    expect((await punkt('Vorgespräch mit der Freizeitenkoordination')).faellig).toBe('2027-07-07');
    await q(`update freizeiten set ferienwoche = 5 where id = $1`, [fz]);
  });

  it('das Vortreffen hat die Themen aus den früheren Punkten', async () => {
    const p = await punkt('Vortreffen mit dem Team');
    expect(p.themen).toEqual(['Teamermappe und Quiz (Qualitätsstandards, Notfall)', 'Ernährung und Allergien im Team']);
    expect(p.termin_art).toBe('hinweis');
  });
});

describe('Termine', () => {
  it('Vortreffen eintragen: Hinweis für das Team mit Datum, Uhrzeit, Text und Themen; erledigt erst, wenn der Termin vorbei ist', async () => {
    const n = await termin(leitung, 'Vortreffen mit dem Team', '2099-07-22T16:00:00Z', 'Im Jugendhaus');
    const notiz = (await q<{ art: string; datum: string; text: string; erstellt_von: string }>(`select art::text, datum::text, text, erstellt_von from notizen where id = $1`, [n])).rows[0]!;
    expect(notiz).toMatchObject({ art: 'hinweis', datum: '2099-07-22', erstellt_von: leitung.id });
    expect(notiz.text).toBe('Vortreffen mit dem Team: Mittwoch, 22.07.2099, 18:00 Uhr\nIm Jugendhaus\nThemen: Teamermappe und Quiz (Qualitätsstandards, Notfall), Ernährung und Allergien im Team');
    expect((await als(db, teamer, () => q(`select 1 from notizen where id = $1`, [n]))).rows).toHaveLength(1);       // das Team sieht ihn
    expect((await punkt('Vortreffen mit dem Team')).auto_erfuellt).toBe(false);                                         // noch in der Zukunft
    // Mitteilung an das Team wie bei jedem neuen Hinweis
    const push = (await als(db, leitung, () => q<{ p: { empfaenger: string[] } }>(`select fn_push_vorbereiten('hinweis', $1) as p`, [n]))).rows[0]!.p;
    expect(push.empfaenger).toEqual(expect.arrayContaining([teamer.id]));
  });

  it('ein geänderter Termin ersetzt den Hinweis; ein vergangener Termin hakt den Punkt ab', async () => {
    const alt = (await q<{ id: string }>(`select termin_notiz_id as id from checkliste_status where freizeit_id = $1 and vorlage_id = $2`, [fz, await vid('Vortreffen mit dem Team')])).rows[0]!.id;
    const neu = await termin(leitung, 'Vortreffen mit dem Team', '2020-07-22T16:00:00Z');
    expect((await q(`select 1 from notizen where id = $1`, [alt])).rows).toHaveLength(0);
    expect((await q(`select 1 from notizen where id = $1`, [neu])).rows).toHaveLength(1);
    expect((await punkt('Vortreffen mit dem Team')).auto_erfuellt).toBe(true);
  });

  it('Termin löschen entfernt den Hinweis und den Haken', async () => {
    expect(await termin(leitung, 'Vortreffen mit dem Team', null)).toBeNull();
    const p = await punkt('Vortreffen mit dem Team');
    expect(p).toMatchObject({ termin: null, auto_erfuellt: false });
    expect((await q(`select 1 from notizen where freizeit_id = $1 and text like 'Vortreffen%'`, [fz])).rows).toHaveLength(0);
  });

  it('Vorgespräch: Absprache, die die Freizeitenkoordination sieht (das Team nicht)', async () => {
    const n = await termin(leitung, 'Vorgespräch mit der Freizeitenkoordination', '2099-06-01T08:30:00Z');
    expect((await q<{ art: string }>(`select art::text from notizen where id = $1`, [n])).rows[0]).toEqual({ art: 'absprache' });
    expect((await als(db, fk, () => q(`select 1 from notizen where id = $1`, [n]))).rows).toHaveLength(1);
    expect((await als(db, teamer, () => q(`select 1 from notizen where id = $1`, [n]))).rows).toHaveLength(0);
  });

  it('nur Leitung und Freizeitenkoordination; nur bei Punkten mit Termin', async () => {
    for (const wer of [teamer, fremd]) {
      expect(await fehler(() => termin(wer, 'Vortreffen mit dem Team', '2099-01-01T10:00:00Z'))).toMatch(/Nur die Leitung/);
    }
    expect(await fehler(() => termin(leitung, 'Wochenplan steht', '2099-01-01T10:00:00Z'))).toMatch(/keinen Termin/);
    await termin(fk, 'Vortreffen mit dem Team', '2099-01-01T10:00:00Z');
  });
});

describe('Themen', () => {
  it('die Leitung hakt Themen ab; sie gehören zur Freizeit', async () => {
    const v = await vid('Vortreffen mit dem Team');
    await als(db, leitung, () => q(`update checkliste_status set themen_erledigt = '{1}' where freizeit_id = $1 and vorlage_id = $2`, [fz, v]));
    expect((await punkt('Vortreffen mit dem Team')).themen_erledigt).toEqual([1]);
  });

  it('leere Themen und ein Termin-Automatik ohne Termin-Art sind nicht erlaubt', async () => {
    expect(await als(db, fk, () => fehler(() => q(`insert into checkliste_vorlage (titel, themen) values ('x', '{""}')`)))).toMatch(/check/i);
    expect(await als(db, fk, () => fehler(() => q(`insert into checkliste_vorlage (titel, automatik) values ('x', 'termin')`)))).toMatch(/check/i);
  });
});
