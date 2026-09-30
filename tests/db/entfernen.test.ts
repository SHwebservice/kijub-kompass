import { describe, it, expect, beforeAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { neueDb, person, als, fehler, type Person } from './harness';

/** Personen entfernen: Schutz der letzten Koordination, Kaskade, Datenübersicht, Rechte. */
let db: PGlite;
const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params);

beforeAll(async () => { db = await neueDb(); });

describe('Schutz der letzten Koordination', () => {
  let k1: Person, k2: Person;
  beforeAll(async () => {
    k1 = await person(db, 'KoordEins', { koordination: true, kategorie: 'Hauptamtliche*r' });
  });

  it('die einzige Koordination lässt sich nicht löschen', async () => {
    const msg = await fehler(() => q('delete from personen where id = $1', [k1.id]));
    expect(msg).toMatch(/letzte aktive Koordination/);
  });
  it('… nicht deaktivieren', async () => {
    const msg = await fehler(() => q('update personen set aktiv = false where id = $1', [k1.id]));
    expect(msg).toMatch(/letzte aktive Koordination/);
  });
  it('… nicht herabstufen', async () => {
    const msg = await fehler(() => q('update personen set ist_koordination = false where id = $1', [k1.id]));
    expect(msg).toMatch(/letzte aktive Koordination/);
  });
  it('mit einer zweiten aktiven Koordination ist Löschen der ersten möglich', async () => {
    k2 = await person(db, 'KoordZwei', { koordination: true, kategorie: 'Hauptamtliche*r' });
    await q('delete from personen where id = $1', [k1.id]);
    const r = await q('select 1 from personen where id = $1', [k1.id]);
    expect(r.rows).toHaveLength(0);
  });
  it('eine deaktivierte zweite Koordination zählt nicht als Ersatz', async () => {
    const k3 = await person(db, 'KoordDrei', { koordination: true, aktiv: false, kategorie: 'Hauptamtliche*r' });
    const msg = await fehler(() => q('delete from personen where id = $1', [k2.id]));
    expect(msg).toMatch(/letzte aktive Koordination/);
    await q('delete from personen where id = $1', [k3.id]);
  });
  it('normale Personen lassen sich frei löschen und deaktivieren', async () => {
    const p = await person(db, 'Normal');
    await q('update personen set aktiv = false where id = $1', [p.id]);
    await q('delete from personen where id = $1', [p.id]);
  });
});

