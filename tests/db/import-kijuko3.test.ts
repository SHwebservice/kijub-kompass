import { describe, it, expect, beforeEach } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { neueDb, person, als, type Person } from './harness';
import { baueImportPlan, type ImportPlan } from '../../src/import/kijuko';
import { beispielBackup } from '../fixtures/kijuko';

/**
 * Umstieg KiJuKo 2.1 → KiJuKo 3: KiJuKo 3 übernimmt die IDs der alten Sicherung. Ein Import der neuen
 * Exportdatei nach einem Import der alten Sicherung erkennt deshalb alles wieder und legt nichts doppelt an.
 */
let db: PGlite;
let koord: Person;
const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params);

async function lauf(plan: ImportPlan) {
  const r = await als(db, koord, () => q<{ r: { zaehler: Record<string, Record<string, number>>; konflikte: unknown[] } }>(
    'select fn_kijuko_import($1::jsonb, true, $2::jsonb, $3::jsonb) as r',
    [JSON.stringify(plan), '{}', JSON.stringify({ name: 'KiJuKo-Kompass.json', sha256: 'abc', backup_datum: '2027-01-01' })]));
  return r.rows[0]!.r;
}
const zahl = async (sql: string, p: unknown[] = []) => (await q<{ n: number }>(`select count(*)::int as n from ${sql}`, p)).rows[0]!.n;

/** Dieselben Daten, wie KiJuKo 3 sie nach „Altdaten übernehmen“ exportiert (Leitung jetzt auch eine Ehrenamtliche). */
function export3() {
  const p = (id: string, vorname: string, nachname: string, email: string, beschaeftigungsart: string, hauptamt = false, extra = {}) =>
    ({ id, vorname, nachname, email, telefon: '', ernaehrung: '', allergien: '', notiz: '', beschaeftigungsart, hauptamt, aktiv: true, ...extra });
  return {
    format: 'kijuko-kompass', version: 1, programm: 'KiJuKo 3', erstelltAm: '2027-01-01T00:00:00Z',
    orte: [
      { id: 'L1', name: 'Mörscher Au', adresse: 'Au 1, 67227 Frankenthal', lieferstelleNr: '5' },
      { id: 'L2', name: 'Kindertreff Mörsch', adresse: 'Dorfstr. 2', lieferstelleNr: '' },
      { id: 'L3', name: 'Strandbad', adresse: '', lieferstelleNr: '' },
    ],
    personen: [
      p('H1', 'Hanna', 'Leiter', 'hanna@kijuko.example', 'Hauptamt', true, { telefon: '0171 111' }),
      p('H2', 'Hugo', 'Zweit', 'hugo@kijuko.example', 'Hauptamt', true),
      p('H4', 'Maria', 'Muster', 'maria@kijuko.example', 'Hauptamt', true),
      p('S1', 'Anna', 'Adler', 'anna@kijuko.example', 'TeamerIn', false, { telefon: '0170 1', ernaehrung: 'Vegetarisch' }),
      p('S2', 'Ben', 'Baum', 'ben@kijuko.example', 'TZK', false, { ernaehrung: 'Mischkost', allergien: 'Nüsse', notiz: 'kann Gitarre' }),
      p('S3', 'Cleo', 'Clever', 'Cleo@KiJuKo.Example', 'Praktikum bezahlt', false, { ernaehrung: 'Vegan' }),
      p('S6', 'Inge', 'Inaktiv', 'inge@kijuko.example', 'FSJ', false, { aktiv: false }),
      p('S7', 'Kurt', 'Komisch', 'kurt@kijuko.example', 'TeamerIn'),
    ],
    freizeiten: [
      { id: 'P1', name: 'Sommer-Sause 1', von: '2027-07-05', bis: '2027-07-09', status: 'Geplant', ortId: 'L1', kennziffer: 'F27S1', serieId: 'SER1',
        ferien: { art: 'Sommer', nummer: 1 }, arbeitsbeginn: '07:30', arbeitsende: '17:00', altersgruppe: '6-11', maxTeilnehmende: 48,
        leitung: ['H1', 'S1'], team: ['S2', 'S3'] },
      { id: 'P4', name: 'Ohne Ort', von: '2027-10-11', bis: '2027-10-15', status: 'Geplant', ortId: '', kennziffer: '', serieId: '',
        ferien: { art: 'Herbst', nummer: 2 }, arbeitsbeginn: '', arbeitsende: '', altersgruppe: '8-12', maxTeilnehmende: null,
        leitung: ['H4'], team: ['S1'] },
      { id: 'P2', name: 'Oster-Woche', von: '2027-03-29', bis: '2027-04-02', status: 'Abgesagt', ortId: 'L2', kennziffer: '', serieId: '',
        ferien: null, arbeitsbeginn: '', arbeitsende: '', altersgruppe: '', maxTeilnehmende: 20, leitung: [], team: [] },
    ],
    verpflegung: [{ freizeitId: 'P1', datum: '2027-07-05', mischkost: 40, vegetarisch: 5, allergiker: 2 }],
    material: [
      { id: 'M1', freizeitId: 'P1', name: 'Bälle', einheit: 'Stück', menge: 10, notiz: '' },
      { id: 'M3', freizeitId: 'P1', name: 'Kleber', einheit: 'Packung', menge: 4, notiz: 'bunt' },
    ],
  };
}

