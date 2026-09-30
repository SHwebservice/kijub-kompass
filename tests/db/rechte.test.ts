import { describe, it, expect, beforeAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { neueDb, person, als, fehler, type Person } from './harness';

/**
 * Rechte-Tests gegen docs/RECHTE.md. Jede Rolle wird positiv (darf) und negativ (darf nicht) geprüft.
 * Fixture: eine Freizeit mit Leitung + TeamerIn, ein Treff mit Treffleitung + BetreuerIn, Außenstehende.
 */
let db: PGlite;
let koord: Person, leitung: Person, teamer: Person, fremder: Person, bewerber: Person;
let tl: Person, betr: Person, betr2: Person, inaktiv: Person;
let fz2: string;
let ort: string, fz: string, fzBald: string, treff: string, slot: string, angebot: string;

const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params);

beforeAll(async () => {
  db = await neueDb();
  koord = await person(db, 'Koord', { koordination: true, kategorie: 'Hauptamtliche*r' });
  leitung = await person(db, 'Leitung', { kategorie: 'Hauptamtliche*r' });
  teamer = await person(db, 'Teamer');
  fremder = await person(db, 'Fremder', { kategorie: 'Hauptamtliche*r' }); // keine Zuordnung, nicht bewerbend
  bewerber = await person(db, 'Bewerber');
  tl = await person(db, 'Treffleitung', { kategorie: 'Hauptamtliche*r' });
  betr = await person(db, 'Betreuer', { kategorie: 'TZK' });
  betr2 = await person(db, 'Betreuer2', { kategorie: 'FSJ' });
  inaktiv = await person(db, 'Inaktiv', { aktiv: false });

  ort = (await q<{ id: string }>(`insert into orte (name, adresse) values ('Mörscher Au','Str. 1') returning id`)).rows[0]!.id;
  fz = (await q<{ id: string }>(
    `insert into freizeiten (name, ort_id, start_datum, ende_datum)
     values ('Sommer 1', $1, current_date + 30, current_date + 34) returning id`, [ort])).rows[0]!.id;
  fzBald = (await q<{ id: string }>(
    `insert into freizeiten (name, start_datum, ende_datum)
     values ('Bald', current_date + 3, current_date + 7) returning id`)).rows[0]!.id;
  fz2 = (await q<{ id: string }>(
    `insert into freizeiten (name, start_datum, ende_datum)
     values ('Sommer 2', current_date + 40, current_date + 44) returning id`)).rows[0]!.id;
  slot = (await q<{ id: string }>(`select id from freizeit_slots where freizeit_id = $1 and name = 'Vormittag'`, [fz])).rows[0]!.id;
  await q(`insert into freizeit_team values ($1, $2, 'leitung'), ($1, $3, 'teamer')`, [fz, leitung.id, teamer.id]);
  angebot = (await q<{ id: string }>(
    `insert into angebote (name, kategorie) values ('Fangen', 'bewegung') returning id`)).rows[0]!.id;

  const t = await q<{ id: string }>(`insert into treffs (name) values ('Kindertreff') returning id`);
  treff = t.rows[0]!.id;
  await q(`insert into treff_team values ($1, $2, 'treffleitung'), ($1, $3, 'betreuerin'), ($1, $4, 'betreuerin')`,
    [treff, tl.id, betr.id, betr2.id]);
  await q(`insert into treff_oeffnungszeiten values ($1, 1, '15:00', '19:00'), ($1, 3, '14:00', '18:00')`, [treff]);
});

describe('Grundsatz: kein anonymer Zugriff, Inaktive sperren', () => {
  it('anonym darf nichts lesen', async () => {
    const msg = await als(db, 'anon', () => fehler(() => q('select * from personen')));
    expect(msg).toMatch(/permission denied/i);
    const msg2 = await als(db, 'anon', () => fehler(() => q('select * from angebote')));
    expect(msg2).toMatch(/permission denied/i);
  });
  it('anonym darf keine Funktion ausführen', async () => {
    const msg = await als(db, 'anon', () => fehler(() => q('select ist_koord()')));
    expect(msg).toMatch(/permission denied/i);
  });
  it('deaktivierte Person sieht nichts', async () => {
    const r = await als(db, inaktiv, () => q('select * from orte'));
    expect(r.rows).toHaveLength(0);
  });
  it('angemeldetes Konto ohne Person sieht nichts', async () => {
    const u = (await q<{ id: string }>(`insert into auth.users (email) values ('niemand@test.example') returning id`)).rows[0]!.id;
    const r = await als(db, { id: '', uid: u, mail: '' }, () => q('select * from orte'));
    expect(r.rows).toHaveLength(0);
  });
});

describe('Konto-Verknüpfung', () => {
  it('verknüpft ein später angelegtes Konto über die Mail (Groß-/Kleinschreibung egal)', async () => {
    const p = await person(db, 'Spaeter', { ohneKonto: true });
    await q(`insert into auth.users (email) values ('SPAETER@Test.Example')`);
    const r = await q<{ auth_user_id: string | null }>('select auth_user_id from personen where id = $1', [p.id]);
    expect(r.rows[0]!.auth_user_id).not.toBeNull();
  });
});

