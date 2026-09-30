import { describe, it, expect, beforeAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { neueDb, person, als, fehler, type Person } from './harness';

/** Datenbankseite des Wochenplans: genau die Abfragen und Änderungen, die die Oberfläche ausführt. */
let db: PGlite;
let koord: Person, leitung: Person, teamer: Person, teamer2: Person, fremder: Person;
let fz: string, vm: string, angebot: string;
const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params);

beforeAll(async () => {
  db = await neueDb();
  koord = await person(db, 'Koord', { koordination: true, kategorie: 'Hauptamtliche*r' });
  leitung = await person(db, 'Leitung', { kategorie: 'Hauptamtliche*r' });
  teamer = await person(db, 'Tom');
  teamer2 = await person(db, 'Tina');
  fremder = await person(db, 'Fremder');
  fz = (await q<{ id: string }>(`insert into freizeiten (name, start_datum, ende_datum) values ('F', current_date + 30, current_date + 32) returning id`)).rows[0]!.id;
  await q(`insert into freizeit_team values ($1, $2, 'leitung'), ($1, $3, 'teamer'), ($1, $4, 'teamer')`, [fz, leitung.id, teamer.id, teamer2.id]);
  vm = (await q<{ id: string }>(`select id from freizeit_slots where freizeit_id = $1 and name = 'Vormittag'`, [fz])).rows[0]!.id;
  angebot = (await q<{ id: string }>(`insert into angebote (name, kategorie) values ('Fangen', 'bewegung') returning id`)).rows[0]!.id;
});

describe('Zeitabschnitte (Slots)', () => {
  it('die Leitung fügt den Abend hinzu, ein zweites Mal nicht', async () => {
    await als(db, leitung, () => q(`insert into freizeit_slots (freizeit_id, name, position) values ($1, 'Abend', 3)`, [fz]));
    const msg = await als(db, leitung, () => fehler(() => q(`insert into freizeit_slots (freizeit_id, name, position) values ($1, 'Abend', 4)`, [fz])));
    expect(msg).toMatch(/duplicate|unique/i);
  });
  it('TeamerInnen und Außenstehende dürfen keine Zeitabschnitte anlegen oder ändern', async () => {
    const msg = await als(db, teamer, () => fehler(() => q(`insert into freizeit_slots (freizeit_id, name, position) values ($1, 'Nacht', 5)`, [fz])));
    expect(msg).toMatch(/row-level security/i);
    const r = await als(db, teamer, () => q(`update freizeit_slots set position = 9 where freizeit_id = $1`, [fz]));
    expect(r.affectedRows).toBe(0);
    const f = await als(db, fremder, () => q('select * from freizeit_slots'));
    expect(f.rows).toHaveLength(0);
  });
  it('die Leitung tauscht die Reihenfolge (zwei Änderungen nacheinander)', async () => {
    const s = await q<{ id: string; name: string }>(`select id, name from freizeit_slots where freizeit_id = $1 order by position`, [fz]);
    expect(s.rows.map((x) => x.name)).toEqual(['Vormittag', 'Nachmittag', 'Abend']);
    await als(db, leitung, async () => {
      await q(`update freizeit_slots set position = 2 where id = $1`, [s.rows[0]!.id]);
      await q(`update freizeit_slots set position = 1 where id = $1`, [s.rows[1]!.id]);
    });
    const danach = await q<{ name: string }>(`select name from freizeit_slots where freizeit_id = $1 order by position`, [fz]);
    expect(danach.rows.map((x) => x.name)).toEqual(['Nachmittag', 'Vormittag', 'Abend']);
  });
});

