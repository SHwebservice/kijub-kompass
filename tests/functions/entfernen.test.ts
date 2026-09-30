import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const quelle = readFileSync(join(__dirname, '../../supabase/functions/konto-entfernen/index.ts'), 'utf8');
const pos = (text: string) => {
  const i = quelle.indexOf(text);
  expect(i, `"${text}" fehlt in konto-entfernen/index.ts`).toBeGreaterThan(-1);
  return i;
};

// Die Edge Function läuft nur bei Supabase. Diese Tests sichern die Reihenfolge der Schutzmaßnahmen ab:
// Jede Löschung muss hinter Rollenprüfung, Eingabeprüfung und Selbstschutz liegen.
describe('Edge Function konto-entfernen (Aufbau)', () => {
  it('prüft die Koordinations-Rolle vor jeder Löschung', () => {
    expect(pos("rpc('ist_koord')")).toBeLessThan(pos('deleteUser'));
    expect(pos("rpc('ist_koord')")).toBeLessThan(pos(".delete()"));
  });

  it('prüft die Eingabe (person_id und modus) vor jeder Löschung', () => {
    expect(pos("modus !== 'zugang' && modus !== 'person'")).toBeLessThan(pos('deleteUser'));
    expect(pos('person_id fehlt oder ist ungültig')).toBeLessThan(pos('deleteUser'));
  });

  it('schützt vor Selbstlöschung und der letzten Koordination mit Zugang, bevor etwas gelöscht wird', () => {
    expect(pos('person.id === eigeneId')).toBeLessThan(pos('deleteUser'));
    expect(pos('Du kannst dich nicht selbst entfernen')).toBeLessThan(pos('deleteUser'));
    expect(pos('Die letzte Koordination mit Zugang')).toBeLessThan(pos('deleteUser'));
  });

  it('löscht erst das Login-Konto, dann die Person (so bleibt bei einem Fehler keine Person ohne Zugriff zurück, die sich nicht löschen ließe)', () => {
    expect(pos('deleteUser')).toBeLessThan(pos(".from('personen').delete()"));
  });

  it('im Modus "zugang" bleibt die Person bestehen', () => {
    const zugangZweig = quelle.slice(pos("if (modus === 'zugang') {"), pos('// 5. Person endgültig löschen'));
    expect(zugangZweig).not.toMatch(/\.delete\(\)/);
    expect(zugangZweig).toMatch(/return antwort/);
  });

  it('protokolliert nichts und ist in sich geschlossen', () => {
    expect(quelle).not.toMatch(/console\.(log|info|debug|warn|error)/);
    expect(quelle).not.toMatch(/from '\.\.?\//);
  });
});
