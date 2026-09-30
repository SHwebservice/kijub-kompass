import { describe, it, expect, beforeAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { neueDb, person, als, fehler, type Person } from './harness';

/** Migration 0015: Wer bekommt welche Mitteilung – und wer darf sie überhaupt auslösen. */
let db: PGlite;
let koord: Person, leitung: Person, t1: Person, t2: Person, tl: Person, b1: Person, b2: Person, fremd: Person, inaktiv: Person, bewerber: Person;
let fz: string, treff: string;

const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params);

interface Ergebnis { empfaenger: string[]; titel: string; text: string; url: string }
const push = async (wer: Person, art: string, ref: string | null = null, extra: object = {}): Promise<Ergebnis> =>
  (await als(db, wer, () => q<{ r: Ergebnis }>('select fn_push_vorbereiten($1, $2, $3::jsonb) as r', [art, ref, JSON.stringify(extra)]))).rows[0]!.r;
const pushFehler = (wer: Person, art: string, ref: string | null = null, extra: object = {}) =>
  als(db, wer, () => fehler(() => q('select fn_push_vorbereiten($1, $2, $3::jsonb)', [art, ref, JSON.stringify(extra)])));
const ids = (...p: Person[]) => p.map((x) => x.id).sort();
const sortiert = (e: Ergebnis) => [...e.empfaenger].sort();
const naechster = async (isodow: number) => (await q<{ d: string }>(`select (current_date + 1 + ((${isodow} - extract(isodow from current_date + 1)::int + 7) % 7))::text as d`)).rows[0]!.d;
/** Setzt die Bremse zurück, damit Tests unabhängig voneinander bleiben. */
const bremseLoesen = () => q('delete from mitteilungen_log');

beforeAll(async () => {
  db = await neueDb();
  koord = await person(db, 'Koord', { koordination: true, kategorie: 'Hauptamtliche*r' });
  leitung = await person(db, 'Leitung', { kategorie: 'Hauptamtliche*r' });
  t1 = await person(db, 'Teamer1');
  t2 = await person(db, 'Teamer2');
  tl = await person(db, 'Treffleitung', { kategorie: 'Hauptamtliche*r' });
  b1 = await person(db, 'Betreuer1', { kategorie: 'TZK' });
  b2 = await person(db, 'Betreuer2', { kategorie: 'FSJ' });
  fremd = await person(db, 'Fremd', { kategorie: 'Hauptamtliche*r' });
  inaktiv = await person(db, 'Inaktiv');
  bewerber = await person(db, 'Bewerber');

  fz = (await q<{ id: string }>(`insert into freizeiten (name, start_datum, ende_datum) values ('Sommer-Sause', current_date + 30, current_date + 34) returning id`)).rows[0]!.id;
  await q(`insert into freizeit_team values ($1, $2, 'leitung'), ($1, $3, 'teamer'), ($1, $4, 'teamer'), ($1, $5, 'teamer')`, [fz, leitung.id, t1.id, t2.id, inaktiv.id]);
  await q(`update personen set aktiv = false where id = $1`, [inaktiv.id]);
  treff = (await q<{ id: string }>(`insert into treffs (name) values ('Kindertreff') returning id`)).rows[0]!.id;
  await q(`insert into treff_team values ($1, $2, 'treffleitung'), ($1, $3, 'betreuerin'), ($1, $4, 'betreuerin')`, [treff, tl.id, b1.id, b2.id]);
  await q(`insert into treff_oeffnungszeiten values ($1, 1, '15:00', '19:00'), ($1, 3, '14:00', '18:00')`, [treff]);
});

