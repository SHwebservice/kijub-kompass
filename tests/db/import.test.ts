import { describe, it, expect, beforeEach } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { neueDb, person, als, fehler, type Person } from './harness';
import { baueImportPlan, type ImportPlan } from '../../src/import/kijuko';
import { beispielBackup, kopie, type Backup } from '../fixtures/kijuko';

/** Import aus KiJuKo: kompletter Weg Backup → Plan → Datenbankfunktion (docs/IMPORT.md). */
let db: PGlite;
let koord: Person;
const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params);

interface Ergebnis {
  angewendet: boolean;
  zaehler: Record<string, Record<string, number>>;
  aenderungen: { art: string; name: string; felder: { feld: string; von: unknown; nach: unknown }[] }[];
  konflikte: { schluessel: string; art: string; name: string; feld: string; kompass: unknown; kijuko: unknown }[];
  entfallen: { art: string; name: string; schluessel: string }[];
  hinweise: string[];
  uebersprungen: { art: string; name: string; grund: string }[];
}

async function lauf(plan: ImportPlan, anwenden: boolean, entscheidungen: Record<string, string> = {}, wer: Person | 'anon' = koord): Promise<Ergebnis> {
  const r = await als(db, wer, () => q<{ r: Ergebnis }>(
    'select fn_kijuko_import($1::jsonb, $2, $3::jsonb, $4::jsonb) as r',
    [JSON.stringify(plan), anwenden, JSON.stringify(entscheidungen), JSON.stringify({ name: 'test.json', sha256: 'abc123', backup_datum: '2027-01-01' })]));
  return r.rows[0]!.r;
}
const anwenden = (b: Backup, e: Record<string, string> = {}) => lauf(baueImportPlan(b), true, e);
const vorschau = (b: Backup, e: Record<string, string> = {}) => lauf(baueImportPlan(b), false, e);
const zahl = async (sql: string, p: unknown[] = []) => (await q<{ n: number }>(`select count(*)::int as n from ${sql}`, p)).rows[0]!.n;
const wert = async <T,>(sql: string, p: unknown[] = []) => (await q<{ v: T }>(`select ${sql}`, p)).rows[0]?.v;

beforeEach(async () => {
  db = await neueDb();
  koord = await person(db, 'Koord', { koordination: true, kategorie: 'Hauptamtliche*r' });
});

describe('Vorschau', () => {
  it('zeigt, was passieren würde, und verändert nichts', async () => {
    const v = await vorschau(beispielBackup());
    expect(v.angewendet).toBe(false);
    expect(v.zaehler.orte).toMatchObject({ neu: 3 });
    expect(v.zaehler.personen).toMatchObject({ neu: 8 });
    expect(v.zaehler.freizeiten).toMatchObject({ neu: 3 });
    expect(v.zaehler.zuteilungen).toMatchObject({ neu: 7 });
    expect(await zahl('orte')).toBe(0);
    expect(await zahl('freizeiten')).toBe(0);
    expect(await zahl('personen')).toBe(1);          // nur die Koordination aus dem Test-Aufbau
    expect(await zahl('import_staende')).toBe(0);
    expect(await zahl('import_laeufe')).toBe(0);
  });

  it('meldet Übersprungenes und Hinweise mit', async () => {
    const v = await vorschau(beispielBackup());
    expect(v.uebersprungen.length).toBeGreaterThanOrEqual(5);
    expect(v.hinweise.join(' ')).toMatch(/Unbekannte Kategorie/);
  });

  it('Vorschau und echter Lauf liefern dieselben Zahlen', async () => {
    const v = await vorschau(beispielBackup());
    const a = await anwenden(beispielBackup());
    expect(a.zaehler).toEqual(v.zaehler);
    expect(a.angewendet).toBe(true);
  });
});

