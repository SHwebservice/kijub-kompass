import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '../../teamprotokolle/api';
import * as treffApi from '../../treffs/api';
import { sendePush } from '../../mitteilungen/senden';
import { TeamprotokolleTab } from './TeamprotokolleTab';
import { renderMitAuth, type Szene } from '../../test-utils';
import { treff, treffMitglied } from '../../test-daten';
import { heuteIso } from '../../freizeiten/logik';
import { axeVerstoesse } from '../../test-a11y';
import type { Teamprotokoll } from '../../teamprotokolle/logik';

vi.mock('../../teamprotokolle/api');
vi.mock('../../treffs/api');

const nord = treff({ id: 't1', name: 'Treff Nord' });
const team = [
  treffMitglied({ person_id: 'lea', vorname: 'Lea', nachname: 'Leitner', rolle: 'treffleitung', kategorie: 'Hauptamtliche*r' }),
  treffMitglied({ person_id: 'ich', vorname: 'Anna', nachname: 'Adler' }),
  treffMitglied({ person_id: 'ben', vorname: 'Ben', nachname: 'Baum' }),
];
const protokoll = (o: Partial<Teamprotokoll> & { id: string; titel: string }): Teamprotokoll => ({
  treff_id: 't1', art: 'teambesprechung', datum: '2027-03-04', text: 'Ab April öffnen wir montags eine Stunde früher.', anwesend: [],
  erstellt_von: 'lea', bearbeitet_von: 'lea', created_at: '2027-03-04T18:00:00Z', updated_at: '2027-03-04T18:00:00Z', gelesen: [], ...o,
});

const betreuerin: Szene = { ich: { id: 'ich', kategorie: 'TZK' }, treffs: [{ treff_id: 't1', rolle: 'betreuerin' }] };
const leitung: Szene = { ich: { id: 'lea', kategorie: 'Hauptamtliche*r' }, treffs: [{ treff_id: 't1', rolle: 'treffleitung' }] };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(treffApi.holeTreffTeam).mockResolvedValue(team);
  vi.mocked(api.listeTeamprotokolle).mockResolvedValue([
    protokoll({ id: 'p1', titel: 'Teamsitzung März', anwesend: ['lea', 'ben'], gelesen: ['ben'] }),
    protokoll({ id: 'p2', titel: 'Neue Schlüsselregel', art: 'information', datum: '2027-02-10', gelesen: ['ich', 'ben'] }),
  ]);
  vi.mocked(api.vermerkeGelesen).mockResolvedValue(undefined);
  vi.mocked(api.speichereTeamprotokoll).mockResolvedValue('neu-1');
  vi.mocked(api.loescheTeamprotokoll).mockResolvedValue(undefined);
});

