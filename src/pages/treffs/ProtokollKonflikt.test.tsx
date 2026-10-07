import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as treffApi from '../../treffs/api';
import * as fzApi from '../../freizeiten/api';
import * as api from '../../tagesprotokoll/api';
import { ProtokollTab } from './ProtokollTab';
import { renderMitAuth, type Szene } from '../../test-utils';
import { treff } from '../../test-daten';
import { heuteIso } from '../../freizeiten/logik';
import type { Protokoll } from '../../tagesprotokoll/logik';

vi.mock('../../treffs/api');
vi.mock('../../freizeiten/api');
vi.mock('../../tagesprotokoll/api');

const heute = heuteIso();
const nord = treff({ id: 't1', name: 'Treff Nord', oeffnungszeiten: [] });
const tzk: Szene = { ich: { id: 'ich', kategorie: 'TZK' }, treffs: [{ treff_id: 't1', rolle: 'betreuerin' }] };

const protokoll = (o: Partial<Protokoll> = {}): Protokoll => ({
  id: 'p1', treff_id: 't1', datum: heute, anz_m: 4, anz_w: 5, anz_d: 1, verlauf: 'Basteln', vorkommnisse: '', erstellt_von: 'ben', bearbeitet_von: 'ben', updated_at: `${heute}T17:30:00Z`, ...o,
});
const geaendert = (o: Partial<Protokoll> = {}) => protokoll({ anz_m: 9, anz_w: 9, anz_d: 9, verlauf: 'Text der anderen', updated_at: `${heute}T18:45:00Z`, ...o });
/** Die Klasse ist im Test ersetzt (automock): den Stand setzen wir von Hand. */
const konflikt = (aktuell: Protokoll | null) => Object.assign(new api.ProtokollKonflikt(null), { aktuell });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.listeProtokolle).mockResolvedValue([protokoll()]);
  vi.mocked(api.listeVorlagen).mockResolvedValue([]);
  vi.mocked(api.speichereProtokoll).mockResolvedValue(undefined);
  vi.mocked(treffApi.listeFeiertage).mockResolvedValue([]);
  vi.mocked(treffApi.listeSchliesszeiten).mockResolvedValue([]);
  vi.mocked(fzApi.holeNamen).mockResolvedValue({ ben: 'Ben Baum' });
});

const oeffneHeutiges = async () => {
  const u = userEvent.setup();
  renderMitAuth(<ProtokollTab treff={nord} rolle="betreuerin" />, tzk);
  await u.click(await screen.findByRole('button', { name: 'Heutiges Protokoll bearbeiten' }));
  return { u, dialog: await screen.findByRole('dialog') };
};

