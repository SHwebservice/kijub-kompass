import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const quelle = readFileSync(join(__dirname, '../../supabase/functions/kalender/index.ts'), 'utf8');
const pos = (text: string) => {
  const i = quelle.indexOf(text);
  expect(i, `"${text}" fehlt in kalender/index.ts`).toBeGreaterThan(-1);
  return i;
};

// Die Edge Function läuft nur bei Supabase. Diese Tests sichern ihren Aufbau ab.
describe('Edge Function kalender (Aufbau)', () => {
  it('prüft das Format des Schlüssels, bevor die Datenbank gefragt wird', () => {
    expect(pos('/^[0-9a-f]{64}$/')).toBeLessThan(pos("rpc('fn_kalender_ics'"));
  });

  it('liest nur über fn_kalender_ics (kein direkter Tabellenzugriff, nichts wird geschrieben)', () => {
    expect(quelle).not.toMatch(/\.from\(/);
    expect(quelle).not.toMatch(/\.(insert|update|delete|upsert)\(/);
  });

  it('liefert iCalendar und bei unbekanntem Schlüssel 404', () => {
    pos("'Content-Type': 'text/calendar; charset=utf-8'");
    expect(quelle).toMatch(/typeof data !== 'string'\) return text\('Kalender nicht gefunden', 404\)/);
  });

  it('protokolliert nichts und ist in sich geschlossen', () => {
    expect(quelle).not.toMatch(/console\.(log|info|debug|warn|error)/);
    expect(quelle).not.toMatch(/from '\.\.?\//);
  });
});
