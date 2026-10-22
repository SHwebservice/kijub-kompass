import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DarstellungsKnopf } from './DarstellungsUmschalter';
import { setzeDarstellung } from '../theme/darstellung';

beforeEach(() => { localStorage.clear(); setzeDarstellung('system'); });

describe('DarstellungsKnopf', () => {
  it('wechselt reihum „Wie Gerät“ → „Hell“ → „Dunkel“ → „Wie Gerät“ und nennt die aktuelle Wahl', async () => {
    render(<DarstellungsKnopf />);
    await userEvent.click(screen.getByRole('button', { name: 'Darstellung: Wie Gerät. Wechseln zu Hell' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    await userEvent.click(screen.getByRole('button', { name: 'Darstellung: Hell. Wechseln zu Dunkel' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    await userEvent.click(screen.getByRole('button', { name: 'Darstellung: Dunkel. Wechseln zu Wie Gerät' }));
    expect(screen.getByRole('button', { name: 'Darstellung: Wie Gerät. Wechseln zu Hell' })).toBeInTheDocument();
  });
});