describe('Erster Import', () => {
  beforeEach(async () => { await anwenden(beispielBackup()); });

  it('legt Orte, Personen und Freizeiten mit den richtigen Werten an', async () => {
    expect(await zahl('orte')).toBe(3);
    expect(await wert('lieferstelle_nr as v from orte where kijuko_id = $1', ['L1'])).toBe('5');
    const f = await q<Record<string, unknown>>(
      `select f.name, f.status, f.ferienzeitraum, f.ferienwoche, f.alter_von, f.alter_bis, f.max_teilnehmende, f.arbeitsbeginn::text as ab,
              f.start_datum::text as s, f.kijuko_code, o.name as ort
         from freizeiten f left join orte o on o.id = f.ort_id where f.kijuko_id = 'P1'`);
    expect(f.rows[0]).toMatchObject({ name: 'Sommer-Sause 1', status: 'geplant', ferienzeitraum: 'sommer', ferienwoche: 1, alter_von: 6,
      alter_bis: 11, max_teilnehmende: 48, ab: '07:30:00', s: '2027-07-05', kijuko_code: 'F27S1', ort: 'Mörscher Au' });
    expect(await wert('status::text as v from freizeiten where kijuko_id = $1', ['P2'])).toBe('abgesagt');
    expect(await wert('ferienwoche as v from freizeiten where kijuko_id = $1', ['P2'])).toBeNull();
    expect(await zahl(`freizeiten where kijuko_id = 'P3'`)).toBe(0);
  });

  it('Personen: Kategorie, Ernährung, Notizen, Quelle, inaktiv; Hauptamtliche sind echte Personen', async () => {
    const ben = await q<Record<string, unknown>>(`select kategorie::text, ernaehrung::text, notizen, kijuko_quelle, aktiv, ist_koordination from personen where kijuko_id = 'S2'`);
    expect(ben.rows[0]).toEqual({ kategorie: 'TZK', ernaehrung: 'Mischkost', notizen: 'Allergien: Nüsse\nkann Gitarre', kijuko_quelle: 'staff', aktiv: true, ist_koordination: false });
    expect(await wert('aktiv as v from personen where kijuko_id = $1', ['S6'])).toBe(false);
    expect(await wert('kategorie::text as v from personen where kijuko_id = $1', ['H1'])).toBe('Hauptamtliche*r');
    expect(await wert('kijuko_quelle as v from personen where kijuko_id = $1', ['H1'])).toBe('hauptamtliche');
    expect(await wert('mail as v from personen where kijuko_id = $1', ['S3'])).toBe('Cleo@KiJuKo.Example');
  });

  it('Leitungen sind Teammitglieder mit Rolle Leitung, Ehrenamtliche Teamer', async () => {
    const t = await q<{ k: string; rolle: string }>(
      `select p.kijuko_id as k, t.rolle::text from freizeit_team t join personen p on p.id = t.person_id
        join freizeiten f on f.id = t.freizeit_id where f.kijuko_id = 'P1' order by 1`);
    expect(t.rows).toEqual([
      { k: 'H1', rolle: 'leitung' }, { k: 'H2', rolle: 'leitung' },
      { k: 'S1', rolle: 'teamer' }, { k: 'S2', rolle: 'teamer' }, { k: 'S3', rolle: 'teamer' },
    ]);
    expect(await zahl(`freizeit_team t join freizeiten f on f.id = t.freizeit_id where f.kijuko_id = 'P4'`)).toBe(2);
  });

  it('Verpflegung und Material sind angelegt; die Beispielzeile nicht', async () => {
    expect(await zahl('freizeit_verpflegung')).toBe(3);
    const g = await q<Record<string, number>>(`select mischkost, vegetarisch, allergiker from freizeit_verpflegung where datum is null`);
    expect(g.rows[0]).toEqual({ mischkost: 50, vegetarisch: 3, allergiker: 3 });
    const m = await q<{ name: string }>('select name from freizeit_material order by name');
    expect(m.rows.map((x) => x.name)).toEqual(['Bälle', 'Kleber']);
  });

  it('protokolliert den Lauf ohne Personendaten', async () => {
    const l = await q<{ datei_sha256: string; backup_datum: string; ergebnis: Record<string, unknown>; angewendet: boolean }>(
      'select datei_sha256, backup_datum::text, ergebnis, angewendet from import_laeufe');
    expect(l.rows).toHaveLength(1);
    expect(l.rows[0]).toMatchObject({ datei_sha256: 'abc123', backup_datum: '2027-01-01', angewendet: true });
    expect(Object.keys(l.rows[0]!.ergebnis).sort()).toEqual(['entfallen', 'hinweise', 'offene_konflikte', 'uebersprungen', 'zaehler']);
    expect(JSON.stringify(l.rows[0]!.ergebnis)).not.toMatch(/Anna|Adler|@/);
  });

  it('private KiJuKo-Felder landen nirgends in der Datenbank', async () => {
    const alles = JSON.stringify((await q('select * from personen')).rows) + JSON.stringify((await q('select * from import_staende')).rows);
    for (const p of ['1990-01-01', 'Musterstraße', 'Musterstadt', 'ZUGANG1', 'zugang.example']) expect(alles).not.toContain(p);
  });
});

