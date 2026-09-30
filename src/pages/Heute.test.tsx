import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import * as fzApi from '../freizeiten/api';
import * as api from '../treffs/api';
import { Heute } from './Heute';
import { renderMitAuth } from '../test-utils';
import { freizeit, inTagen, treff } from '../test-daten';
import { formatKurz } from '../freizeiten/logik';

vi.mock('../freizeiten/api');
vi.mock('../treffs/api');

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(fzApi.listeFreizeiten).mockResolvedValue([freizeit({ id: 'f1', name: 'Sommer-Sause', start_datum: inTagen(2), ende_datum: inTagen(6) })]);
  vi.mocked(api.listeTreffs).mockResolvedValue([treff({ id: 't1', name: 'Treff Nord' })]);
  vi.mocked(api.listeMeineDienste).mockResolvedValue([]);
});

describe('Startseite', () => {
  it('ohne Zuordnung: Willkommen-Hinweis, keine Abfrage der Treffs', async () => {
    renderMitAuth(<Heute />, { ich: { kategorie: 'TeamerIn' } });
    expect(await screen.findByText('Willkommen im KiJuB-Kompass')).toBeInTheDocument();
    expect(api.listeTreffs).not.toHaveBeenCalled();
    expect(api.listeMeineDienste).not.toHaveBeenCalled();
  });

  it('zeigt meine Freizeiten', async () => {
    renderMitAuth(<Heute />, { freizeiten: [{ freizeit_id: 'f1', rolle: 'teamer' }] });
    expect(await screen.findByRole('link', { name: 'Sommer-Sause' })).toHaveAttribute('href', '/freizeiten/f1');
    expect(screen.queryByText('Meine Treffs')).not.toBeInTheDocument();
  });

  it('zeigt meine Treffs und die nächsten Dienste', async () => {
    vi.mocked(api.listeMeineDienste).mockResolvedValue([
      { id: 'd1', datum: inTagen(0), von: '15:00', bis: '19:00', ist_sonder: false, bezeichnung: null, treff_id: 't1', treff_name: 'Treff Nord' },
      { id: 'd2', datum: inTagen(3), von: '10:00', bis: '14:00', ist_sonder: true, bezeichnung: 'Sommerfest', treff_id: 't1', treff_name: 'Treff Nord' },
    ]);
    renderMitAuth(<Heute />, { ich: { id: 'ich', kategorie: 'TZK' }, treffs: [{ treff_id: 't1', rolle: 'betreuerin' }] });
    const treffs = await screen.findByRole('list', { name: 'Meine Treffs' });
    expect(await within(treffs).findByRole('link', { name: 'Treff Nord' })).toHaveAttribute('href', '/treffs/t1');
    const dienste = await screen.findByRole('list', { name: 'Meine Dienste' });
    const eintraege = await within(dienste).findAllByRole('listitem');
    expect(eintraege).toHaveLength(2);
    expect(eintraege[0]).toHaveTextContent(`${formatKurz(inTagen(0))} · 15:00–19:00 Uhr`);
    expect(eintraege[0]).toHaveTextContent('Heute');
    expect(eintraege[1]).toHaveTextContent('Sonderdienst: Sommerfest');
    expect(within(eintraege[0]!).getByRole('link')).toHaveAttribute('href', '/treffs/t1/dienstplan');
    expect(api.listeMeineDienste).toHaveBeenCalledWith('ich', inTagen(0), inTagen(14));
  });

  it('ohne Dienste: Hinweis', async () => {
    renderMitAuth(<Heute />, { ich: { kategorie: 'TZK' }, treffs: [{ treff_id: 't1', rolle: 'betreuerin' }] });
    expect(await screen.findByText('Keine Dienste eingeteilt.')).toBeInTheDocument();
  });

  it('meldet Fehler', async () => {
    vi.mocked(api.listeMeineDienste).mockRejectedValue(new Error('x'));
    renderMitAuth(<Heute />, { ich: { kategorie: 'TZK' }, treffs: [{ treff_id: 't1', rolle: 'betreuerin' }] });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
