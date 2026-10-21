import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '../../treffs/api';
import { renderMitAuth, type Szene } from '../../test-utils';
import { addTage, monatErster, monatText } from '../../treffs/dienstplan';
import { heuteIso } from '../../freizeiten/logik';
import { axeVerstoesse } from '../../test-a11y';
import { MeineDienste, nachMonat, kalenderUrl, VORSCHAU_TAGE } from './MeineDienste';

vi.mock('../../treffs/api');

const heute = heuteIso();
const inTagen = (n: number) => addTage(heute, n);
const betreuerin: Szene = { ich: { kategorie: 'TZK' }, treffs: [{ treff_id: 't1', rolle: 'betreuerin' }] };
const dienst = (id: string, datum: string, o: Partial<api.MeinDienst> = {}): api.MeinDienst => ({
  id, datum, von: '15:00', bis: '19:00', ist_sonder: false, bezeichnung: null, treff_id: 't1', treff_name: 'Treff Nord', eingeteilt_am: null, ...o,
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.listeMeineDienste).mockResolvedValue([]);
  vi.mocked(api.listeMeineWuensche).mockResolvedValue([]);
  vi.mocked(api.listeVeroeffentlicht).mockResolvedValue([]);
  vi.mocked(api.holeDiensteGesehen).mockResolvedValue(null);
  vi.mocked(api.merkeDiensteGesehen).mockResolvedValue(undefined);
  vi.mocked(api.kalenderLinkSeit).mockResolvedValue(null);
});

describe('Meine Dienste', () => {
  it('lädt die Dienste der nächsten Monate über alle Treffs, nach Monat mit Stunden', async () => {
    vi.mocked(api.listeMeineDienste).mockResolvedValue([
      dienst('a', inTagen(1)), dienst('b', inTagen(2), { ist_sonder: true, bezeichnung: 'Fest', von: '10:00', bis: '12:00', treff_name: 'Treff Süd', treff_id: 't2' }),
    ]);
    vi.mocked(api.listeVeroeffentlicht).mockResolvedValue([{ treff_id: 't1', monat: monatErster(inTagen(1)) }]);
    renderMitAuth(<MeineDienste />, betreuerin);
    expect(api.listeMeineDienste).toHaveBeenCalledWith('ich', heute, inTagen(VORSCHAU_TAGE));
    const liste = await screen.findByRole('list', { name: `Meine Dienste im ${monatText(monatErster(inTagen(1)))}` });
    expect(within(liste).getAllByRole('listitem').length).toBeGreaterThanOrEqual(1);
    expect(await screen.findByText('Sonderdienst: Fest')).toBeInTheDocument();
    expect(screen.getByText('Treff Süd')).toBeInTheDocument();
    // Der Monat von Treff Süd ist nicht veröffentlicht: vorläufig
    expect(await screen.findAllByText('vorläufig')).toHaveLength(1);
    expect(screen.getByRole('link', { name: new RegExp('15:00–19:00 Uhr') })).toHaveAttribute('href', `/treffs/t1/dienstplan?datum=${inTagen(1)}`);
  });

  it('markiert neu Eingeteilte seit dem letzten Besuch und merkt sich den Besuch', async () => {
    vi.mocked(api.holeDiensteGesehen).mockResolvedValue('2020-01-01T00:00:00Z');
    vi.mocked(api.listeMeineDienste).mockResolvedValue([dienst('a', inTagen(1), { eingeteilt_am: '2026-01-01T00:00:00Z' }), dienst('b', inTagen(2))]);
    renderMitAuth(<MeineDienste />, betreuerin);
    expect(await screen.findByText('neu')).toBeInTheDocument();
    expect(screen.getByText(/Ein Dienst ist seit deinem letzten Besuch neu eingeteilt/)).toBeInTheDocument();
    expect(api.merkeDiensteGesehen).toHaveBeenCalledWith('ich');
  });

  it('ohne Dienste: Hinweis; offene Wünsche stehen darunter', async () => {
    vi.mocked(api.listeMeineWuensche).mockResolvedValue([{ dienst_id: 'w', datum: inTagen(3), von: '15:00', bis: '19:00', treff_id: 't1', treff_name: 'Treff Nord', status: 'offen' }]);
    renderMitAuth(<MeineDienste />, betreuerin);
    expect(await screen.findByText('Keine Dienste eingeteilt')).toBeInTheDocument();
    expect(await screen.findByText('wartet auf Antwort')).toBeInTheDocument();
  });

  it('Kalender: Datei herunterladen und Abo-Link erzeugen (nur einmal sichtbar)', async () => {
    vi.mocked(api.meineDiensteIcs).mockResolvedValue('BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n');
    vi.mocked(api.kalenderLinkErneuern).mockResolvedValue('a'.repeat(64));
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    renderMitAuth(<MeineDienste />, betreuerin);
    await userEvent.click(await screen.findByRole('button', { name: 'Als Datei herunterladen (.ics)' }));
    expect(api.meineDiensteIcs).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Abo-Link erzeugen' }));
    expect(await screen.findByLabelText('Dein Abo-Link (nur jetzt sichtbar)')).toHaveValue(kalenderUrl('a'.repeat(64)));
    expect(screen.getByRole('link', { name: 'In Kalender-App öffnen' }).getAttribute('href')).toMatch(/^webcal:/);
  });

  it('vorhandener Abo-Link: neu erzeugen nur nach Rückfrage, löschen möglich', async () => {
    vi.mocked(api.kalenderLinkSeit).mockResolvedValue('2026-10-01T10:00:00Z');
    vi.mocked(api.kalenderLinkEntfernen).mockResolvedValue(undefined);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderMitAuth(<MeineDienste />, betreuerin);
    expect(await screen.findByText(/Du hast einen Abo-Link seit 01.10.2026/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Neuen Abo-Link erzeugen' }));
    expect(api.kalenderLinkErneuern).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await userEvent.click(screen.getByRole('button', { name: 'Abo-Link löschen' }));
    expect(api.kalenderLinkEntfernen).toHaveBeenCalled();
    confirm.mockRestore();
  });

  it('Barrierefreiheit (axe): keine Verstöße', async () => {
    vi.mocked(api.listeMeineDienste).mockResolvedValue([dienst('a', inTagen(1))]);
    renderMitAuth(<MeineDienste />, betreuerin);
    await screen.findByText('Treff Nord');
    expect(await axeVerstoesse(document.body)).toEqual([]);
  });
});

describe('nachMonat', () => {
  it('gruppiert nach Monat in zeitlicher Reihenfolge', () => {
    const g = nachMonat([dienst('b', '2027-04-02'), dienst('a', '2027-03-30'), dienst('c', '2027-04-05')]);
    expect(g.map((x) => [x.monat, x.dienste.map((d) => d.id)])).toEqual([['2027-03-01', ['a']], ['2027-04-01', ['b', 'c']]]);
  });
});