describe('Personen', () => {
  it('TeamerIn sieht nur die eigene Zeile', async () => {
    const r = await als(db, teamer, () => q('select id from personen'));
    expect(r.rows).toEqual([{ id: teamer.id }]);
  });
  it('Koordination sieht alle', async () => {
    const r = await als(db, koord, () => q('select id from personen'));
    expect(r.rows.length).toBeGreaterThanOrEqual(9);
  });
  it('eigene Kontaktdaten dürfen selbst geändert werden', async () => {
    await als(db, teamer, () => q(`update personen set telefon = '0170', notizen = 'Nussallergie' where id = $1`, [teamer.id]));
    const r = await q<{ telefon: string }>('select telefon from personen where id = $1', [teamer.id]);
    expect(r.rows[0]!.telefon).toBe('0170');
  });
  it('Kategorie, Koordinations-Flag und aktiv sind selbst nicht änderbar', async () => {
    for (const set of [`kategorie = 'Hauptamtliche*r'`, `ist_koordination = true`, `aktiv = false`, `mail = 'x@y.de'`]) {
      const msg = await als(db, teamer, () => fehler(() => q(`update personen set ${set} where id = $1`, [teamer.id])));
      expect(msg).toMatch(/selbst geändert/);
    }
  });
  it('fremde Personen sind nicht änderbar', async () => {
    const r = await als(db, teamer, () => q(`update personen set telefon = 'x' where id = $1`, [fremder.id]));
    expect(r.affectedRows).toBe(0);
  });
  it('nur Koordination legt Personen an und löscht sie', async () => {
    const msg = await als(db, leitung, () => fehler(() =>
      q(`insert into personen (vorname, nachname, mail) values ('A','B','ab@test.example')`)));
    expect(msg).toMatch(/row-level security/i);
    await als(db, koord, () => q(`insert into personen (vorname, nachname, mail) values ('A','B','ab@test.example')`));
    const del = await als(db, leitung, () => q(`delete from personen where mail = 'ab@test.example'`));
    expect(del.affectedRows).toBe(0);
  });
  it('Mail ist ohne Beachtung der Schreibweise eindeutig', async () => {
    const msg = await fehler(() => q(`insert into personen (vorname, nachname, mail) values ('D','D','TEAMER@test.example')`));
    expect(msg).toMatch(/duplicate|unique/i);
  });
});

describe('Team-Listen: Namen für das Team, Kontaktdaten nur für Leitung', () => {
  it('TeamerIn sieht Namen und Rollen, aber keine Kontaktdaten', async () => {
    const r = await als(db, teamer, () =>
      q<{ vorname: string; mail: string | null; telefon: string | null }>(
        'select vorname, mail, telefon from v_team_freizeit where freizeit_id = $1', [fz]));
    expect(r.rows.map((x) => x.vorname).sort()).toEqual(['Leitung', 'Teamer']);
    expect(r.rows.every((x) => x.mail === null && x.telefon === null)).toBe(true);
  });
  it('Leitung sieht Mail und Telefon', async () => {
    const r = await als(db, leitung, () =>
      q<{ mail: string | null }>('select mail from v_team_freizeit where freizeit_id = $1', [fz]));
    expect(r.rows.every((x) => x.mail !== null)).toBe(true);
  });
  it('Außenstehende sehen keine Team-Zeilen', async () => {
    const r = await als(db, fremder, () => q('select * from v_team_freizeit'));
    expect(r.rows).toHaveLength(0);
  });
  it('Namensliste enthält nur Personen des eigenen Teams', async () => {
    const r = await als(db, teamer, () => q<{ vorname: string }>('select vorname from v_personen_namen'));
    expect(r.rows.map((x) => x.vorname).sort()).toEqual(['Leitung', 'Teamer']);
  });
  it('Treff: BetreuerIn ohne Kontaktdaten, Treffleitung mit', async () => {
    const b = await als(db, betr, () => q<{ mail: string | null }>('select mail from v_team_treff'));
    expect(b.rows).toHaveLength(3);
    expect(b.rows.every((x) => x.mail === null)).toBe(true);
    const t = await als(db, tl, () => q<{ mail: string | null }>('select mail from v_team_treff'));
    expect(t.rows.every((x) => x.mail !== null)).toBe(true);
  });
});

describe('Treff-Zuordnung', () => {
  it('nur zulässige Kategorien dürfen einem Treff zugeordnet werden', async () => {
    const msg = await fehler(() => q(`insert into treff_team values ($1, $2, 'betreuerin')`, [treff, teamer.id]));
    expect(msg).toMatch(/darf keinem Treff zugeordnet werden/);
  });
});

describe('Freizeiten', () => {
  it('Team und Bewerbende sehen Freizeiten, nicht zugeordnete Hauptamtliche nicht', async () => {
    const t = await als(db, teamer, () => q('select id from freizeiten'));
    expect(t.rows).toHaveLength(3); // TeamerIn-Kategorie darf alle zur Bewerbung sehen
    const f = await als(db, fremder, () => q('select id from freizeiten'));
    expect(f.rows).toHaveLength(0);
    const l = await als(db, leitung, () => q('select id from freizeiten'));
    expect(l.rows).toEqual([{ id: fz }]);
  });
  it('nur Koordination ändert Stammdaten', async () => {
    const r = await als(db, leitung, () => q(`update freizeiten set name = 'X' where id = $1`, [fz]));
    expect(r.affectedRows).toBe(0);
    const k = await als(db, koord, () => q(`update freizeiten set name = 'Sommer 1' where id = $1`, [fz]));
    expect(k.affectedRows).toBe(1);
  });
  it('neue Freizeit bekommt Vormittag und Nachmittag', async () => {
    const r = await q<{ name: string }>('select name from freizeit_slots where freizeit_id = $1 order by position', [fz]);
    expect(r.rows.map((x) => x.name)).toEqual(['Vormittag', 'Nachmittag']);
  });
  it('Ferienwoche wird je Ferienzeitraum begrenzt', async () => {
    const msg = await fehler(() => q(
      `insert into freizeiten (name, ferienzeitraum, ferienwoche, start_datum, ende_datum)
       values ('Zu viel','ostern',3,current_date,current_date)`));
    expect(msg).toMatch(/check/i);
  });
});

