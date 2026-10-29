import { describe, it, expect, beforeAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { neueDb, person, als, fehler, type Person } from './harness';

/** Migration 0035: Teamprotokolle der Treffs. */
let db: PGlite;
let tl: Person, tk: Person, fk: Person, betr: Person, betr2: Person, fremd: Person;
let treff: string, anderer: string;

const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params);
const lege = async (wer: Person, titel = 'Teamsitzung März', anwesend: string[] = [], t = treff) =>
  (await als(db, wer, () => q<{ id: string }>(`insert into treff_teamprotokolle (treff_id, art, datum, titel, text, anwesend) values ($1, 'teambesprechung', '2027-03-04', $2, 'Neue Öffnungszeiten ab April.', $3::uuid[]) returning id`,
    [t, titel, `{${anwesend.join(',')}}`]))).rows[0]!.id;

beforeAll(async () => {
  db = await neueDb();
  tl = await person(db, 'Lea', { kategorie: 'Hauptamtliche*r' });
  tk = await person(db, 'TK', { kategorie: 'Hauptamtliche*r' });
  fk = await person(db, 'FK', { kategorie: 'Hauptamtliche*r' });
  betr = await person(db, 'Ben', { kategorie: 'TZK' });
  betr2 = await person(db, 'Bea', { kategorie: 'FSJ' });
  fremd = await person(db, 'Fremd', { kategorie: 'TZK' });
  await q(`update personen set ist_treffkoordination = true where id = $1`, [tk.id]);
  await q(`update personen set ist_freizeitkoordination = true where id = $1`, [fk.id]);
  treff = (await q<{ id: string }>(`insert into treffs (name) values ('Kindertreff') returning id`)).rows[0]!.id;
  anderer = (await q<{ id: string }>(`insert into treffs (name) values ('Anderer') returning id`)).rows[0]!.id;
  await q(`insert into treff_team (treff_id, person_id, rolle) values ($1, $2, 'treffleitung'), ($1, $3, 'betreuerin'), ($1, $4, 'betreuerin'), ($5, $6, 'betreuerin')`,
    [treff, tl.id, betr.id, betr2.id, anderer, fremd.id]);
});

describe('Teamprotokolle: anlegen und lesen', () => {
  it('die Treffleitung legt an; Verfasser und Zeit setzt die Datenbank', async () => {
    const id = await lege(tl, 'Teamsitzung März', [betr.id, tl.id, betr.id]);
    const r = (await q<{ erstellt_von: string; bearbeitet_von: string; anwesend: string[] }>(`select erstellt_von, bearbeitet_von, anwesend from treff_teamprotokolle where id = $1`, [id])).rows[0]!;
    expect(r.erstellt_von).toBe(tl.id);
    expect(r.bearbeitet_von).toBe(tl.id);
    expect(new Set(r.anwesend)).toEqual(new Set([betr.id, tl.id]));                                           // doppelte entfernt
  });

  it('das ganze Team und die Treffkoordination lesen; andere Treffs und die Freizeitenkoordination nicht', async () => {
    for (const wer of [tl, betr, betr2, tk]) expect((await als(db, wer, () => q(`select 1 from treff_teamprotokolle`))).rows.length).toBeGreaterThan(0);
    for (const wer of [fremd, fk]) expect((await als(db, wer, () => q(`select 1 from treff_teamprotokolle`))).rows).toHaveLength(0);
    expect(await als(db, 'anon', () => fehler(() => q(`select 1 from treff_teamprotokolle`)))).toMatch(/permission denied/i);
  });

  it('nur Treffleitung und Treffkoordination schreiben, ändern, löschen', async () => {
    for (const wer of [betr, fremd, fk]) expect(await fehler(() => lege(wer))).toMatch(/row-level security/i);
    const id = await lege(tk, 'Info von der Koordination');
    await als(db, tl, () => q(`update treff_teamprotokolle set text = 'ergänzt' where id = $1`, [id]));
    expect((await q(`select bearbeitet_von from treff_teamprotokolle where id = $1`, [id])).rows[0]).toEqual({ bearbeitet_von: tl.id });
    const r = await als(db, betr, () => q(`update treff_teamprotokolle set text = 'x' where id = $1`, [id]));
    expect(r.affectedRows ?? 0).toBe(0);
    await als(db, tl, () => q(`delete from treff_teamprotokolle where id = $1`, [id]));
  });

  it('anwesend nur aus dem Team; leerer Titel, falsche Art und Verschieben nicht erlaubt', async () => {
    expect(await fehler(() => lege(tl, 'x', [fremd.id]))).toMatch(/nur Personen aus dem Team/);
    expect(await als(db, tl, () => fehler(() => q(`insert into treff_teamprotokolle (treff_id, titel, text) values ($1, ' ', 'x')`, [treff])))).toMatch(/check/i);
    expect(await als(db, tl, () => fehler(() => q(`insert into treff_teamprotokolle (treff_id, art, titel, text) values ($1, 'gerücht', 't', 'x')`, [treff])))).toMatch(/check/i);
    const id = await lege(tl, 'Zum Verschieben');
    expect(await als(db, tk, () => fehler(() => q(`update treff_teamprotokolle set treff_id = $2 where id = $1`, [id, anderer])))).toMatch(/nicht in einen anderen Treff/);
  });
});

