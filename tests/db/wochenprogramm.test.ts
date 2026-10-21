import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { neueDb } from './harness';

/** Migration 0038: Das Wochenprogramm je Öffnungstag ist nur noch Freitext; bestehende Einträge werden übernommen. */
describe('0038 Wochenprogramm als Freitext', () => {
  it('übernimmt Katalog-Programmpunkt bzw. Freitext samt Notiz in den Freitext', async () => {
    const db = await neueDb({ ueberspringen: ['0038'] });
    const treff = (await db.query<{ id: string }>(`insert into treffs (name) values ('Nord') returning id`)).rows[0]!.id;
    const angebot = (await db.query<{ id: string }>(`insert into angebote (name, kategorie) values ('Fangen', 'bewegung') returning id`)).rows[0]!.id;
    await db.query(`insert into treff_plan_eintraege (treff_id, wochentag, angebot_id, notiz) values ($1, 1, $2, 'Im Hof')`, [treff, angebot]);
    await db.query(`insert into treff_plan_eintraege (treff_id, wochentag, freitext, notiz) values ($1, 2, 'Kochen', ' ')`, [treff]);
    await db.query(`insert into treff_plan_eintraege (treff_id, wochentag, freitext) values ($1, 3, 'Kicker')`, [treff]);

    await db.exec(readFileSync(join(__dirname, '../../supabase/migrations/0038_wochenprogramm_freitext.sql'), 'utf8'));

    const r = await db.query(`select wochentag, freitext, angebot_id, notiz from treff_plan_eintraege where treff_id = $1 order by wochentag`, [treff]);
    expect(r.rows).toEqual([
      { wochentag: 1, freitext: 'Fangen – Im Hof', angebot_id: null, notiz: null },
      { wochentag: 2, freitext: 'Kochen', angebot_id: null, notiz: null },
      { wochentag: 3, freitext: 'Kicker', angebot_id: null, notiz: null },
    ]);
  });
});
