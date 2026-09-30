import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Impressum } from './Impressum';
import { Datenschutz } from './Datenschutz';
import { FACHSTELLE, LINKS, TRAEGER } from './angaben';

describe('Impressum', () => {
  it('nennt Träger, Fachstelle und Kontakt aus den Angaben', () => {
    render(<Impressum />);
    expect(screen.getAllByText(TRAEGER.name).length).toBeGreaterThan(0);   // Träger und Fachstelle nennen ihn beide
    expect(screen.getByText(new RegExp(TRAEGER.ustId))).toBeInTheDocument();
    expect(screen.getByText(FACHSTELLE.name)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: TRAEGER.mail })).toHaveAttribute('href', `mailto:${TRAEGER.mail}`);
    expect(screen.getByRole('link', { name: FACHSTELLE.mail })).toHaveAttribute('href', `mailto:${FACHSTELLE.mail}`);
  });

  it('externe Verweise öffnen sicher in einem neuen Tab', () => {
    render(<Impressum />);
    for (const name of [/Vollständiges Impressum/, /Datenschutzerklärung der Stadt/]) {
      const a = screen.getByRole('link', { name });
      expect(a).toHaveAttribute('target', '_blank');
      expect(a).toHaveAttribute('rel', 'noopener noreferrer');
    }
    expect(screen.getByRole('link', { name: /Vollständiges Impressum/ })).toHaveAttribute('href', LINKS.impressumStadt);
  });

  it('Fußzeile verlinkt Impressum, Datenschutz und Anmeldung', () => {
    render(<Impressum />);
    expect(screen.getByRole('link', { name: 'Zur Anmeldung' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Datenschutz' })).toHaveAttribute('href', '/datenschutz');
  });
});

describe('Datenschutzhinweise', () => {
  it('enthält die Pflichtabschnitte', () => {
    render(<Datenschutz />);
    for (const titel of ['Verantwortlich', 'Welche Daten verarbeitet werden und wozu', 'Wer Zugriff hat', 'Dienstleister', 'Cookies und lokale Speicherung', 'Speicherdauer', 'Deine Rechte']) {
      expect(screen.getByRole('heading', { name: titel })).toBeInTheDocument();
    }
  });

  it('beschreibt ehrlich, dass keine Namenslisten von Kindern gespeichert werden, und die Sicherungsdauer', () => {
    render(<Datenschutz />);
    expect(screen.getByText(/keine Namenslisten von Kindern/)).toBeInTheDocument();
    expect(screen.getByText(/nach 60 Tagen automatisch gelöscht/)).toBeInTheDocument();
  });

  it('verweist auf die Datenschutzerklärung der Stadt und nennt die Verantwortlichen', () => {
    render(<Datenschutz />);
    expect(screen.getByRole('link', { name: /Datenschutzerklärung der Stadt Frankenthal/ })).toHaveAttribute('href', LINKS.datenschutzStadt);
    expect(screen.getAllByRole('link', { name: FACHSTELLE.mail }).length).toBeGreaterThan(0);
  });
});