describe('Bewerbungen', () => {
  it('Bewerbende dürfen sich für weit genug entfernte Freizeiten bewerben', async () => {
    await als(db, bewerber, () => q(
      `insert into bewerbungen (person_id, freizeit_id, notiz) values ($1, $2, 'gern')`, [bewerber.id, fz]));
    const r = await q('select * from bewerbungen where person_id = $1', [bewerber.id]);
    expect(r.rows).toHaveLength(1);
  });
  it('nicht für Freizeiten innerhalb der Vorlauffrist (7 Tage)', async () => {
    const msg = await als(db, bewerber, () => fehler(() => q(
      `insert into bewerbungen (person_id, freizeit_id) values ($1, $2)`, [bewerber.id, fzBald])));
    expect(msg).toMatch(/row-level security/i);
  });
  it('nicht im Namen einer anderen Person', async () => {
    const msg = await als(db, bewerber, () => fehler(() => q(
      `insert into bewerbungen (person_id, freizeit_id) values ($1, $2)`, [fremder.id, fz])));
    expect(msg).toMatch(/row-level security/i);
  });
  it('nicht, wenn man schon im Team ist', async () => {
    const msg = await als(db, teamer, () => fehler(() => q(
      `insert into bewerbungen (person_id, freizeit_id) values ($1, $2)`, [teamer.id, fz])));
    expect(msg).toMatch(/row-level security/i);
  });
  it('Hauptamtliche bewerben sich nicht', async () => {
    const msg = await als(db, fremder, () => fehler(() => q(
      `insert into bewerbungen (person_id, freizeit_id) values ($1, $2)`, [fremder.id, fz])));
    expect(msg).toMatch(/row-level security/i);
  });
  it('fremde Bewerbungen sind unsichtbar, die Koordination sieht alle', async () => {
    const t = await als(db, teamer, () => q('select * from bewerbungen'));
    expect(t.rows).toHaveLength(0);
    const k = await als(db, koord, () => q('select * from bewerbungen'));
    expect(k.rows).toHaveLength(1);
  });
  it('Annehmen ordnet als TeamerIn zu; nur die Koordination darf das', async () => {
    const id = (await q<{ id: string }>('select id from bewerbungen where person_id = $1', [bewerber.id])).rows[0]!.id;
    const msg = await als(db, teamer, () => fehler(() => q('select fn_bewerbung_annehmen($1)', [id])));
    expect(msg).toMatch(/Koordination/);
    await als(db, koord, () => q('select fn_bewerbung_annehmen($1)', [id]));
    const team = await q<{ rolle: string }>('select rolle from freizeit_team where freizeit_id = $1 and person_id = $2', [fz, bewerber.id]);
    expect(team.rows[0]!.rolle).toBe('teamer');
    const again = await als(db, koord, () => fehler(() => q('select fn_bewerbung_annehmen($1)', [id])));
    expect(again).toMatch(/bereits entschieden/);
    await q('delete from freizeit_team where person_id = $1', [bewerber.id]);
  });
  it('Zurückziehen nur solange offen', async () => {
    await als(db, bewerber, () => q(`insert into bewerbungen (person_id, freizeit_id) values ($1, $2)`, [bewerber.id, fz2]));
    await q(`update bewerbungen set status = 'abgelehnt' where person_id = $1 and freizeit_id = $2`, [bewerber.id, fz2]);
    const nein = await als(db, bewerber, () => q(`delete from bewerbungen where person_id = $1 and freizeit_id = $2`, [bewerber.id, fz2]));
    expect(nein.affectedRows).toBe(0);
    await q('delete from bewerbungen where person_id = $1', [bewerber.id]);
    await als(db, bewerber, () => q(`insert into bewerbungen (person_id, freizeit_id) values ($1, $2)`, [bewerber.id, fz]));
    const r = await als(db, bewerber, () => q(`delete from bewerbungen where person_id = $1 and freizeit_id = $2`, [bewerber.id, fz]));
    expect(r.affectedRows).toBe(1);
  });
});

