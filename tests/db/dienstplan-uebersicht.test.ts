import { describe, it, expect, beforeAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { neueDb, person, als, fehler, type Person } from './harness';

/** Migration 0036: Monat veröffentlichen, „kann nicht“, Mindestbesetzung, Zeitpunkt der Einteilung, Kalender. */
let db: PGlite;
let tl: Person, tk: Person, anna: Person, ben: Person, fremd: Person;
let treff: string, anderer: string, dienst: string;

const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params);
const monat = async (tage: number) => (await q<{ m: string }>(`select to_char(date_trunc('month', current_date + $1::int), 'YYYY-MM-DD') as m`, [tage])).rows[0]!.m;
const datum = async (tage: number) => (await q<{ d: string }>(`select to_char(current_date + $1::int, 'YYYY-MM-DD') as d`, [tage])).rows[0]!.d;
type Push = { empfaenger: string[]; titel: string; text: string; url: string };

beforeAll(async () => {
  db = await neueDb();
  tl = await person(db, 'Leitung', { kategorie: 'Hauptamtliche*r' });
  tk = await person(db, 'TK', { kategorie: 'Hauptamtliche*r' });
  anna = await person(db, 'Anna', { kategorie: 'TZK' });
  ben = await person(db, 'Ben', { kategorie: 'TZK' });
  fremd = await person(db, 'Fremd', { kategorie: 'TZK' });
  await q(`update personen set ist_treffkoordination = true where id = $1`, [tk.id]);
  treff = (await q<{ id: string }>(`insert into treffs (name, adresse_abw) values ('Kindertreff', 'Hauptstraße 1; Hof') returning id`)).rows[0]!.id;
  anderer = (await q<{ id: string }>(`insert into treffs (name) values ('Anderer') returning id`)).rows[0]!.id;
  await q(`insert into treff_team (treff_id, person_id, rolle) values ($1, $2, 'treffleitung'), ($1, $3, 'betreuerin'), ($1, $4, 'betreuerin')`, [treff, tl.id, anna.id, ben.id]);
  await q(`insert into treff_team (treff_id, person_id, rolle) values ($1, $2, 'betreuerin')`, [anderer, fremd.id]);
  dienst = (await q<{ id: string }>(`insert into dienste (treff_id, datum, von, bis) values ($1, current_date + 40, '15:00', '19:00') returning id`, [treff])).rows[0]!.id;
});

describe('Monat veröffentlichen', () => {
  it('Monate, die vor der Migration schon Dienste hatten, gelten als veröffentlicht', async () => {
    const alt = await neueDb({ ueberspringen: ['0036'] });
    const t = (await alt.query<{ id: string }>(`insert into treffs (name) values ('Alt') returning id`)).rows[0]!.id;
    await alt.query(`insert into dienste (treff_id, datum, von, bis) values ($1, '2026-03-04', '15:00', '19:00'), ($1, '2026-03-11', '15:00', '19:00'), ($1, '2026-05-06', '15:00', '19:00')`, [t]);
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    await alt.exec(readFileSync(join(__dirname, '../../supabase/migrations/0036_dienstplan_uebersicht.sql'), 'utf8'));
    const r = await alt.query<{ m: string }>(`select to_char(monat, 'YYYY-MM-DD') as m from dienstplan_monate where treff_id = $1 order by 1`, [t]);
    expect(r.rows.map((x) => x.m)).toEqual(['2026-03-01', '2026-05-01']);
  });

  it('Treffleitung veröffentlicht; wer und wann setzt die Datenbank', async () => {
    const m = await monat(40);
    await als(db, tl, () => q(`insert into dienstplan_monate (treff_id, monat, veroeffentlicht_von) values ($1, $2, $3)`, [treff, m, anna.id]));
    const r = (await q<{ von: string }>(`select veroeffentlicht_von as von from dienstplan_monate where treff_id = $1 and monat = $2`, [treff, m])).rows[0]!;
    expect(r.von).toBe(tl.id);
  });

  it('das Team liest den Stand, schreibt ihn aber nicht; Außenstehende sehen nichts', async () => {
    const m = await monat(40);
    expect((await als(db, anna, () => q(`select 1 from dienstplan_monate where treff_id = $1`, [treff]))).rows).toHaveLength(1);
    expect((await als(db, fremd, () => q(`select 1 from dienstplan_monate where treff_id = $1`, [treff]))).rows).toHaveLength(0);
    expect(await als(db, anna, () => fehler(() => q(`insert into dienstplan_monate (treff_id, monat) values ($1, $2)`, [treff, '2030-01-01'])))).toMatch(/row-level security/i);
    const geloescht = await als(db, anna, () => q(`delete from dienstplan_monate where treff_id = $1 and monat = $2`, [treff, m]));
    expect(geloescht.affectedRows).toBe(0);
  });

  it('nur der erste Tag eines Monats', async () => {
    expect(await als(db, tl, () => fehler(() => q(`insert into dienstplan_monate (treff_id, monat) values ($1, '2030-01-15')`, [treff])))).toMatch(/check/i);
  });

  it('Mitteilung „Dienstplan steht“ an das Team ohne die veröffentlichende Person, nur kurz nach dem Veröffentlichen', async () => {
    const m = await monat(40);
    const p = (await als(db, tl, () => q<{ p: Push }>(`select fn_push_vorbereiten('dienstplan_veroeffentlicht', $1, $2::jsonb) as p`, [treff, JSON.stringify({ monat: m })]))).rows[0]!.p;
    expect(new Set(p.empfaenger)).toEqual(new Set([anna.id, ben.id]));
    expect(p.titel).toBe('Dienstplan · Kindertreff');
    expect(p.text).toMatch(/^Der Dienstplan für \S+ \d{4} steht\./);
    expect(p.url).toBe(`/treffs/${treff}/dienstplan?ansicht=monat&datum=${m}`);
    // Nicht von jemand anderem, nicht für einen unveröffentlichten Monat
    expect(await als(db, tk, () => fehler(() => q(`select fn_push_vorbereiten('dienstplan_veroeffentlicht', $1, $2::jsonb)`, [treff, JSON.stringify({ monat: m })])))).toMatch(/nicht zulässig/);
    expect(await als(db, tl, () => fehler(() => q(`select fn_push_vorbereiten('dienstplan_veroeffentlicht', $1, $2::jsonb)`, [treff, JSON.stringify({ monat: '2031-01-01' })])))).toMatch(/nicht zulässig/);
  });

  it('Treffleitung nimmt die Veröffentlichung zurück', async () => {
    const m = await monat(40);
    const r = await als(db, tl, () => q(`delete from dienstplan_monate where treff_id = $1 and monat = $2`, [treff, m]));
    expect(r.affectedRows).toBe(1);
  });
});