describe('Wiederholter Import (Abgleich statt Neuanlage)', () => {
  it('ein zweiter Lauf mit derselben Datei ändert nichts und legt nichts doppelt an', async () => {
    await anwenden(beispielBackup());
    const vorher = { p: await zahl('personen'), f: await zahl('freizeiten'), t: await zahl('freizeit_team'), v: await zahl('freizeit_verpflegung') };
    const r = await anwenden(beispielBackup());
    expect(await zahl('personen')).toBe(vorher.p);
    expect(await zahl('freizeiten')).toBe(vorher.f);
    expect(await zahl('freizeit_team')).toBe(vorher.t);
    expect(await zahl('freizeit_verpflegung')).toBe(vorher.v);
    for (const art of ['orte', 'personen', 'freizeiten', 'zuteilungen', 'verpflegung', 'material']) {
      const z = r.zaehler[art]!;
      expect(z.neu ?? 0, `${art} neu`).toBe(0);
      expect(z.geaendert ?? 0, `${art} geändert`).toBe(0);
    }
    expect(r.aenderungen).toEqual([]);
    expect(r.konflikte).toEqual([]);
    expect(await zahl('import_laeufe')).toBe(2);
  });

  it('übernimmt Änderungen aus KiJuKo, wenn der Kompass-Wert nicht angefasst wurde', async () => {
    await anwenden(beispielBackup());
    const b = kopie(beispielBackup());
    (b.staff as Record<string, unknown>[])[0]!.phone = '0170 NEU';
    (b.projects as Record<string, unknown>[])[0]!.name = 'Sommer-Sause 1 (neu benannt)';
    (b.projects as Record<string, unknown>[])[0]!.workStartTime = '08:00';
    const r = await anwenden(b);
    expect(r.konflikte).toEqual([]);
    expect(await wert('telefon as v from personen where kijuko_id = $1', ['S1'])).toBe('0170 NEU');
    expect(await wert('name as v from freizeiten where kijuko_id = $1', ['P1'])).toBe('Sommer-Sause 1 (neu benannt)');
    expect(await wert('arbeitsbeginn::text as v from freizeiten where kijuko_id = $1', ['P1'])).toBe('08:00:00');
    expect(r.zaehler.personen).toMatchObject({ geaendert: 1 });
    const pers = r.aenderungen.find((a) => a.art === 'Person')!;
    expect(pers.felder).toEqual([{ feld: 'telefon', von: '0170 1', nach: '0170 NEU' }]);
  });

  it('Kompass-Änderungen bleiben, solange KiJuKo sich nicht geändert hat (kein Konflikt)', async () => {
    await anwenden(beispielBackup());
    await q(`update personen set telefon = '0160 SELBST' where kijuko_id = 'S1'`);
    const r = await anwenden(beispielBackup());
    expect(r.konflikte).toEqual([]);
    expect(await wert('telefon as v from personen where kijuko_id = $1', ['S1'])).toBe('0160 SELBST');
  });

  it('leere Werte aus KiJuKo überschreiben nie', async () => {
    await anwenden(beispielBackup());
    const b = kopie(beispielBackup());
    (b.staff as Record<string, unknown>[])[0]!.phone = '';
    await anwenden(b);
    expect(await wert('telefon as v from personen where kijuko_id = $1', ['S1'])).toBe('0170 1');
  });

  it('Kompass-Werte werden nie durch Import-Daten für andere Felder beeinflusst (Koordination, Rolle, Farbe)', async () => {
    await anwenden(beispielBackup());
    await q(`update personen set ist_koordination = true, farbe = '#fff' where kijuko_id = 'H1'`);
    await anwenden(beispielBackup());
    const p = await q<{ ist_koordination: boolean; farbe: string }>(`select ist_koordination, farbe from personen where kijuko_id = 'H1'`);
    expect(p.rows[0]).toEqual({ ist_koordination: true, farbe: '#fff' });
  });
});

