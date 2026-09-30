import { describe, it, expect } from 'vitest';
import { neueDb } from './harness';

const TABELLEN = [
  'dienst_wuensche', 'dienst_zuteilungen', 'dienste', 'dienstplan_kommentare', 'feiertage', 'freizeit_slots', 'freizeit_team',
  'lebensmittel_eingang', 'lebensmittel_verbrauch', 'notiz_bestaetigungen', 'notiz_kommentare', 'notizen', 'plan_eintraege',
  'treff_aufgaben', 'treff_plan_eintraege', 'treff_protokolle', 'treff_team',
];

describe('Live-Aktualisierung (Migrationen 0011, 0012 und 0016)', () => {
  it('läuft ohne Realtime-Veröffentlichung folgenlos durch', async () => {
    const db = await neueDb();
    const r = await db.query<{ n: number }>(`select count(*)::int as n from pg_publication`);
    expect(r.rows[0]!.n).toBe(0);
  });

  it('meldet genau die Tabellen der Freizeiten und Treffs an, wenn Realtime vorhanden ist', async () => {
    const db = await neueDb({ realtime: true });
    const r = await db.query<{ tablename: string }>(`select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1`);
    expect(r.rows.map((x) => x.tablename)).toEqual(TABELLEN);
  });

  it('personenbezogene Tabellen sind NICHT dabei (Personen, Bewerbungen, Nachweise …)', async () => {
    const db = await neueDb({ realtime: true });
    const r = await db.query<{ tablename: string }>(`select tablename from pg_publication_tables where pubname = 'supabase_realtime'`);
    for (const t of ['personen', 'bewerbungen', 'zeitnachweise', 'abwesenheiten', 'push_abos', 'import_laeufe']) {
      expect(r.rows.map((x) => x.tablename)).not.toContain(t);
    }
  });
});
