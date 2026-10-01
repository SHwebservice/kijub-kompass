import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Farbkontraste nach WCAG 2.2: Text 4,5 : 1 (AA), Rahmen von Eingaben, Fokusring und andere Bedienelemente 3 : 1.
 * Gelesen werden die Werte aus src/styles/tokens.css, für das helle und das dunkle Farbschema.
 */
const css = readFileSync(join(__dirname, '../../src/styles/tokens.css'), 'utf8');

type Farbe = [number, number, number, number];   // r, g, b, Deckkraft

function werte(block: string): Record<string, string> {
  const r: Record<string, string> = {};
  for (const m of block.matchAll(/--([\w-]+):\s*([^;]+);/g)) r[m[1]!] = m[2]!.trim();
  return r;
}
const dunkelStart = css.indexOf('@media (prefers-color-scheme: dark)');
const hell = werte(css.slice(css.indexOf(':root {'), dunkelStart));
const dunkel = { ...hell, ...werte(css.slice(dunkelStart)) };

function farbe(text: string): Farbe {
  const hex = /^#([0-9a-f]{6})$/i.exec(text);
  if (hex) return [parseInt(hex[1]!.slice(0, 2), 16), parseInt(hex[1]!.slice(2, 4), 16), parseInt(hex[1]!.slice(4, 6), 16), 1];
  const rgb = /^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*(?:\/\s*([\d.]+))?\s*\)$/.exec(text);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), rgb[4] === undefined ? 1 : Number(rgb[4])];
  throw new Error(`Unbekanntes Farbformat: ${text}`);
}

/** Legt eine (halb)durchsichtige Farbe über einen Untergrund. */
const ueber = (f: Farbe, grund: Farbe): Farbe => [0, 1, 2].map((i) => Math.round(f[i]! * f[3] + grund[i]! * (1 - f[3]))).concat(1) as Farbe;

function leuchtdichte([r, g, b]: Farbe): number {
  const k = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * k(r) + 0.7152 * k(g) + 0.0722 * k(b);
}
export function kontrast(a: Farbe, b: Farbe): number {
  const [hellere, dunklere] = [leuchtdichte(a), leuchtdichte(b)].sort((x, y) => y - x);
  return (hellere! + 0.05) / (dunklere! + 0.05);
}

const schemata = { hell, dunkel } as const;

function pruefe(schema: Record<string, string>, vordergrund: string, untergrund: string): number {
  const grund = ueber(farbe(schema[untergrund]!), farbe(schema.surface!));      // durchsichtige Untergründe liegen auf einer Fläche
  return kontrast(ueber(farbe(schema[vordergrund]!), grund), grund);
}

/** Text auf Fläche (mindestens 4,5 : 1). */
const TEXT: [string, string][] = [
  ['text', 'bg'], ['text', 'surface'], ['text', 'surface-2'], ['text', 'accent-bg'],
  ['text-muted', 'bg'], ['text-muted', 'surface'], ['text-muted', 'surface-2'],
  ['text-hint', 'surface'], ['text-hint', 'bg'], ['text-hint', 'surface-2'],
  ['accent', 'surface'], ['accent', 'bg'], ['accent', 'accent-bg'], ['accent', 'surface-2'],
  ['on-accent', 'accent'], ['on-accent', 'accent-hover'],
  ['danger', 'surface'], ['danger', 'danger-bg'], ['success', 'surface'], ['success', 'success-bg'],
  ['warning', 'surface'], ['warning', 'warning-bg'], ['orange', 'surface'], ['orange', 'orange-bg'],
];
/** Rahmen von Eingaben, Fokusring und Zustandsfarben als Bedienelement (mindestens 3 : 1). */
const BEDIENELEMENTE: [string, string][] = [
  ['border-strong', 'surface'], ['border-strong', 'bg'], ['accent', 'surface'], ['danger', 'surface'],
];