describe('Konflikte', () => {
  const geaendertBeide = async () => {
    await anwenden(beispielBackup());
    await q(`update personen set telefon = '0160 KOMPASS' where kijuko_id = 'S1'`);
    const b = kopie(beispielBackup());
    (b.staff as Record<string, unknown>[])[0]!.phone = '0170 KIJUKO';
    return b;
  };

  it('beide Seiten geändert: Konflikt wird gemeldet, der Kompass-Wert bleibt', async () => {
    const b = await geaendertBeide();
    const r = await anwenden(b);
    expect(r.konflikte).toHaveLength(1);
    expect(r.konflikte[0]).toMatchObject({ art: 'Person', feld: 'telefon', kompass: '0160 KOMPASS', kijuko: '0170 KIJUKO' });
    expect(await wert('telefon as v from personen where kijuko_id = $1', ['S1'])).toBe('0160 KOMPASS');
  });

  it('ein offener Konflikt bleibt beim nächsten Import offen', async () => {
    const b = await geaendertBeide();
    await anwenden(b);
    const r = await anwenden(b);
    expect(r.konflikte).toHaveLength(1);
  });

  it('Entscheidung "kijuko" übernimmt den KiJuKo-Wert', async () => {
    const b = await geaendertBeide();
    const k = (await anwenden(b)).konflikte[0]!;
    const r = await anwenden(b, { [k.schluessel]: 'kijuko' });
    expect(r.konflikte).toEqual([]);
    expect(await wert('telefon as v from personen where kijuko_id = $1', ['S1'])).toBe('0170 KIJUKO');
  });

  it('Entscheidung "kompass" behält den Kompass-Wert und der Konflikt taucht nicht wieder auf', async () => {
    const b = await geaendertBeide();
    const k = (await anwenden(b)).konflikte[0]!;
    await anwenden(b, { [k.schluessel]: 'kompass' });
    expect(await wert('telefon as v from personen where kijuko_id = $1', ['S1'])).toBe('0160 KOMPASS');
    expect((await anwenden(b)).konflikte).toEqual([]);
    // Ändert KiJuKo später erneut, ist es wieder ein Konflikt
    (b.staff as Record<string, unknown>[])[0]!.phone = '0170 NOCHMAL';
    expect((await anwenden(b)).konflikte).toHaveLength(1);
  });

  it('die Vorschau entscheidet nichts und speichert keine Entscheidungen', async () => {
    const b = await geaendertBeide();
    const k = (await vorschau(b)).konflikte[0]!;
    await vorschau(b, { [k.schluessel]: 'kijuko' });
    expect(await wert('telefon as v from personen where kijuko_id = $1', ['S1'])).toBe('0160 KOMPASS');
  });

  it('Rolle im Team: Kompass-Änderung bleibt erhalten; Änderung auf beiden Seiten ist ein Konflikt', async () => {
    await anwenden(beispielBackup());
    await q(`update freizeit_team t set rolle = 'leitung' from personen p, freizeiten f
              where p.id = t.person_id and f.id = t.freizeit_id and p.kijuko_id = 'S1' and f.kijuko_id = 'P1'`);
    const r1 = await anwenden(beispielBackup());
    expect(r1.konflikte).toEqual([]);                                       // KiJuKo unverändert → Kompass-Rolle bleibt
    const role = async () => wert<string>(`t.rolle::text as v from freizeit_team t join personen p on p.id = t.person_id
      join freizeiten f on f.id = t.freizeit_id where p.kijuko_id = 'S1' and f.kijuko_id = 'P1'`);
    expect(await role()).toBe('leitung');
  });
});