describe('Person endgültig löschen: Kaskade', () => {
  let koord: Person, leitung: Person, teamer: Person, tl: Person;
  let fz: string, treff: string, angebot: string, notiz: string;

  beforeAll(async () => {
    koord = await person(db, 'Chef', { koordination: true, kategorie: 'Hauptamtliche*r' });
    leitung = await person(db, 'Lea', { kategorie: 'Hauptamtliche*r' });
    teamer = await person(db, 'Tom');
    tl = await person(db, 'Tina', { kategorie: 'TZK' });
    fz = (await q<{ id: string }>(
      `insert into freizeiten (name, start_datum, ende_datum) values ('F', current_date+30, current_date+34) returning id`)).rows[0]!.id;
    await q(`insert into freizeit_team values ($1, $2, 'leitung'), ($1, $3, 'teamer')`, [fz, leitung.id, teamer.id]);
    treff = (await q<{ id: string }>(`insert into treffs (name) values ('T') returning id`)).rows[0]!.id;
    await q(`insert into treff_team values ($1, $2, 'betreuerin')`, [treff, tl.id]);
    await q(`insert into treff_oeffnungszeiten values ($1, 1, '15:00', '19:00')`, [treff]);
    angebot = (await q<{ id: string }>(`insert into angebote (name, kategorie) values ('A','kreativ') returning id`)).rows[0]!.id;
    notiz = (await q<{ id: string }>(
      `insert into notizen (freizeit_id, art, text, erstellt_von) values ($1, 'hinweis', 'Hallo', $2) returning id`, [fz, leitung.id])).rows[0]!.id;
    await q(`insert into notiz_bestaetigungen values ($1, $2)`, [notiz, teamer.id]);
    await q(`insert into bewerbungen (person_id, freizeit_id) values ($1, $2)`, [teamer.id, fz]);
    await q(`insert into angebot_bewertungen values ($1, $2, 5)`, [angebot, teamer.id]);
    await q(`insert into angebot_favoriten values ($1, $2)`, [teamer.id, angebot]);
    await q(`insert into abwesenheiten (person_id, datum, typ) values ($1, current_date, 'urlaub')`, [tl.id]);
    const d = (await q<{ id: string }>(`insert into dienste (treff_id, datum, von, bis) values ($1, current_date, '15:00', '19:00') returning id`, [treff])).rows[0]!.id;
    await q(`insert into dienst_zuteilungen values ($1, $2)`, [d, tl.id]);
    await q(`insert into zeitnachweise (treff_id, person_id, monat) values ($1, $2, date_trunc('month', current_date)::date)`, [treff, tl.id]);
    await q(`insert into plan_eintraege (freizeit_id, datum, slot_id, angebot_id, erstellt_von)
             select $1, current_date+31, id, $2, $3 from freizeit_slots where freizeit_id = $1 limit 1`, [fz, angebot, teamer.id]);
  });

  const zaehle = async (tabelle: string, spalte: string, id: string) =>
    (await q<{ n: number }>(`select count(*)::int as n from ${tabelle} where ${spalte} = $1`, [id])).rows[0]!.n;

  it('Datenübersicht zählt, was an der Person hängt', async () => {
    const r = await als(db, koord, () => q<{ u: Record<string, number | boolean> }>('select fn_person_datenuebersicht($1) as u', [tl.id]));
    expect(r.rows[0]!.u).toMatchObject({ treffs: 1, dienste: 1, abwesenheiten: 1, nachweise: 1, freizeiten: 0, hat_zugang: true });
    const l = await als(db, koord, () => q<{ u: Record<string, number> }>('select fn_person_datenuebersicht($1) as u', [leitung.id]));
    expect(l.rows[0]!.u).toMatchObject({ leitung_freizeiten: 1, notizen_verfasst: 1 });
  });

  it('die Übersicht sieht nur die Koordination', async () => {
    const msg = await als(db, leitung, () => fehler(() => q('select fn_person_datenuebersicht($1)', [tl.id])));
    expect(msg).toMatch(/Nur die Koordination/);
    const anon = await als(db, 'anon', () => fehler(() => q('select fn_person_datenuebersicht($1)', [tl.id])));
    expect(anon).toMatch(/permission denied/i);
  });

  it('Löschen per App-Zugriff: nur Koordination, andere bewirken nichts', async () => {
    const r = await als(db, leitung, () => q('delete from personen where id = $1', [teamer.id]));
    expect(r.affectedRows).toBe(0);
    expect(await zaehle('personen', 'id', teamer.id)).toBe(1);
  });

  it('eine Betreuungsperson samt Diensten, Abwesenheiten und Nachweisen wird vollständig entfernt', async () => {
    await als(db, koord, () => q('delete from personen where id = $1', [tl.id]));
    expect(await zaehle('personen', 'id', tl.id)).toBe(0);
    expect(await zaehle('treff_team', 'person_id', tl.id)).toBe(0);
    expect(await zaehle('dienst_zuteilungen', 'person_id', tl.id)).toBe(0);
    expect(await zaehle('abwesenheiten', 'person_id', tl.id)).toBe(0);
    expect(await zaehle('zeitnachweise', 'person_id', tl.id)).toBe(0);
    // Dienst und Treff selbst bleiben bestehen
    expect(await zaehle('dienste', 'treff_id', treff)).toBe(1);
    expect(await zaehle('treffs', 'id', treff)).toBe(1);
  });

  it('eine TeamerIn: Zuordnung, Bewerbung, Bewertung, Favoriten, Bestätigung weg – Plan-Eintrag bleibt ohne Namen', async () => {
    await als(db, koord, () => q('delete from personen where id = $1', [teamer.id]));
    for (const [t, s] of [['freizeit_team', 'person_id'], ['bewerbungen', 'person_id'], ['angebot_bewertungen', 'person_id'],
      ['angebot_favoriten', 'person_id'], ['notiz_bestaetigungen', 'person_id']] as const) {
      expect(await zaehle(t, s, teamer.id)).toBe(0);
    }
    const plan = await q<{ erstellt_von: string | null }>('select erstellt_von from plan_eintraege where freizeit_id = $1', [fz]);
    expect(plan.rows).toHaveLength(1);
    expect(plan.rows[0]!.erstellt_von).toBeNull();
  });

  it('eine Leitung: verfasste Hinweise bleiben ohne Namen, die Freizeit bleibt bestehen', async () => {
    await als(db, koord, () => q('delete from personen where id = $1', [leitung.id]));
    const n = await q<{ erstellt_von: string | null; text: string }>('select erstellt_von, text from notizen where id = $1', [notiz]);
    expect(n.rows[0]).toEqual({ erstellt_von: null, text: 'Hallo' });
    expect(await zaehle('freizeiten', 'id', fz)).toBe(1);
    expect(await zaehle('freizeit_team', 'freizeit_id', fz)).toBe(0);
  });

  it('das Login-Konto wird separat entfernt: auth_user_id fällt auf NULL, die Person bleibt', async () => {
    const p = await person(db, 'Konto');
    const vorher = await q<{ auth_user_id: string | null }>('select auth_user_id from personen where id = $1', [p.id]);
    expect(vorher.rows[0]!.auth_user_id).toBe(p.uid);
    await q('delete from auth.users where id = $1', [p.uid]);
    const nachher = await q<{ auth_user_id: string | null }>('select auth_user_id from personen where id = $1', [p.id]);
    expect(nachher.rows).toHaveLength(1);
    expect(nachher.rows[0]!.auth_user_id).toBeNull();
  });

  it('Person ohne Zugang hat nach dem Entfernen des Kontos sofort keinen Datenzugriff mehr', async () => {
    const p = await person(db, 'Gesperrt');
    await q('delete from auth.users where id = $1', [p.uid]);
    const r = await als(db, p, () => q('select * from orte'));
    expect(r.rows).toHaveLength(0);
  });
});