describe('„Kann nicht“', () => {
  it('die Person trägt sich für künftige Tage ihres Treffs ein, nicht für andere und nicht rückwirkend', async () => {
    const d = await datum(40);
    await als(db, anna, () => q(`insert into dienst_verhinderungen (treff_id, person_id, datum) values ($1, $2, $3)`, [treff, anna.id, d]));
    expect(await als(db, anna, () => fehler(() => q(`insert into dienst_verhinderungen (treff_id, person_id, datum) values ($1, $2, $3)`, [treff, ben.id, d])))).toMatch(/row-level security/i);
    expect(await als(db, anna, () => fehler(() => q(`insert into dienst_verhinderungen (treff_id, person_id, datum) values ($1, $2, current_date - 1)`, [treff, anna.id])))).toMatch(/row-level security/i);
    expect(await als(db, fremd, () => fehler(() => q(`insert into dienst_verhinderungen (treff_id, person_id, datum) values ($1, $2, $3)`, [treff, fremd.id, d])))).toMatch(/row-level security/i);
  });

  it('sehen dürfen es die Person, die Treffleitung und die Treffkoordination – nicht das übrige Team', async () => {
    const n = async (wer: Person) => (await als(db, wer, () => q(`select 1 from dienst_verhinderungen where treff_id = $1`, [treff]))).rows.length;
    expect(await n(anna)).toBe(1);
    expect(await n(tl)).toBe(1);
    expect(await n(tk)).toBe(1);
    expect(await n(ben)).toBe(0);
  });

  it('Mitteilung an die Treffleitung nur, wenn die Person an dem Tag eingeteilt ist', async () => {
    const d = await datum(40);
    const vorbereiten = (wer: Person) => als(db, wer, () => q<{ p: Push }>(`select fn_push_vorbereiten('verhindert', $1, $2::jsonb) as p`, [treff, JSON.stringify({ datum: d })]));
    expect(await fehler(() => vorbereiten(anna))).toMatch(/nicht zulässig/);
    await q(`insert into dienst_zuteilungen (dienst_id, person_id) values ($1, $2)`, [dienst, anna.id]);
    const p = (await vorbereiten(anna)).rows[0]!.p;
    expect(p.empfaenger).toEqual([tl.id]);
    expect(p.text).toMatch(/kann am \d\d\.\d\d\.\d{4} nicht, ist aber eingeteilt/);
    expect(await fehler(() => vorbereiten(ben))).toMatch(/nicht zulässig/);
  });

  it('nur die Person selbst nimmt es zurück; wer den Treff verlässt, dessen Einträge fallen weg', async () => {
    const d = await datum(41);
    await als(db, ben, () => q(`insert into dienst_verhinderungen (treff_id, person_id, datum) values ($1, $2, $3)`, [treff, ben.id, d]));
    expect((await als(db, tl, () => q(`delete from dienst_verhinderungen where person_id = $1`, [ben.id]))).affectedRows).toBe(0);
    await q(`delete from treff_team where treff_id = $1 and person_id = $2`, [treff, ben.id]);
    expect((await q(`select 1 from dienst_verhinderungen where person_id = $1`, [ben.id])).rows).toHaveLength(0);
    await q(`insert into treff_team (treff_id, person_id, rolle) values ($1, $2, 'betreuerin')`, [treff, ben.id]);
  });
});