describe('Wochenplan', () => {
  const datum = () => `current_date + 31`;
  it('TeamerIn trägt einen Katalog-Punkt ein', async () => {
    await als(db, teamer, () => q(
      `insert into plan_eintraege (freizeit_id, datum, slot_id, angebot_id) values ($1, ${datum()}, $2, $3)`, [fz, slot, angebot]));
    const r = await als(db, teamer, () => q('select erstellt_von from plan_eintraege'));
    expect(r.rows).toEqual([{ erstellt_von: teamer.id }]);
  });
  it('Freitext nur für Leitung/Koordination', async () => {
    const msg = await als(db, teamer, () => fehler(() => q(
      `insert into plan_eintraege (freizeit_id, datum, slot_id, freitext) values ($1, ${datum()}, $2, 'Eis essen')`, [fz, slot])));
    expect(msg).toMatch(/row-level security/i);
    await als(db, leitung, () => q(
      `insert into plan_eintraege (freizeit_id, datum, slot_id, freitext) values ($1, ${datum()}, $2, 'Eis essen')`, [fz, slot]));
  });
  it('TeamerIn ändert nur eigene Einträge, Leitung alle', async () => {
    const fremd = (await q<{ id: string }>(`select id from plan_eintraege where freitext = 'Eis essen'`)).rows[0]!.id;
    const t = await als(db, teamer, () => q(`update plan_eintraege set notiz = 'x' where id = $1`, [fremd]));
    expect(t.affectedRows).toBe(0);
    const l = await als(db, leitung, () => q(`update plan_eintraege set notiz = 'ok' where id = $1`, [fremd]));
    expect(l.affectedRows).toBe(1);
  });
  it('Außenstehende lesen und schreiben nichts', async () => {
    const r = await als(db, fremder, () => q('select * from plan_eintraege'));
    expect(r.rows).toHaveLength(0);
    const msg = await als(db, fremder, () => fehler(() => q(
      `insert into plan_eintraege (freizeit_id, datum, slot_id, angebot_id) values ($1, ${datum()}, $2, $3)`, [fz, slot, angebot])));
    expect(msg).toMatch(/row-level security/i);
  });
  it('Datum außerhalb der Freizeit und fremder Slot werden abgelehnt', async () => {
    const msg = await als(db, leitung, () => fehler(() => q(
      `insert into plan_eintraege (freizeit_id, datum, slot_id, angebot_id) values ($1, current_date + 90, $2, $3)`, [fz, slot, angebot])));
    expect(msg).toMatch(/außerhalb der Freizeit/);
    const fremdSlot = (await q<{ id: string }>('select id from freizeit_slots where freizeit_id = $1 limit 1', [fzBald])).rows[0]!.id;
    const msg2 = await als(db, leitung, () => fehler(() => q(
      `insert into plan_eintraege (freizeit_id, datum, slot_id, angebot_id) values ($1, ${datum()}, $2, $3)`, [fz, fremdSlot, angebot])));
    expect(msg2).toMatch(/Slot gehört nicht/);
  });
  it('Slot-Reihenfolge ändert die Leitung, nicht TeamerIn', async () => {
    const t = await als(db, teamer, () => q(`update freizeit_slots set position = 9 where id = $1`, [slot]));
    expect(t.affectedRows).toBe(0);
    const l = await als(db, leitung, () => q(`update freizeit_slots set position = 1 where id = $1`, [slot]));
    expect(l.affectedRows).toBe(1);
  });
});

describe('Hinweise und Absprachen (Freizeit)', () => {
  let hinweis: string, absprache: string;
  beforeAll(async () => {
    hinweis = (await als(db, leitung, () => q<{ id: string }>(
      `insert into notizen (freizeit_id, art, text) values ($1, 'hinweis', 'Sonnencreme!') returning id`, [fz]))).rows[0]!.id;
    absprache = (await als(db, leitung, () => q<{ id: string }>(
      `insert into notizen (freizeit_id, art, text) values ($1, 'absprache', 'Budget?') returning id`, [fz]))).rows[0]!.id;
  });
  it('TeamerIn liest Hinweise, aber keine Absprachen', async () => {
    const r = await als(db, teamer, () => q<{ id: string }>('select id from notizen'));
    expect(r.rows.map((x) => x.id)).toEqual([hinweis]);
  });
  it('TeamerIn kann nichts anlegen', async () => {
    const msg = await als(db, teamer, () => fehler(() => q(
      `insert into notizen (freizeit_id, art, text) values ($1, 'hinweis', 'Hallo')`, [fz])));
    expect(msg).toMatch(/row-level security/i);
  });
  it('nur TeamerInnen bestätigen Hinweise (nicht die Leitung)', async () => {
    await als(db, teamer, () => q(`insert into notiz_bestaetigungen (notiz_id, person_id) values ($1, $2)`, [hinweis, teamer.id]));
    const msg = await als(db, leitung, () => fehler(() => q(
      `insert into notiz_bestaetigungen (notiz_id, person_id) values ($1, $2)`, [hinweis, leitung.id])));
    expect(msg).toMatch(/row-level security/i);
  });
  it('niemand bestätigt im Namen anderer', async () => {
    const msg = await als(db, teamer, () => fehler(() => q(
      `insert into notiz_bestaetigungen (notiz_id, person_id) values ($1, $2)`, [hinweis, leitung.id])));
    expect(msg).toMatch(/row-level security/i);
  });
  it('Leitung und Koordination bestätigen und kommentieren Absprachen, TeamerIn nicht', async () => {
    await als(db, leitung, () => q(`insert into notiz_bestaetigungen values ($1, $2)`, [absprache, leitung.id]));
    await als(db, koord, () => q(`insert into notiz_kommentare (notiz_id, person_id, text) values ($1, $2, 'ok')`, [absprache, koord.id]));
    const msg = await als(db, teamer, () => fehler(() => q(
      `insert into notiz_kommentare (notiz_id, person_id, text) values ($1, $2, 'mitreden')`, [absprache, teamer.id])));
    expect(msg).toMatch(/row-level security/i);
  });
  it('Außenstehende sehen keine Notizen', async () => {
    const r = await als(db, fremder, () => q('select * from notizen'));
    expect(r.rows).toHaveLength(0);
  });
});