describe('Gelesen', () => {
  it('jede Person vermerkt nur sich selbst; die Treffleitung sieht, wer gelesen hat', async () => {
    const id = (await q<{ id: string }>(`select id from treff_teamprotokolle where titel = 'Teamsitzung März'`)).rows[0]!.id;
    await als(db, betr, () => q(`insert into treff_teamprotokoll_gelesen (protokoll_id, person_id) values ($1, $2)`, [id, betr.id]));
    expect(await als(db, betr, () => fehler(() => q(`insert into treff_teamprotokoll_gelesen (protokoll_id, person_id) values ($1, $2)`, [id, betr2.id])))).toMatch(/row-level security/i);
    expect(await als(db, fremd, () => fehler(() => q(`insert into treff_teamprotokoll_gelesen (protokoll_id, person_id) values ($1, $2)`, [id, fremd.id])))).toMatch(/row-level security/i);
    expect((await als(db, tl, () => q<{ person_id: string }>(`select person_id from treff_teamprotokoll_gelesen where protokoll_id = $1`, [id]))).rows).toEqual([{ person_id: betr.id }]);
    expect((await als(db, fremd, () => q(`select 1 from treff_teamprotokoll_gelesen`))).rows).toHaveLength(0);
  });
});

describe('Mitteilung', () => {
  it('neues Protokoll: an das Team ohne die verfassende Person, Link zum Reiter', async () => {
    const id = await lege(tl, 'Wichtige Info');
    const p = (await als(db, tl, () => q<{ p: { empfaenger: string[]; titel: string; text: string; url: string } }>(`select fn_push_vorbereiten('teamprotokoll', $1) as p`, [id]))).rows[0]!.p;
    expect(new Set(p.empfaenger)).toEqual(new Set([betr.id, betr2.id]));
    expect(p).toMatchObject({ titel: 'Neues Teamprotokoll · Kindertreff', text: 'Wichtige Info (04.03.2027) – bitte lesen.', url: `/treffs/${treff}/teamprotokolle` });
    expect(await als(db, betr, () => fehler(() => q(`select fn_push_vorbereiten('teamprotokoll', $1)`, [id])))).toMatch(/nicht zulässig/);
  });
});

/** Migration 0037: Abschnitte, Entwurf, gemeldete Änderungen, neue Teammitglieder. */
type Zeile = { abschnitte: { titel: string; text: string }[]; text: string; gemeldet_von: string | null; gemeldet_am: string | null; entwurf: boolean };
const zeile = async (id: string) => (await q<Zeile>(`select abschnitte, text, gemeldet_von, gemeldet_am, entwurf from treff_teamprotokolle where id = $1`, [id])).rows[0]!;
const gegliedert = async (wer: Person, entwurf: boolean, titel = 'Gegliedert') =>
  (await als(db, wer, () => q<{ id: string }>(
    `insert into treff_teamprotokolle (treff_id, titel, datum, abschnitte, naechstes_datum, naechstes_zeit, aufgaben, entwurf)
     values ($1, $2, '2027-04-01', $3::jsonb, '2027-04-15', '18:30', ' Flyer drucken ', $4) returning id`,
    [treff, titel, JSON.stringify([{ titel: ' Termine ', text: 'Sommerfest am 3.7.' }, { titel: '', text: '' }, { titel: 'Kasse', text: '- Kassenbuch prüfen' }]), entwurf]))).rows[0]!.id;