describe('Teamprotokolle', () => {
  it('BetreuerIn: Liste mit Art, Datum und „ungelesen“; kein Anlegen', async () => {
    renderMitAuth(<TeamprotokolleTab treff={nord} rolle="betreuerin" />, betreuerin);
    const liste = await screen.findByRole('list', { name: 'Teamprotokolle' });
    const p1 = within(liste).getByText('Teamsitzung März').closest('li')!;
    expect(p1).toHaveTextContent('Teambesprechung');
    expect(p1).toHaveTextContent('04.03.2027');
    expect(within(p1).getByText('ungelesen')).toBeInTheDocument();
    expect(within(within(liste).getByText('Neue Schlüsselregel').closest('li')!).queryByText('ungelesen')).not.toBeInTheDocument();
    expect(screen.getByText(/Ein Protokoll ist für dich noch ungelesen/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ Neues Teamprotokoll' })).not.toBeInTheDocument();
  });

  it('öffnen zeigt den Text und die Anwesenden und vermerkt „gelesen“ – ohne Bearbeiten-Knöpfe', async () => {
    const u = userEvent.setup();
    renderMitAuth(<TeamprotokolleTab treff={nord} rolle="betreuerin" />, betreuerin);
    await u.click(await screen.findByRole('button', { name: 'Teamsitzung März' }));
    const d = await screen.findByRole('dialog');
    expect(within(d).getByText('Ab April öffnen wir montags eine Stunde früher.')).toBeInTheDocument();
    expect(within(d).getByText('Anwesend: Lea Leitner, Ben Baum')).toBeInTheDocument();
    expect(within(d).getByText('von Lea Leitner')).toBeInTheDocument();
    expect(api.vermerkeGelesen).toHaveBeenCalledWith('p1', 'ich');
    expect(within(d).queryByRole('button', { name: 'Bearbeiten' })).not.toBeInTheDocument();
    expect(within(d).queryByText('Noch nicht gelesen:', { exact: false })).not.toBeInTheDocument();
  });

  it('schon gelesen: kein zweites Vermerken', async () => {
    const u = userEvent.setup();
    renderMitAuth(<TeamprotokolleTab treff={nord} rolle="betreuerin" />, betreuerin);
    await u.click(await screen.findByRole('button', { name: 'Neue Schlüsselregel' }));
    await screen.findByRole('dialog');
    expect(api.vermerkeGelesen).not.toHaveBeenCalled();
  });

  it('Treffleitung: sieht, wer gelesen hat und wer noch nicht', async () => {
    const u = userEvent.setup();
    renderMitAuth(<TeamprotokolleTab treff={nord} rolle="treffleitung" />, leitung);
    const liste = await screen.findByRole('list', { name: 'Teamprotokolle' });
    expect(within(liste).getByText('Teamsitzung März').closest('li')).toHaveTextContent('1 noch nicht gelesen');
    expect(within(liste).getByText('Neue Schlüsselregel').closest('li')).toHaveTextContent('von allen gelesen');
    await u.click(within(liste).getByRole('button', { name: 'Teamsitzung März' }));
    const d = await screen.findByRole('dialog');
    expect(within(within(d).getByRole('region', { name: 'Gelesen' })).getByText('Ben Baum')).toBeInTheDocument();
    expect(within(d).getByText('Noch nicht gelesen: Anna Adler')).toBeInTheDocument();
    expect(api.vermerkeGelesen).not.toHaveBeenCalled();                                     // eigenes Protokoll
  });

  it('Treffleitung legt an: Titel und Inhalt nötig, Anwesende wählbar, Team wird informiert', async () => {
    const u = userEvent.setup();
    renderMitAuth(<TeamprotokolleTab treff={nord} rolle="treffleitung" />, leitung);
    await u.click(await screen.findByRole('button', { name: '+ Neues Teamprotokoll' }));
    const d = await screen.findByRole('dialog');
    expect(within(d).getByLabelText('Datum')).toHaveValue(heuteIso());
    await u.click(within(d).getByRole('button', { name: 'Speichern und Team informieren' }));
    expect(within(d).getByText('Bitte einen Titel eingeben.')).toBeInTheDocument();
    expect(within(d).getByText('Bitte den Inhalt eintragen.')).toBeInTheDocument();
    await u.selectOptions(within(d).getByLabelText('Art'), 'information');
    await u.type(within(d).getByLabelText('Titel'), 'Neue Hausordnung');
    await u.type(within(d).getByLabelText('Inhalt'), 'Bitte lesen.');
    await u.click(within(d).getByLabelText('Ben Baum'));
    await u.click(within(d).getByRole('button', { name: 'Speichern und Team informieren' }));
    expect(api.speichereTeamprotokoll).toHaveBeenCalledWith('t1', null, { art: 'information', datum: heuteIso(), titel: 'Neue Hausordnung', text: 'Bitte lesen.', anwesend: ['ben'] });
    expect(sendePush).toHaveBeenCalledWith('teamprotokoll', 'neu-1');
  });

  it('Treffleitung bearbeitet (ohne neue Mitteilung) und löscht mit Rückfrage', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const u = userEvent.setup();
    renderMitAuth(<TeamprotokolleTab treff={nord} rolle="treffleitung" />, leitung);
    await u.click(await screen.findByRole('button', { name: 'Teamsitzung März' }));
    await u.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Bearbeiten' }));
    const d = await screen.findByRole('dialog', { name: 'Teamprotokoll bearbeiten' });
    expect(within(d).getByLabelText('Lea Leitner')).toBeChecked();
    await u.type(within(d).getByLabelText('Titel'), ' (ergänzt)');
    await u.click(within(d).getByRole('button', { name: 'Speichern' }));
    expect(api.speichereTeamprotokoll).toHaveBeenCalledWith('t1', 'p1', expect.objectContaining({ titel: 'Teamsitzung März (ergänzt)' }));
    expect(sendePush).not.toHaveBeenCalled();

    await u.click(screen.getByRole('button', { name: 'Neue Schlüsselregel' }));
    await u.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Löschen' }));
    expect(api.loescheTeamprotokoll).toHaveBeenCalledWith('p2');
  });

  it('Barrierefreiheit (axe): keine Verstöße', async () => {
    const { container } = renderMitAuth(<TeamprotokolleTab treff={nord} rolle="treffleitung" />, leitung);
    await screen.findByText('Teamsitzung März');
    expect(await axeVerstoesse(container)).toEqual([]);
  });
});