describe('Tagesprotokoll: gleichzeitiges Bearbeiten', () => {
  it('jemand anderes hat inzwischen gespeichert: Warnung mit Name, nichts geht still verloren, die Eingaben bleiben', async () => {
    vi.mocked(api.speichereProtokoll).mockRejectedValueOnce(konflikt(geaendert()));
    const { u, dialog } = await oeffneHeutiges();
    await u.click(within(dialog).getByRole('button', { name: 'weiblich erhöhen' }));
    await u.click(within(dialog).getByRole('button', { name: 'Speichern' }));
    const warnung = (await within(dialog).findByText(/Dieses Protokoll wurde inzwischen geändert/)).closest('[role="status"]')!;
    expect(warnung).toHaveTextContent(/von Ben Baum/);
    expect(warnung).toHaveTextContent(/Wenn du dein Protokoll jetzt speicherst, gehen diese Änderungen verloren/);
    expect(within(dialog).getByLabelText('Anzahl weiblich')).toHaveValue('6');
  });

  it('„Aktuelle Fassung laden“ übernimmt den Stand der anderen; danach wird gegen dessen Zeitpunkt geprüft', async () => {
    vi.mocked(api.speichereProtokoll).mockRejectedValueOnce(konflikt(geaendert()));
    const { u, dialog } = await oeffneHeutiges();
    await u.click(within(dialog).getByRole('button', { name: 'Speichern' }));
    await u.click(await within(dialog).findByRole('button', { name: /Aktuelle Fassung laden/ }));
    expect(within(dialog).getByLabelText('Anzahl männlich')).toHaveValue('9');
    expect(within(dialog).getByLabelText(/Was war los/)).toHaveValue('Text der anderen');
    expect(within(dialog).queryByText(/inzwischen geändert/)).not.toBeInTheDocument();
    await u.click(within(dialog).getByRole('button', { name: 'Speichern' }));
    expect(api.speichereProtokoll).toHaveBeenLastCalledWith('t1', heute, expect.objectContaining({ anz_m: 9 }), { erwartet: `${heute}T18:45:00Z` });
  });

  it('„Meine Fassung trotzdem speichern“ überschreibt bewusst (ohne Prüfung)', async () => {
    vi.mocked(api.speichereProtokoll).mockRejectedValueOnce(konflikt(geaendert()));
    const { u, dialog } = await oeffneHeutiges();
    await u.click(within(dialog).getByRole('button', { name: 'Speichern' }));
    await u.click(await within(dialog).findByRole('button', { name: 'Meine Fassung trotzdem speichern' }));
    expect(api.speichereProtokoll).toHaveBeenLastCalledWith('t1', heute, expect.any(Object));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('ohne Änderung der anderen gibt es keine Warnung', async () => {
    const { dialog } = await oeffneHeutiges();
    expect(within(dialog).queryByText(/inzwischen/)).not.toBeInTheDocument();
  });

  it('jemand hat das Protokoll inzwischen gelöscht: als neues Protokoll speichern', async () => {
    vi.mocked(api.speichereProtokoll).mockRejectedValueOnce(konflikt(null));
    const { u, dialog } = await oeffneHeutiges();
    await u.click(within(dialog).getByRole('button', { name: 'Speichern' }));
    expect(await within(dialog).findByText('Dieses Protokoll wurde inzwischen gelöscht.')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /Aktuelle Fassung laden/ })).not.toBeInTheDocument();
    await u.click(within(dialog).getByRole('button', { name: 'Als neues Protokoll speichern' }));
    expect(api.speichereProtokoll).toHaveBeenLastCalledWith('t1', heute, expect.any(Object));
  });

  it('neues Protokoll, aber für den Tag gibt es inzwischen eines: Hinweis mit Übernahme', async () => {
    vi.mocked(api.listeProtokolle).mockResolvedValue([]);
    vi.mocked(api.speichereProtokoll).mockRejectedValueOnce(konflikt(geaendert()));
    const u = userEvent.setup();
    renderMitAuth(<ProtokollTab treff={nord} rolle="betreuerin" />, tzk);
    await u.click(await screen.findByRole('button', { name: 'Protokoll für heute schreiben' }));
    const dialog = await screen.findByRole('dialog');
    await u.click(within(dialog).getByRole('button', { name: 'Speichern' }));
    expect(await within(dialog).findByText('Für diesen Tag gibt es inzwischen ein Protokoll')).toBeInTheDocument();
    await u.click(within(dialog).getByRole('button', { name: /Aktuelle Fassung laden/ }));
    expect(within(dialog).getByLabelText('Anzahl divers')).toHaveValue('9');
    expect(within(dialog).queryByLabelText('Tag')).not.toBeInTheDocument();            // jetzt ist es ein bestehendes Protokoll
  });

  it('andere Fehler beim Speichern bleiben normale Fehlermeldungen', async () => {
    vi.mocked(api.speichereProtokoll).mockRejectedValueOnce(new Error('kaputt'));
    const { u, dialog } = await oeffneHeutiges();
    await u.click(within(dialog).getByRole('button', { name: 'Speichern' }));
    expect((await within(dialog).findAllByRole('alert')).length).toBeGreaterThan(0);
    expect(within(dialog).queryByText(/inzwischen geändert/)).not.toBeInTheDocument();
  });
});