describe('Gliederung (0037)', () => {
  it('Abschnitte werden bereinigt, der reine Text entsteht aus allem', async () => {
    const z = await zeile(await gegliedert(tl, false));
    expect(z.abschnitte).toEqual([{ titel: 'Termine', text: 'Sommerfest am 3.7.' }, { titel: 'Kasse', text: '- Kassenbuch prüfen' }]);
    expect(z.text).toBe('Termine\nSommerfest am 3.7.\n\nKasse\n- Kassenbuch prüfen\n\nNächstes Treffen: 15.04.2027 um 18:30 Uhr\n\nAufgaben und Ziele:\nFlyer drucken');
  });

  it('wer nur Text schreibt, bekommt einen Abschnitt ohne Überschrift; ohne Inhalt nur als Entwurf', async () => {
    const id = await lege(tl, 'Nur Text');
    expect((await zeile(id)).abschnitte).toEqual([{ titel: '', text: 'Neue Öffnungszeiten ab April.' }]);
    expect(await als(db, tl, () => fehler(() => q(`insert into treff_teamprotokolle (treff_id, titel) values ($1, 'Leer')`, [treff])))).toMatch(/braucht einen Inhalt/);
    await als(db, tl, () => q(`insert into treff_teamprotokolle (treff_id, titel, entwurf) values ($1, 'Leerer Entwurf', true)`, [treff]));
    expect(await als(db, tl, () => fehler(() => q(`insert into treff_teamprotokolle (treff_id, titel, abschnitte) values ($1, 'x', '[{"titel": 5, "text": "a"}]')`, [treff])))).toMatch(/Überschrift/);
  });
});

describe('Entwurf (0037)', () => {
  it('sieht nur die Leitung; erst beim Veröffentlichen gilt er als gemeldet und darf die Mitteilung raus', async () => {
    const id = await gegliedert(tl, true, 'Entwurf Mai');
    expect(await zeile(id)).toMatchObject({ entwurf: true, gemeldet_am: null });
    expect((await als(db, betr, () => q(`select 1 from treff_teamprotokolle where id = $1`, [id]))).rows).toHaveLength(0);
    expect((await als(db, tk, () => q(`select 1 from treff_teamprotokolle where id = $1`, [id]))).rows).toHaveLength(1);
    expect(await als(db, betr, () => fehler(() => q(`insert into treff_teamprotokoll_gelesen (protokoll_id, person_id) values ($1, $2)`, [id, betr.id])))).toMatch(/row-level security/i);
    expect(await als(db, tl, () => fehler(() => q(`select fn_push_vorbereiten('teamprotokoll', $1)`, [id])))).toMatch(/nicht zulässig/);
    await als(db, tk, () => q(`update treff_teamprotokolle set entwurf = false where id = $1`, [id]));
    expect(await zeile(id)).toMatchObject({ entwurf: false, gemeldet_von: tk.id });
    const p = (await als(db, tk, () => q<{ p: { titel: string } }>(`select fn_push_vorbereiten('teamprotokoll', $1) as p`, [id]))).rows[0]!.p;
    expect(p.titel).toBe('Neues Teamprotokoll · Kindertreff');
    expect(await als(db, tl, () => fehler(() => q(`select fn_push_vorbereiten('teamprotokoll', $1)`, [id])))).toMatch(/nicht zulässig/);   // gemeldet hat die Koordination
    expect(await als(db, tl, () => fehler(() => q(`update treff_teamprotokolle set entwurf = true where id = $1`, [id])))).toMatch(/nicht wieder zum Entwurf/);
  });
});

describe('Änderung melden (0037)', () => {
  it('setzt den Gelesen-Stand zurück und erlaubt die Mitteilung „geändert“; gemeldet_am lässt sich nicht direkt setzen', async () => {
    const id = await gegliedert(tl, false, 'Zum Ändern');
    await als(db, betr, () => q(`insert into treff_teamprotokoll_gelesen (protokoll_id, person_id) values ($1, $2)`, [id, betr.id]));
    const vorher = (await zeile(id)).gemeldet_am;
    await als(db, tk, () => q(`update treff_teamprotokolle set gemeldet_am = now() + interval '1 day', gemeldet_von = $2 where id = $1`, [id, tk.id]));
    expect(await zeile(id)).toMatchObject({ gemeldet_am: vorher, gemeldet_von: tl.id });
    expect(await als(db, betr, () => fehler(() => q(`select fn_teamprotokoll_aenderung_melden($1)`, [id])))).toMatch(/Keine Berechtigung/);
    await als(db, tk, () => q(`select fn_teamprotokoll_aenderung_melden($1)`, [id]));
    expect((await zeile(id)).gemeldet_von).toBe(tk.id);
    expect((await q(`select 1 from treff_teamprotokoll_gelesen where protokoll_id = $1`, [id])).rows).toHaveLength(0);
    const p = (await als(db, tk, () => q<{ p: { titel: string; text: string } }>(`select fn_push_vorbereiten('teamprotokoll_geaendert', $1) as p`, [id]))).rows[0]!.p;
    expect(p).toMatchObject({ titel: 'Teamprotokoll geändert · Kindertreff', text: 'Zum Ändern (01.04.2027) – bitte noch einmal lesen.' });
  });

  it('andere Mitteilungen laufen weiter über die bisherige Funktion', async () => {
    expect(await als(db, tl, () => fehler(() => q(`select fn_push_vorbereiten('materialliste', $1)`, [treff])))).toMatch(/nicht zulässig/);
  });
});