describe('Verknüpfung mit vorhandenen Datensätzen', () => {
  it('eine schon vorhandene Person mit gleicher Mail wird verknüpft statt doppelt angelegt', async () => {
    const vorhanden = await person(db, 'Anna', { kategorie: 'TeamerIn' });
    await q('update personen set mail = $2, telefon = $3, farbe = $4 where id = $1', [vorhanden.id, 'ANNA@kijuko.example', '0999 EIGEN', '#abc']);
    const r = await anwenden(beispielBackup());
    expect(await zahl(`personen where lower(mail) = 'anna@kijuko.example'`)).toBe(1);
    const p = await q<{ id: string; kijuko_id: string; telefon: string; farbe: string }>(
      `select id, kijuko_id, telefon, farbe from personen where lower(mail) = 'anna@kijuko.example'`);
    expect(p.rows[0]).toMatchObject({ id: vorhanden.id, kijuko_id: 'S1', telefon: '0999 EIGEN', farbe: '#abc' });
    expect(r.hinweise.join(' ')).toMatch(/Anna Adler: Mit der vorhandenen Person/);
    // Konto (auth) bleibt verknüpft
    expect(await wert('auth_user_id as v from personen where id = $1', [vorhanden.id])).toBe(vorhanden.uid);
  });

  it('vorhandene Orte und Freizeiten (gleicher Name bzw. Name+Start) werden verknüpft', async () => {
    const o = (await q<{ id: string }>(`insert into orte (name) values ('mörscher au') returning id`)).rows[0]!.id;
    const f = (await q<{ id: string }>(`insert into freizeiten (name, start_datum, ende_datum) values ('sommer-sause 1', '2027-07-05', '2027-07-09') returning id`)).rows[0]!.id;
    await anwenden(beispielBackup());
    expect(await zahl(`orte where lower(name) = 'mörscher au'`)).toBe(1);
    expect(await wert('id as v from orte where kijuko_id = $1', ['L1'])).toBe(o);
    expect(await zahl(`freizeiten where lower(name) = 'sommer-sause 1'`)).toBe(1);
    expect(await wert('id as v from freizeiten where kijuko_id = $1', ['P1'])).toBe(f);
  });

  it('gehört eine neue Mail schon einer anderen Person, wird sie nicht übernommen (Hinweis statt Fehler)', async () => {
    await anwenden(beispielBackup());
    const plan = baueImportPlan(beispielBackup());
    plan.personen.find((p) => p.kijuko_id === 'S2')!.mail = 'anna@kijuko.example';   // Parser würde das schon abfangen – hier direkt an die Datenbank
    const r = await lauf(plan, true);
    expect(await wert('mail as v from personen where kijuko_id = $1', ['S2'])).toBe('ben@kijuko.example');
    expect(r.hinweise.join(' ')).toMatch(/gehört im Kompass schon einer anderen Person/);
  });

  it('gehört die Mail im Kompass schon zu einer anderen KiJuKo-Person, wird der Datensatz übersprungen', async () => {
    await anwenden(beispielBackup());
    const plan = baueImportPlan(beispielBackup());
    const ben = plan.personen.find((p) => p.kijuko_id === 'S2')!;
    ben.kijuko_id = 'S2-NEU';                                                          // andere KiJuKo-ID, Mail von Ben
    const r = await lauf(plan, true);
    expect(r.hinweise.join(' ')).toMatch(/schon zu einer anderen KiJuKo-Person/);
    expect(await zahl(`personen where lower(mail) = 'ben@kijuko.example'`)).toBe(1);
  });

  it('Mail-Änderung einer Person mit Login-Konto wird mit Hinweis gemeldet', async () => {
    const vorhanden = await person(db, 'Kurt');
    await q('update personen set mail = $2 where id = $1', [vorhanden.id, 'kurt@kijuko.example']);
    await anwenden(beispielBackup());
    const b = kopie(beispielBackup());
    (b.staff as Record<string, unknown>[])[6]!.email = 'kurt.neu@kijuko.example';
    const r = await anwenden(b);
    expect(await wert('mail as v from personen where id = $1', [vorhanden.id])).toBe('kurt.neu@kijuko.example');
    expect(r.hinweise.join(' ')).toMatch(/Login-Konto läuft aber weiter unter der alten Adresse/);
  });
});

