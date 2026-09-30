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

  describe('Tastaturfokus bleibt im Fenster', () => {
    const fenster = () => render(<Sheet titel="Test" schliessen={() => undefined}><input aria-label="Erstes" /><button>Mitte</button><input aria-label="Letztes" /><button disabled>Gesperrt</button></Sheet>);

    it('Tab am Ende springt zum ersten, Umschalt+Tab am Anfang zum letzten Element (Schließen-Knopf zuerst)', async () => {
      fenster();
      const zu = screen.getByRole('button', { name: 'Schließen' });
      const letztes = screen.getByLabelText('Letztes');
      letztes.focus();
      await userEvent.tab();
      expect(zu).toHaveFocus();
      await userEvent.tab({ shift: true });
      expect(letztes).toHaveFocus();
    });

    it('Tab läuft normal durch die Elemente; gesperrte werden übersprungen', async () => {
      fenster();
      screen.getByRole('button', { name: 'Schließen' }).focus();
      await userEvent.tab();
      expect(screen.getByLabelText('Erstes')).toHaveFocus();
      await userEvent.tab();
      expect(screen.getByRole('button', { name: 'Mitte' })).toHaveFocus();
      await userEvent.tab();
      expect(screen.getByLabelText('Letztes')).toHaveFocus();
    });

    it('vom Fenster selbst (beim Öffnen fokussiert) führt Tab zum ersten, Umschalt+Tab zum letzten Element', async () => {
      fenster();
      expect(screen.getByRole('dialog')).toHaveFocus();
      await userEvent.tab();
      expect(screen.getByRole('button', { name: 'Schließen' })).toHaveFocus();
      screen.getByRole('dialog').focus();
      await userEvent.tab({ shift: true });
      expect(screen.getByLabelText('Letztes')).toHaveFocus();
    });

    it('liegt der Fokus außerhalb, holt Tab ihn zurück ins Fenster', async () => {
      const draussen = document.createElement('button');
      document.body.appendChild(draussen);
      fenster();
      draussen.focus();
      await userEvent.tab();
      expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
      draussen.remove();
    });

    it('ohne bedienbare Elemente bleibt der Fokus im Fenster', async () => {
      render(<Sheet titel="Leer" schliessen={() => undefined}><p>nur Text</p></Sheet>);
      await userEvent.tab();
      expect(document.body.contains(document.activeElement)).toBe(true);
    });
  });
});