describe('Lebensmittel', () => {
  it('nur Leitung am Ort und Koordination dürfen lesen und schreiben', async () => {
    await als(db, leitung, () => q(
      `insert into lebensmittel_eingang (ort_id, freizeit_id, name, menge, einheit) values ($1, $2, 'Milch', 100, 'l')`, [ort, fz]));
    const msg = await als(db, teamer, () => fehler(() => q(
      `insert into lebensmittel_eingang (ort_id, name, menge) values ($1, 'Kakao', 5)`, [ort])));
    expect(msg).toMatch(/row-level security/i);
    const r = await als(db, teamer, () => q('select * from lebensmittel_eingang'));
    expect(r.rows).toHaveLength(0);
  });
  it('Bestand: ok → knapp → leer', async () => {
    const status = async () => (await als(db, leitung, () =>
      q<{ status: string; rest: string }>(`select status, rest from v_lebensmittel_bestand where name = 'Milch'`))).rows[0]!;
    expect((await status()).status).toBe('ok');
    await als(db, leitung, () => q(`insert into lebensmittel_verbrauch (ort_id, name, menge, datum) values ($1,'Milch',80,current_date)`, [ort]));
    expect((await status()).status).toBe('knapp');
    await als(db, leitung, () => q(`insert into lebensmittel_verbrauch (ort_id, name, menge, datum) values ($1,'Milch',20,current_date)`, [ort]));
    expect((await status()).status).toBe('leer');
  });
  it('Bestand ist für TeamerInnen leer', async () => {
    const r = await als(db, teamer, () => q('select * from v_lebensmittel_bestand'));
    expect(r.rows).toHaveLength(0);
  });
});

describe('Treffs, Dienste, Wünsche', () => {
  const montag = () => `(date_trunc('week', current_date)::date + 7)`; // nächster Montag
  it('BetreuerIn sieht den eigenen Treff, Außenstehende nicht', async () => {
    const b = await als(db, betr, () => q('select id from treffs'));
    expect(b.rows).toEqual([{ id: treff }]);
    const f = await als(db, teamer, () => q('select id from treffs'));
    expect(f.rows).toHaveLength(0);
  });
  it('nur Treffleitung legt Dienste an', async () => {
    const msg = await als(db, betr, () => fehler(() => q(
      `insert into dienste (treff_id, datum, von, bis) values ($1, ${montag()}, '15:00', '19:00')`, [treff])));
    expect(msg).toMatch(/row-level security/i);
    await als(db, tl, () => q(
      `insert into dienste (treff_id, datum, von, bis) values ($1, ${montag()}, '15:00', '19:00')`, [treff]));
  });
  it('Wunschdienst: eigener Wunsch ja, als entschieden nein, Entscheidung nur durch Treffleitung', async () => {
    const d = (await q<{ id: string }>('select id from dienste where treff_id = $1', [treff])).rows[0]!.id;
    await als(db, betr, () => q(`insert into dienst_wuensche (dienst_id, person_id) values ($1, $2)`, [d, betr.id]));
    const msg = await als(db, betr, () => fehler(() => q(
      `insert into dienst_wuensche (dienst_id, person_id, status) values ($1, $2, 'bestaetigt')`, [d, betr2.id])));
    expect(msg).toMatch(/row-level security/i);
    const selbst = await als(db, betr, () => q(`update dienst_wuensche set status = 'bestaetigt' where dienst_id = $1`, [d]));
    expect(selbst.affectedRows).toBe(0);
    const leit = await als(db, tl, () => q(
      `update dienst_wuensche set status = 'bestaetigt', entschieden_von = $2 where dienst_id = $1`, [d, tl.id]));
    expect(leit.affectedRows).toBe(1);
  });
  it('Monatsmuster setzt Zuteilungen an allen Öffnungstagen des Monats', async () => {
    const n = await als(db, tl, () => q<{ n: number }>(
      `select fn_dienste_monatsmuster($1, current_date, $2::jsonb) as n`,
      [treff, JSON.stringify({ '1': [betr.id, tl.id], '3': [betr2.id] })]));
    expect(n.rows[0]!.n).toBeGreaterThanOrEqual(8);
    const z = await q<{ c: number }>(
      `select count(*)::int as c from dienst_zuteilungen z join dienste d on d.id = z.dienst_id
        where d.treff_id = $1 and extract(isodow from d.datum) = 3`, [treff]);
    expect(z.rows[0]!.c).toBeGreaterThanOrEqual(4);
  });
  it('Monatsmuster: BetreuerIn darf nicht, Fremde im Muster werden abgelehnt', async () => {
    const msg = await als(db, betr, () => fehler(() => q(
      `select fn_dienste_monatsmuster($1, current_date, $2::jsonb)`, [treff, JSON.stringify({ '1': [betr.id] })])));
    expect(msg).toMatch(/Treffleitung/);
    const msg2 = await als(db, tl, () => fehler(() => q(
      `select fn_dienste_monatsmuster($1, current_date, $2::jsonb)`, [treff, JSON.stringify({ '1': [teamer.id] })])));
    expect(msg2).toMatch(/gehört nicht zu diesem Treff/);
  });
  it('Statistik: Treffleitung sieht alle, BetreuerIn nur sich', async () => {
    const alle = await als(db, tl, () => q(`select * from fn_dienst_statistik($1, current_date)`, [treff]));
    expect(alle.rows).toHaveLength(3);
    const eigene = await als(db, betr, () => q<{ person_id: string }>(`select * from fn_dienst_statistik($1, current_date)`, [treff]));
    expect(eigene.rows.map((x) => x.person_id)).toEqual([betr.id]);
    const msg = await als(db, teamer, () => fehler(() => q(`select * from fn_dienst_statistik($1, current_date)`, [treff])));
    expect(msg).toMatch(/Kein Zugriff/);
  });
  it('BetreuerIn schreibt Wochenprogramm; Außenstehende nicht', async () => {
    await als(db, betr, () => q(`insert into treff_plan_eintraege (treff_id, wochentag, angebot_id) values ($1, 1, $2)`, [treff, angebot]));
    const msg = await als(db, teamer, () => fehler(() => q(
      `insert into treff_plan_eintraege (treff_id, wochentag, freitext) values ($1, 3, 'x')`, [treff])));
    expect(msg).toMatch(/row-level security/i);
  });
  it('Treff-Absprachen: Treffleitung schreibt, BetreuerIn liest und bestätigt', async () => {
    const n = (await als(db, tl, () => q<{ id: string }>(
      `insert into notizen (treff_id, art, text) values ($1, 'absprache', 'Schlüssel') returning id`, [treff]))).rows[0]!.id;
    const msg = await als(db, betr, () => fehler(() => q(
      `insert into notizen (treff_id, art, text) values ($1, 'absprache', 'eigene')`, [treff])));
    expect(msg).toMatch(/row-level security/i);
    const r = await als(db, betr, () => q('select id from notizen where treff_id = $1', [treff]));
    expect(r.rows).toEqual([{ id: n }]);
    await als(db, betr, () => q(`insert into notiz_bestaetigungen (notiz_id, person_id) values ($1, $2)`, [n, betr.id]));
  });
  it('Treff-Notizen kennen nur Absprachen', async () => {
    const msg = await fehler(() => q(`insert into notizen (treff_id, art, text) values ($1, 'hinweis', 'x')`, [treff]));
    expect(msg).toMatch(/check/i);
  });
});

