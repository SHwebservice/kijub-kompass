import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';
import { AuthKontext, type AuthWert } from './lib/auth-kontext';
import { berechneRollen, type Ich } from './lib/rollen';
import { beispielIch } from './test-utils';

// Geprüft wird, welche Verwaltungsseiten wer erreicht: nicht erlaubte Adressen führen zurück zur Startseite bzw. zur Liste.
vi.mock('./lib/supabase', () => ({ konfiguriert: true, supabase: {} }));

let aktuell: Partial<Ich> = {};
vi.mock('./lib/auth', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => {
    const ich = beispielIch(aktuell);
    const wert: AuthWert = {
      status: 'bereit', session: null, ich, rollen: berechneRollen(ich, [], []), fehler: null, mussPasswortAendern: false,
      anmelden: async () => null, passwortAendern: async () => null, abmelden: async () => undefined,
    };
    return <AuthKontext.Provider value={wert}>{children}</AuthKontext.Provider>;
  },
}));

const FK: Partial<Ich> = { ist_freizeitkoordination: true, kategorie: 'Hauptamtliche*r' };
const TK: Partial<Ich> = { ist_treffkoordination: true, kategorie: 'Hauptamtliche*r' };
const BEIDE: Partial<Ich> = { ist_freizeitkoordination: true, ist_treffkoordination: true, kategorie: 'Hauptamtliche*r' };
const NORMAL: Partial<Ich> = { kategorie: 'TeamerIn' };

/** Öffnet die Adresse und liefert, wo die App gelandet ist. */
function landetBei(ich: Partial<Ich>, pfad: string): string {
  aktuell = ich;
  window.history.pushState({}, '', pfad);
  const { unmount } = render(<App />);
  const ziel = window.location.pathname;
  unmount();
  return ziel;
}

beforeEach(() => { window.history.pushState({}, '', '/'); });

describe('Seiten der Freizeitenkoordination', () => {
  it.each(['/bewerbungen', '/import', '/freizeiten/neu', '/freizeiten/f1/bearbeiten'])('%s: nur Freizeitenkoordination', (pfad) => {
    expect(landetBei(FK, pfad)).toBe(pfad);
    expect(landetBei(BEIDE, pfad)).toBe(pfad);
    expect(landetBei(TK, pfad)).not.toBe(pfad);
    expect(landetBei(NORMAL, pfad)).not.toBe(pfad);
  });
  it('wer nicht darf, landet auf der Startseite bzw. der Freizeitenliste', () => {
    expect(landetBei(TK, '/bewerbungen')).toBe('/');
    expect(landetBei(TK, '/import')).toBe('/');
    expect(landetBei(TK, '/freizeiten/neu')).toBe('/freizeiten');
  });
});

describe('Seiten der Treffkoordination', () => {
  it.each(['/treffs/neu', '/treffs/t1/bearbeiten'])('%s: nur Treffkoordination', (pfad) => {
    expect(landetBei(TK, pfad)).toBe(pfad);
    expect(landetBei(BEIDE, pfad)).toBe(pfad);
    expect(landetBei(FK, pfad)).toBe('/treffs');
    expect(landetBei(NORMAL, pfad)).toBe('/treffs');
  });
});

describe('Gemeinsame Verwaltung: jede der beiden Koordinationen', () => {
  it.each(['/personen', '/orte', '/mitteilungen', '/katalog/import', '/katalog/neu', '/quiz/verwalten'])('%s', (pfad) => {
    expect(landetBei(FK, pfad)).toBe(pfad);
    expect(landetBei(TK, pfad)).toBe(pfad);
    expect(landetBei(BEIDE, pfad)).toBe(pfad);
    expect(landetBei(NORMAL, pfad)).not.toBe(pfad);
  });
});

describe('Seiten werden erst beim Öffnen geladen', () => {
  it('eine nachgeladene Seite erscheint (mit Platzhalter, solange sie lädt)', async () => {
    aktuell = BEIDE;
    window.history.pushState({}, '', '/orte');
    const { unmount } = render(<App />);
    expect(await screen.findByRole('heading', { name: 'Orte' })).toBeInTheDocument();
    unmount();
  });
});
