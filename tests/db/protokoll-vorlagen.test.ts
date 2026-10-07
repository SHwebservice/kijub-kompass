import { describe, it, expect, beforeAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { neueDb, person, als, fehler, type Person } from './harness';

/** Migration 0028: Vorlagen für das Tagesprotokoll je Treff und Wochentag. */
let db: PGlite;
let tl: Person, tk: Person, fk: Person, betr: Person, fremd: Person;
let treff: string, anderer: string;

const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params);
const lege = (wer: Person, wochentag: number, text: string, t = treff) =>
  als(db, wer, () => q(`insert into treff_protokoll_vorlagen (treff_id, wochentag, text) values ($1, $2, $3)
                         on conflict (treff_id, wochentag) do update set text = excluded.text`, [t, wochentag, text]));

beforeAll(async () => {
  db = await neueDb();
  tl = await person(db, 'Leitung', { kategorie: 'Hauptamtliche*r' });
  tk = await person(db, 'TK', { kategorie: 'Hauptamtliche*r' });
  fk = await person(db, 'FK', { kategorie: 'Hauptamtliche*r' });
  betr = await person(db, 'Betreuer', { kategorie: 'TZK' });
  fremd = await person(db, 'Fremd', { kategorie: 'TZK' });
  await q(`update personen set ist_treffkoordination = true where id = $1`, [tk.id]);
  await q(`update personen set ist_freizeitkoordination = true where id = $1`, [fk.id]);
  treff = (await q<{ id: string }>(`insert into treffs (name) values ('Kindertreff') returning id`)).rows[0]!.id;
  anderer = (await q<{ id: string }>(`insert into treffs (name) values ('Anderer') returning id`)).rows[0]!.id;
  await q(`insert into treff_team (treff_id, person_id, rolle) values ($1, $2, 'treffleitung'), ($1, $3, 'betreuerin')`, [treff, tl.id, betr.id]);
  await q(`insert into treff_team (treff_id, person_id, rolle) values ($1, $2, 'betreuerin')`, [anderer, fremd.id]);
});

describe('Protokoll-Vorlagen', () => {
  it('Treffleitung legt an und ändert; Bearbeiter und Zeitpunkt werden vermerkt', async () => {
    await lege(tl, 3, 'Programm: Kochen\nStimmung:');
    await lege(tl, 3, 'Programm: Backen\nStimmung:');
    const r = await q<{ text: string; bearbeitet_von: string }>(`select text, bearbeitet_von from treff_protokoll_vorlagen where treff_id = $1 and wochentag = 3`, [treff]);
    expect(r.rows[0]).toEqual({ text: 'Programm: Backen\nStimmung:', bearbeitet_von: tl.id });
  });

  it('die Treffkoordination darf pflegen, BetreuerIn, Freizeitenkoordination und Fremde nicht', async () => {
    await lege(tk, 1, 'Montag: Hausaufgaben');
    for (const wer of [betr, fk, fremd]) expect(await fehler(() => lege(wer, 2, 'x'))).toMatch(/row-level security/i);
  });

  it('lesen: das Team des Treffs und die Treffkoordination; andere sehen nichts', async () => {
    expect((await als(db, betr, () => q(`select wochentag from treff_protokoll_vorlagen order by 1`))).rows).toEqual([{ wochentag: 1 }, { wochentag: 3 }]);
    expect((await als(db, tk, () => q(`select 1 from treff_protokoll_vorlagen`))).rows).toHaveLength(2);
    expect((await als(db, fremd, () => q(`select 1 from treff_protokoll_vorlagen`))).rows).toHaveLength(0);
    expect((await als(db, fk, () => q(`select 1 from treff_protokoll_vorlagen`))).rows).toHaveLength(0);
    expect(await als(db, 'anon', () => fehler(() => q(`select 1 from treff_protokoll_vorlagen`)))).toMatch(/permission denied/i);
  });

  it('leerer Text, falscher Wochentag und Verschieben in einen anderen Treff sind nicht erlaubt', async () => {
    expect(await fehler(() => lege(tl, 4, '   '))).toMatch(/check/i);
    expect(await fehler(() => lege(tl, 8, 'x'))).toMatch(/check/i);
    expect(await als(db, tk, () => fehler(() => q(`update treff_protokoll_vorlagen set treff_id = $2 where treff_id = $1 and wochentag = 1`, [treff, anderer])))).toMatch(/nicht ändern/);
  });

  it('Löschen durch die Treffleitung; mit dem Treff verschwinden die Vorlagen', async () => {
    await als(db, tl, () => q(`delete from treff_protokoll_vorlagen where treff_id = $1 and wochentag = 1`, [treff]));
    expect((await q(`select 1 from treff_protokoll_vorlagen where treff_id = $1`, [treff])).rows).toHaveLength(1);
    await q(`delete from treffs where id = $1`, [treff]);
    expect((await q(`select 1 from treff_protokoll_vorlagen`)).rows).toHaveLength(0);
  });
});