describe('Abwesenheiten und Feiertage', () => {
  it('Treffleitung trägt für Personen des Treffs ein, nicht für Fremde', async () => {
    await als(db, tl, () => q(`insert into abwesenheiten (person_id, datum, typ, notiz)
                               values ($1, date_trunc('week', current_date)::date + 14, 'urlaub', 'Tirol')`, [betr.id]));
    const msg = await als(db, tl, () => fehler(() => q(
      `insert into abwesenheiten (person_id, datum, typ) values ($1, current_date, 'krank')`, [teamer.id])));
    expect(msg).toMatch(/row-level security/i);
  });
  it('BetreuerIn sieht nur die eigenen Abwesenheiten', async () => {
    const eigene = await als(db, betr, () => q('select * from abwesenheiten'));
    expect(eigene.rows).toHaveLength(1);
    const andere = await als(db, betr2, () => q('select * from abwesenheiten'));
    expect(andere.rows).toHaveLength(0);
  });
  it('BetreuerIn kann nichts eintragen', async () => {
    const msg = await als(db, betr, () => fehler(() => q(
      `insert into abwesenheiten (person_id, datum, typ) values ($1, current_date + 40, 'krank')`, [betr.id])));
    expect(msg).toMatch(/row-level security/i);
  });
  it('Feiertage: alle lesen, Treffleitung schreibt für den eigenen Treff', async () => {
    await als(db, tl, () => q(`insert into feiertage (treff_id, datum, bezeichnung) values ($1, current_date + 50, 'Fronleichnam')`, [treff]));
    const r = await als(db, teamer, () => q('select * from feiertage'));
    expect(r.rows).toHaveLength(1);
    const msg = await als(db, tl, () => fehler(() => q(
      `insert into feiertage (treff_id, datum, bezeichnung) values (null, current_date + 51, 'global')`)));
    expect(msg).toMatch(/row-level security/i);
  });
});