describe('Neu im Team (0037)', () => {
  it('bisherige Protokolle gelten als „vor Eintritt“, Entwürfe nicht; nach einer gemeldeten Änderung zählt es wieder', async () => {
    const entwurf = await gegliedert(tl, true, 'Noch Entwurf');
    const neu = await person(db, 'Nina', { kategorie: 'TZK' });
    await q(`insert into treff_team (treff_id, person_id, rolle) values ($1, $2, 'betreuerin')`, [treff, neu.id]);
    const r = (await q<{ protokoll_id: string; vor_eintritt: boolean }>(`select protokoll_id, vor_eintritt from treff_teamprotokoll_gelesen where person_id = $1`, [neu.id])).rows;
    const veroeffentlicht = (await q(`select 1 from treff_teamprotokolle where treff_id = $1 and not entwurf`, [treff])).rows.length;
    expect(r).toHaveLength(veroeffentlicht);
    expect(r.every((x) => x.vor_eintritt)).toBe(true);
    expect(r.some((x) => x.protokoll_id === entwurf)).toBe(false);
    await als(db, tl, () => q(`select fn_teamprotokoll_aenderung_melden($1)`, [r[0]!.protokoll_id]));
    expect((await q(`select 1 from treff_teamprotokoll_gelesen where person_id = $1 and protokoll_id = $2`, [neu.id, r[0]!.protokoll_id])).rows).toHaveLength(0);
  });
});

describe('Migration 0037 wiederholbar', () => {
  it('läuft ein zweites Mal ohne Fehler; Inhalte, Gelesen-Stand und Mitteilungen bleiben', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const id = await gegliedert(tl, false, 'Vor dem zweiten Lauf');
    await als(db, betr, () => q(`insert into treff_teamprotokoll_gelesen (protokoll_id, person_id) values ($1, $2)`, [id, betr.id]));
    const vorher = await zeile(id);
    await db.exec(readFileSync(join(__dirname, '../../supabase/migrations/0037_teamprotokolle_format.sql'), 'utf8'));
    expect(await zeile(id)).toEqual(vorher);
    expect((await q(`select 1 from treff_teamprotokoll_gelesen where protokoll_id = $1 and person_id = $2`, [id, betr.id])).rows).toHaveLength(1);
    expect((await q(`select count(*)::int as n from pg_proc where proname like 'fn_push_vorbereiten%'`)).rows[0]).toEqual({ n: 4 });   // basis, vor_0037, vor_0041 (seit 0041), Hülle
    const p = (await als(db, tl, () => q<{ p: { titel: string } }>(`select fn_push_vorbereiten('teamprotokoll', $1) as p`, [id]))).rows[0]!.p;
    expect(p.titel).toBe('Neues Teamprotokoll · Kindertreff');
  });

  it('überschreibt eine spätere Migration fn_push_vorbereiten, stellt ein erneuter Lauf die Hülle wieder her – deren Zweige bleiben', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    // so wie 0036, wenn es erst nach 0037 eingespielt wird: die Hülle ist weg
    await db.exec(`create or replace function fn_push_vorbereiten(p_art text, p_ref uuid default null, p_extra jsonb default '{}') returns jsonb
      language plpgsql security definer set search_path = public, pg_temp as $x$
      begin
        if p_art = 'spaeter' then return jsonb_build_object('titel', 'aus der späteren Migration'); end if;
        return fn_push_vorbereiten_basis(p_art, p_ref, p_extra);
      end $x$;`);
    const id = await gegliedert(tl, false, 'Nach Überschreiben');
    await db.exec(readFileSync(join(__dirname, '../../supabase/migrations/0037_teamprotokolle_format.sql'), 'utf8'));
    const tp = (await als(db, tl, () => q<{ p: { titel: string } }>(`select fn_push_vorbereiten('teamprotokoll', $1) as p`, [id]))).rows[0]!.p;
    expect(tp.titel).toBe('Neues Teamprotokoll · Kindertreff');
    const sp = (await als(db, tl, () => q<{ p: { titel: string } }>(`select fn_push_vorbereiten('spaeter') as p`))).rows[0]!.p;
    expect(sp.titel).toBe('aus der späteren Migration');
  });
});
