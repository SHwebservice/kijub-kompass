import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FARBE_DUNKEL, FARBE_HELL, SCHLUESSEL, ladeDarstellung, setzeDarstellung, starteDarstellung, wendeAn } from './darstellung';

const wurzel = document.documentElement;
const meta = () => document.querySelector('meta[name="theme-color"]')!.getAttribute('content');

beforeEach(() => {
  localStorage.clear();
  wurzel.removeAttribute('data-theme');
  document.head.innerHTML = '<meta name="theme-color" content="#000000" />';
  starteDarstellung();
});

describe('Darstellung', () => {
  it('ohne Wahl folgt die App dem Gerät: kein data-theme', () => {
    expect(ladeDarstellung()).toBe('system');
    expect(wurzel.hasAttribute('data-theme')).toBe(false);
  });

  it('„hell“ und „dunkel“ setzen data-theme, speichern die Wahl und färben die Browserleiste', () => {
    setzeDarstellung('dunkel');
    expect(wurzel.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem(SCHLUESSEL)).toBe('dunkel');
    expect(meta()).toBe(FARBE_DUNKEL);
    setzeDarstellung('hell');
    expect(wurzel.getAttribute('data-theme')).toBe('light');
    expect(meta()).toBe(FARBE_HELL);
  });

  it('„system“ entfernt data-theme wieder', () => {
    setzeDarstellung('dunkel');
    setzeDarstellung('system');
    expect(wurzel.hasAttribute('data-theme')).toBe(false);
    expect(localStorage.getItem(SCHLUESSEL)).toBe('system');
  });

  it('ein gespeicherter Wert wird beim Start angewendet; Unsinn zählt als „system“', () => {
    localStorage.setItem(SCHLUESSEL, 'dunkel');
    starteDarstellung();
    expect(wurzel.getAttribute('data-theme')).toBe('dark');
    localStorage.setItem(SCHLUESSEL, 'lila');
    expect(ladeDarstellung()).toBe('system');
  });

  it('ohne Speicher (gesperrt) geht nichts kaputt', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('gesperrt'); });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('gesperrt'); });
    expect(ladeDarstellung()).toBe('system');
    expect(() => setzeDarstellung('hell')).not.toThrow();
    expect(wurzel.getAttribute('data-theme')).toBe('light');
    get.mockRestore(); set.mockRestore();
  });

  it('wendeAn arbeitet auf einem übergebenen Dokument', () => {
    const doc = document.implementation.createHTMLDocument('x');
    wendeAn('dunkel', doc);
    expect(doc.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('das Init-Skript vor dem ersten Zeichnen nutzt denselben Schlüssel und dieselben Werte', () => {
    const skript = readFileSync(join(__dirname, '../../public/theme-init.js'), 'utf8');
    expect(skript).toContain(`'${SCHLUESSEL}'`);
    expect(skript).toContain("=== 'hell'");
    expect(skript).toContain("=== 'dunkel'");
    expect(readFileSync(join(__dirname, '../../index.html'), 'utf8')).toContain('<script src="/theme-init.js"></script>');
  });
});
