import { describe, it, expect, beforeAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { neueDb, person, als, fehler, type Person } from './harness';

/** Migration 0017: Bewerbung angenommen, Nachweis eingereicht, Lebensmittel knapp oder leer. */
let db: PGlite;
let koord: Person, koord2: Person, leitung: Person, leitung2: Person, tl: Person, b1: Person, b2: Person, bewerber: Person, fremd: Person;
let fz: string, ort: string, treff: string, treffOhneLeitung: string;

const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params);

interface Ergebnis { empfaenger: string[]; titel: string; text: string; url: string }
const push = async (wer: Person, art: string, ref: string | null = null, extra: object = {}): Promise<Ergebnis> =>
  (await als(db, wer, () => q<{ r: Ergebnis }>('select fn_push_vorbereiten($1, $2, $3::jsonb) as r', [art, ref, JSON.stringify(extra)]))).rows[0]!.r;
const pushFehler = (wer: Person, art: string, ref: string | null = null, extra: object = {}) =>
  als(db, wer, () => fehler(() => q('select fn_push_vorbereiten($1, $2, $3::jsonb)', [art, ref, JSON.stringify(extra)])));
const bremseLoesen = () => q(`delete from mitteilungen_log where art <> 'lebensmittel'`);
const zaehleLog = async (art: string) => (await q<{ n: number }>(`select count(*)::int as n from mitteilungen_log where art = $1`, [art])).rows[0]!.n;

beforeAll(async () => {
  db = await neueDb();
  koord = await person(db, 'Koord', { koordination: true, kategorie: 'Hauptamtliche*r' });
  koord2 = await person(db, 'Koord2', { koordination: true, kategorie: 'Hauptamtliche*r' });
  leitung = await person(db, 'Leitung', { kategorie: 'Hauptamtliche*r' });
  leitung2 = await person(db, 'Leitung2', { kategorie: 'Hauptamtliche*r' });
  tl = await person(db, 'Treffleitung', { kategorie: 'Hauptamtliche*r' });
  b1 = await person(db, 'Betreuer1', { kategorie: 'TZK' });
  b2 = await person(db, 'Betreuer2', { kategorie: 'TZK' });
  bewerber = await person(db, 'Bewerber');
  fremd = await person(db, 'Fremd');

  ort = (await q<{ id: string }>(`insert into orte (name) values ('Mörscher Au') returning id`)).rows[0]!.id;
  fz = (await q<{ id: string }>(`insert into freizeiten (name, start_datum, ende_datum, ort_id) values ('Sommer-Sause', current_date + 30, current_date + 34, $1) returning id`, [ort])).rows[0]!.id;
  await q(`insert into freizeit_team values ($1, $2, 'leitung'), ($1, $3, 'leitung')`, [fz, leitung.id, leitung2.id]);
  treff = (await q<{ id: string }>(`insert into treffs (name) values ('Kindertreff') returning id`)).rows[0]!.id;
  treffOhneLeitung = (await q<{ id: string }>(`insert into treffs (name) values ('Treff Süd') returning id`)).rows[0]!.id;
  await q(`insert into treff_team values ($1, $2, 'treffleitung'), ($1, $3, 'betreuerin'), ($4, $3, 'betreuerin')`, [treff, tl.id, b1.id, treffOhneLeitung]);
});

