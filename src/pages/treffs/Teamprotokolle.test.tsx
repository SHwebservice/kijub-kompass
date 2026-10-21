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
  treff_id: 't1', art: 'teambesprechung', datum: '2027-03-04', text: 'Ab April öffnen wir montags eine Stunde früher.',
  abschnitte: [{ titel: '', text: 'Ab April öffnen wir montags eine Stunde früher.' }], naechstes_datum: null, naechstes_zeit: null, aufgaben: '', anwesend: [], entwurf: false,
  erstellt_von: 'lea', bearbeitet_von: 'lea', gemeldet_am: '2027-03-04T18:00:00Z', gemeldet_von: 'lea', created_at: '2027-03-04T18:00:00Z', updated_at: '2027-03-04T18:00:00Z',
  gelesen: [], vorEintritt: [], ...o,
});

const betreuerin: Szene = { ich: { id: 'ich', kategorie: 'TZK' }, treffs: [{ treff_id: 't1', rolle: 'betreuerin' }] };
const leitung: Szene = { ich: { id: 'lea', kategorie: 'Hauptamtliche*r' }, treffs: [{ treff_id: 't1', rolle: 'treffleitung' }] };

beforeEach(() => {
  vi.resetAllMocks();
  window.localStorage.clear();
  vi.mocked(treffApi.holeTreffTeam).mockResolvedValue(team);
  vi.mocked(api.listeTeamprotokolle).mockResolvedValue([
    protokoll({ id: 'p1', titel: 'Teamsitzung März', anwesend: ['lea', 'ben'], gelesen: ['ben'] }),
    protokoll({ id: 'p2', titel: 'Neue Schlüsselregel', art: 'information', datum: '2027-02-10', gelesen: ['ich', 'ben'] }),
  ]);
  vi.mocked(api.vermerkeGelesen).mockResolvedValue(undefined);
  vi.mocked(api.speichereTeamprotokoll).mockImplementation(async (_t, id) => id ?? 'neu-1');
  vi.mocked(api.loescheTeamprotokoll).mockResolvedValue(undefined);
  vi.mocked(api.meldeAenderung).mockResolvedValue(undefined);
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
    expect(api.vermerkeGelesen).toHaveBeenCalledWith('p1', 'ich', false);
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

  it('Treffleitung legt an: Abschnitte, nächstes Treffen, Aufgaben; Veröffentlichen informiert das Team', async () => {
    const u = userEvent.setup();
    renderMitAuth(<TeamprotokolleTab treff={nord} rolle="treffleitung" />, leitung);
    await u.click(await screen.findByRole('button', { name: '+ Neues Teamprotokoll' }));
    const d = await screen.findByRole('dialog');
    expect(within(d).getByLabelText('Datum')).toHaveValue(heuteIso());
    await u.click(within(d).getByRole('button', { name: 'Veröffentlichen und Team informieren' }));
    expect(within(d).getByText('Bitte einen Titel eingeben.')).toBeInTheDocument();
    expect(within(d).getByText('Bitte mindestens einen Abschnitt ausfüllen.')).toBeInTheDocument();
    await u.selectOptions(within(d).getByLabelText('Art'), 'information');
    await u.type(within(d).getByLabelText('Titel'), 'Teamsitzung April');
    await u.type(within(d).getByLabelText('Überschrift 1'), 'Termine');
    await u.type(within(d).getByLabelText('Ergebnis 1'), 'Sommerfest am 3.7.');
    await u.click(within(d).getByRole('button', { name: '+ Überschrift hinzufügen' }));
    await u.type(within(d).getByLabelText('Überschrift 2'), 'Kasse');
    await u.type(within(d).getByLabelText('Ergebnis 2'), '- prüfen');
    await u.click(within(d).getByRole('button', { name: 'Abschnitt 2 nach oben' }));
    await u.type(within(d).getByLabelText('Nächstes Treffen'), '2027-04-15');
    await u.type(within(d).getByLabelText('Uhrzeit'), '18:30');
    await u.type(within(d).getByLabelText('Aufgaben und Ziele'), '- Flyer drucken');
    await u.click(within(d).getByLabelText('Ben Baum'));
    await u.click(within(d).getByRole('button', { name: 'Veröffentlichen und Team informieren' }));
    expect(api.speichereTeamprotokoll).toHaveBeenCalledWith('t1', null, {
      art: 'information', datum: heuteIso(), titel: 'Teamsitzung April', abschnitte: [{ titel: 'Kasse', text: '- prüfen' }, { titel: 'Termine', text: 'Sommerfest am 3.7.' }],
      naechstes_datum: '2027-04-15', naechstes_zeit: '18:30', aufgaben: '- Flyer drucken', anwesend: ['ben'],
    }, false);
    expect(sendePush).toHaveBeenCalledWith('teamprotokoll', 'neu-1');
  });

  it('Als Entwurf speichern: ohne Inhalt möglich, keine Mitteilung; der Entwurf ist markiert und zählt nicht', async () => {
    vi.mocked(api.listeTeamprotokolle).mockResolvedValue([protokoll({ id: 'e1', titel: 'Entwurf Mai', entwurf: true, gemeldet_am: null, gemeldet_von: null })]);
    const u = userEvent.setup();
    renderMitAuth(<TeamprotokolleTab treff={nord} rolle="treffleitung" />, leitung);
    const e1 = (await screen.findByText('Entwurf Mai')).closest('li')!;
    expect(within(e1).getByText('Entwurf')).toBeInTheDocument();
    expect(e1).not.toHaveTextContent('noch nicht gelesen');
    await u.click(screen.getByRole('button', { name: '+ Neues Teamprotokoll' }));
    const d = await screen.findByRole('dialog');
    await u.type(within(d).getByLabelText('Titel'), 'Nur ein Gerüst');
    await u.click(within(d).getByRole('button', { name: 'Als Entwurf speichern' }));
    expect(api.speichereTeamprotokoll).toHaveBeenCalledWith('t1', null, expect.objectContaining({ titel: 'Nur ein Gerüst' }), true);
    expect(sendePush).not.toHaveBeenCalled();
  });

  it('Entwurf veröffentlichen: jetzt erst die Mitteilung', async () => {
    vi.mocked(api.listeTeamprotokolle).mockResolvedValue([protokoll({ id: 'e1', titel: 'Entwurf Mai', entwurf: true, gemeldet_am: null, gemeldet_von: null })]);
    const u = userEvent.setup();
    renderMitAuth(<TeamprotokolleTab treff={nord} rolle="treffleitung" />, leitung);
    await u.click(await screen.findByRole('button', { name: 'Entwurf Mai' }));
    const lesen = await screen.findByRole('dialog');
    expect(within(lesen).getByText(/nur Treffleitung und Koordination sehen ihn/)).toBeInTheDocument();
    expect(within(lesen).queryByRole('region', { name: 'Gelesen' })).not.toBeInTheDocument();
    await u.click(within(lesen).getByRole('button', { name: 'Bearbeiten' }));
    const d = await screen.findByRole('dialog', { name: 'Entwurf bearbeiten' });
    await u.click(within(d).getByRole('button', { name: 'Veröffentlichen und Team informieren' }));
    expect(api.speichereTeamprotokoll).toHaveBeenCalledWith('t1', 'e1', expect.anything(), false);
    expect(sendePush).toHaveBeenCalledWith('teamprotokoll', 'e1');
  });

  it('Treffleitung bearbeitet ohne Meldung (keine Mitteilung) und löscht mit Rückfrage', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const u = userEvent.setup();
    renderMitAuth(<TeamprotokolleTab treff={nord} rolle="treffleitung" />, leitung);
    await u.click(await screen.findByRole('button', { name: 'Teamsitzung März' }));
    await u.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Bearbeiten' }));
    const d = await screen.findByRole('dialog', { name: 'Teamprotokoll bearbeiten' });
    expect(within(d).getByLabelText('Lea Leitner')).toBeChecked();
    expect(within(d).getByLabelText('Ergebnis 1')).toHaveValue('Ab April öffnen wir montags eine Stunde früher.');
    await u.type(within(d).getByLabelText('Titel'), ' (ergänzt)');
    await u.click(within(d).getByRole('button', { name: 'Speichern' }));
    expect(api.speichereTeamprotokoll).toHaveBeenCalledWith('t1', 'p1', expect.objectContaining({ titel: 'Teamsitzung März (ergänzt)' }), false);
    expect(api.meldeAenderung).not.toHaveBeenCalled();
    expect(sendePush).not.toHaveBeenCalled();

    await u.click(screen.getByRole('button', { name: 'Neue Schlüsselregel' }));
    await u.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Löschen' }));
    expect(api.loescheTeamprotokoll).toHaveBeenCalledWith('p2');
  });

  it('Änderung ans Team melden: Gelesen-Stand zurück und Mitteilung „geändert“', async () => {
    const u = userEvent.setup();
    renderMitAuth(<TeamprotokolleTab treff={nord} rolle="treffleitung" />, leitung);
    await u.click(await screen.findByRole('button', { name: 'Teamsitzung März' }));
    await u.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Bearbeiten' }));
    const d = await screen.findByRole('dialog', { name: 'Teamprotokoll bearbeiten' });
    await u.click(within(d).getByLabelText(/Änderung ans Team melden/));
    await u.click(within(d).getByRole('button', { name: 'Speichern und melden' }));
    expect(api.meldeAenderung).toHaveBeenCalledWith('p1');
    expect(sendePush).toHaveBeenCalledWith('teamprotokoll_geaendert', 'p1');
  });

  it('Lesen: Abschnitte auf- und zuklappen, Abschluss mit nächstem Treffen und Aufgaben, „zuletzt geändert“', async () => {
    vi.mocked(api.listeTeamprotokolle).mockResolvedValue([protokoll({
      id: 'g1', titel: 'Gegliedert', abschnitte: [{ titel: 'Termine', text: 'Sommerfest' }, { titel: 'Kasse', text: '- Kassenbuch prüfen\n- Belege sammeln' }],
      naechstes_datum: '2027-04-15', naechstes_zeit: '18:30:00', aufgaben: 'Flyer drucken', updated_at: '2027-03-05T09:15:00Z', bearbeitet_von: 'lea', gelesen: ['ich'],
    })]);
    const u = userEvent.setup();
    renderMitAuth(<TeamprotokolleTab treff={nord} rolle="betreuerin" />, betreuerin);
    await u.click(await screen.findByRole('button', { name: 'Gegliedert' }));
    const d = await screen.findByRole('dialog');
    const termine = within(d).getByText('Termine').closest('details')!;
    const kasse = within(d).getByText('Kasse').closest('details')!;
    expect(termine).toHaveAttribute('open');
    expect(kasse).not.toHaveAttribute('open');
    expect([...kasse.querySelectorAll('li')].map((l) => l.textContent)).toEqual(['Kassenbuch prüfen', 'Belege sammeln']);
    await u.click(within(d).getByRole('button', { name: 'Alle aufklappen' }));
    expect(kasse).toHaveAttribute('open');
    await u.click(within(d).getByRole('button', { name: 'Alle zuklappen' }));
    expect(termine).not.toHaveAttribute('open');
    const abschluss = within(d).getByRole('region', { name: 'Nächstes Treffen, Aufgaben und Ziele' });
    expect(abschluss).toHaveTextContent('Nächstes Treffen: 15.04.2027 um 18:30 Uhr');
    expect(abschluss).toHaveTextContent('Flyer drucken');
    expect(within(d).getByText(/Zuletzt geändert am .* von Lea Leitner/)).toBeInTheDocument();
  });

  it('Drucken / als PDF speichern: Vorlage mit allen Abschnitten, Dateiname aus Treff, Datum und Titel', async () => {
    vi.mocked(api.listeTeamprotokolle).mockResolvedValue([protokoll({
      id: 'g1', titel: 'Gegliedert', abschnitte: [{ titel: 'Termine', text: 'Sommerfest' }, { titel: 'Kasse', text: '- Kassenbuch prüfen' }],
      aufgaben: 'Flyer drucken', anwesend: ['lea', 'ben'], gelesen: ['ich'],
    })]);
    let beimDrucken: { titel: string; text: string } | null = null;
    const print = vi.spyOn(window, 'print').mockImplementation(() => {
      beimDrucken = { titel: document.title, text: document.querySelector('.teamprotokoll-druck')?.textContent ?? '' };
    });
    document.title = 'KiJuB-Kompass';
    renderMitAuth(<TeamprotokolleTab treff={nord} rolle="betreuerin" />, betreuerin);
    await userEvent.click(await screen.findByRole('button', { name: 'Gegliedert' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Drucken / als PDF speichern' }));
    expect(print).toHaveBeenCalledTimes(1);
    expect(beimDrucken!.titel).toBe('Teamprotokoll Treff Nord 2027-03-04 – Gegliedert');
    for (const teil of ['Treff Nord · Teamprotokoll', 'Gegliedert', '04.03.2027 · von Lea Leitner', 'Anwesend: Lea Leitner, Ben Baum', 'Termine', 'Sommerfest', 'Kasse', 'Kassenbuch prüfen', 'Aufgaben und Ziele', 'Flyer drucken']) {
      expect(beimDrucken!.text).toContain(teil);
    }
    expect(beimDrucken!.text).not.toContain('Gelesen');
    expect(document.title).toBe('KiJuB-Kompass');
    expect(document.querySelector('.teamprotokoll-druck')).toBeNull();
    print.mockRestore();
  });

  it('neu im Team: „vor Eintritt“ ist nicht ungelesen; Öffnen macht daraus „gelesen“; die Leitung sieht es getrennt', async () => {
    vi.mocked(api.listeTeamprotokolle).mockResolvedValue([protokoll({ id: 'p1', titel: 'Alt', gelesen: ['ich'], vorEintritt: ['ich'] })]);
    const u = userEvent.setup();
    const a = renderMitAuth(<TeamprotokolleTab treff={nord} rolle="betreuerin" />, betreuerin);
    const alt = (await screen.findByRole('button', { name: 'Alt' })).closest('li')!;
    expect(within(alt).queryByText('ungelesen')).not.toBeInTheDocument();
    await u.click(within(alt).getByRole('button', { name: 'Alt' }));
    await screen.findByRole('dialog');
    expect(api.vermerkeGelesen).toHaveBeenCalledWith('p1', 'ich', true);
    a.unmount();

    renderMitAuth(<TeamprotokolleTab treff={nord} rolle="treffleitung" />, leitung);
    await u.click(await screen.findByRole('button', { name: 'Alt' }));
    const d = await screen.findByRole('dialog');
    expect(within(d).getByText('Erst danach ins Team gekommen: Anna Adler')).toBeInTheDocument();
    expect(within(d).getByRole('region', { name: 'Gelesen' })).toHaveTextContent('Noch niemand.');                 // „vor Eintritt“ ist kein „gelesen“
  });

  it('ungespeicherte Eingaben bleiben auf dem Gerät und lassen sich wiederherstellen', async () => {
    const u = userEvent.setup();
    renderMitAuth(<TeamprotokolleTab treff={nord} rolle="treffleitung" />, leitung);
    await u.click(await screen.findByRole('button', { name: '+ Neues Teamprotokoll' }));
    let d = await screen.findByRole('dialog');
    await u.type(within(d).getByLabelText('Titel'), 'Halb fertig');
    await u.click(within(d).getByRole('button', { name: 'Schließen' }));            // versehentlich zu
    await u.click(screen.getByRole('button', { name: '+ Neues Teamprotokoll' }));
    d = await screen.findByRole('dialog');
    expect(within(d).getByLabelText('Titel')).toHaveValue('');
    await u.click(within(d).getByRole('button', { name: 'Wiederherstellen' }));
    expect(within(d).getByLabelText('Titel')).toHaveValue('Halb fertig');
  });

  it('Barrierefreiheit (axe): keine Verstöße', async () => {
    const { container } = renderMitAuth(<TeamprotokolleTab treff={nord} rolle="treffleitung" />, leitung);
    await screen.findByText('Teamsitzung März');
    expect(await axeVerstoesse(container)).toEqual([]);
  });

  it('Barrierefreiheit (axe): gegliederte Lese-Ansicht und Formular', async () => {
    vi.mocked(api.listeTeamprotokolle).mockResolvedValue([protokoll({
      id: 'g1', titel: 'Gegliedert', abschnitte: [{ titel: 'Termine', text: 'Sommerfest' }, { titel: 'Kasse', text: '- prüfen' }], naechstes_datum: '2027-04-15', aufgaben: 'Flyer',
    })]);
    const u = userEvent.setup();
    renderMitAuth(<TeamprotokolleTab treff={nord} rolle="treffleitung" />, leitung);
    await u.click(await screen.findByRole('button', { name: 'Gegliedert' }));
    await screen.findByRole('dialog');
    expect(await axeVerstoesse(document.body)).toEqual([]);
    await u.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Bearbeiten' }));
    await screen.findByRole('dialog', { name: 'Teamprotokoll bearbeiten' });
    expect(await axeVerstoesse(document.body)).toEqual([]);
  });
});