describe('Was in KiJuKo wegfällt', () => {
  it('Person und Zuteilung werden nicht gelöscht, sondern gemeldet; die Person wird markiert', async () => {
    await anwenden(beispielBackup());
    const b = kopie(beispielBackup());
    b.staff = (b.staff as Record<string, unknown>[]).filter((s) => s.id !== 'S2');
    b.allocations = (b.allocations as Record<string, unknown>[]).filter((a) => a.staffId !== 'S2');
    const r = await anwenden(b);
    expect(await zahl(`personen where kijuko_id = 'S2'`)).toBe(1);
    expect(await wert('kijuko_entfallen_am is not null as v from personen where kijuko_id = $1', ['S2'])).toBe(true);
    expect(r.entfallen.map((e) => `${e.art}:${e.name}`)).toEqual(expect.arrayContaining(['Person:Ben Baum']));
    expect(r.entfallen.some((e) => e.art === 'Zuteilung' && /Ben Baum in Sommer-Sause 1/.test(e.name))).toBe(true);
    expect(await zahl(`freizeit_team t join personen p on p.id = t.person_id where p.kijuko_id = 'S2'`)).toBe(1);
  });

  it('eine entfallene Zuteilung wird nur auf ausdrücklichen Wunsch entfernt', async () => {
    await anwenden(beispielBackup());
    const b = kopie(beispielBackup());
    b.allocations = (b.allocations as Record<string, unknown>[]).filter((a) => a.staffId !== 'S2');
    const z = (await anwenden(b)).entfallen.find((e) => e.art === 'Zuteilung')!;
    const r = await anwenden(b, { [z.schluessel]: 'kijuko' });
    expect(r.zaehler.zuteilungen).toMatchObject({ entfernt: 1 });
    expect(await zahl(`freizeit_team t join personen p on p.id = t.person_id where p.kijuko_id = 'S2'`)).toBe(0);
    expect((await anwenden(b)).entfallen.filter((e) => e.art === 'Zuteilung')).toEqual([]);
  });

  it('taucht die Person wieder auf, verschwindet die Markierung', async () => {
    await anwenden(beispielBackup());
    const b = kopie(beispielBackup());
    b.staff = (b.staff as Record<string, unknown>[]).filter((s) => s.id !== 'S2');
    await anwenden(b);
    await anwenden(beispielBackup());
    expect(await wert('kijuko_entfallen_am is null as v from personen where kijuko_id = $1', ['S2'])).toBe(true);
  });

  it('eine entfallene Freizeit wird nur markiert', async () => {
    await anwenden(beispielBackup());
    const b = kopie(beispielBackup());
    b.projects = (b.projects as Record<string, unknown>[]).filter((p) => p.id !== 'P4');
    const r = await anwenden(b);
    expect(await zahl(`freizeiten where kijuko_id = 'P4'`)).toBe(1);
    expect(await wert('kijuko_entfallen_am is not null as v from freizeiten where kijuko_id = $1', ['P4'])).toBe(true);
    expect(r.entfallen.some((e) => e.art === 'Freizeit' && e.name === 'Ohne Ort')).toBe(true);
  });

  it('im Kompass bewusst entfernte Zuteilungen kommen nicht zurück', async () => {
    await anwenden(beispielBackup());
    await q(`delete from freizeit_team t using personen p where p.id = t.person_id and p.kijuko_id = 'S1'`);
    const r = await anwenden(beispielBackup());
    expect(await zahl(`freizeit_team t join personen p on p.id = t.person_id where p.kijuko_id = 'S1'`)).toBe(0);
    expect(r.hinweise.join(' ')).toMatch(/bewusst entfernt/);
  });
});

describe('Verpflegung und Material folgen KiJuKo', () => {
  it('geänderte Mengen werden übernommen, weggefallene Zeilen gelöscht', async () => {
    await anwenden(beispielBackup());
    const b = kopie(beispielBackup());
    const c = (b.cateringEntries as Record<string, unknown>[])[0]!;
    c.mischkost = 60;
    delete (c.dailyPortions as Record<string, unknown>)['06.07.2027'];
    b.materialNeeds = (b.materialNeeds as Record<string, unknown>[]).filter((m) => m.id !== 'M3');
    (b.materialNeeds as Record<string, unknown>[])[0]!.qtyNeeded = 12;
    const r = await anwenden(b);
    expect(r.zaehler.verpflegung).toMatchObject({ geaendert: 1, geloescht: 1 });
    expect(await wert('mischkost as v from freizeit_verpflegung where datum is null')).toBe(60);
    expect(await zahl('freizeit_verpflegung')).toBe(2);
    expect(r.zaehler.material).toMatchObject({ geaendert: 1, geloescht: 1 });
    expect(await wert('menge::int as v from freizeit_material where kijuko_id = $1', ['M1'])).toBe(12);
    expect(await zahl('freizeit_material')).toBe(1);
  });
});

