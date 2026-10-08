import { describe, it, expect, beforeAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { neueDb, person, als, fehler, type Person } from './harness';

/** Migration 0029: Checkliste zur Vorbereitung einer Freizeit (Grundfunktionen; die Punkte mit Automatik, die 0031 aus der Standardliste nahm, legt der Test selbst an). */
let db: PGlite;
let fk: Person, tk: Person, leitung: Person, teamer: Person, fremdeLeitung: Person;
let fz: string, andere: string, ort: string;

const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params);
type Punkt = { freizeit_id: string; art: string; id: string; titel: string; faellig: string | null; status: string; auto_erfuellt: boolean; automatik: string | null; geaendert_von: string | null };
const liste = async (wer: Person, ids: string[] = [fz]) =>
  (await als(db, wer, () => q<{ r: Punkt[] }>(`select fn_checkliste($1::uuid[]) as r`, [ids]))).rows[0]!.r;
const punkt = async (titel: string, wer: Person = leitung) => (await liste(wer)).find((p) => p.titel === titel)!;
const vorlageId = async (titel: string) => (await q<{ id: string }>(`select id from checkliste_vorlage where titel = $1`, [titel])).rows[0]!.id;
const heute = async () => (await q<{ d: string }>(`select (now() at time zone 'Europe/Berlin')::date::text as d`)).rows[0]!.d;

beforeAll(async () => {
  db = await neueDb();
  fk = await person(db, 'FK', { kategorie: 'Hauptamtliche*r' });
  tk = await person(db, 'TK', { kategorie: 'Hauptamtliche*r' });
  leitung = await person(db, 'Leitung', { kategorie: 'Hauptamtliche*r' });
  fremdeLeitung = await person(db, 'Fremd', { kategorie: 'Hauptamtliche*r' });
  teamer = await person(db, 'Teamer', { kategorie: 'TeamerIn' });
  await q(`update personen set ist_freizeitkoordination = true where id = $1`, [fk.id]);
  await q(`update personen set ist_treffkoordination = true where id = $1`, [tk.id]);
  ort = (await q<{ id: string }>(`insert into orte (name) values ('Au') returning id`)).rows[0]!.id;
  // Start in 20 Tagen, 3 Tage lang
  fz = (await q<{ id: string }>(`insert into freizeiten (name, start_datum, ende_datum, ort_id) values ('Zeltlager', current_date + 20, current_date + 22, $1) returning id`, [ort])).rows[0]!.id;
  andere = (await q<{ id: string }>(`insert into freizeiten (name, start_datum, ende_datum) values ('Andere', current_date + 30, current_date + 31) returning id`)).rows[0]!.id;
  await q(`insert into freizeit_team (freizeit_id, person_id, rolle) values ($1, $2, 'leitung'), ($1, $3, 'teamer'), ($4, $5, 'leitung')`, [fz, leitung.id, teamer.id, andere, fremdeLeitung.id]);
  // Automatik-Punkte als Testdaten (nicht mehr in der Standardliste seit 0031)
  await q(`insert into checkliste_vorlage (position, titel, bezug, tage, automatik) values
    (1, 'Leitung steht fest', 'start', -84, 'leitung'), (2, 'Team ist zusammengestellt', 'start', -42, 'team'),
    (3, 'Offene Bewerbungen sind entschieden', 'start', -42, 'bewerbungen'), (4, 'Infos für das Team veröffentlicht', 'start', -14, 'hinweis'),
    (5, 'Alle haben die Hinweise gesehen', 'start', -3, 'hinweise_gesehen'), (6, 'Lebensmittel-Bestand am Ort geprüft', 'start', -7, 'lebensmittel')`);
});

describe('Standard-Checkliste', () => {
  it('enthält den Vorschlag; alle Aktiven lesen, nur die Freizeitenkoordination pflegt', async () => {
    const n = (await als(db, teamer, () => q(`select 1 from checkliste_vorlage`))).rows.length;
    expect(n).toBe(16);                                                                                   // 10 Standardpunkte (0032) + 6 Testpunkte
    await als(db, fk, () => q(`insert into checkliste_vorlage (titel, tage, position) values ('Bus bestellen', -30, 35)`));
    for (const wer of [tk, leitung, teamer]) {
      expect(await als(db, wer, () => fehler(() => q(`insert into checkliste_vorlage (titel) values ('x')`)))).toMatch(/row-level security/i);
    }
    expect(await als(db, 'anon', () => fehler(() => q(`select 1 from checkliste_vorlage`)))).toMatch(/permission denied/i);
  });

  it('Ziel und Automatik nur aus den bekannten Werten', async () => {
    expect(await als(db, fk, () => fehler(() => q(`insert into checkliste_vorlage (titel, ziel) values ('x', 'irgendwo')`)))).toMatch(/check/i);
    expect(await als(db, fk, () => fehler(() => q(`insert into checkliste_vorlage (titel, automatik) values ('x', 'zauber')`)))).toMatch(/check/i);
  });
});

