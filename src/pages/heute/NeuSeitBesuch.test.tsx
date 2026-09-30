import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { NeuSeitBesuch } from './NeuSeitBesuch';
import type { Neuigkeit } from '../../heute/api';

const jetzt = Date.now();
const vorMinuten = (m: number) => new Date(jetzt - m * 60000).toISOString();
const neu = (o: Partial<Neuigkeit> = {}): Neuigkeit => ({ zeit: vorMinuten(10), art: 'hinweis', text: 'Sonnencreme mitbringen', quelle: 'Sommer-Sause', url: '/freizeiten/f1/hinweise', ...o });

const zeige = (props: Partial<Parameters<typeof NeuSeitBesuch>[0]> = {}) => {
  const gesehen = vi.fn().mockResolvedValue(undefined);
  render(<MemoryRouter><NeuSeitBesuch seit={vorMinuten(120)} neu={[neu()]} gesamt={1} gesehen={gesehen} {...props} /></MemoryRouter>);
  return gesehen;
};

describe('Neu seit deinem letzten Besuch', () => {
  it('erscheint nicht beim ersten Besuch und nicht ohne Neuigkeiten', () => {
    zeige({ seit: null });
    expect(screen.queryByText('Neu seit deinem letzten Besuch')).not.toBeInTheDocument();
  });
  it('erscheint nicht ohne Neuigkeiten', () => {
    zeige({ neu: [], gesamt: 0 });
    expect(screen.queryByText('Neu seit deinem letzten Besuch')).not.toBeInTheDocument();
  });

  it('zeigt Art, Text, Quelle, „vor …“ und den Link zum Ort der Neuigkeit', () => {
    zeige();
    const liste = screen.getByRole('list', { name: 'Neuigkeiten' });
    const link = within(liste).getByRole('link');
    expect(link).toHaveAttribute('href', '/freizeiten/f1/hinweise');
    expect(link).toHaveTextContent('Hinweis: Sonnencreme mitbringen');
    expect(liste).toHaveTextContent('Sommer-Sause');
    expect(liste).toHaveTextContent('vor 10 Min.');
  });

  it('nennt die Bezugszeit „seit …“', () => {
    zeige();
    expect(screen.getByText(/^Seit \d\d\.\d\d\.\d{4} \d\d:\d\d Uhr/)).toBeInTheDocument();
  });

  it('jede Art hat ein Wort (auch unbekannte Arten brechen nichts)', () => {
    zeige({
      neu: (['hinweis', 'absprache', 'plan', 'protokoll', 'notiz', 'kommentar', 'bewerbung', 'vorschlag', 'nachweis'] as const).map((art, i) => neu({ art, text: `T${i}`, url: `/u${i}` })),
      gesamt: 9,
    });
    const texte = within(screen.getByRole('list', { name: 'Neuigkeiten' })).getAllByRole('link').map((l) => l.textContent);
    expect(texte).toEqual(expect.arrayContaining([expect.stringContaining('Hinweis: T0'), expect.stringContaining('Wochenplan: T2'), expect.stringContaining('Protokoll: T3'), expect.stringContaining('Nachweis: T8')]));
  });

  it('mehr Neuigkeiten, als gezeigt werden: „… und n weitere“', () => {
    zeige({ gesamt: 12 });
    expect(screen.getByText('… und 11 weitere.')).toBeInTheDocument();
  });

  it('„Alles gesehen“ ruft die Quittierung auf', async () => {
    const gesehen = zeige();
    await userEvent.click(screen.getByRole('button', { name: 'Alles gesehen' }));
    expect(gesehen).toHaveBeenCalledTimes(1);
  });

  it('ein Fehler beim Quittieren wird angezeigt', async () => {
    const gesehen = vi.fn().mockRejectedValue({ code: '42501', message: 'x' });
    zeige({ gesehen });
    await userEvent.click(screen.getByRole('button', { name: 'Alles gesehen' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Dafür fehlt die Berechtigung.');
  });
});
