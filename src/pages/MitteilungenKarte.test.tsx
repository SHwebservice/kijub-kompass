import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as geraet from '../mitteilungen/geraet';
import * as senden from '../mitteilungen/senden';
import { MitteilungenKarte } from './MitteilungenKarte';
import { renderMitAuth } from '../test-utils';

vi.mock('../mitteilungen/geraet');

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(geraet.pruefeStatus).mockResolvedValue('aus');
  vi.mocked(geraet.schalteEin).mockResolvedValue(undefined);
  vi.mocked(geraet.schalteAus).mockResolvedValue(undefined);
  vi.mocked(geraet.istApple).mockReturnValue(false);
});

const zeige = () => renderMitAuth(<MitteilungenKarte />);

describe('Mitteilungen-Karte', () => {
  it('ausgeschaltet: erklärt und bietet „einschalten“ an; nach dem Einschalten zeigt sie den neuen Stand', async () => {
    vi.mocked(geraet.pruefeStatus).mockResolvedValueOnce('aus').mockResolvedValue('an');
    zeige();
    await userEvent.click(await screen.findByRole('button', { name: 'Mitteilungen einschalten' }));
    expect(geraet.schalteEin).toHaveBeenCalledWith('ich');
    expect(await screen.findByText('Mitteilungen sind auf diesem Gerät eingeschaltet.')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Testmitteilung senden' })).toBeInTheDocument();
  });

  it('Einschalten scheitert: die Meldung erscheint, die Karte bleibt bedienbar', async () => {
    vi.mocked(geraet.schalteEin).mockRejectedValue(new Error('Ohne Erlaubnis kann der Browser keine Mitteilungen anzeigen.'));
    zeige();
    await userEvent.click(await screen.findByRole('button', { name: 'Mitteilungen einschalten' }));
    expect(await screen.findByText('Ohne Erlaubnis kann der Browser keine Mitteilungen anzeigen.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mitteilungen einschalten' })).toBeEnabled();
  });

  it('eingeschaltet: Test senden meldet die Anzahl der Geräte', async () => {
    vi.mocked(geraet.pruefeStatus).mockResolvedValue('an');
    vi.mocked(senden.sendeMitteilung).mockResolvedValue({ empfaenger: 1, geraete: 2, gesendet: 2, entfernt: 0, fehlgeschlagen: 0 });
    zeige();
    await userEvent.click(await screen.findByRole('button', { name: 'Testmitteilung senden' }));
    expect(senden.sendeMitteilung).toHaveBeenCalledWith('test');
    expect(await screen.findByText(/Testmitteilung an 2 Geräte gesendet/)).toBeInTheDocument();
  });

  it('Test an genau ein Gerät: Einzahl', async () => {
    vi.mocked(geraet.pruefeStatus).mockResolvedValue('an');
    vi.mocked(senden.sendeMitteilung).mockResolvedValue({ empfaenger: 1, geraete: 1, gesendet: 1, entfernt: 0, fehlgeschlagen: 0 });
    zeige();
    await userEvent.click(await screen.findByRole('button', { name: 'Testmitteilung senden' }));
    expect(await screen.findByText(/an 1 Gerät gesendet/)).toBeInTheDocument();
  });

  it('Test ohne erreichbares Gerät: Hinweis zum erneuten Einschalten', async () => {
    vi.mocked(geraet.pruefeStatus).mockResolvedValue('an');
    vi.mocked(senden.sendeMitteilung).mockResolvedValue({ empfaenger: 1, geraete: 1, gesendet: 0, entfernt: 1, fehlgeschlagen: 0 });
    zeige();
    await userEvent.click(await screen.findByRole('button', { name: 'Testmitteilung senden' }));
    expect(await screen.findByText(/an kein Gerät gesendet/)).toBeInTheDocument();
  });

  it('Test scheitert: Meldung der Funktion', async () => {
    vi.mocked(geraet.pruefeStatus).mockResolvedValue('an');
    vi.mocked(senden.sendeMitteilung).mockRejectedValue(new Error('Mitteilungen sind noch nicht eingerichtet (VAPID-Schlüssel fehlen).'));
    zeige();
    await userEvent.click(await screen.findByRole('button', { name: 'Testmitteilung senden' }));
    expect(await screen.findByText(/VAPID-Schlüssel fehlen/)).toBeInTheDocument();
  });

  it('ausschalten', async () => {
    vi.mocked(geraet.pruefeStatus).mockResolvedValueOnce('an').mockResolvedValue('aus');
    zeige();
    await userEvent.click(await screen.findByRole('button', { name: 'Ausschalten' }));
    expect(geraet.schalteAus).toHaveBeenCalledWith('ich');
    expect(await screen.findByText('Mitteilungen sind auf diesem Gerät ausgeschaltet.')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Mitteilungen einschalten' })).toBeInTheDocument();
  });

  it('nicht unterstützt: Erklärung; auf Apple-Geräten mit Anleitung für den Home-Bildschirm', async () => {
    vi.mocked(geraet.pruefeStatus).mockResolvedValue('nicht_unterstuetzt');
    const { unmount } = zeige();
    expect(await screen.findByText(/kann keine Mitteilungen anzeigen/)).toBeInTheDocument();
    expect(screen.queryByText(/Home-Bildschirm/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    unmount();
    vi.mocked(geraet.istApple).mockReturnValue(true);
    zeige();
    expect(await screen.findByText(/Home-Bildschirm/)).toBeInTheDocument();
  });

  it('nicht eingerichtet und blockiert: passende Hinweise ohne Schaltfläche', async () => {
    vi.mocked(geraet.pruefeStatus).mockResolvedValue('nicht_eingerichtet');
    const { unmount } = zeige();
    expect(await screen.findByText(/noch nicht eingerichtet/)).toBeInTheDocument();
    unmount();
    vi.mocked(geraet.pruefeStatus).mockResolvedValue('verweigert');
    zeige();
    expect(await screen.findByText(/blockiert/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('eine fehlgeschlagene Statusprüfung gilt als „aus“', async () => {
    vi.mocked(geraet.pruefeStatus).mockRejectedValue(new Error('x'));
    zeige();
    expect(await screen.findByRole('button', { name: 'Mitteilungen einschalten' })).toBeInTheDocument();
  });
});