describe('Bewerbung angenommen', () => {
  let bid: string;
  beforeAll(async () => {
    bid = (await q<{ id: string }>(`insert into bewerbungen (person_id, freizeit_id) values ($1, $2) returning id`, [bewerber.id, fz])).rows[0]!.id;
  });

  it('solange nichts entschieden ist, gibt es keine Mitteilung', async () => {
    expect(await pushFehler(koord, 'bewerbung_angenommen', bid)).toMatch(/nicht zulässig/);
  });

  it('nach der Annahme erfährt es die Person – mit Freizeit und Zeitraum, niemand sonst', async () => {
    await als(db, koord, () => q(`select fn_bewerbung_annehmen($1)`, [bid]));
    const e = await push(koord, 'bewerbung_angenommen', bid);
    expect(e.empfaenger).toEqual([bewerber.id]);
    expect(e.titel).toBe('Bewerbung angenommen');
    expect(e.text).toMatch(/^Du bist dabei: Sommer-Sause \(\d\d\.\d\d\.\d{4} – \d\d\.\d\d\.\d{4}\)\.$/);
    expect(e.url).toBe(`/freizeiten/${fz}`);
  });

  it('nur die Koordination, und nur die Person, die entschieden hat', async () => {
    await bremseLoesen();
    expect(await pushFehler(bewerber, 'bewerbung_angenommen', bid)).toMatch(/nicht zulässig/);
    expect(await pushFehler(fremd, 'bewerbung_angenommen', bid)).toMatch(/nicht zulässig/);
    expect(await pushFehler(koord2, 'bewerbung_angenommen', bid)).toMatch(/nicht zulässig/);        // hat nicht selbst entschieden
  });

  it('nach mehr als zehn Minuten nicht mehr', async () => {
    await bremseLoesen();
    await q(`update bewerbungen set entschieden_am = now() - interval '11 minutes' where id = $1`, [bid]);
    expect(await pushFehler(koord, 'bewerbung_angenommen', bid)).toMatch(/nicht zulässig/);
  });

  it('eine abgelehnte Bewerbung löst nichts aus', async () => {
    const b = (await q<{ id: string }>(`insert into bewerbungen (person_id, freizeit_id) values ($1, $2) returning id`, [fremd.id, fz])).rows[0]!.id;
    await als(db, koord, () => q(`select fn_bewerbung_ablehnen($1)`, [b]));
    expect(await pushFehler(koord, 'bewerbung_angenommen', b)).toMatch(/nicht zulässig/);
    const z = (await q<{ entschieden_am: string | null }>(`select entschieden_am from bewerbungen where id = $1`, [b])).rows[0]!;
    expect(z.entschieden_am).not.toBeNull();
  });
});

describe('Nachweis eingereicht', () => {
  let nid: string, nohne: string;
  beforeAll(async () => {
    nid = (await q<{ id: string }>(`insert into zeitnachweise (treff_id, person_id, monat, status) values ($1, $2, '2027-03-01', 'eingereicht') returning id`, [treff, b1.id])).rows[0]!.id;
    nohne = (await q<{ id: string }>(`insert into zeitnachweise (treff_id, person_id, monat, status) values ($1, $2, '2027-04-01', 'eingereicht') returning id`, [treffOhneLeitung, b1.id])).rows[0]!.id;
  });

  it('die Treffleitung erfährt es, mit Name, Monat und Link', async () => {
    const e = await push(b1, 'nachweis_eingereicht', nid);
    expect(e.empfaenger).toEqual([tl.id]);
    expect(e.titel).toBe('Nachweis eingereicht · Kindertreff');
    expect(e.text).toBe('Betreuer1 Test hat den Nachweis für März 2027 eingereicht.');
    expect(e.url).toBe(`/treffs/${treff}/nachweis`);
  });

  it('ohne Treffleitung geht es an die Koordination', async () => {
    const e = await push(b1, 'nachweis_eingereicht', nohne);
    expect([...e.empfaenger].sort()).toEqual([koord.id, koord2.id].sort());
    expect(e.text).toContain('April 2027');
  });

  it('nur die Person selbst kann es auslösen – nicht Treffleitung, Koordination oder andere', async () => {
    await bremseLoesen();
    for (const wer of [tl, koord, b2, fremd]) expect(await pushFehler(wer, 'nachweis_eingereicht', nid)).toMatch(/nicht zulässig/);
  });

  it('nur im Status „eingereicht“ und nur frisch', async () => {
    await bremseLoesen();
    await q(`update zeitnachweise set status = 'entwurf' where id = $1`, [nid]);
    expect(await pushFehler(b1, 'nachweis_eingereicht', nid)).toMatch(/nicht zulässig/);
    await q(`update zeitnachweise set status = 'eingereicht' where id = $1`, [nid]);
    await q(`alter table zeitnachweise disable trigger zeitnachweise_touch`);
    await q(`update zeitnachweise set updated_at = now() - interval '11 minutes' where id = $1`, [nid]);
    await q(`alter table zeitnachweise enable trigger zeitnachweise_touch`);
    expect(await pushFehler(b1, 'nachweis_eingereicht', nid)).toMatch(/nicht zulässig/);
  });
});