describe.each(Object.entries(schemata))('Kontraste im %s Farbschema', (name, schema) => {
  it.each(TEXT)('Text %s auf %s: mindestens 4,5 : 1', (vorn, hinten) => {
    expect(pruefe(schema, vorn, hinten), `${vorn} auf ${hinten}`).toBeGreaterThanOrEqual(4.5);
  });

  it.each(BEDIENELEMENTE)('%s auf %s: mindestens 3 : 1', (vorn, hinten) => {
    expect(pruefe(schema, vorn, hinten), `${vorn} auf ${hinten}`).toBeGreaterThanOrEqual(3);
  });

  it('der Fokusring hebt sich deutlich von der Fläche ab (mindestens 3 : 1)', () => {
    const ring = /rgb\(([^)]+)\)/.exec(schema['focus-ring']!)![0];
    expect(pruefe({ ...schema, ring }, 'ring', 'surface'), 'Fokusring auf Fläche').toBeGreaterThanOrEqual(3);
    expect(pruefe({ ...schema, ring }, 'ring', 'bg'), 'Fokusring auf Hintergrund').toBeGreaterThanOrEqual(3);
  });

  it(`Werte sind vorhanden (${name})`, () => {
    for (const k of ['text', 'surface', 'accent', 'border-strong', 'focus-ring']) expect(schema[k]).toBeTruthy();
  });
});

describe('Kontrastrechnung selbst', () => {
  it('Schwarz auf Weiß ist 21 : 1, gleiche Farben 1 : 1', () => {
    expect(kontrast([0, 0, 0, 1], [255, 255, 255, 1])).toBeCloseTo(21, 5);
    expect(kontrast([120, 10, 10, 1], [120, 10, 10, 1])).toBeCloseTo(1, 5);
  });
  it('durchsichtige Farben werden über den Untergrund gerechnet', () => {
    expect(ueber([0, 0, 0, 0.5], [255, 255, 255, 1])).toEqual([128, 128, 128, 1]);
  });
});

/** Glas: Text auf durchscheinender Fläche auf der stärksten Farbwolke (schlechtester Fall, die Wolken verlaufen nach außen weich aus). */
describe.each(Object.entries(schemata))('Glas im %s Farbschema', (_name, schema) => {
  const TEXTE = ['text', 'text-muted', 'text-hint', 'accent', 'danger', 'success', 'warning', 'orange'];
  const grundMit = (glas: string, wolke: string): Farbe => ueber(farbe(schema[glas]!), ueber(farbe(schema[wolke]!), farbe(schema.bg!)));
  const faelle = ['glas', 'glas-stark'].flatMap((g) => ['wolke-1', 'wolke-2', 'wolke-3'].flatMap((wo) => TEXTE.map((x) => [x, g, wo] as const)));

  it.each(faelle)('%s auf %s über %s: mindestens 4,5 : 1', (text, glas, wolke) => {
    expect(kontrast(farbe(schema[text]!), grundMit(glas, wolke)), `${text} auf ${glas} über ${wolke}`).toBeGreaterThanOrEqual(4.5);
  });

  it('Text auf Glas ohne Wolke darunter (am Rand der Seite) ist ebenfalls lesbar', () => {
    for (const g of ['glas', 'glas-stark']) for (const x of TEXTE) {
      const grund = ueber(farbe(schema[g]!), farbe(schema.bg!));
      expect(kontrast(farbe(schema[x]!), grund), `${x} auf ${g}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('Dunkel als feste Wahl', () => {
  it('„data-theme=dark“ hat dieselben Werte wie das Gerät im Dunkelmodus', () => {
    const medien = css.slice(css.indexOf('@media (prefers-color-scheme: dark)'), css.indexOf("/* Feste Wahl"));
    const fest = css.slice(css.indexOf(":root[data-theme='dark'] {"));
    expect(werte(fest.slice(0, fest.indexOf('\n}')))).toEqual(werte(medien));
  });
});
