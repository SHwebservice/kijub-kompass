import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { Login } from './Login';

function aufbau(over: Partial<ComponentProps<typeof Login>> = {}) {
  const codeSenden = vi.fn().mockResolvedValue(null);
  const codePruefen = vi.fn().mockResolvedValue(null);
  render(<Login codeSenden={codeSenden} codePruefen={codePruefen} konfiguriert {...over} />);
  return { codeSenden, codePruefen };
}

describe('Login', () => {
  it('Senden ist erst mit gültiger Mail möglich', async () => {
    aufbau();
    const knopf = screen.getByRole('button', { name: 'Code senden' });
    expect(knopf).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Mail-Adresse'), 'anna@kijub.example');
    expect(knopf).toBeEnabled();
  });

  it('führt von der Mail zur Code-Eingabe und meldet mit dem Code an', async () => {
    const { codeSenden, codePruefen } = aufbau();
    await userEvent.type(screen.getByLabelText('Mail-Adresse'), 'anna@kijub.example');
    await userEvent.click(screen.getByRole('button', { name: 'Code senden' }));
    expect(codeSenden).toHaveBeenCalledWith('anna@kijub.example');

    await userEvent.type(await screen.findByLabelText('Code'), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Anmelden' }));
    expect(codePruefen).toHaveBeenCalledWith('anna@kijub.example', '123456');
  });

  it('zeigt Fehler beim Senden und bleibt auf dem Mail-Schritt', async () => {
    aufbau({ codeSenden: vi.fn().mockResolvedValue('Für diese Mail-Adresse gibt es keinen Zugang.') });
    await userEvent.type(screen.getByLabelText('Mail-Adresse'), 'fremd@example.org');
    await userEvent.click(screen.getByRole('button', { name: 'Code senden' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('keinen Zugang');
    expect(screen.getByLabelText('Mail-Adresse')).toBeInTheDocument();
  });

  it('zeigt Fehler bei falschem Code', async () => {
    aufbau({ codePruefen: vi.fn().mockResolvedValue('Der Code ist ungültig oder abgelaufen. Bitte neu anfordern.') });
    await userEvent.type(screen.getByLabelText('Mail-Adresse'), 'anna@kijub.example');
    await userEvent.click(screen.getByRole('button', { name: 'Code senden' }));
    await userEvent.type(await screen.findByLabelText('Code'), '000000');
    await userEvent.click(screen.getByRole('button', { name: 'Anmelden' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('ungültig');
  });

  it('ohne Supabase-Konfiguration: Hinweis und gesperrter Button', async () => {
    aufbau({ konfiguriert: false });
    expect(screen.getByRole('alert')).toHaveTextContent('noch nicht mit Supabase verbunden');
    await userEvent.type(screen.getByLabelText('Mail-Adresse'), 'anna@kijub.example');
    expect(screen.getByRole('button', { name: 'Code senden' })).toBeDisabled();
  });
});