describe('Zugang und Bremse', () => {
  it('ohne Anmeldung und für Inaktive nicht aufrufbar', async () => {
    expect(await als(db, 'anon', () => fehler(() => q(`select fn_push_vorbereiten('test')`)))).toMatch(/permission denied/i);
    expect(await pushFehler(inaktiv, 'test')).toMatch(/Nicht angemeldet/);
  });

  it('die Hilfsfunktionen sind von außen nicht aufrufbar; das Protokoll ist unsichtbar', async () => {
    expect(await als(db, koord, () => fehler(() => q(`select fn_push_name($1)`, [koord.id])))).toMatch(/permission denied/i);
    expect(await als(db, koord, () => fehler(() => q(`select fn_push_ziel('{"art":"alle"}'::jsonb)`)))).toMatch(/permission denied/i);
    await push(koord, 'test');
    expect(await als(db, koord, () => fehler(() => q('select * from mitteilungen_log')))).toMatch(/permission denied/i);
    expect(await als(db, koord, () => fehler(() => q(`delete from mitteilungen_log`)))).toMatch(/permission denied/i);
    await bremseLoesen();
  });

  it('dieselbe Mitteilung zweimal in kurzer Zeit wird abgelehnt, andere Inhalte nicht', async () => {
    await bremseLoesen();
    await push(tl, 'dienstplan', treff, { personen: [b1.id] });
    expect(await pushFehler(tl, 'dienstplan', treff, { personen: [b1.id] })).toMatch(/gerade schon gesendet/);
    const anders = await push(tl, 'dienstplan', treff, { personen: [b2.id] });
    expect(anders.empfaenger).toEqual([b2.id]);
  });

  it('höchstens 60 Mitteilungen pro Stunde und Person', async () => {
    await bremseLoesen();
    await q(`insert into mitteilungen_log (art, von_person) select 'test', $1 from generate_series(1, 60)`, [koord.id]);
    expect(await pushFehler(koord, 'test')).toMatch(/Zu viele Mitteilungen/);
    expect((await push(tl, 'test')).empfaenger).toEqual([tl.id]);        // andere Personen sind nicht betroffen
    await bremseLoesen();
  });

  it('unbekannte Arten werden abgelehnt; der Test geht nur an einen selbst', async () => {
    await bremseLoesen();
    expect(await pushFehler(koord, 'gibtsnicht')).toMatch(/Unbekannte Art/);
    const r = await push(b1, 'test');
    expect(r.empfaenger).toEqual([b1.id]);
    expect(r.titel).toBe('Testmitteilung');
  });
});

describe('Freizeiten', () => {
  const notiz = async (wer: Person, art: 'hinweis' | 'absprache', text: string) =>
    (await als(db, wer, () => q<{ id: string }>(`insert into notizen (freizeit_id, art, geltung, text) values ($1, $2, 'gesamt', $3) returning id`, [fz, art, text]))).rows[0]!.id;

  it('neuer Hinweis: an das Team der Freizeit (ohne Verfasser und Inaktive), mit Text und Link', async () => {
    await bremseLoesen();
    const id = await notiz(leitung, 'hinweis', 'Bitte Sonnencreme mitbringen');
    const r = await push(leitung, 'hinweis', id);
    expect(sortiert(r)).toEqual(ids(t1, t2));
    expect(r.titel).toBe('Neuer Hinweis · Sommer-Sause');
    expect(r.text).toBe('Bitte Sonnencreme mitbringen');
    expect(r.url).toBe(`/freizeiten/${fz}/hinweise`);
  });

  it('lange Texte werden gekürzt', async () => {
    await bremseLoesen();
    const id = await notiz(leitung, 'hinweis', 'x'.repeat(500));
    expect((await push(leitung, 'hinweis', id)).text).toHaveLength(140);
  });

  it('nur die Verfasserin oder der Verfasser löst aus – und nur für Frisches', async () => {
    await bremseLoesen();
    const id = await notiz(leitung, 'hinweis', 'Hinweis');
    expect(await pushFehler(t1, 'hinweis', id)).toMatch(/nicht zulässig/);
    expect(await pushFehler(koord, 'hinweis', id)).toMatch(/nicht zulässig/);
    await q(`update notizen set created_at = now() - interval '1 hour' where id = $1`, [id]);
    expect(await pushFehler(leitung, 'hinweis', id)).toMatch(/nicht zulässig/);
  });

  it('eine Absprache ist keine Hinweis-Mitteilung und umgekehrt', async () => {
    await bremseLoesen();
    const absprache = await notiz(leitung, 'absprache', 'Budget klären');
    expect(await pushFehler(leitung, 'hinweis', absprache)).toMatch(/nicht zulässig/);
    const hinweis = await notiz(leitung, 'hinweis', 'Hinweis 2');
    expect(await pushFehler(leitung, 'absprache_freizeit', hinweis)).toMatch(/nicht zulässig/);
  });

  it('neue Absprache: an die Koordination (ohne Verfasser)', async () => {
    await bremseLoesen();
    const id = await notiz(leitung, 'absprache', 'Budget klären');
    const r = await push(leitung, 'absprache_freizeit', id);
    expect(r.empfaenger).toEqual([koord.id]);
    expect(r.titel).toBe('Neue Absprache · Sommer-Sause');
  });

  it('schreibt die Koordination die Absprache, geht sie an die Leitung', async () => {
    await bremseLoesen();
    const id = await notiz(koord, 'absprache', 'Bitte melden');
    expect((await push(koord, 'absprache_freizeit', id)).empfaenger).toEqual([leitung.id]);
  });

  it('neue Bewerbung: an die Koordination; nur für die eigene, frische Bewerbung', async () => {
    await bremseLoesen();
    await als(db, bewerber, () => q(`insert into bewerbungen (person_id, freizeit_id) values ($1, $2)`, [bewerber.id, fz]));
    const r = await push(bewerber, 'bewerbung', fz);
    expect(r.empfaenger).toEqual([koord.id]);
    expect(r.text).toBe('Bewerber Test bewirbt sich für Sommer-Sause.');
    expect(r.url).toBe('/bewerbungen');
    expect(await pushFehler(t1, 'bewerbung', fz)).toMatch(/nicht zulässig/);
  });

  it('neuer Katalog-Vorschlag: an die Koordination', async () => {
    await bremseLoesen();
    const id = (await als(db, t1, () => q<{ id: string }>(`insert into angebot_vorschlaege (eingereicht_von, daten) values ($1, '{"name":"Kimspiel"}'::jsonb) returning id`, [t1.id]))).rows[0]!.id;
    const r = await push(t1, 'vorschlag', id);
    expect(r.empfaenger).toEqual([koord.id]);
    expect(r.text).toBe('Teamer1 Test: Kimspiel');
    expect(await pushFehler(t2, 'vorschlag', id)).toMatch(/nicht zulässig/);
  });
});