describe('Lebensmittel knapp oder leer', () => {
  const eingang = (name: string, menge: number, einheit: string) =>
    q(`insert into lebensmittel_eingang (ort_id, freizeit_id, name, menge, einheit, erstellt_von) values ($1, $2, $3, $4, $5, $6)`, [ort, fz, name, menge, einheit, koord.id]);
  const verbrauch = (wer: Person, name: string, menge: number) =>
    als(db, wer, () => q(`insert into lebensmittel_verbrauch (ort_id, freizeit_id, name, menge, datum) values ($1, $2, $3, $4, current_date)`, [ort, fz, name, menge]));

  beforeAll(async () => {
    await eingang('Milch', 10, 'l');
    await eingang('Reis', 100, 'kg');
  });

  it('wird ein Artikel knapp, erfährt es die Koordination – mit Ort, Artikel und Rest', async () => {
    await verbrauch(leitung, 'Milch', 8);                               // Rest 2 von 10 → knapp
    const e = await push(leitung, 'lebensmittel', ort, { name: 'Milch' });
    expect([...e.empfaenger].sort()).toEqual([koord.id, koord2.id].sort());
    expect(e.titel).toBe('Lebensmittel knapp');
    expect(e.text).toBe('Mörscher Au: Milch wird knapp (noch 2 l).');
    expect(e.url).toBe(`/freizeiten/${fz}/lebensmittel`);
  });

  it('dieselbe Lage wird nicht noch einmal gemeldet (auch nicht von einer anderen Leitung)', async () => {
    await verbrauch(leitung2, 'Milch', 0.5);                            // Rest 1,5 – weiterhin „knapp“
    const e = await push(leitung2, 'lebensmittel', ort, { name: 'Milch' });
    expect(e.empfaenger).toEqual([]);
    expect(await zaehleLog('lebensmittel')).toBe(1);
  });

  it('wird er leer, gibt es eine neue Mitteilung; Dezimalstellen mit Komma', async () => {
    await verbrauch(leitung, 'Milch', 1.5);                              // Rest 0 → leer
    const e = await push(leitung, 'lebensmittel', ort, { name: 'Milch' });
    expect(e.titel).toBe('Lebensmittel aufgebraucht');
    expect(e.text).toBe('Mörscher Au: Milch ist aufgebraucht.');
    await eingang('Saft', 4, 'l');
    await verbrauch(leitung, 'Saft', 3.25);                              // Rest 0,75 von 4 → knapp
    const s = await push(leitung, 'lebensmittel', ort, { name: 'Saft' });
    expect(s.text).toBe('Mörscher Au: Saft wird knapp (noch 0,75 l).');
  });

  it('ist noch genug da, gibt es weder Empfänger noch einen Protokolleintrag', async () => {
    const vorher = await zaehleLog('lebensmittel');
    await verbrauch(leitung, 'Reis', 1);
    const e = await push(leitung, 'lebensmittel', ort, { name: 'Reis' });
    expect(e.empfaenger).toEqual([]);
    expect(await zaehleLog('lebensmittel')).toBe(vorher);
  });

  it('die Koordination löst ihre eigene Buchung nicht an sich selbst aus, die andere erfährt es', async () => {
    await eingang('Brot', 10, 'Stück');
    await verbrauch(koord, 'Brot', 9);
    const e = await push(koord, 'lebensmittel', ort, { name: 'Brot' });
    expect(e.empfaenger).toEqual([koord2.id]);
  });

  it('ohne frische eigene Buchung des Artikels ist es nicht zulässig', async () => {
    await bremseLoesen();
    expect(await pushFehler(tl, 'lebensmittel', ort, { name: 'Milch' })).toMatch(/nicht zulässig/);          // keine Leitung am Ort
    expect(await pushFehler(leitung, 'lebensmittel', ort, { name: 'Gibt es nicht' })).toMatch(/nicht zulässig/);
    await q(`update lebensmittel_verbrauch set created_at = now() - interval '11 minutes' where name = 'Saft'`);
    expect(await pushFehler(leitung, 'lebensmittel', ort, { name: 'Saft' })).toMatch(/nicht zulässig/);
    expect(await pushFehler(leitung, 'lebensmittel', ort, {})).toMatch(/nicht zulässig/);
  });
});