describe('Nachweis der Teilzeitkräfte', () => {
  let nachweis: string;
  const monat = `date_trunc('month', current_date)::date`;
  it('BetreuerIn legt den eigenen Nachweis an, nicht für andere', async () => {
    nachweis = (await als(db, betr, () => q<{ id: string }>(
      `insert into zeitnachweise (treff_id, person_id, monat) values ($1, $2, ${monat}) returning id`, [treff, betr.id]))).rows[0]!.id;
    const msg = await als(db, betr, () => fehler(() => q(
      `insert into zeitnachweise (treff_id, person_id, monat) values ($1, $2, ${monat})`, [treff, betr2.id])));
    expect(msg).toMatch(/row-level security/i);
  });
  it('Befüllen übernimmt Dienste und Abwesenheiten; manuelle Zeilen bleiben', async () => {
    await als(db, betr, () => q(`insert into zeitnachweis_zeilen (nachweis_id, datum, zeiten, stunden) values ($1, current_date, 'manuell', 1)`, [nachweis]));
    await als(db, betr, () => q('select fn_nachweis_befuellen($1)', [nachweis]));
    await als(db, betr, () => q('select fn_nachweis_befuellen($1)', [nachweis])); // wiederholbar
    const z = await q<{ quelle: string; c: number }>(
      `select quelle, count(*)::int as c from zeitnachweis_zeilen where nachweis_id = $1 group by quelle order by quelle`, [nachweis]);
    const nach = Object.fromEntries(z.rows.map((x) => [x.quelle, x.c]));
    expect(nach.manuell).toBe(1);
    expect(nach.dienst).toBeGreaterThanOrEqual(4);
    const dienstZeile = await q<{ zeiten: string; stunden: string }>(
      `select zeiten, stunden from zeitnachweis_zeilen where nachweis_id = $1 and quelle = 'dienst' limit 1`, [nachweis]);
    expect(dienstZeile.rows[0]!.zeiten).toMatch(/^\d\d:\d\d - \d\d:\d\d/);
  });
  it('fremde Nachweise sind für andere BetreuerInnen unsichtbar', async () => {
    const r = await als(db, betr2, () => q('select * from zeitnachweise'));
    expect(r.rows).toHaveLength(0);
    const z = await als(db, betr2, () => q('select * from zeitnachweis_zeilen'));
    expect(z.rows).toHaveLength(0);
  });
  it('einreichen ja, freigeben nein (nur Treffleitung/Koordination)', async () => {
    await als(db, betr, () => q(`update zeitnachweise set status = 'eingereicht' where id = $1`, [nachweis]));
    const r = await als(db, betr, () => q(`update zeitnachweise set status = 'freigegeben' where id = $1`, [nachweis]));
    expect(r.affectedRows).toBe(0); // nach "eingereicht" ist die Zeile für die Person gesperrt
    const leit = await als(db, tl, () => q(`update zeitnachweise set status = 'freigegeben' where id = $1`, [nachweis]));
    expect(leit.affectedRows).toBe(1);
    const frei = await q<{ freigegeben_von: string }>('select freigegeben_von from zeitnachweise where id = $1', [nachweis]);
    expect(frei.rows[0]!.freigegeben_von).toBe(tl.id);
  });
  it('freigegebene Nachweise sind für die Person gesperrt', async () => {
    const r = await als(db, betr, () => q(`update zeitnachweis_zeilen set stunden = 99 where nachweis_id = $1`, [nachweis]));
    expect(r.affectedRows).toBe(0);
    const msg = await als(db, betr, () => fehler(() => q('select fn_nachweis_befuellen($1)', [nachweis])));
    expect(msg).toMatch(/gesperrt/);
  });
  it('eine Person kann sich nicht selbst freigeben', async () => {
    const n2 = (await q<{ id: string }>(
      `insert into zeitnachweise (treff_id, person_id, monat, status) values ($1, $2, ${monat} - interval '1 month', 'entwurf') returning id`,
      [treff, betr2.id])).rows[0]!.id;
    const msg = await als(db, betr2, () => fehler(() => q(`update zeitnachweise set status = 'freigegeben' where id = $1`, [n2])));
    expect(msg).toMatch(/row-level security|Nur Treffleitung/i);
  });
});

