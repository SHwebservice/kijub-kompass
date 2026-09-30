import { describe, it, expect, beforeAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { neueDb, person, als, fehler, type Person } from './harness';

/** Migration 0020: fn_heute (Startseite in einem Aufruf) und „Neu seit deinem letzten Besuch“. */
let db: PGlite;
let koord: Person, fk: Person, tk: Person, leitung: Person, teamer: Person, tl: Person, betr: Person, fremd: Person;
let fz: string, ort: string, treff: string, vm: string, hinweis: string, absprache: string, treffAbsprache: string;

const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Heute = Record<string, any>;
const heute = async (wer: Person, anfrage: object = {}): Promise<Heute> =>
  (await als(db, wer, () => q<{ r: Heute }>(`select fn_heute(current_date, $1::jsonb) as r`, [JSON.stringify(anfrage)]))).rows[0]!.r;

const ALLES = () => ({
  notiz_freizeiten: [fz], notiz_treffs: [treff], team_freizeiten: [fz], plan_freizeiten: [fz], kachel_treffs: [treff],
  bestand: true, nachweise: true, bewerbungen: true, vorschlaege: true, fehler: true, wuensche: 'alle',
});

beforeAll(async () => {
  db = await neueDb();
  koord = await person(db, 'Koord', { koordination: true, kategorie: 'Hauptamtliche*r' });
  fk = await person(db, 'FK', { kategorie: 'Hauptamtliche*r' });
  tk = await person(db, 'TK', { kategorie: 'Hauptamtliche*r' });
  await q(`update personen set ist_freizeitkoordination = true where id = $1`, [fk.id]);
  await q(`update personen set ist_treffkoordination = true where id = $1`, [tk.id]);
  leitung = await person(db, 'Leitung', { kategorie: 'Hauptamtliche*r' });
  teamer = await person(db, 'Teamer');
  tl = await person(db, 'Treffleitung', { kategorie: 'Hauptamtliche*r' });
  betr = await person(db, 'Betreuer', { kategorie: 'TZK' });
  fremd = await person(db, 'Fremd');

  ort = (await q<{ id: string }>(`insert into orte (name) values ('Mörscher Au') returning id`)).rows[0]!.id;
  fz = (await q<{ id: string }>(`insert into freizeiten (name, start_datum, ende_datum, ort_id) values ('Sommer-Sause', current_date - 1, current_date + 3, $1) returning id`, [ort])).rows[0]!.id;
  await q(`insert into freizeit_team values ($1, $2, 'leitung'), ($1, $3, 'teamer')`, [fz, leitung.id, teamer.id]);
  vm = (await q<{ id: string }>(`select id from freizeit_slots where freizeit_id = $1 and name = 'Vormittag'`, [fz])).rows[0]!.id;
  treff = (await q<{ id: string }>(`insert into treffs (name) values ('Kindertreff') returning id`)).rows[0]!.id;
  await q(`insert into treff_team values ($1, $2, 'treffleitung'), ($1, $3, 'betreuerin')`, [treff, tl.id, betr.id]);

  hinweis = (await q<{ id: string }>(`insert into notizen (freizeit_id, art, text, erstellt_von) values ($1, 'hinweis', 'Sonnencreme', $2) returning id`, [fz, leitung.id])).rows[0]!.id;
  absprache = (await q<{ id: string }>(`insert into notizen (freizeit_id, art, text, erstellt_von) values ($1, 'absprache', 'Budget', $2) returning id`, [fz, koord.id])).rows[0]!.id;
  treffAbsprache = (await q<{ id: string }>(`insert into notizen (treff_id, art, text, erstellt_von) values ($1, 'absprache', 'Schlüssel', $2) returning id`, [treff, tl.id])).rows[0]!.id;
  await q(`insert into notiz_bestaetigungen (notiz_id, person_id) values ($1, $2)`, [hinweis, teamer.id]);
  await q(`insert into plan_eintraege (freizeit_id, datum, slot_id, freitext, erstellt_von) values ($1, current_date, $2, 'Schwimmen', $3), ($1, current_date + 1, $2, 'Morgen', $3)`, [fz, vm, leitung.id]);

  await q(`insert into lebensmittel_eingang (ort_id, freizeit_id, name, menge, einheit, erstellt_von) values ($1, $2, 'Milch', 10, 'l', $3), ($1, $2, 'Reis', 100, 'kg', $3)`, [ort, fz, koord.id]);
  await q(`insert into lebensmittel_verbrauch (ort_id, freizeit_id, name, menge, datum, erstellt_von) values ($1, $2, 'Milch', 9, current_date, $3)`, [ort, fz, leitung.id]);

  const bewerber = await person(db, 'Bewerber');
  await q(`insert into bewerbungen (person_id, freizeit_id) values ($1, $2)`, [bewerber.id, fz]);
  await q(`insert into angebote (name, kategorie) values ('Basteln', 'kreativ')`);
  await q(`insert into angebot_vorschlaege (eingereicht_von, daten) values ($1, '{"name":"Nachtwanderung"}')`, [teamer.id]);
  await q(`insert into treff_oeffnungszeiten select $1, extract(isodow from current_date)::int, '00:00', '23:59'`, [treff]);
  const d = (await q<{ id: string }>(`insert into dienste (treff_id, datum) values ($1, current_date + 2) returning id`, [treff])).rows[0]!.id;
  await q(`insert into dienst_wuensche (dienst_id, person_id) values ($1, $2)`, [d, betr.id]);
  await q(`insert into zeitnachweise (treff_id, person_id, monat, status) values ($1, $2, date_trunc('month', current_date), 'eingereicht')`, [treff, betr.id]);
  await q(`insert into fehlermeldungen (version, seite, meldung) values ('v', '/', 'kaputt')`);
  await q(`insert into treff_aufgaben (treff_id, text, erstellt_von) values ($1, 'Saft kaufen', $2), ($1, 'Flyer', $2)`, [treff, tl.id]);
});

describe('Hinweise, Absprachen, Team, Wochenplan', () => {
  it('Hinweise und Absprachen der angefragten Freizeiten und Treffs – mit Bestätigungen und Quelle', async () => {
    const r = await heute(koord, ALLES());
    const n = (id: string) => r.notizen.find((x: Heute) => x.id === id);
    expect(r.notizen).toHaveLength(3);
    expect(n(hinweis)).toMatchObject({ art: 'hinweis', text: 'Sonnencreme', quelle: 'Sommer-Sause', freizeit_id: fz, treff_id: null, bestaetigt_von: [teamer.id] });
    expect(n(absprache)).toMatchObject({ art: 'absprache', bestaetigt_von: [] });
    expect(n(treffAbsprache)).toMatchObject({ quelle: 'Kindertreff', treff_id: treff });
    expect(r.notizen[0].created_at >= r.notizen[2].created_at).toBe(true);        // neueste zuerst
  });

  it('jede Person bekommt nur, was sie sehen darf (Absprachen sieht ein Teamer nicht)', async () => {
    const r = await heute(teamer, ALLES());
    expect(r.notizen.map((x: Heute) => x.id)).toEqual([hinweis]);
    const f = await heute(fk, ALLES());
    expect(f.notizen.map((x: Heute) => x.id).sort()).toEqual([hinweis, absprache].sort());           // Freizeitenkoordination: nichts aus den Treffs
    const t = await heute(tk, ALLES());
    expect(t.notizen.map((x: Heute) => x.id)).toEqual([treffAbsprache]);
    expect((await heute(fremd, ALLES())).notizen).toEqual([]);
  });

  it('ohne Anfrage keine Notizen, Teams oder Pläne', async () => {
    const r = await heute(koord);
    expect(r.notizen).toEqual([]);
    expect(r.team).toEqual([]);
    expect(r.plan).toEqual([]);
  });

  it('Teamzeilen nur für die angefragten Freizeiten', async () => {
    const r = await heute(leitung, { team_freizeiten: [fz] });
    expect(r.team).toHaveLength(2);
    expect(r.team).toEqual(expect.arrayContaining([{ freizeit_id: fz, person_id: leitung.id, rolle: 'leitung' }]));
    expect((await heute(leitung, { team_freizeiten: [] })).team).toEqual([]);
  });

  it('Wochenplan nur von heute, mit Titel und Slot', async () => {
    const r = await heute(teamer, { plan_freizeiten: [fz] });
    expect(r.plan).toHaveLength(1);
    expect(r.plan[0]).toMatchObject({ freizeit_id: fz, titel: 'Schwimmen', slot: 'Vormittag' });
  });
});

describe('Lebensmittel, Wünsche, Zahlen', () => {
  it('knappe Lebensmittel mit Ort – nur für Leitung und Koordination, und nur wenn angefragt', async () => {
    const r = await heute(leitung, { bestand: true });
    expect(r.bestand).toEqual([{ ort_id: ort, name: 'Milch', einheit: 'l', rest: 1, status: 'knapp' }]);
    expect(r.orte).toEqual({ [ort]: 'Mörscher Au' });
    expect((await heute(teamer, { bestand: true })).bestand).toEqual([]);
    expect((await heute(leitung, {})).bestand).toBeUndefined();
  });

  it('Dienstwünsche: alle sichtbaren oder nur bestimmte Treffs; BetreuerIn sieht nur eigene', async () => {
    const alle = await heute(tk, { wuensche: 'alle' });
    expect(alle.wuensche).toEqual([expect.objectContaining({ person_id: betr.id, treff_id: treff })]);
    expect(alle.treff_namen).toEqual({ [treff]: 'Kindertreff' });
    expect((await heute(tl, { wuensche: [treff] })).wuensche).toHaveLength(1);
    expect((await heute(tl, { wuensche: [] })).wuensche).toEqual([]);
    expect((await heute(fremd, { wuensche: 'alle' })).wuensche).toEqual([]);
    expect((await heute(tl, {})).wuensche).toBeUndefined();
  });

  it('Zahlen: Bewerbungen und Lebensmittel für die Freizeitenkoordination, Nachweise für die Treffkoordination, Fehler für jede Koordination', async () => {
    const f = await heute(fk, ALLES());
    expect([f.bewerbungen, f.vorschlaege, f.nachweise, f.fehler]).toEqual([1, 1, 0, 1]);
    const t = await heute(tk, ALLES());
    expect([t.bewerbungen, t.vorschlaege, t.nachweise, t.fehler]).toEqual([0, 1, 1, 1]);
    const k = await heute(koord, ALLES());
    expect([k.bewerbungen, k.vorschlaege, k.nachweise, k.fehler]).toEqual([1, 1, 1, 1]);
    const n = await heute(teamer, ALLES());
    expect([n.bewerbungen, n.nachweise, n.fehler]).toEqual([0, 0, 0]);
    expect((await heute(koord, {})).bewerbungen).toBeUndefined();
  });

  it('Protokolle von heute und offene Notizen der Treffs', async () => {
    await q(`insert into treff_protokolle (treff_id, datum) values ($1, current_date), ($1, current_date - 1)`, [treff]);
    const r = await heute(betr, { kachel_treffs: [treff] });
    expect(r.protokolliert).toEqual([treff]);
    expect(r.offene_notizen).toEqual({ [treff]: 2 });
    const leer = await heute(fremd, { kachel_treffs: [treff] });
    expect(leer.protokolliert).toEqual([]);
    expect(leer.offene_notizen).toEqual({});
    await q(`delete from treff_protokolle`);
  });
});

describe('Neu seit deinem letzten Besuch', () => {
  const besuch = (wer: Person, anfrage: object = {}) => heute(wer, { ...ALLES(), ...anfrage, besuch: true });
  const setzeBesuch = (p: Person, letzter: string, vorheriger: string | null) =>
    q(`insert into besuche (person_id, letzter_kontakt, vorheriger_besuch) values ($1, now() - $2::interval, ${vorheriger ? 'now() - $3::interval' : 'null'})
       on conflict (person_id) do update set letzter_kontakt = excluded.letzter_kontakt, vorheriger_besuch = excluded.vorheriger_besuch`,
      vorheriger ? [p.id, letzter, vorheriger] : [p.id, letzter]);
  const vor = (minuten: number) => `now() - interval '${minuten} minutes'`;

  beforeAll(async () => {
    // Zeitstempel lassen sich sonst nicht zurückdatieren (die Tabellen setzen sie selbst)
    for (const [t, tr] of [['treff_protokolle', 'treff_protokolle_pruefen'], ['treff_aufgaben', 'treff_aufgaben_pruefen'], ['zeitnachweise', 'zeitnachweise_touch']]) await q(`alter table ${t} disable trigger ${tr}`);
    // Neuigkeiten: „alt“ (vor 50 Minuten), Rest „neu“ (vor wenigen Minuten)
    await q(`insert into notizen (freizeit_id, art, text, erstellt_von, created_at) values ($1, 'hinweis', 'Alter Hinweis', $2, ${vor(50)})`, [fz, leitung.id]);
    await q(`insert into notizen (freizeit_id, art, text, erstellt_von, created_at) values ($1, 'hinweis', 'Neuer Hinweis', $2, ${vor(10)})`, [fz, leitung.id]);
    await q(`insert into notizen (freizeit_id, art, text, erstellt_von, created_at) values ($1, 'hinweis', 'Mein eigener Hinweis', $2, ${vor(9)})`, [fz, teamer.id]);
    await q(`insert into notizen (treff_id, art, text, erstellt_von, created_at) values ($1, 'absprache', 'Neue Treff-Absprache', $2, ${vor(8)})`, [treff, tl.id]);
    await q(`insert into plan_eintraege (freizeit_id, datum, slot_id, freitext, erstellt_von, created_at) values ($1, current_date, $2, 'Neues Spiel', $3, ${vor(7)})`, [fz, vm, leitung.id]);
    await q(`insert into treff_protokolle (treff_id, datum, bearbeitet_von) values ($1, current_date - 3, $2)`, [treff, betr.id]);
    await q(`update treff_protokolle set updated_at = ${vor(6)}, bearbeitet_von = $2 where treff_id = $1`, [treff, betr.id]);
    await q(`insert into treff_aufgaben (treff_id, text, erstellt_von, created_at) values ($1, 'Neue Aufgabe', $2, ${vor(5)}), ($1, 'Alte Aufgabe', $2, ${vor(55)})`, [treff, betr.id]);
    await q(`insert into dienstplan_kommentare (treff_id, woche_start, person_id, text, created_at) values ($1, date_trunc('week', current_date)::date, $2, 'Kann jemand tauschen?', ${vor(4)})`, [treff, betr.id]);
    await q(`update bewerbungen set created_at = ${vor(3)}`);
    await q(`update angebot_vorschlaege set created_at = ${vor(2)}`);
    await q(`update zeitnachweise set updated_at = ${vor(1)}`);
    for (const [t, tr] of [['treff_protokolle', 'treff_protokolle_pruefen'], ['treff_aufgaben', 'treff_aufgaben_pruefen'], ['zeitnachweise', 'zeitnachweise_touch']]) await q(`alter table ${t} enable trigger ${tr}`);
  });

  it('beim allerersten Besuch gibt es nichts „Neues“ – der Besuch wird vermerkt', async () => {
    const r = await besuch(koord);
    expect(r.seit).toBeNull();
    expect(r.neu).toEqual([]);
    expect(r.neu_gesamt).toBe(0);
    expect((await q('select 1 from besuche where person_id = $1', [koord.id])).rows).toHaveLength(1);
  });

  it('ohne Anfrage „besuch“ wird nichts berechnet und nichts vermerkt', async () => {
    const r = await heute(fremd, ALLES());
    expect(r.neu).toBeUndefined();
    expect((await q('select 1 from besuche where person_id = $1', [fremd.id])).rows).toHaveLength(0);
  });

  it('nach einer Pause: alles, was andere seitdem angelegt haben – neueste zuerst, nichts Eigenes, nichts Altes', async () => {
    await setzeBesuch(koord, '40 minutes', null);
    const r = await besuch(koord);
    expect(r.seit).not.toBeNull();
    const texte = r.neu.map((x: Heute) => x.text);
    expect(texte).toEqual(expect.arrayContaining(['Neuer Hinweis', 'Mein eigener Hinweis', 'Neue Treff-Absprache', `Neues Spiel (${(await q<{ d: string }>(`select to_char(current_date, 'DD.MM.') as d`)).rows[0]!.d})`, 'Neue Aufgabe', 'Kann jemand tauschen?', 'Neue Bewerbung', 'Nachtwanderung', 'Nachweis eingereicht']));
    expect(texte).not.toContain('Alter Hinweis');
    expect(texte).not.toContain('Alte Aufgabe');
    expect(r.neu.map((x: Heute) => x.zeit).every((z: string, i: number, l: string[]) => i === 0 || l[i - 1]! >= z)).toBe(true);
    expect(r.neu_gesamt).toBe(r.neu.length);
  });

  it('Eigenes zählt nie; jede Neuigkeit hat Art, Quelle und Link', async () => {
    await setzeBesuch(teamer, '40 minutes', null);
    const r = await besuch(teamer);
    const texte = r.neu.map((x: Heute) => x.text);
    expect(texte).toContain('Neuer Hinweis');
    expect(texte).not.toContain('Mein eigener Hinweis');
    const h = r.neu.find((x: Heute) => x.text === 'Neuer Hinweis');
    expect(h).toMatchObject({ art: 'hinweis', quelle: 'Sommer-Sause', url: `/freizeiten/${fz}/hinweise` });
    expect(r.neu.find((x: Heute) => x.art === 'plan')).toMatchObject({ url: `/freizeiten/${fz}/plan`, quelle: 'Sommer-Sause' });
  });

  it('jede Person sieht nur Neuigkeiten aus ihrem Bereich', async () => {
    await setzeBesuch(fk, '40 minutes', null); await setzeBesuch(tk, '40 minutes', null); await setzeBesuch(betr, '40 minutes', null);
    const arten = async (p: Person) => [...new Set((await besuch(p)).neu.map((x: Heute) => x.art))].sort();
    expect(await arten(fk)).toEqual(['absprache', 'bewerbung', 'hinweis', 'plan', 'vorschlag']);            // nichts aus den Treffs
    expect(await arten(tk)).toEqual(['absprache', 'kommentar', 'nachweis', 'notiz', 'protokoll', 'vorschlag']);       // nichts aus den Freizeiten
    expect(await arten(betr)).toEqual(['absprache', 'notiz']);                                                       // eigene Protokolle, Kommentare und Nachweise zählen nicht
  });

  it('innerhalb derselben Sitzung (unter 30 Minuten) bleibt der Bezugszeitpunkt gleich', async () => {
    await setzeBesuch(leitung, '40 minutes', '2 days');
    const a = await besuch(leitung);
    const b = await besuch(leitung);
    expect(b.seit).toBe(a.seit);
    expect(b.neu).toEqual(a.neu);
  });

  it('„Alles gesehen“: der nächste Besuch beginnt ab jetzt', async () => {
    await setzeBesuch(leitung, '40 minutes', '2 days');
    expect((await besuch(leitung)).neu.length).toBeGreaterThan(0);
    await als(db, leitung, () => q('select fn_besuch_quittieren()'));
    const r = await besuch(leitung);
    expect(r.neu).toEqual([]);
  });

  it('höchstens 30 Einträge, dazu die Gesamtzahl; nie weiter zurück als 30 Tage', async () => {
    await q(`insert into treff_aufgaben (treff_id, text, erstellt_von, created_at) select $1, 'Masse ' || g, $2, now() - interval '1 minute' from generate_series(1, 40) g`, [treff, tl.id]);
    await setzeBesuch(betr, '40 minutes', null);
    const r = await besuch(betr);
    expect(r.neu).toHaveLength(30);
    expect(r.neu_gesamt).toBeGreaterThan(40);
    await q(`insert into notizen (freizeit_id, art, text, erstellt_von, created_at) values ($1, 'hinweis', 'Vor 40 Tagen', $2, now() - interval '40 days')`, [fz, leitung.id]);
    await setzeBesuch(teamer, '40 minutes', '60 days');
    await besuch(teamer);
    await setzeBesuch(teamer, '40 minutes', '60 days');
    expect((await besuch(teamer)).neu.map((x: Heute) => x.text)).not.toContain('Vor 40 Tagen');
  });
});

describe('Rechte', () => {
  it('anonym nicht aufrufbar; Konto ohne Person bekommt einen Fehler', async () => {
    expect(await als(db, 'anon', () => fehler(() => q(`select fn_heute(current_date, '{}'::jsonb)`)))).toMatch(/permission denied/i);
    const ohne = await person(db, 'Ohne', { ohneKonto: true });
    await q(`insert into auth.users (email) values ('ohne-person@test.example')`);
    const uid = (await q<{ id: string }>(`select id from auth.users where email = 'ohne-person@test.example'`)).rows[0]!.id;
    expect(await als(db, { id: ohne.id, uid, mail: 'x' }, () => fehler(() => q(`select fn_heute(current_date, '{}'::jsonb)`)))).toMatch(/Nicht angemeldet/);
  });

  it('jede Person sieht und ändert nur ihren eigenen Besuchsstand', async () => {
    expect((await als(db, fremd, () => q('select * from besuche'))).rows).toEqual([]);
    const weg = await als(db, fremd, () => q(`update besuche set vorheriger_besuch = null`));
    expect(weg.affectedRows).toBe(0);
    expect(await als(db, fremd, () => fehler(() => q(`insert into besuche (person_id, letzter_kontakt) values ($1, now())`, [leitung.id])))).toMatch(/row-level security/i);
  });
});
