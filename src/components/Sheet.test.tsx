import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sheet } from './Sheet';

describe('Sheet', () => {
  it('der Cursor bleibt beim Tippen im Feld, auch wenn die Schließen-Funktion bei jedem Zeichnen neu entsteht', async () => {
    function Beispiel() {
      const [text, setText] = useState('');
      return (
        <Sheet titel="Test" schliessen={() => undefined}>
          <input aria-label="Feld" value={text} onChange={(e) => setText(e.target.value)} />
        </Sheet>
      );
    }
    render(<Beispiel />);
    await userEvent.type(screen.getByLabelText('Feld'), 'Hallo Welt');
    expect(screen.getByLabelText('Feld')).toHaveValue('Hallo Welt');
  });

  it('Escape und Klick auf den Hintergrund schließen; ein Klick ins Fenster nicht', async () => {
    const zu = vi.fn();
    render(<Sheet titel="Test" schliessen={zu}><p>Inhalt</p></Sheet>);
    await userEvent.click(screen.getByText('Inhalt'));
    expect(zu).not.toHaveBeenCalled();
    await userEvent.keyboard('{Escape}');
    expect(zu).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Schließen' }));
    expect(zu).toHaveBeenCalledTimes(2);
  });

  it('Escape ruft immer die aktuelle Funktion auf', async () => {
    const alt = vi.fn(); const neu = vi.fn();
    const { rerender } = render(<Sheet titel="Test" schliessen={alt}><p>x</p></Sheet>);
    rerender(<Sheet titel="Test" schliessen={neu}><p>x</p></Sheet>);
    await userEvent.keyboard('{Escape}');
    expect(alt).not.toHaveBeenCalled();
    expect(neu).toHaveBeenCalledTimes(1);
  });

  it('gibt den Fokus beim Schließen zurück', () => {
    const knopf = document.createElement('button');
    document.body.appendChild(knopf);
    knopf.focus();
    const { unmount } = render(<Sheet titel="Test" schliessen={() => undefined}><p>x</p></Sheet>);
    expect(screen.getByRole('dialog')).toHaveFocus();
    unmount();
    expect(knopf).toHaveFocus();
    knopf.remove();
  });
});