describe('Einträge', () => {
  it('TeamerIn trägt einen Katalog-Punkt ein; Verfasser ist automatisch sie selbst', async () => {
    await als(db, teamer, () => q(`insert into plan_eintraege (freizeit_id, datum, slot_id, angebot_id) values ($1, current_date + 30, $2, $3)`, [fz, vm, angebot]));
    const r = await als(db, teamer, () => q<{ erstellt_von: string; name: string }>(
      `select e.erstellt_von, a.name from plan_eintraege e join angebote a on a.id = e.angebot_id`));
    expect(r.rows).toEqual([{ erstellt_von: teamer.id, name: 'Fangen' }]);
  });

  it('mehrere Einträge in derselben Zelle sind möglich', async () => {
    await als(db, teamer2, () => q(`insert into plan_eintraege (freizeit_id, datum, slot_id, angebot_id) values ($1, current_date + 30, $2, $3)`, [fz, vm, angebot]));
    const n = await q<{ n: number }>(`select count(*)::int as n from plan_eintraege where slot_id = $1 and datum = current_date + 30`, [vm]);
    expect(n.rows[0]!.n).toBe(2);
  });

  it('Die eigene Notiz ändern: ja. Fremde Einträge ändern oder löschen: nein', async () => {
    const eigener = (await q<{ id: string }>('select id from plan_eintraege where erstellt_von = $1', [teamer.id])).rows[0]!.id;
    const ok = await als(db, teamer, () => q(`update plan_eintraege set notiz = 'Bälle' where id = $1`, [eigener]));
    expect(ok.affectedRows).toBe(1);
    const fremd = await als(db, teamer2, () => q(`update plan_eintraege set notiz = 'gehackt' where id = $1`, [eigener]));
    expect(fremd.affectedRows).toBe(0);
    const weg = await als(db, teamer2, () => q('delete from plan_eintraege where id = $1', [eigener]));
    expect(weg.affectedRows).toBe(0);
    const n = await als(db, leitung, () => q('update plan_eintraege set notiz = $2 where id = $1', [eigener, 'Leitung darf']));
    expect(n.affectedRows).toBe(1);
  });

  it('TeamerInnen dürfen einen eigenen Eintrag nicht auf Freitext umstellen', async () => {
    const eigener = (await q<{ id: string }>('select id from plan_eintraege where erstellt_von = $1', [teamer.id])).rows[0]!.id;
    const msg = await als(db, teamer, () => fehler(() => q(`update plan_eintraege set angebot_id = null, freitext = 'Frei' where id = $1`, [eigener])));
    expect(msg).toMatch(/row-level security/i);
  });

  it('die Leitung stellt einen Eintrag auf Freitext um, der Verfasser bleibt', async () => {
    const eigener = (await q<{ id: string }>('select id from plan_eintraege where erstellt_von = $1', [teamer.id])).rows[0]!.id;
    await als(db, leitung, () => q(`update plan_eintraege set angebot_id = null, freitext = 'Ausflug' where id = $1`, [eigener]));
    const r = await q<{ erstellt_von: string; freitext: string }>('select erstellt_von, freitext from plan_eintraege where id = $1', [eigener]);
    expect(r.rows[0]).toEqual({ erstellt_von: teamer.id, freitext: 'Ausflug' });
  });

  it('ein Eintrag braucht Katalog-Punkt oder Text', async () => {
    const msg = await als(db, leitung, () => fehler(() => q(`insert into plan_eintraege (freizeit_id, datum, slot_id) values ($1, current_date + 30, $2)`, [fz, vm])));
    expect(msg).toMatch(/check/i);
  });

  it('Koordination trägt ein; Außenstehende lesen nichts', async () => {
    await als(db, koord, () => q(`insert into plan_eintraege (freizeit_id, datum, slot_id, freitext) values ($1, current_date + 31, $2, 'Fest')`, [fz, vm]));
    const r = await als(db, fremder, () => q('select * from plan_eintraege'));
    expect(r.rows).toHaveLength(0);
    const k = await q<{ erstellt_von: string }>(`select erstellt_von from plan_eintraege where freitext = 'Fest'`);
    expect(k.rows[0]!.erstellt_von).toBe(koord.id);
  });

  it('die Namen der Verfasser sieht das Team, Außenstehende nicht', async () => {
    const team = await als(db, teamer2, () => q<{ id: string }>('select id from v_personen_namen where id = $1', [teamer.id]));
    expect(team.rows).toHaveLength(1);
    const aussen = await als(db, fremder, () => q('select id from v_personen_namen where id = $1', [teamer.id]));
    expect(aussen.rows).toHaveLength(0);
  });

  it('gelöschte Verfasser: Eintrag bleibt, ohne Namen', async () => {
    const p = await person(db, 'Weg');
    await q(`insert into freizeit_team values ($1, $2, 'teamer')`, [fz, p.id]);
    await als(db, p, () => q(`insert into plan_eintraege (freizeit_id, datum, slot_id, angebot_id) values ($1, current_date + 32, $2, $3)`, [fz, vm, angebot]));
    await q('delete from personen where id = $1', [p.id]);
    const r = await als(db, leitung, () => q<{ erstellt_von: string | null }>(`select erstellt_von from plan_eintraege where datum = current_date + 32`));
    expect(r.rows).toEqual([{ erstellt_von: null }]);
  });
});