describe('Treffs und Dienstplan', () => {
  it('neue Treff-Absprache: an alle im Treff außer der Treffleitung selbst', async () => {
    await bremseLoesen();
    const id = (await als(db, tl, () => q<{ id: string }>(`insert into notizen (treff_id, art, geltung, text) values ($1, 'absprache', 'gesamt', 'Schlüssel bitte zurückgeben') returning id`, [treff]))).rows[0]!.id;
    const r = await push(tl, 'absprache_treff', id);
    expect(sortiert(r)).toEqual(ids(b1, b2));
    expect(r.url).toBe(`/treffs/${treff}/absprachen`);
  });

  it('Dienstplan geändert: nur an genannte Personen des Treffs', async () => {
    await bremseLoesen();
    const r = await push(tl, 'dienstplan', treff, { personen: [b1.id, fremd.id, tl.id] });
    expect(r.empfaenger).toEqual([b1.id]);                      // Fremde gehören nicht zum Treff, die Treffleitung bekommt nichts von sich selbst
    expect(r.text).toBe('Dein Dienstplan wurde geändert.');
    expect(r.url).toBe(`/treffs/${treff}/dienstplan`);
  });

  it('Dienstplan geändert: nur Treffleitung oder Koordination lösen aus', async () => {
    await bremseLoesen();
    expect(await pushFehler(b1, 'dienstplan', treff, { personen: [b2.id] })).toMatch(/nicht zulässig/);
    expect(await pushFehler(fremd, 'dienstplan', treff, { personen: [b2.id] })).toMatch(/nicht zulässig/);
    expect((await push(koord, 'dienstplan', treff, { personen: [b2.id] })).empfaenger).toEqual([b2.id]);
  });

  it('ohne genannte Personen gibt es keine Empfänger', async () => {
    await bremseLoesen();
    expect((await push(tl, 'dienstplan', treff, {})).empfaenger).toEqual([]);
  });

  it('neuer Kommentar: an alle im Treff außer dem Verfasser', async () => {
    await bremseLoesen();
    const montag = await naechster(1);
    const id = (await als(db, b1, () => q<{ id: string }>(
      `insert into dienstplan_kommentare (treff_id, woche_start, person_id, text) values ($1, $2, $3, 'Ich kann früher kommen') returning id`,
      [treff, montag, b1.id]))).rows[0]!.id;
    const r = await push(b1, 'dienstplan_kommentar', id);
    expect(sortiert(r)).toEqual(ids(tl, b2));
    expect(r.text).toBe('Betreuer1 Test: Ich kann früher kommen');
    expect(await pushFehler(b2, 'dienstplan_kommentar', id)).toMatch(/nicht zulässig/);
  });

  it('neuer Dienstwunsch: an die Treffleitung; nur mit echtem, frischem Wunsch', async () => {
    await bremseLoesen();
    const datum = await naechster(3);
    expect(await pushFehler(b1, 'wunsch_neu', treff, { datum })).toMatch(/nicht zulässig/);        // noch kein Wunsch
    await als(db, b1, () => q(`select fn_dienst_wunsch($1, $2)`, [treff, datum]));
    const r = await push(b1, 'wunsch_neu', treff, { datum });
    expect(r.empfaenger).toEqual([tl.id]);
    expect(r.text).toMatch(/^Betreuer1 Test wünscht den Dienst am \d\d\.\d\d\.\d{4}\.$/);
    expect(await pushFehler(b2, 'wunsch_neu', treff, { datum })).toMatch(/nicht zulässig/);        // fremder Wunsch
  });

  it('Wunsch beantwortet: nur an die Person, nur nach der Entscheidung und nur von der entscheidenden Person', async () => {
    await bremseLoesen();
    const datum = await naechster(1);
    await als(db, b2, () => q(`select fn_dienst_wunsch($1, $2)`, [treff, datum]));
    const dienst = (await q<{ id: string }>(`select id from dienste where treff_id = $1 and datum = $2`, [treff, datum])).rows[0]!.id;
    expect(await pushFehler(tl, 'wunsch_antwort', dienst, { person: b2.id })).toMatch(/nicht zulässig/);   // noch offen
    await als(db, tl, () => q(`select fn_wunsch_entscheiden($1, $2, true)`, [dienst, b2.id]));
    expect(await pushFehler(b2, 'wunsch_antwort', dienst, { person: b2.id })).toMatch(/nicht zulässig/);   // darf nur die Leitung
    const r = await push(tl, 'wunsch_antwort', dienst, { person: b2.id });
    expect(r.empfaenger).toEqual([b2.id]);
    expect(r.text).toMatch(/bestätigt\.$/);
  });

  it('abgelehnter Wunsch: Text „abgelehnt“', async () => {
    await bremseLoesen();
    const datum = await naechster(3);
    await als(db, b2, () => q(`select fn_dienst_wunsch($1, $2)`, [treff, datum]));
    const dienst = (await q<{ id: string }>(`select id from dienste where treff_id = $1 and datum = $2`, [treff, datum])).rows[0]!.id;
    await als(db, koord, () => q(`select fn_wunsch_entscheiden($1, $2, false)`, [dienst, b2.id]));
    expect((await push(koord, 'wunsch_antwort', dienst, { person: b2.id })).text).toMatch(/abgelehnt\.$/);
  });
});

