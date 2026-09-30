import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '../fehlermeldungen/api';
import { Fehlermeldungen } from './Fehlermeldungen';
import { renderMitAuth } from '../test-utils';

vi.mock('../fehlermeldungen/api');

const f = (o: Partial<api.Fehlermeldung> & { id: string }): api.Fehlermeldung => ({
  version: 'abc1234', seite: '/treffs/:id/notizen', meldung: 'x is not defined', stapel: null, anzahl: 1,
  erstmals: '2027-03-01T10:00:00Z', zuletzt: '2027-03-02T11:30:00Z', erledigt: false, ...o,
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.listeFehlermeldungen).mockResolvedValue([]);
  for (const fn of [api.setzeFehlerErledigt, api.loescheFehlermeldung, api.loescheErledigteFehler] as const) vi.mocked(fn as (...a: never[]) => Promise<void>).mockResolvedValue(undefined);
});

const zeige = () => renderMitAuth(<Fehlermeldungen />, { ich: { ist_koordination: true, kategorie: 'Hauptamtliche*r' } });

describe('Fehlermeldungen', () => {
  it('ohne Meldungen: freundlicher Hinweis', async () => {
    zeige();
    expect(await screen.findByText('Keine offenen Fehlermeldungen')).toBeInTheDocument();
  });

  it('zeigt Meldung, Seite, Version, Zeiten und Anzahl; Technisches eingeklappt', async () => {
    vi.mocked(api.listeFehlermeldungen).mockResolvedValue([f({ id: '1', anzahl: 7, stapel: 'at x (app.js:1:1)' })]);
    zeige();
    const eintrag = (await screen.findByRole('list', { name: 'Fehlermeldungen' })).querySelector('li')!;
    expect(eintrag).toHaveTextContent('x is not defined');
    expect(eintrag).toHaveTextContent('Seite /treffs/:id/notizen');
    expect(eintrag).toHaveTextContent('Version abc1234');
    expect(eintrag).toHaveTextContent('zuletzt 02.03.2027 11:30');
    expect(eintrag).toHaveTextContent('7×');
    expect(eintrag.querySelector('details')).not.toHaveAttribute('open');
  });

  it('Erledigte sind ausgeblendet, bis man sie zeigen lässt', async () => {
    vi.mocked(api.listeFehlermeldungen).mockResolvedValue([f({ id: '1', meldung: 'offen' }), f({ id: '2', meldung: 'schon erledigt', erledigt: true })]);
    const u = userEvent.setup();
    zeige();
    await screen.findByText('offen');
    expect(screen.queryByText('schon erledigt')).not.toBeInTheDocument();
    await u.click(screen.getByLabelText(/Erledigte zeigen \(1\)/));
    expect(screen.getByText('schon erledigt')).toBeInTheDocument();
  });

  it('abhaken, wieder öffnen und löschen', async () => {
    vi.mocked(api.listeFehlermeldungen).mockResolvedValue([f({ id: '1' }), f({ id: '2', meldung: 'alt', erledigt: true })]);
    const u = userEvent.setup();
    zeige();
    const liste = await screen.findByRole('list', { name: 'Fehlermeldungen' });
    await u.click(within(liste).getByRole('button', { name: 'Erledigt' }));
    expect(api.setzeFehlerErledigt).toHaveBeenCalledWith('1', true);
    await u.click(screen.getByLabelText(/Erledigte zeigen/));
    await u.click(screen.getByRole('button', { name: 'Wieder öffnen' }));
    expect(api.setzeFehlerErledigt).toHaveBeenCalledWith('2', false);
    await u.click(screen.getByRole('button', { name: /„x is not defined“ löschen/ }));
    expect(api.loescheFehlermeldung).toHaveBeenCalledWith('1');
  });

  it('alle Erledigten löschen mit Rückfrage', async () => {
    vi.mocked(api.listeFehlermeldungen).mockResolvedValue([f({ id: '2', erledigt: true })]);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const u = userEvent.setup();
    zeige();
    const knopf = await screen.findByRole('button', { name: 'Erledigte löschen' });
    await u.click(knopf);
    expect(api.loescheErledigteFehler).not.toHaveBeenCalled();
    await u.click(knopf);
    expect(api.loescheErledigteFehler).toHaveBeenCalledTimes(1);
    confirm.mockRestore();
  });

  it('Ladefehler und Fehler beim Speichern werden angezeigt', async () => {
    vi.mocked(api.listeFehlermeldungen).mockResolvedValue([f({ id: '1' })]);
    vi.mocked(api.setzeFehlerErledigt).mockRejectedValue({ code: '42501', message: 'row-level security' });
    const u = userEvent.setup();
    zeige();
    await u.click(await screen.findByRole('button', { name: 'Erledigt' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Dafür fehlt die Berechtigung.');
  });
});