describe('Inhalte, Katalog, Formulare', () => {
  beforeAll(async () => {
    await q(`insert into inhalte values ('teamermappe', '{"sections":[]}'::jsonb, null, now()),
                                          ('treffmappe',  '{"sections":[]}'::jsonb, null, now())`);
  });
  it('Teamermappe lesen alle Aktiven', async () => {
    for (const p of [teamer, betr, fremder]) {
      const r = await als(db, p, () => q(`select schluessel from inhalte where schluessel = 'teamermappe'`));
      expect(r.rows).toHaveLength(1);
    }
  });
  it('Treffmappe: Koordination, Treffleitung und TZK-BetreuerIn – sonst niemand', async () => {
    const sieht = async (p: Person) => (await als(db, p, () => q(`select 1 from inhalte where schluessel = 'treffmappe'`))).rows.length;
    expect(await sieht(koord)).toBe(1);
    expect(await sieht(tl)).toBe(1);
    expect(await sieht(betr)).toBe(1);      // Kategorie TZK
    expect(await sieht(betr2)).toBe(0);     // Kategorie FSJ
    expect(await sieht(teamer)).toBe(0);
  });
  it('Inhalte ändert nur die Koordination', async () => {
    const r = await als(db, leitung, () => q(`update inhalte set daten = '{}'::jsonb where schluessel = 'teamermappe'`));
    expect(r.affectedRows).toBe(0);
    const k = await als(db, koord, () => q(`update inhalte set daten = '{"sections":[]}'::jsonb where schluessel = 'teamermappe'`));
    expect(k.affectedRows).toBe(1);
  });
  it('Katalog lesen alle, schreiben nur Koordination', async () => {
    const r = await als(db, teamer, () => q('select * from angebote'));
    expect(r.rows.length).toBeGreaterThan(0);
    const msg = await als(db, teamer, () => fehler(() => q(`insert into angebote (name, kategorie) values ('x','kreativ')`)));
    expect(msg).toMatch(/row-level security/i);
  });
  it('Bewertung: eine je Person, nicht im Namen anderer', async () => {
    await als(db, teamer, () => q(`insert into angebot_bewertungen values ($1, $2, 4)`, [angebot, teamer.id]));
    const msg = await als(db, teamer, () => fehler(() => q(`insert into angebot_bewertungen values ($1, $2, 5)`, [angebot, leitung.id])));
    expect(msg).toMatch(/row-level security/i);
    const dup = await als(db, teamer, () => fehler(() => q(`insert into angebot_bewertungen values ($1, $2, 3)`, [angebot, teamer.id])));
    expect(dup).toMatch(/duplicate|unique/i);
    const v = await als(db, leitung, () => q<{ anzahl: number }>('select anzahl from v_angebot_bewertung'));
    expect(v.rows[0]!.anzahl).toBe(1);
  });
  it('Favoriten sind privat', async () => {
    await als(db, teamer, () => q(`insert into angebot_favoriten values ($1, $2)`, [teamer.id, angebot]));
    const r = await als(db, leitung, () => q('select * from angebot_favoriten'));
    expect(r.rows).toHaveLength(0);
  });
  it('Vorschlag einreichen, Koordination übernimmt in den Katalog', async () => {
    const id = (await als(db, teamer, () => q<{ id: string }>(
      `insert into angebot_vorschlaege (eingereicht_von, daten) values ($1, $2::jsonb) returning id`,
      [teamer.id, JSON.stringify({ name: 'Schatzsuche', kategorie: 'highlight', alter_gruppen: ['6-8'], wetter: 'outdoor' })]))).rows[0]!.id;
    const fremd = await als(db, leitung, () => q('select * from angebot_vorschlaege'));
    expect(fremd.rows).toHaveLength(0);
    const msg = await als(db, teamer, () => fehler(() => q('select fn_vorschlag_uebernehmen($1)', [id])));
    expect(msg).toMatch(/Koordination/);
    await als(db, koord, () => q('select fn_vorschlag_uebernehmen($1)', [id]));
    const a = await q<{ alter_gruppen: string[]; wetter: string }>(`select alter_gruppen, wetter from angebote where name = 'Schatzsuche'`);
    expect(a.rows[0]).toEqual({ alter_gruppen: ['6-8'], wetter: 'outdoor' });
  });
  it('Volltextsuche findet Programmpunkte (deutsche Stammformen)', async () => {
    await q(`insert into angebote (name, kategorie, umsetzung) values ('Wasserspiele', 'wasser', 'Die Kinder laufen mit Schwämmen')`);
    const r = await als(db, teamer, () => q(
      `select name from angebote where suchtext @@ plainto_tsquery('german', 'Schwamm')`));
    expect(r.rows).toEqual([{ name: 'Wasserspiele' }]);
  });
  it('Formular-Entwurf für die Anwesenheitsliste (Kindernamen) wird nie gespeichert', async () => {
    const msg = await als(db, teamer, () => fehler(() => q(
      `insert into formular_entwuerfe (person_id, typ, daten) values ($1, 'anwesenheit', '{}'::jsonb)`, [teamer.id])));
    expect(msg).toMatch(/check/i);
    await als(db, teamer, () => q(
      `insert into formular_entwuerfe (person_id, typ, daten) values ($1, 'tagesbericht', '{}'::jsonb)`, [teamer.id]));
  });
});

describe('KiJuKo-Zusatzdaten und Import-Tabellen', () => {
  it('Verpflegung und Material: Leitung liest, TeamerIn nicht, niemand schreibt direkt', async () => {
    await q(`insert into freizeit_verpflegung (freizeit_id, mischkost, vegetarisch) values ($1, 50, 3)`, [fz]);
    const l = await als(db, leitung, () => q('select * from freizeit_verpflegung'));
    expect(l.rows).toHaveLength(1);
    const t = await als(db, teamer, () => q('select * from freizeit_verpflegung'));
    expect(t.rows).toHaveLength(0);
    const msg = await als(db, koord, () => fehler(() => q(`insert into freizeit_material (freizeit_id, name) values ($1, 'Bälle')`, [fz])));
    expect(msg).toMatch(/row-level security/i);
  });
  it('Import-Protokolle sehen nur Koordinierende', async () => {
    await q(`insert into import_laeufe (ergebnis) values ('{}'::jsonb)`);
    const k = await als(db, koord, () => q('select * from import_laeufe'));
    expect(k.rows).toHaveLength(1);
    const l = await als(db, leitung, () => q('select * from import_laeufe'));
    expect(l.rows).toHaveLength(0);
  });
});

describe('Persönliche Daten bleiben privat', () => {
  it('Push-Abos, gelesen-Stand und Quiz-Ergebnisse gehören der Person', async () => {
    await als(db, teamer, () => q(`insert into push_abos (person_id, endpoint, p256dh, auth) values ($1, 'https://push/1', 'k', 'a')`, [teamer.id]));
    await als(db, teamer, () => q(`insert into quiz_ergebnisse values ($1, 'aufsicht', 5, 6)`, [teamer.id]));
    const andere = await als(db, leitung, () => q('select * from push_abos'));
    expect(andere.rows).toHaveLength(0);
    const k = await als(db, koord, () => q('select * from quiz_ergebnisse'));
    expect(k.rows).toHaveLength(1);
    const msg = await als(db, teamer, () => fehler(() => q(
      `insert into push_abos (person_id, endpoint, p256dh, auth) values ($1, 'https://push/2', 'k', 'a')`, [leitung.id])));
    expect(msg).toMatch(/row-level security/i);
  });
});
