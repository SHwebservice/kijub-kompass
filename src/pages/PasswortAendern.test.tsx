import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PasswortAendern } from './PasswortAendern';

async function ausfuellen(neu: string, wiederholung: string) {
  await userEvent.type(screen.getByLabelText('Neues Passwort'), neu);
  await userEvent.type(screen.getByLabelText('Neues Passwort wiederholen'), wiederholung);
  await userEvent.click(screen.getByRole('button', { name: 'Passwort speichern' }));
}

describe('PasswortAendern', () => {
  it('lehnt zu kurze Passwörter ab, ohne zu speichern', async () => {
    const speichern = vi.fn().mockResolvedValue(null);
    render(<PasswortAendern speichern={speichern} />);
    await ausfuellen('kurz', 'kurz');
    expect(await screen.findByRole('alert')).toHaveTextContent('mindestens 10 Zeichen');
    expect(speichern).not.toHaveBeenCalled();
  });

  it('lehnt abweichende Wiederholung ab', async () => {
    const speichern = vi.fn().mockResolvedValue(null);
    render(<PasswortAendern speichern={speichern} />);
    await ausfuellen('ein-langes-passwort', 'ein-anderes-passwort');
    expect(await screen.findByRole('alert')).toHaveTextContent('stimmen nicht überein');
    expect(speichern).not.toHaveBeenCalled();
  });

  it('speichert ein gültiges Passwort und bestätigt', async () => {
    const speichern = vi.fn().mockResolvedValue(null);
    const onFertig = vi.fn();
    render(<PasswortAendern speichern={speichern} onFertig={onFertig} />);
    await ausfuellen('ein-langes-passwort', 'ein-langes-passwort');
    expect(speichern).toHaveBeenCalledWith('ein-langes-passwort');
    expect(await screen.findByText('Passwort gespeichert.')).toBeInTheDocument();
    expect(onFertig).toHaveBeenCalled();
    expect(screen.getByLabelText('Neues Passwort')).toHaveValue('');
  });

  it('zeigt Serverfehler an', async () => {
    render(<PasswortAendern speichern={vi.fn().mockResolvedValue('Das neue Passwort muss sich vom bisherigen unterscheiden.')} />);
    await ausfuellen('ein-langes-passwort', 'ein-langes-passwort');
    expect(await screen.findByRole('alert')).toHaveTextContent('unterscheiden');
  });

  it('erzwungene Variante erklärt den Grund und bietet Abmelden an', async () => {
    const abmelden = vi.fn();
    render(<PasswortAendern erzwungen speichern={vi.fn()} abmelden={abmelden} />);
    expect(screen.getByText(/Startpasswort von der Koordination/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Abmelden' }));
    expect(abmelden).toHaveBeenCalled();
  });

  it('Felder sind als neues Passwort ausgezeichnet (Passwortmanager)', () => {
    render(<PasswortAendern speichern={vi.fn()} />);
    expect(screen.getByLabelText('Neues Passwort')).toHaveAttribute('autocomplete', 'new-password');
  });
});
