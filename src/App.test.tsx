import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

// Ohne Supabase-Konfiguration startet die App abgemeldet: geprüft wird, welche Seiten ohne Anmeldung erreichbar sind.
vi.mock('./lib/supabase', () => ({ konfiguriert: false, supabase: {} }));

const oeffne = (pfad: string) => { window.history.pushState({}, '', pfad); return render(<App />); };

beforeEach(() => { window.history.pushState({}, '', '/'); });

describe('App: Seiten ohne Anmeldung', () => {
  it('die Startadresse zeigt die Anmeldung, mit Links zu Impressum und Datenschutz', () => {
    oeffne('/');
    expect(screen.getByRole('heading', { name: 'Anmelden' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Impressum' })).toHaveAttribute('href', '/impressum');
    expect(screen.getByRole('link', { name: 'Datenschutz' })).toHaveAttribute('href', '/datenschutz');
  });

  it('das Impressum ist ohne Anmeldung lesbar', () => {
    oeffne('/impressum');
    expect(screen.getByRole('heading', { name: 'Impressum' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Anmelden' })).not.toBeInTheDocument();
  });

  it('die Datenschutzhinweise sind ohne Anmeldung lesbar', () => {
    oeffne('/datenschutz');
    expect(screen.getByRole('heading', { name: 'Datenschutzhinweise' })).toBeInTheDocument();
  });

  it('alle übrigen Adressen führen zur Anmeldung, nie zu Daten', () => {
    for (const pfad of ['/freizeiten', '/treffs/abc', '/personen', '/katalog/x/bearbeiten']) {
      const { unmount } = oeffne(pfad);
      expect(screen.getByRole('heading', { name: 'Anmelden' })).toBeInTheDocument();
      unmount();
    }
  });
});