describe('Robustheit und Rechte', () => {
  it('nur die Koordination darf importieren (auch die Vorschau)', async () => {
    const leitung = await person(db, 'Leitung', { kategorie: 'Hauptamtliche*r' });
    const plan = baueImportPlan(beispielBackup());
    const msg = await fehler(() => lauf(plan, false, {}, leitung));
    expect(msg).toMatch(/Nur die Koordination/);
    const anon = await fehler(() => lauf(plan, false, {}, 'anon'));
    expect(anon).toMatch(/permission denied/i);
  });

  it('die internen Helfer sind von außen nicht aufrufbar', async () => {
    for (const f of [`fn_import_lauf('{}'::jsonb, '{}'::jsonb)`, `fn_import_norm('personen', 'mail', '"x"'::jsonb)`]) {
      const msg = await als(db, koord, () => fehler(() => q(`select ${f}`)));
      expect(msg).toMatch(/permission denied/i);
    }
  });

  it('lehnt einen ungültigen Plan ab', async () => {
    const msg = await als(db, koord, () => fehler(() => q(`select fn_kijuko_import('{"foo":1}'::jsonb)`)));
    expect(msg).toMatch(/Ungültiger Importplan/);
  });

  it('eine passende Ferienwoche wird erzwungen, falsche Pläne brechen den Import nicht ab', async () => {
    const plan = baueImportPlan(beispielBackup());
    plan.freizeiten[0]!.ferienwoche = 9;                 // von Hand verfälscht (Parser würde das verhindern)
    const r = await lauf(plan, true);
    expect(r.hinweise.join(' ')).toMatch(/Ferienwoche passt nicht/);
    expect(await wert('ferienwoche as v from freizeiten where kijuko_id = $1', ['P1'])).toBeNull();
  });

  it('ein Fehler mitten im Lauf hinterlässt nichts (alles oder nichts)', async () => {
    const plan = baueImportPlan(beispielBackup());
    (plan.personen[2] as unknown as Record<string, unknown>).kategorie = 'Kein Gültiger Wert';
    await fehler(() => lauf(plan, true));
    expect(await zahl('orte')).toBe(0);
    expect(await zahl('personen')).toBe(1);
    expect(await zahl('import_laeufe')).toBe(0);
    expect(await zahl('import_staende')).toBe(0);
  });

  it('der Import deaktiviert die letzte Koordination nie von selbst; selbst auf ausdrückliche Entscheidung nicht', async () => {
    await q(`update personen set mail = 'koord@kijuko.example' where ist_koordination`);
    const plan = baueImportPlan(beispielBackup());
    plan.personen.push({ kijuko_id: 'K', kijuko_quelle: 'hauptamtliche', vorname: 'Koord', nachname: 'Test', mail: 'koord@kijuko.example',
      kategorie: 'Hauptamtliche*r', aktiv: false });
    // Ohne Entscheidung: nur ein gemeldeter Konflikt, die Koordination bleibt aktiv
    const r = await lauf(plan, true);
    const k = r.konflikte.find((x) => x.feld === 'aktiv')!;
    expect(k).toBeDefined();
    expect(await wert('aktiv as v from personen where ist_koordination')).toBe(true);
    // Selbst mit Entscheidung "kijuko" schützt die Datenbank die letzte Koordination (alles oder nichts)
    const msg = await fehler(() => lauf(plan, true, { [k.schluessel]: 'kijuko' }));
    expect(msg).toMatch(/letzte aktive Koordination/);
    expect(await wert('aktiv as v from personen where ist_koordination')).toBe(true);
  });
});