describe('Manuelle Mitteilungen der Koordination', () => {
  const manuell = (wer: Person, ziel: object, titel = 'Hallo', text = 'Bitte lesen') => push(wer, 'manuell', null, { ziel, titel, text });

  it('nur die Koordination', async () => {
    await bremseLoesen();
    expect(await als(db, leitung, () => fehler(() => q(`select fn_push_vorbereiten('manuell', null, $1::jsonb)`, [JSON.stringify({ ziel: { art: 'alle' }, titel: 'x', text: 'y' })])))).toMatch(/Nur die Koordination/);
    expect(await als(db, tl, () => fehler(() => q(`select fn_push_vorschau('{"art":"alle"}'::jsonb)`)))).toMatch(/Nur die Koordination/);
  });

  it('an alle aktiven Personen außer der Absenderin', async () => {
    await bremseLoesen();
    const r = await manuell(koord, { art: 'alle' });
    expect(sortiert(r)).toEqual(ids(leitung, t1, t2, tl, b1, b2, fremd, bewerber));     // ohne Koord (Absender) und Inaktive
    expect(r.titel).toBe('Hallo');
    expect(r.url).toBe('/');
  });

  it('an die Koordination', async () => {
    await bremseLoesen();
    const zweite = await person(db, 'Koord2', { koordination: true, kategorie: 'Hauptamtliche*r' });
    expect((await manuell(koord, { art: 'koordination' })).empfaenger).toEqual([zweite.id]);
    await q(`delete from personen where id = $1`, [zweite.id]);
  });

  it('nach Kategorie: Leitungen bzw. TeamerInnen (Freizeiten und Treffs)', async () => {
    await bremseLoesen();
    expect(sortiert(await manuell(koord, { art: 'kategorie', kategorie: 'leitung' }))).toEqual(ids(leitung, tl));
    await bremseLoesen();
    expect(sortiert(await manuell(koord, { art: 'kategorie', kategorie: 'teamer' }))).toEqual(ids(t1, t2, b1, b2));
  });

  it('nach Freizeit, optional mit Rolle; nach Treff, optional mit Rolle', async () => {
    await bremseLoesen();
    expect(sortiert(await manuell(koord, { art: 'freizeit', id: fz }))).toEqual(ids(leitung, t1, t2));
    await bremseLoesen();
    expect(sortiert(await manuell(koord, { art: 'freizeit', id: fz, rolle: 'teamer' }))).toEqual(ids(t1, t2));
    await bremseLoesen();
    expect((await manuell(koord, { art: 'freizeit', id: fz, rolle: 'leitung' })).empfaenger).toEqual([leitung.id]);
    await bremseLoesen();
    expect(sortiert(await manuell(koord, { art: 'treff', id: treff }))).toEqual(ids(tl, b1, b2));
    await bremseLoesen();
    expect((await manuell(koord, { art: 'treff', id: treff, rolle: 'treffleitung' })).empfaenger).toEqual([tl.id]);
  });

  it('prüft Ziel, Rolle, Titel und Text', async () => {
    await bremseLoesen();
    const f = (extra: object) => als(db, koord, () => fehler(() => q(`select fn_push_vorbereiten('manuell', null, $1::jsonb)`, [JSON.stringify(extra)])));
    expect(await f({ ziel: { art: 'gibtsnicht' }, titel: 'a', text: 'b' })).toMatch(/Unbekanntes Ziel/);
    expect(await f({ ziel: { art: 'kategorie', kategorie: 'egal' }, titel: 'a', text: 'b' })).toMatch(/Unbekannte Kategorie/);
    expect(await f({ ziel: { art: 'freizeit', id: fz, rolle: 'chef' }, titel: 'a', text: 'b' })).toMatch(/Unbekannte Rolle/);
    expect(await f({ ziel: { art: 'alle' }, titel: ' ', text: 'b' })).toMatch(/Titel/);
    expect(await f({ ziel: { art: 'alle' }, titel: 'x'.repeat(81), text: 'b' })).toMatch(/Titel/);
    expect(await f({ ziel: { art: 'alle' }, titel: 'a', text: '' })).toMatch(/Text/);
    expect(await f({ ziel: { art: 'alle' }, titel: 'a', text: 'y'.repeat(301) })).toMatch(/Text/);
  });

  it('Vorschau: Anzahl, Namen und wie viele ein Gerät eingerichtet haben', async () => {
    await bremseLoesen();
    await q(`insert into push_abos (person_id, endpoint, p256dh, auth) values ($1, 'https://push.example/1', 'k', 'a'), ($1, 'https://push.example/2', 'k', 'a'), ($2, 'https://push.example/3', 'k', 'a')`, [t1.id, leitung.id]);
    const v = (await als(db, koord, () => q<{ v: { anzahl: number; personen: { id: string; name: string }[]; mit_geraet: number } }>(
      `select fn_push_vorschau($1::jsonb) as v`, [JSON.stringify({ art: 'freizeit', id: fz })]))).rows[0]!.v;
    expect(v.anzahl).toBe(3);
    expect(v.personen.map((p) => p.name)).toEqual(['Leitung Test', 'Teamer1 Test', 'Teamer2 Test']);
    expect(v.mit_geraet).toBe(2);                                // zwei Personen (t1 mit zwei Geräten, leitung mit einem)
    await q('delete from push_abos');
  });

  it('Vorschau zählt die Koordination selbst nicht mit', async () => {
    const v = (await als(db, koord, () => q<{ v: { anzahl: number } }>(`select fn_push_vorschau('{"art":"koordination"}'::jsonb) as v`))).rows[0]!.v;
    expect(v.anzahl).toBe(0);
  });
});

describe('Geräte (push_abos)', () => {
  it('jede Person verwaltet nur ihre eigenen Geräte', async () => {
    await als(db, t1, () => q(`insert into push_abos (person_id, endpoint, p256dh, auth) values ($1, 'https://push.example/a', 'k', 'a')`, [t1.id]));
    const msg = await als(db, t2, () => fehler(() => q(`insert into push_abos (person_id, endpoint, p256dh, auth) values ($1, 'https://push.example/b', 'k', 'a')`, [t1.id])));
    expect(msg).toMatch(/row-level security/i);
    expect((await als(db, t2, () => q('select * from push_abos'))).rows).toHaveLength(0);
    expect((await als(db, t1, () => q('select * from push_abos'))).rows).toHaveLength(1);
    const weg = await als(db, t2, () => q(`delete from push_abos where endpoint = 'https://push.example/a'`));
    expect(weg.affectedRows).toBe(0);
    await q('delete from push_abos');
  });
});