describe('Mindestbesetzung', () => {
  it('Standard 1; Treffleitung und Treffkoordination ändern sie, das Team nicht', async () => {
    expect((await q<{ n: number }>(`select mindestbesetzung as n from treffs where id = $1`, [treff])).rows[0]!.n).toBe(1);
    await als(db, tl, () => q(`select fn_mindestbesetzung_setzen($1, 2)`, [treff]));
    expect((await q<{ n: number }>(`select mindestbesetzung as n from treffs where id = $1`, [treff])).rows[0]!.n).toBe(2);
    await als(db, tk, () => q(`select fn_mindestbesetzung_setzen($1, 3)`, [treff]));
    expect(await als(db, anna, () => fehler(() => q(`select fn_mindestbesetzung_setzen($1, 1)`, [treff])))).toMatch(/Nur Treffleitung/);
    expect(await als(db, tl, () => fehler(() => q(`select fn_mindestbesetzung_setzen($1, 0)`, [treff])))).toMatch(/zwischen 1 und 20/);
  });
});

describe('Zeitpunkt der Einteilung', () => {
  it('neue Einteilungen bekommen einen Zeitpunkt', async () => {
    const r = (await q<{ at: string | null }>(`select created_at as at from dienst_zuteilungen where dienst_id = $1 and person_id = $2`, [dienst, anna.id])).rows[0]!;
    expect(r.at).not.toBeNull();
  });
});

describe('Kalender', () => {
  it('eigene Dienste als iCalendar, mit Ort und „vorläufig“ für Monate in Planung', async () => {
    await q(`insert into dienste (treff_id, datum, von, bis, ist_sonder, bezeichnung) values ($1, current_date + 41, '10:00', '12:00', true, 'Fest, groß')
             returning id`, [treff]).then(async (r) => q(`insert into dienst_zuteilungen (dienst_id, person_id) values ($1, $2)`, [(r.rows[0] as { id: string }).id, anna.id]));
    const ics = (await als(db, anna, () => q<{ t: string }>(`select fn_meine_dienste_ics() as t`))).rows[0]!.t;
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain(`UID:${dienst}@kijub-kompass`);
    expect(ics).toMatch(/DTSTART;TZID=Europe\/Berlin:\d{8}T150000/);
    expect(ics).toContain('SUMMARY:Dienst · Kindertreff');
    expect(ics).toContain('SUMMARY:Sonderdienst: Fest\\, groß · Kindertreff');
    expect(ics).toContain('LOCATION:Hauptstraße 1\\; Hof');
    expect(ics).toContain('STATUS:TENTATIVE');                 // Monat nicht (mehr) veröffentlicht
    // Ben ist nirgends eingeteilt
    const leer = (await als(db, ben, () => q<{ t: string }>(`select fn_meine_dienste_ics() as t`))).rows[0]!.t;
    expect(leer).not.toContain('BEGIN:VEVENT');
  });

  it('Abo-Link: Schlüssel einmalig, nur der Hash wird gespeichert; Erneuern macht den alten ungültig; Löschen beendet das Abo', async () => {
    const s1 = (await als(db, anna, () => q<{ s: string }>(`select fn_kalender_link_erneuern() as s`))).rows[0]!.s;
    expect(s1).toMatch(/^[0-9a-f]{64}$/);
    expect((await q<{ h: string }>(`select token_hash as h from kalender_abos where person_id = $1`, [anna.id])).rows[0]!.h).not.toBe(s1);
    expect((await als(db, anna, () => q<{ s: string | null }>(`select fn_kalender_link_seit() as s`))).rows[0]!.s).not.toBeNull();
    const ics = (await q<{ t: string | null }>(`select fn_kalender_ics($1) as t`, [s1])).rows[0]!.t;
    expect(ics).toContain('BEGIN:VEVENT');

    const s2 = (await als(db, anna, () => q<{ s: string }>(`select fn_kalender_link_erneuern() as s`))).rows[0]!.s;
    expect((await q<{ t: string | null }>(`select fn_kalender_ics($1) as t`, [s1])).rows[0]!.t).toBeNull();
    expect((await q<{ t: string | null }>(`select fn_kalender_ics($1) as t`, [s2])).rows[0]!.t).toContain('BEGIN:VEVENT');
    expect((await q<{ t: string | null }>(`select fn_kalender_ics($1) as t`, ['kein-schluessel'])).rows[0]!.t).toBeNull();

    await als(db, anna, () => q(`select fn_kalender_link_entfernen()`));
    expect((await q<{ t: string | null }>(`select fn_kalender_ics($1) as t`, [s2])).rows[0]!.t).toBeNull();
  });

  it('die Abo-Tabelle und der Abruf per Schlüssel sind für Angemeldete nicht direkt zugänglich', async () => {
    expect(await als(db, anna, () => fehler(() => q(`select * from kalender_abos`)))).toMatch(/permission denied/i);
    expect(await als(db, anna, () => fehler(() => q(`select fn_kalender_ics('x')`)))).toMatch(/permission denied/i);
    expect(await als(db, 'anon', () => fehler(() => q(`select fn_meine_dienste_ics()`)))).toMatch(/permission denied/i);
  });
});
