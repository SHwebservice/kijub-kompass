import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { erzeugePasswort, PASSWORT_ALPHABET } from '../../supabase/functions/_shared/passwort';

const FUNKTIONEN = join(__dirname, '../../supabase/functions');

describe('erzeugePasswort', () => {
  it('hat das Format XXXX-XXXX-XXXX ohne verwechselbare Zeichen', () => {
    for (let i = 0; i < 200; i++) {
      const p = erzeugePasswort();
      expect(p).toMatch(/^[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}$/);
      expect(p).not.toMatch(/[0O1lI]/);
    }
  });

  it('ist mit 14 Zeichen länger als das Mindestmaß der App (10)', () => {
    expect(erzeugePasswort().length).toBe(14);
  });

  it('liefert bei 1000 Aufrufen keine Wiederholung', () => {
    const s = new Set(Array.from({ length: 1000 }, () => erzeugePasswort()));
    expect(s.size).toBe(1000);
  });

  it('nutzt alle Zeichen des Alphabets ungefähr gleich oft (keine Modulo-Verzerrung)', () => {
    const zaehler = new Map<string, number>();
    for (let i = 0; i < 20000; i++) {
      for (const z of erzeugePasswort().replace(/-/g, '')) zaehler.set(z, (zaehler.get(z) ?? 0) + 1);
    }
    expect(zaehler.size).toBe(PASSWORT_ALPHABET.length);
    const werte = [...zaehler.values()];
    const erwartet = (20000 * 12) / PASSWORT_ALPHABET.length;
    for (const w of werte) expect(Math.abs(w - erwartet) / erwartet).toBeLessThan(0.1);
  });

  it('verwirft Zufallswerte oberhalb der Grenze (Rejection Sampling)', () => {
    const folge = [255, 254, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]; // 255/254 liegen über der Grenze 228
    let i = 0;
    const p = erzeugePasswort((b) => { b[0] = folge[i++ % folge.length]!; return b; });
    expect(p.startsWith(PASSWORT_ALPHABET.slice(0, 4))).toBe(true);
  });

  it('Alphabet enthält keine doppelten Zeichen', () => {
    expect(new Set(PASSWORT_ALPHABET).size).toBe(PASSWORT_ALPHABET.length);
  });
});

describe('Edge Function konto-passwort', () => {
  const block = (datei: string) => {
    const t = readFileSync(join(FUNKTIONEN, datei), 'utf8').replace(/\r\n/g, '\n');
    const a = t.indexOf('// >>> passwort');
    const b = t.indexOf('// <<< passwort');
    expect(a).toBeGreaterThan(-1);
    expect(b).toBeGreaterThan(a);
    return t.slice(a, b);
  };

  it('enthält denselben Passwort-Generator wie _shared/passwort.ts (Datei ist absichtlich eine Kopie)', () => {
    expect(block('konto-passwort/index.ts')).toBe(block('_shared/passwort.ts'));
  });

  it('prüft die Koordinations-Rolle vor jeder Änderung und protokolliert das Passwort nicht', () => {
    const t = readFileSync(join(FUNKTIONEN, 'konto-passwort/index.ts'), 'utf8');
    const rolle = t.indexOf("rpc('ist_koord')");
    const aenderung = t.indexOf('createUser');
    expect(rolle).toBeGreaterThan(-1);
    expect(rolle).toBeLessThan(aenderung);
    expect(t).not.toMatch(/console\.(log|info|debug|warn|error)/);
  });

  it('importiert nichts aus _shared (Einzelupload im Dashboard muss funktionieren)', () => {
    const t = readFileSync(join(FUNKTIONEN, 'konto-passwort/index.ts'), 'utf8');
    expect(t).not.toMatch(/from '\.\.?\//);
  });
});