beforeEach(async () => {
  db = await neueDb();
  koord = await person(db, 'Koord', { koordination: true, kategorie: 'Hauptamtliche*r' });
});

describe('Exportdatei aus KiJuKo 3', () => {
  it('legt beim Erstimport alles an', async () => {
    const e = await lauf(baueImportPlan(export3()));
    expect(e.zaehler.personen).toMatchObject({ neu: 8 });
    expect(e.zaehler.freizeiten).toMatchObject({ neu: 3 });
    expect(await zahl(`freizeit_team t join personen p on p.id = t.person_id where p.kijuko_id = 'S1' and t.rolle = 'leitung'`)).toBe(1);
  });

  it('nach der alten Sicherung: nichts doppelt, Ehrenamtliche wird Leitung, Essenszahlen werden ersetzt', async () => {
    await lauf(baueImportPlan(beispielBackup()));
    const personen = await zahl('personen'); const freizeiten = await zahl('freizeiten'); const orte = await zahl('orte');

    const e = await lauf(baueImportPlan(export3()));
    expect(e.zaehler.personen?.neu ?? 0).toBe(0);
    expect(e.zaehler.freizeiten?.neu ?? 0).toBe(0);
    expect(await zahl('personen')).toBe(personen);
    expect(await zahl('freizeiten')).toBe(freizeiten);
    expect(await zahl('orte')).toBe(orte);
    expect(e.konflikte).toEqual([]);

    expect((await q<{ rolle: string }>(`select t.rolle::text as rolle from freizeit_team t join personen p on p.id = t.person_id
      join freizeiten f on f.id = t.freizeit_id where p.kijuko_id = 'S1' and f.kijuko_id = 'P1'`)).rows[0]?.rolle).toBe('leitung');
    const v = await q<{ datum: string | null; mischkost: number }>(`select v.datum::text as datum, v.mischkost from freizeit_verpflegung v
      join freizeiten f on f.id = v.freizeit_id where f.kijuko_id = 'P1' order by v.datum`);
    expect(v.rows).toEqual([{ datum: '2027-07-05', mischkost: 40 }]);

    // Ein zweiter Lauf mit derselben Datei ändert nichts
    const z = await lauf(baueImportPlan(export3()));
    for (const art of ['orte', 'personen', 'freizeiten', 'zuteilungen', 'verpflegung', 'material']) {
      expect((z.zaehler[art]?.neu ?? 0) + (z.zaehler[art]?.geaendert ?? 0), art).toBe(0);
    }
  });
});
