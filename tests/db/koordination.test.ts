import { describe, it, expect, beforeAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { neueDb, person, als, fehler, type Person } from './harness';

/**
 * Migration 0018: Freizeitenkoordination und Treffkoordination (getrennt, eine Person kann beides sein).
 * Gemeinsam (jede der beiden): Personen, Orte, Katalog, Quiz, Einstellungen, manuelle Mitteilungen.
 */
let db: PGlite;
let fk: Person, tk: Person, beide: Person, normal: Person, bewerber: Person, leitung: Person, tl: Person, betr: Person;
let fz: string, treff: string, bewerbung: string;

const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params);
const zahl = async (wer: Person, sql: string, p: unknown[] = []) => (await als(db, wer, () => q<{ n: number }>(`select count(*)::int as n from ${sql}`, p))).rows[0]!.n;
const geaendert = async (wer: Person, sql: string, p: unknown[] = []) => (await als(db, wer, () => q(sql, p))).affectedRows ?? 0;
const setze = (p: Person, freizeit: boolean, treffs: boolean) =>
  q(`update personen set ist_freizeitkoordination = $2, ist_treffkoordination = $3 where id = $1`, [p.id, freizeit, treffs]);

interface Ergebnis { empfaenger: string[]; titel: string; text: string; url: string }
const push = async (wer: Person, art: string, ref: string | null = null, extra: object = {}): Promise<Ergebnis> =>
  (await als(db, wer, () => q<{ r: Ergebnis }>('select fn_push_vorbereiten($1, $2, $3::jsonb) as r', [art, ref, JSON.stringify(extra)]))).rows[0]!.r;
const pushFehler = (wer: Person, art: string, ref: string | null = null, extra: object = {}) =>
  als(db, wer, () => fehler(() => q('select fn_push_vorbereiten($1, $2, $3::jsonb)', [art, ref, JSON.stringify(extra)])));

beforeAll(async () => {
  db = await neueDb();
  beide = await person(db, 'Beide', { kategorie: 'Hauptamtliche*r' });
  fk = await person(db, 'FK', { kategorie: 'Hauptamtliche*r' });
  tk = await person(db, 'TK', { kategorie: 'Hauptamtliche*r' });
  normal = await person(db, 'Normal', { kategorie: 'Hauptamtliche*r' });
  bewerber = await person(db, 'Bewerber');
  leitung = await person(db, 'Leitung', { kategorie: 'Hauptamtliche*r' });
  tl = await person(db, 'Treffleitung', { kategorie: 'Hauptamtliche*r' });
  betr = await person(db, 'Betreuer', { kategorie: 'TZK' });
  await setze(beide, true, true);
  await setze(fk, true, false);
  await setze(tk, false, true);

  fz = (await q<{ id: string }>(`insert into freizeiten (name, start_datum, ende_datum) values ('Sommer', current_date + 30, current_date + 34) returning id`)).rows[0]!.id;
  treff = (await q<{ id: string }>(`insert into treffs (name) values ('Kindertreff') returning id`)).rows[0]!.id;
  await q(`insert into freizeit_team values ($1, $2, 'leitung')`, [fz, leitung.id]);
  await q(`insert into treff_team values ($1, $2, 'treffleitung'), ($1, $3, 'betreuerin')`, [treff, tl.id, betr.id]);
  await q(`insert into treff_oeffnungszeiten select $1, extract(isodow from current_date)::int, '00:00', '23:59'`, [treff]);
  bewerbung = (await q<{ id: string }>(`insert into bewerbungen (person_id, freizeit_id) values ($1, $2) returning id`, [bewerber.id, fz])).rows[0]!.id;
});

