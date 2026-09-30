import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FehlerGrenze } from './FehlerGrenze';
import { VERSION } from '../version';
import { meldeFehler } from '../fehlermeldungen/melder';

vi.mock('../fehlermeldungen/melder', () => ({ meldeFehler: vi.fn() }));

function Kaputt(): never { throw new Error('Testfehler: nicht gefunden'); }

describe('FehlerGrenze', () => {
  beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => undefined); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('zeigt ohne Fehler die Kinder', () => {
    render(<FehlerGrenze><p>Alles gut</p></FehlerGrenze>);
    expect(screen.getByText('Alles gut')).toBeInTheDocument();
  });

  it('zeigt bei einem Fehler eine verständliche Meldung statt einer weißen Seite', () => {
    render(<FehlerGrenze><Kaputt /></FehlerGrenze>);
    expect(screen.getByRole('alert')).toHaveTextContent('Da ist etwas schiefgelaufen');
    expect(screen.getByText(/Deine Daten sind nicht verloren/)).toBeInTheDocument();
    expect(screen.queryByText('Alles gut')).not.toBeInTheDocument();
  });

  it('meldet den Fehler an die Koordination (ohne ihn zu verschlucken)', () => {
    render(<FehlerGrenze><Kaputt /></FehlerGrenze>);
    expect(meldeFehler).toHaveBeenCalledWith(expect.objectContaining({ message: 'Testfehler: nicht gefunden' }));
  });

  it('zeigt technische Angaben (Meldung und Version) zum Weitergeben', () => {
    render(<FehlerGrenze><Kaputt /></FehlerGrenze>);
    expect(screen.getByText('Testfehler: nicht gefunden')).toBeInTheDocument();
    expect(screen.getByText(`Version ${VERSION}`)).toBeInTheDocument();
  });

  it('„Seite neu laden“ ruft das Neuladen auf', async () => {
    const neu = vi.fn();
    render(<FehlerGrenze neuLaden={neu}><Kaputt /></FehlerGrenze>);
    await userEvent.click(screen.getByRole('button', { name: 'Seite neu laden' }));
    expect(neu).toHaveBeenCalledTimes(1);
  });

  it('meldet den Fehler an die Konsole (für die Fehlersuche)', () => {
    render(<FehlerGrenze><Kaputt /></FehlerGrenze>);
    expect(console.error).toHaveBeenCalled();
  });
});
