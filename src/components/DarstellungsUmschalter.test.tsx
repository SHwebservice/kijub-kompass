import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DarstellungsKnopf, DarstellungsUmschalter } from './DarstellungsUmschalter';
import { setzeDarstellung } from '../theme/darstellung';

beforeEach(() => { localStorage.clear(); setzeDarstellung('system'); });

describe('DarstellungsUmschalter', () => {
  it('zeigt drei Möglichkeiten, die aktuelle ist gedrückt, ein Klick wechselt', async () => {
    render(<DarstellungsUmschalter />);
    expect(screen.getByRole('group', { name: 'Darstellung' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Wie Gerät' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Dunkel' }));
    expect(screen.getByRole('button', { name: 'Dunkel' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Wie Gerät' })).toHaveAttribute('aria-pressed', 'false');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('der Knopf im Kopf wechselt zwischen hell und dunkel, beide Bedienelemente bleiben im Gleichschritt', async () => {
    render(<><DarstellungsKnopf /><DarstellungsUmschalter /></>);
    await userEvent.click(screen.getByRole('button', { name: 'Dunkle Darstellung einschalten' }));
    expect(screen.getByRole('button', { name: 'Dunkel' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Helle Darstellung einschalten' }));
    expect(screen.getByRole('button', { name: 'Hell' })).toHaveAttribute('aria-pressed', 'true');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});