describe('Kennzeichen und Schutz', () => {
  it('„ist_koordination“ ist die Summe: irgendein Bereich', async () => {
    const r = await q<{ v: string; f: boolean; t: boolean; k: boolean }>(`select vorname as v, ist_freizeitkoordination as f, ist_treffkoordination as t, ist_koordination as k from personen where vorname in ('Beide','FK','TK','Normal') order by vorname`);
    expect(r.rows).toEqual([{ v: 'Beide', f: true, t: true, k: true }, { v: 'FK', f: true, t: false, k: true }, { v: 'Normal', f: false, t: false, k: false }, { v: 'TK', f: false, t: true, k: true }]);
  });

  it('Altcode: wer nur „ist_koordination“ setzt, meint beide Bereiche – auch beim Zurücknehmen', async () => {
    const p = await person(db, 'Alt', { koordination: true, kategorie: 'Hauptamtliche*r' });
    expect((await q(`select ist_freizeitkoordination as f, ist_treffkoordination as t from personen where id = $1`, [p.id])).rows[0]).toEqual({ f: true, t: true });
    await q(`update personen set ist_koordination = false where id = $1`, [p.id]);
    expect((await q(`select ist_freizeitkoordination as f, ist_treffkoordination as t, ist_koordination as k from personen where id = $1`, [p.id])).rows[0]).toEqual({ f: false, t: false, k: false });
    await q(`update personen set ist_koordination = true where id = $1`, [p.id]);
    expect((await q(`select ist_freizeitkoordination as f, ist_treffkoordination as t from personen where id = $1`, [p.id])).rows[0]).toEqual({ f: true, t: true });
    await q(`update personen set ist_koordination = false where id = $1`, [p.id]);
  });

  it('nur ein Bereich: „ist_koordination“ folgt', async () => {
    const p = await person(db, 'Teil', { kategorie: 'Hauptamtliche*r' });
    await q(`update personen set ist_treffkoordination = true where id = $1`, [p.id]);
    expect((await q(`select ist_koordination as k from personen where id = $1`, [p.id])).rows[0]).toEqual({ k: true });
    await q(`update personen set ist_treffkoordination = false where id = $1`, [p.id]);
    expect((await q(`select ist_koordination as k from personen where id = $1`, [p.id])).rows[0]).toEqual({ k: false });
  });

  it('die letzte aktive Person je Bereich ist geschützt – unabhängig vom anderen Bereich', async () => {
    // Beide und FK sind Freizeitenkoordination, Beide und TK sind Treffkoordination.
    await setze(tk, false, false);                                               // jetzt ist „Beide“ die einzige Treffkoordination
    const m1 = await fehler(() => q(`update personen set ist_treffkoordination = false where id = $1`, [beide.id]));
    expect(m1).toMatch(/letzte aktive Koordination der Treffs/);
    expect(await fehler(() => q(`update personen set aktiv = false where id = $1`, [beide.id]))).toMatch(/letzte aktive Koordination der Treffs/);
    expect(await fehler(() => q(`delete from personen where id = $1`, [beide.id]))).toMatch(/letzte aktive Koordination der Treffs/);
    await setze(beide, false, true);                                             // Freizeiten gibt es noch durch FK → erlaubt
    await setze(beide, true, true);
    await setze(tk, false, true);
  });

  it('die Freizeiten-Seite ist ebenso geschützt', async () => {
    await setze(beide, false, true);                                             // FK ist jetzt die einzige Freizeitenkoordination
    expect(await fehler(() => q(`update personen set ist_freizeitkoordination = false where id = $1`, [fk.id]))).toMatch(/letzte aktive Koordination der Freizeiten/);
    await setze(beide, true, true);
  });

  it('Kennzeichen ändern dürfen nur Koordinatoren, nicht die Person selbst', async () => {
    const msg = await als(db, normal, () => fehler(() => q(`update personen set ist_treffkoordination = true where id = $1`, [normal.id])));
    expect(msg).toMatch(/Nur Telefon, Ernährung und Notizen/);
    expect(await geaendert(tk, `update personen set ist_freizeitkoordination = true where id = $1`, [normal.id])).toBe(1);        // gemeinsame Personenverwaltung
    await setze(normal, false, false);
  });
});

describe('Freizeitenkoordination (nur Freizeiten)', () => {
  it('sieht und ändert Freizeiten, Team, Bewerbungen und Lebensmittel', async () => {
    expect(await zahl(fk, 'freizeiten')).toBe(1);
    expect(await geaendert(fk, `update freizeiten set name = 'Sommer 1' where id = $1`, [fz])).toBe(1);
    expect(await zahl(fk, 'freizeit_team')).toBe(1);
    expect(await zahl(fk, 'bewerbungen')).toBe(1);
  });
  it('entscheidet Bewerbungen', async () => {
    await als(db, fk, () => q(`select fn_bewerbung_annehmen($1)`, [bewerbung]));
    expect((await q(`select status::text as s from bewerbungen where id = $1`, [bewerbung])).rows[0]).toEqual({ s: 'angenommen' });
    await q(`update bewerbungen set status = 'offen', entschieden_von = null, entschieden_am = null where id = $1`, [bewerbung]);
    await q(`delete from freizeit_team where person_id = $1`, [bewerber.id]);
  });
  it('sieht Kontaktdaten der Freizeit-Teams, aber nichts aus den Treffs', async () => {
    expect(await zahl(fk, 'v_team_freizeit where mail is not null')).toBe(1);
    expect(await zahl(fk, 'treffs')).toBe(0);
    expect(await zahl(fk, 'treff_team')).toBe(0);
    expect(await zahl(fk, 'v_team_treff')).toBe(0);
  });
  it('darf nichts in den Treffs ändern oder anlegen', async () => {
    expect(await geaendert(fk, `update treffs set name = 'X' where id = $1`, [treff])).toBe(0);
    expect(await als(db, fk, () => fehler(() => q(`insert into treffs (name) values ('Neu')`)))).toMatch(/row-level security/i);
    expect(await als(db, fk, () => fehler(() => q(`select fn_dienst_sicherstellen($1, current_date)`, [treff])))).toMatch(/Treffleitung/);
    expect(await als(db, fk, () => fehler(() => q(`insert into treff_protokolle (treff_id, datum) values ($1, current_date)`, [treff])))).toMatch(/row-level security/i);
    expect(await als(db, fk, () => fehler(() => q(`insert into treff_aufgaben (treff_id, text) values ($1, 'x')`, [treff])))).toMatch(/row-level security/i);
  });
});

