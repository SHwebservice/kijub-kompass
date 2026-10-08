import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '../../freizeiten/api';
import { sendePush } from '../../mitteilungen/senden';
import { MaterialTab } from './MaterialTab';
import { renderMitAuth } from '../../test-utils';
import { freizeitDetail } from '../../test-daten';
import { axeVerstoesse } from '../../test-a11y';

vi.mock('../../freizeiten/api');

const fz = freizeitDetail({ id: 'f1', name: 'Zeltlager' });
const leitung = { ich: { kategorie: 'Hauptamtliche*r' as const }, freizeiten: [{ freizeit_id: 'f1', rolle: 'leitung' as const }] };
const posten = (id: string, name: string, o: Partial<api.MaterialPosten> = {}): api.MaterialPosten => ({ id, name, menge: '', notiz: '', erstellt_von: 'lea', created_at: '2027-06-01T10:00:00Z', ...o });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.listeMaterialliste).mockResolvedValue([posten('m1', 'Bastelpapier', { menge: '5 Pakete', notiz: 'bunt' }), posten('m2', 'Bälle')]);
  vi.mocked(api.holeMaterialAbgabe).mockResolvedValue(null);
  vi.mocked(api.holeNamen).mockResolvedValue({ lea: 'Lea Leitner' });
  for (const fn of [api.legeMaterialAn, api.aendereMaterial, api.loescheMaterial, api.gibMateriallisteAb] as const) {
    vi.mocked(fn as (...a: never[]) => Promise<void>).mockResolvedValue(undefined);
  }
});

const zeige = () => renderMitAuth(<MaterialTab freizeit={fz} />, leitung);

describe('Materialliste (Reiter „Material“)', () => {
  it('zeigt die Positionen mit Menge und Notiz', async () => {
    zeige();
    const liste = await screen.findByRole('list', { name: 'Materialliste' });
    expect(within(liste).getByText('Bastelpapier')).toBeInTheDocument();
    expect(within(liste).getByText('· 5 Pakete')).toBeInTheDocument();
    expect(within(liste).getByText('bunt')).toBeInTheDocument();
  });

  it('hinzufügen (Name nötig), bearbeiten, löschen', async () => {
    const u = userEvent.setup();
    zeige();
    await screen.findByText('Bastelpapier');
    await u.click(screen.getByRole('button', { name: 'Hinzufügen' }));
    expect(screen.getByText('Bitte angeben, was gebraucht wird.')).toBeInTheDocument();
    await u.type(screen.getByLabelText('Was wird gebraucht?'), 'Seile');
    await u.type(screen.getByLabelText('Menge (optional)'), '3');
    await u.click(screen.getByRole('button', { name: 'Hinzufügen' }));
    expect(api.legeMaterialAn).toHaveBeenCalledWith('f1', { name: 'Seile', menge: '3', notiz: '' });

    await u.click(screen.getByRole('button', { name: 'Bälle bearbeiten' }));
    await u.type(screen.getByLabelText('Menge'), '10');
    await u.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(api.aendereMaterial).toHaveBeenCalledWith('m2', { name: 'Bälle', menge: '10', notiz: '' });

    await u.click(screen.getByRole('button', { name: 'Bastelpapier löschen' }));
    expect(api.loescheMaterial).toHaveBeenCalledWith('m1');
  });

  it('abgeben mit Rückfrage; die Freizeitenkoordination bekommt eine Mitteilung', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const u = userEvent.setup();
    zeige();
    await u.click(await screen.findByRole('button', { name: 'An die Freizeitenkoordination abgeben' }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('2 Positionen'));
    expect(api.gibMateriallisteAb).toHaveBeenCalledWith('f1');
    expect(sendePush).toHaveBeenCalledWith('materialliste', 'f1');
    expect(await screen.findByText(/Die Materialliste ist abgegeben/)).toBeInTheDocument();
  });

  it('nach der Abgabe: Stand mit Name; neue Positionen seitdem → Hinweis „erneut abgeben“', async () => {
    vi.mocked(api.holeMaterialAbgabe).mockResolvedValue({ abgegeben_von: 'lea', abgegeben_am: '2027-05-15T08:00:00Z' });
    zeige();
    expect(await screen.findByText(/von Lea Leitner/)).toBeInTheDocument();
    expect(screen.getByText(/Seitdem sind neue Positionen dazugekommen/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Erneut an die Freizeitenkoordination abgeben' })).toBeInTheDocument();
  });

  it('leere Liste: nichts abzugeben', async () => {
    vi.mocked(api.listeMaterialliste).mockResolvedValue([]);
    zeige();
    expect(await screen.findByText('Noch kein Material eingetragen')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /abgeben/ })).not.toBeInTheDocument();
  });

  it('Barrierefreiheit (axe): keine Verstöße', async () => {
    const { container } = zeige();
    await screen.findByText('Bastelpapier');
    expect(await axeVerstoesse(container)).toEqual([]);
  });
});