describe('fn_checkliste', () => {
  it('Fälligkeit relativ zu Start bzw. Ende; Leitung und Freizeitenkoordination sehen die Punkte, andere nicht', async () => {
    const p = await punkt('Wochenplan steht');
    expect(p.faellig).toBe((await q<{ d: string }>(`select (current_date + 6)::text as d`)).rows[0]!.d);             // Start − 14
    expect((await punkt('Nachbesprechung mit dem Team')).faellig).toBe((await q<{ d: string }>(`select (current_date + 22)::text as d`)).rows[0]!.d);   // letzter Tag
    expect((await liste(fk)).length).toBe(17);
    for (const wer of [teamer, tk, fremdeLeitung]) expect(await liste(wer)).toEqual([]);
    expect((await liste(fk, [fz, andere])).length).toBe(34);
  });

  it('automatisch erkannt: Leitung, Team, Bewerbungen; Hinweis und „alle gesehen“; Wochenplan; Lebensmittel', async () => {
    expect((await punkt('Leitung steht fest')).auto_erfuellt).toBe(true);
    expect((await punkt('Team ist zusammengestellt')).auto_erfuellt).toBe(true);
    expect((await punkt('Offene Bewerbungen sind entschieden')).auto_erfuellt).toBe(true);
    expect((await punkt('Infos für das Team veröffentlicht')).auto_erfuellt).toBe(false);

    const n = (await q<{ id: string }>(`insert into notizen (freizeit_id, art, text) values ($1, 'hinweis', 'Treffpunkt 9 Uhr') returning id`, [fz])).rows[0]!.id;
    expect((await punkt('Infos für das Team veröffentlicht')).auto_erfuellt).toBe(true);
    expect((await punkt('Alle haben die Hinweise gesehen')).auto_erfuellt).toBe(false);
    await q(`insert into notiz_bestaetigungen (notiz_id, person_id) values ($1, $2)`, [n, teamer.id]);
    expect((await punkt('Alle haben die Hinweise gesehen')).auto_erfuellt).toBe(true);

    // seit 0032: an jedem Tag Vormittag und Nachmittag
    const slot = async (name: string) => (await q<{ id: string }>(`select id from freizeit_slots where freizeit_id = $1 and name = $2`, [fz, name])).rows[0]!.id;
    const vm = await slot('Vormittag'); const nm = await slot('Nachmittag');
    await q(`insert into plan_eintraege (freizeit_id, datum, slot_id, freitext) values ($1, current_date + 20, $2, 'A'), ($1, current_date + 21, $2, 'B'), ($1, current_date + 22, $2, 'C')`, [fz, vm]);
    expect((await punkt('Wochenplan steht')).auto_erfuellt).toBe(false);                               // nachmittags fehlt alles
    await q(`insert into plan_eintraege (freizeit_id, datum, slot_id, freitext) values ($1, current_date + 20, $2, 'A'), ($1, current_date + 21, $2, 'B')`, [fz, nm]);
    expect((await punkt('Wochenplan steht')).auto_erfuellt).toBe(false);                               // ein Nachmittag fehlt
    await q(`insert into plan_eintraege (freizeit_id, datum, slot_id, freitext) values ($1, current_date + 22, $2, 'C')`, [fz, nm]);
    expect((await punkt('Wochenplan steht')).auto_erfuellt).toBe(true);

    expect((await punkt('Lebensmittel-Bestand am Ort geprüft')).auto_erfuellt).toBe(false);
    await q(`insert into lebensmittel_eingang (ort_id, name, menge) values ($1, 'Nudeln', 5)`, [ort]);
    expect((await punkt('Lebensmittel-Bestand am Ort geprüft')).auto_erfuellt).toBe(true);

    await q(`insert into bewerbungen (person_id, freizeit_id) values ($1, $2)`, [fremdeLeitung.id, fz]);
    expect((await punkt('Offene Bewerbungen sind entschieden')).auto_erfuellt).toBe(false);
  });
});