describe('Treffkoordination (nur Treffs)', () => {
  it('sieht und ändert Treffs, Team, Protokolle und Notizen', async () => {
    expect(await zahl(tk, 'treffs')).toBe(1);
    expect(await geaendert(tk, `update treffs set name = 'Kindertreff' where id = $1`, [treff])).toBe(1);
    await als(db, tk, () => q(`insert into treff_protokolle (treff_id, datum, anz_m) values ($1, current_date, 3)`, [treff]));
    await als(db, tk, () => q(`insert into treff_aufgaben (treff_id, text) values ($1, 'Saft kaufen')`, [treff]));
    expect(await zahl(tk, 'treff_protokolle')).toBe(1);
    expect(await zahl(tk, 'treff_aufgaben')).toBe(1);
  });
  it('stellt Dienste sicher und gibt Nachweise frei', async () => {
    await als(db, tk, () => q(`select fn_dienst_sicherstellen($1, current_date)`, [treff]));
    const n = (await q<{ id: string }>(`insert into zeitnachweise (treff_id, person_id, monat, status) values ($1, $2, date_trunc('month', current_date), 'eingereicht') returning id`, [treff, betr.id])).rows[0]!.id;
    expect(await geaendert(tk, `update zeitnachweise set status = 'freigegeben' where id = $1`, [n])).toBe(1);
  });
  it('sieht Kontaktdaten der Treff-Teams, aber nichts aus den Freizeiten', async () => {
    expect(await zahl(tk, 'v_team_treff where mail is not null')).toBe(2);
    expect(await zahl(tk, 'freizeiten')).toBe(0);
    expect(await zahl(tk, 'freizeit_team')).toBe(0);
    expect(await zahl(tk, 'bewerbungen')).toBe(0);
    expect(await zahl(tk, 'v_team_freizeit')).toBe(0);
  });
  it('darf in den Freizeiten nichts entscheiden oder anlegen', async () => {
    expect(await als(db, tk, () => fehler(() => q(`select fn_bewerbung_annehmen($1)`, [bewerbung])))).toMatch(/Nur die Koordination darf Bewerbungen entscheiden/);
    expect(await als(db, tk, () => fehler(() => q(`insert into freizeiten (name, start_datum, ende_datum) values ('Neu', current_date, current_date)`)))).toMatch(/row-level security/i);
    expect(await geaendert(tk, `update freizeiten set name = 'X' where id = $1`, [fz])).toBe(0);
  });
});

