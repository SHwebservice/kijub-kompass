import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { Login } from './Login';

function aufbau(over: Partial<ComponentProps<typeof Login>> = {}) {
  const anmelden = vi.fn().mockResolvedValue(null);
  render(<Login anmelden={anmelden} konfiguriert {...over} />);
  return { anmelden };
}

describe('Login', () => {
  it('Anmelden ist erst mit Mail und Passwort möglich', async () => {
    aufbau();
    const knopf = screen.getByRole('button', { name: 'Anmelden' });
    expect(knopf).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Mail-Adresse'), 'anna@kijub.example');
    expect(knopf).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Passwort'), 'geheim');
    expect(knopf).toBeEnabled();
  });

  it('meldet mit den eingegebenen Daten an', async () => {
    const { anmelden } = aufbau();
    await userEvent.type(screen.getByLabelText('Mail-Adresse'), 'anna@kijub.example');
    await userEvent.type(screen.getByLabelText('Passwort'), 'geheim');
    await userEvent.click(screen.getByRole('button', { name: 'Anmelden' }));
    expect(anmelden).toHaveBeenCalledWith('anna@kijub.example', 'geheim');
  });

  it('ruft nachAnmeldung nur nach erfolgreicher Anmeldung auf (Sprung zur Startseite)', async () => {
    const nachAnmeldung = vi.fn();
    const { anmelden } = aufbau({ nachAnmeldung });
    await userEvent.type(screen.getByLabelText('Mail-Adresse'), 'anna@kijub.example');
    await userEvent.type(screen.getByLabelText('Passwort'), 'geheim');
    await userEvent.click(screen.getByRole('button', { name: 'Anmelden' }));
    expect(anmelden).toHaveBeenCalled();
    expect(nachAnmeldung).toHaveBeenCalledTimes(1);
  });

  it('springt bei falschem Passwort nicht zur Startseite', async () => {
    const nachAnmeldung = vi.fn();
    aufbau({ anmelden: vi.fn().mockResolvedValue('Mail-Adresse oder Passwort stimmt nicht.'), nachAnmeldung });
    await userEvent.type(screen.getByLabelText('Mail-Adresse'), 'anna@kijub.example');
    await userEvent.type(screen.getByLabelText('Passwort'), 'falsch');
    await userEvent.click(screen.getByRole('button', { name: 'Anmelden' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(nachAnmeldung).not.toHaveBeenCalled();
  });

  it('das Passwortfeld ist verdeckt und als aktuelles Passwort ausgezeichnet', () => {
    aufbau();
    const feld = screen.getByLabelText('Passwort');
    expect(feld).toHaveAttribute('type', 'password');
    expect(feld).toHaveAttribute('autocomplete', 'current-password');
  });

  it('zeigt einen Fehler und behält die Mail-Adresse', async () => {
    aufbau({ anmelden: vi.fn().mockResolvedValue('Mail-Adresse oder Passwort stimmt nicht.') });
    await userEvent.type(screen.getByLabelText('Mail-Adresse'), 'anna@kijub.example');
    await userEvent.type(screen.getByLabelText('Passwort'), 'falsch');
    await userEvent.click(screen.getByRole('button', { name: 'Anmelden' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('stimmt nicht');
    expect(screen.getByLabelText('Mail-Adresse')).toHaveValue('anna@kijub.example');
  });

  it('ohne Supabase-Konfiguration: Hinweis und gesperrter Button', async () => {
    aufbau({ konfiguriert: false });
    expect(screen.getByRole('alert')).toHaveTextContent('noch nicht mit Supabase verbunden');
    await userEvent.type(screen.getByLabelText('Mail-Adresse'), 'anna@kijub.example');
    await userEvent.type(screen.getByLabelText('Passwort'), 'geheim');
    expect(screen.getByRole('button', { name: 'Anmelden' })).toBeDisabled();
  });
});