describe('Stand je Freizeit und eigene Punkte', () => {
  it('Leitung hakt ab und setzt „nicht relevant“; wer und wann wird vermerkt', async () => {
    const v = await vorlageId('Leitungsmappe überprüft');
    await als(db, leitung, () => q(`insert into checkliste_status (freizeit_id, vorlage_id, status, notiz, geaendert_von) values ($1, $2, 'erledigt', 'gedruckt', $3)`, [fz, v, fk.id]));
    const p = await punkt('Leitungsmappe überprüft');
    expect(p).toMatchObject({ status: 'erledigt', geaendert_von: leitung.id });
    await als(db, fk, () => q(`update checkliste_status set status = 'nicht_relevant' where freizeit_id = $1 and vorlage_id = $2`, [fz, v]));
    expect(await punkt('Leitungsmappe überprüft')).toMatchObject({ status: 'nicht_relevant', geaendert_von: fk.id });
  });

  it('TeamerIn, Treffkoordination und Leitung einer anderen Freizeit dürfen nichts ändern', async () => {
    const v = await vorlageId('Vortreffen mit dem Team');
    for (const wer of [teamer, tk, fremdeLeitung]) {
      expect(await als(db, wer, () => fehler(() => q(`insert into checkliste_status (freizeit_id, vorlage_id, status) values ($1, $2, 'erledigt')`, [fz, v])))).toMatch(/row-level security/i);
      expect(await als(db, wer, () => fehler(() => q(`insert into checkliste_eigene (freizeit_id, titel) values ($1, 'x')`, [fz])))).toMatch(/row-level security/i);
    }
  });

  it('eigene Punkte mit Datum; erscheinen in der Liste; nicht in eine andere Freizeit verschiebbar', async () => {
    const id = (await als(db, leitung, () => q<{ id: string }>(`insert into checkliste_eigene (freizeit_id, titel, faellig_am) values ($1, 'Kanus reservieren', current_date + 5) returning id`, [fz]))).rows[0]!.id;
    const p = (await liste(leitung)).find((x) => x.id === id)!;
    expect(p).toMatchObject({ art: 'eigen', titel: 'Kanus reservieren', status: 'offen', auto_erfuellt: false });
    expect(await als(db, fk, () => fehler(() => q(`update checkliste_eigene set freizeit_id = $2 where id = $1`, [id, andere])))).toMatch(/verschieben/);
    expect((await q<{ erstellt_von: string }>(`select erstellt_von from checkliste_eigene where id = $1`, [id])).rows[0]!.erstellt_von).toBe(leitung.id);
  });

  it('mit der Freizeit verschwinden Stand und eigene Punkte', async () => {
    const tmp = (await q<{ id: string }>(`insert into freizeiten (name, start_datum, ende_datum) values ('Tmp', current_date, current_date) returning id`)).rows[0]!.id;
    await q(`insert into checkliste_eigene (freizeit_id, titel) values ($1, 'x')`, [tmp]);
    await q(`insert into checkliste_status (freizeit_id, vorlage_id, status) values ($1, $2, 'erledigt')`, [tmp, await vorlageId('Wochenplan steht')]);
    await q(`delete from freizeiten where id = $1`, [tmp]);
    expect((await q(`select 1 from checkliste_eigene where freizeit_id = $1 union all select 1 from checkliste_status where freizeit_id = $1`, [tmp])).rows).toHaveLength(0);
  });
});

describe('Erinnerung „heute fällig“', () => {
  type Plan = { freizeit?: string; empfaenger: string[]; titel: string; text: string; url: string };
  const erinnere = async () => (await q<{ r: Plan[] }>(`select fn_protokoll_erinnerungen() as r`)).rows[0]!.r;

  it('geht einmal am Tag an die Leitungen, nur für offene und nicht automatisch erfüllte Punkte', async () => {
    await q(`delete from mitteilungen_log`);
    const d = await heute();
    await q(`insert into checkliste_eigene (freizeit_id, titel, faellig_am) values ($1, 'Bus bestätigen', $2)`, [fz, d]);
    const r = (await erinnere()).filter((x) => x.url === `/freizeiten/${fz}/vorbereitung`);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ empfaenger: [leitung.id], titel: 'Vorbereitung · Zeltlager', text: 'Heute fällig: Bus bestätigen', url: `/freizeiten/${fz}/vorbereitung` });
    expect((await erinnere()).filter((x) => x.url === `/freizeiten/${fz}/vorbereitung`)).toEqual([]);          // einmal am Tag
  });

  it('erledigte Punkte erinnern nicht; abgesagte Freizeiten auch nicht', async () => {
    await q(`delete from mitteilungen_log`);
    await q(`update checkliste_eigene set status = 'erledigt' where titel = 'Bus bestätigen'`);
    expect((await erinnere()).filter((x) => x.url === `/freizeiten/${fz}/vorbereitung`)).toEqual([]);
    await q(`delete from mitteilungen_log`);
    await q(`update checkliste_eigene set status = 'offen' where titel = 'Bus bestätigen'`);
    await q(`update freizeiten set status = 'abgesagt' where id = $1`, [fz]);
    expect((await erinnere()).filter((x) => x.url === `/freizeiten/${fz}/vorbereitung`)).toEqual([]);
    await q(`update freizeiten set status = 'geplant' where id = $1`, [fz]);
  });

  it('nur mit dem Service-Schlüssel aufrufbar', async () => {
    for (const wer of [fk, leitung]) {
      expect(await als(db, wer, () => fehler(() => q(`select fn_checkliste_erinnerungen()`)))).toMatch(/permission denied/i);
      expect(await als(db, wer, () => fehler(() => q(`select fn_protokoll_erinnerungen()`)))).toMatch(/permission denied/i);
    }
  });
});