describe('Beide Bereiche, Gemeinsames, normale Personen', () => {
  it('wer beides ist, darf alles wie bisher', async () => {
    expect(await zahl(beide, 'freizeiten')).toBe(1);
    expect(await zahl(beide, 'treffs')).toBe(1);
    expect(await zahl(beide, 'treff_protokolle')).toBe(1);
    expect(await geaendert(beide, `update freizeiten set name = 'Sommer' where id = $1`, [fz])).toBe(1);
  });

  it('gemeinsam: Personen, Orte und Katalog verwaltet jede der beiden, sonst niemand', async () => {
    for (const [nr, wer] of [[1, fk], [2, tk], [3, beide]] as [number, Person][]) {
      await als(db, wer, () => q(`insert into orte (name) values ($1)`, [`Ort ${nr}`]));
      await als(db, wer, () => q(`insert into angebote (name, kategorie) values ($1, 'kreativ')`, [`Angebot ${nr}`]));
      await als(db, wer, () => q(`insert into personen (vorname, nachname, mail, kategorie) values ('N', $1, $2, 'TeamerIn')`, [`Neu${nr}`, `neu${nr}@test.example`]));
    }
    expect(await als(db, normal, () => fehler(() => q(`insert into orte (name) values ('Nein')`)))).toMatch(/row-level security/i);
    expect(await als(db, normal, () => fehler(() => q(`insert into angebote (name, kategorie) values ('Nein', 'kreativ')`)))).toMatch(/row-level security/i);
    expect(await als(db, normal, () => fehler(() => q(`insert into personen (vorname, nachname, mail, kategorie) values ('N', 'X', 'x@test.example', 'TeamerIn')`)))).toMatch(/row-level security/i);
  });

  it('normale Personen sehen weder Freizeiten noch Treffs ohne Zuordnung', async () => {
    expect(await zahl(normal, 'treffs')).toBe(0);
    expect(await zahl(normal, 'treff_protokolle')).toBe(0);
    expect(await zahl(normal, 'lebensmittel_eingang')).toBe(0);
  });
});

describe('Hinweise und Absprachen', () => {
  beforeAll(async () => {
    await q(`insert into notizen (freizeit_id, art, text) values ($1, 'absprache', 'Budget Freizeit')`, [fz]);
    await q(`insert into notizen (treff_id, art, text) values ($1, 'absprache', 'Schlüssel Treff')`, [treff]);
  });
  it('jede Koordination sieht die Absprachen ihres Bereichs', async () => {
    expect(await zahl(fk, `notizen where text = 'Budget Freizeit'`)).toBe(1);
    expect(await zahl(fk, `notizen where text = 'Schlüssel Treff'`)).toBe(0);
    expect(await zahl(tk, `notizen where text = 'Budget Freizeit'`)).toBe(0);
    expect(await zahl(tk, `notizen where text = 'Schlüssel Treff'`)).toBe(1);
    expect(await zahl(beide, 'notizen')).toBe(2);
  });
  it('schreiben nur im eigenen Bereich', async () => {
    await als(db, fk, () => q(`insert into notizen (freizeit_id, art, text) values ($1, 'hinweis', 'Hinweis von FK')`, [fz]));
    await als(db, tk, () => q(`insert into notizen (treff_id, art, text) values ($1, 'absprache', 'Absprache von TK')`, [treff]));
    expect(await als(db, fk, () => fehler(() => q(`insert into notizen (treff_id, art, text) values ($1, 'absprache', 'nein')`, [treff])))).toMatch(/row-level security/i);
    expect(await als(db, tk, () => fehler(() => q(`insert into notizen (freizeit_id, art, text) values ($1, 'hinweis', 'nein')`, [fz])))).toMatch(/row-level security/i);
  });
});

describe('Mitteilungen je Bereich', () => {
  const bremse = () => q(`delete from mitteilungen_log`);

  it('neue Bewerbung: nur die Freizeitenkoordination', async () => {
    await bremse();
    const e = await push(bewerber, 'bewerbung', fz);
    expect([...e.empfaenger].sort()).toEqual([beide.id, fk.id].sort());
  });

  it('Absprache in einer Freizeit: Leitung und Freizeitenkoordination, nicht die Treffkoordination', async () => {
    await bremse();
    const n = (await als(db, leitung, () => q<{ id: string }>(`insert into notizen (freizeit_id, art, text) values ($1, 'absprache', 'Neu') returning id`, [fz]))).rows[0]!.id;
    const e = await push(leitung, 'absprache_freizeit', n);
    expect([...e.empfaenger].sort()).toEqual([beide.id, fk.id].sort());
  });

  it('Nachweis eingereicht ohne Treffleitung: nur die Treffkoordination', async () => {
    await bremse();
    const ohne = (await q<{ id: string }>(`insert into treffs (name) values ('Ohne Leitung') returning id`)).rows[0]!.id;
    await q(`insert into treff_team values ($1, $2, 'betreuerin')`, [ohne, betr.id]);
    const n = (await q<{ id: string }>(`insert into zeitnachweise (treff_id, person_id, monat, status) values ($1, $2, date_trunc('month', current_date), 'eingereicht') returning id`, [ohne, betr.id])).rows[0]!.id;
    const e = await push(betr, 'nachweis_eingereicht', n);
    expect([...e.empfaenger].sort()).toEqual([beide.id, tk.id].sort());
  });

  it('Lebensmittel knapp: nur die Freizeitenkoordination', async () => {
    await bremse();
    const ort = (await q<{ id: string }>(`insert into orte (name) values ('Au') returning id`)).rows[0]!.id;
    await q(`update freizeiten set ort_id = $1 where id = $2`, [ort, fz]);
    await q(`insert into lebensmittel_eingang (ort_id, freizeit_id, name, menge, einheit, erstellt_von) values ($1, $2, 'Milch', 10, 'l', $3)`, [ort, fz, fk.id]);
    await als(db, leitung, () => q(`insert into lebensmittel_verbrauch (ort_id, freizeit_id, name, menge, datum) values ($1, $2, 'Milch', 9, current_date)`, [ort, fz]));
    const e = await push(leitung, 'lebensmittel', ort, { name: 'Milch' });
    expect([...e.empfaenger].sort()).toEqual([beide.id, fk.id].sort());
  });

  it('Bewerbung angenommen darf nur die Freizeitenkoordination auslösen', async () => {
    await bremse();
    await als(db, fk, () => q(`select fn_bewerbung_annehmen($1)`, [bewerbung]));
    expect(await pushFehler(tk, 'bewerbung_angenommen', bewerbung)).toMatch(/nicht zulässig/);
    const e = await push(fk, 'bewerbung_angenommen', bewerbung);
    expect(e.empfaenger).toEqual([bewerber.id]);
  });

  it('Dienstplan-Mitteilung: Treffkoordination ja, Freizeitenkoordination nein', async () => {
    await bremse();
    const ok = await push(tk, 'dienstplan', treff, { personen: [betr.id] });
    expect(ok.empfaenger).toEqual([betr.id]);
    expect(await pushFehler(fk, 'dienstplan', treff, { personen: [betr.id] })).toMatch(/nicht zulässig/);
  });

  it('manuelle Mitteilungen: an alle beide, an Freizeiten nur die Freizeitenkoordination, an Treffs nur die Treffkoordination', async () => {
    await bremse();
    const manuell = (wer: Person, ziel: object) => push(wer, 'manuell', null, { titel: 'T', text: 'X', ziel });
    expect((await manuell(fk, { art: 'alle' })).empfaenger.length).toBeGreaterThan(0);
    expect((await manuell(tk, { art: 'alle' })).empfaenger.length).toBeGreaterThan(0);
    expect((await manuell(fk, { art: 'freizeit', id: fz })).empfaenger).toContain(leitung.id);
    expect((await manuell(tk, { art: 'treff', id: treff })).empfaenger).toContain(tl.id);
    expect(await pushFehler(tk, 'manuell', null, { titel: 'T', text: 'X', ziel: { art: 'freizeit', id: fz } })).toMatch(/Freizeitenkoordination/);
    expect(await pushFehler(fk, 'manuell', null, { titel: 'T', text: 'X', ziel: { art: 'treff', id: treff } })).toMatch(/Treffkoordination/);
    expect(await pushFehler(normal, 'manuell', null, { titel: 'T', text: 'X', ziel: { art: 'alle' } })).toMatch(/Koordination/);
  });
});

describe('Vollständigkeit der Umstellung', () => {
  it('in den Regeln der Freizeit- und Tabellen der Treffs steht kein „irgendeine Koordination“ mehr', async () => {
    const r = await q<{ tablename: string; policyname: string }>(`
      select tablename, policyname from pg_policies
       where schemaname = 'public' and (coalesce(qual, '') like '%ist_koord()%' or coalesce(with_check, '') like '%ist_koord()%') order by 1, 2`);
    const tabellen = [...new Set(r.rows.map((x) => x.tablename))];
    // Nur gemeinsam verwaltete Bereiche dürfen „irgendeine Koordination“ behalten
    expect(tabellen).toEqual(['angebot_bewertungen', 'angebot_kommentare', 'angebot_vorschlaege', 'angebote', 'einstellungen', 'inhalte',
      'orte', 'personen', 'quiz_ergebnisse', 'quiz_fragen', 'tags']);
  });

  it('die umgestellten Funktionen fragen nicht mehr nach „irgendeiner Koordination“', async () => {
    const r = await q<{ proname: string }>(`
      select proname from pg_proc where pronamespace = 'public'::regnamespace and prosrc like '%ist_koord()%' order by 1`);
    // Gemeinsame Bereiche (Personen, Katalog, manuelle Mitteilungen) behalten ist_koord()
    expect(r.rows.map((x) => x.proname)).toEqual(['fn_person_datenuebersicht', 'fn_personen_schutz', 'fn_push_vorbereiten', 'fn_push_ziel', 'fn_vorschlag_ablehnen', 'fn_vorschlag_uebernehmen']);
  });
});
