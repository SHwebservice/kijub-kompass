import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '../../katalog/api';
import * as wort from '../../katalog/word';
import { AngebotForm } from './AngebotForm';
import { Vorschlaege } from './Vorschlaege';
import { KatalogImport } from './KatalogImport';
import { renderMitAuth, type Szene } from '../../test-utils';
import { leeresAngebot, type Angebot } from '../../katalog/logik';

vi.mock('../../katalog/api');
vi.mock('../../katalog/word');

const fangen: Angebot = { ...leeresAngebot('bewegung'), id: 'fangen', name: 'Fangen', dauer: '20 Min.', alter_gruppen: ['6-8'], wetter: 'outdoor', umsetzung: 'Fangen spielen' };
const teamer: Szene = { freizeiten: [{ freizeit_id: 'f1', rolle: 'teamer' }] };
const koord: Szene = { ich: { ist_koordination: true, kategorie: 'Hauptamtliche*r' } };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.listeKatalog).mockResolvedValue([fangen]);
  vi.mocked(api.speichereAngebot).mockResolvedValue('neu-id');
  vi.mocked(api.reicheVorschlagEin).mockResolvedValue(undefined);
  vi.mocked(api.listeVorschlaege).mockResolvedValue([]);
  vi.mocked(api.importiereAngebote).mockImplementation(async (l) => l.length);
  for (const fn of [api.aendereVorschlag, api.lehneVorschlagAb] as const) vi.mocked(fn as (...x: never[]) => Promise<void>).mockResolvedValue(undefined);
  vi.mocked(api.uebernimmVorschlag).mockResolvedValue('x');
});

const form = (modus: 'neu' | 'bearbeiten' | 'vorschlag', s: Szene, pfad = '/katalog/neu') =>
  renderMitAuth(<AngebotForm modus={modus} />, { ...s, pfad, route: modus === 'bearbeiten' ? '/katalog/:id/bearbeiten' : pfad });

describe('Programmpunkt anlegen und bearbeiten', () => {
  it('Koordination legt an und landet beim neuen Programmpunkt', async () => {
    form('neu', koord);
    await userEvent.type(await screen.findByLabelText('Name'), '  Schnitzeljagd ');
    await userEvent.selectOptions(screen.getByLabelText('Kategorie'), 'highlight');
    await userEvent.type(screen.getByLabelText('Dauer'), '60 Min.');
    await userEvent.click(screen.getByLabelText('9–12 Jahre'));
    await userEvent.selectOptions(screen.getByLabelText('Wetter'), 'outdoor');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(api.speichereAngebot).toHaveBeenCalledWith(null, expect.objectContaining({ name: '  Schnitzeljagd ', kategorie: 'highlight', dauer: '60 Min.', alter_gruppen: ['9-12'], wetter: 'outdoor' }));
    expect(await screen.findByTestId('andere-seite')).toBeInTheDocument();
  });

  it('prüft Name und zeigt Fehler', async () => {
    form('neu', koord);
    await userEvent.click(await screen.findByRole('button', { name: 'Speichern' }));
    expect(screen.getByText('Bitte einen Namen eingeben.')).toBeInTheDocument();
    expect(api.speichereAngebot).not.toHaveBeenCalled();
  });

  it('meldet Fehler der Datenbank', async () => {
    vi.mocked(api.speichereAngebot).mockRejectedValue(new Error('x'));
    form('neu', koord);
    await userEvent.type(await screen.findByLabelText('Name'), 'X');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(await screen.findByText('Das Speichern hat nicht geklappt.')).toBeInTheDocument();
  });

  it('bearbeiten: Felder sind vorbelegt, gespeichert wird unter derselben ID', async () => {
    form('bearbeiten', koord, '/katalog/fangen/bearbeiten');
    expect(await screen.findByLabelText('Name')).toHaveValue('Fangen');
    expect(screen.getByLabelText('6–8 Jahre')).toBeChecked();
    expect(screen.getByLabelText('Wetter')).toHaveValue('outdoor');
    await userEvent.type(screen.getByLabelText('Raum'), 'Wiese');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(api.speichereAngebot).toHaveBeenCalledWith('fangen', expect.objectContaining({ raum: 'Wiese', name: 'Fangen' }));
  });

  it('bearbeiten: unbekannter Programmpunkt', async () => {
    form('bearbeiten', koord, '/katalog/gibtsnicht/bearbeiten');
    expect(await screen.findByText('Der Programmpunkt wurde nicht gefunden.')).toBeInTheDocument();
  });

  it('TeamerIn schlägt vor statt zu speichern', async () => {
    form('vorschlag', teamer, '/katalog/vorschlagen');
    expect(await screen.findByText(/Dein Vorschlag geht an die Koordination/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Name'), 'Kimspiel');
    await userEvent.click(screen.getByRole('button', { name: 'Vorschlag einreichen' }));
    expect(api.reicheVorschlagEin).toHaveBeenCalledWith('ich', expect.objectContaining({ name: 'Kimspiel' }));
    expect(api.speichereAngebot).not.toHaveBeenCalled();
  });

  it('Word-Plan füllt das Formular vor; Alter bleibt unberührt', async () => {
    vi.mocked(wort.wordZuHtml).mockResolvedValue('<h1>Workshop „Seilspiele“</h1><table><tr><th>a</th><th>b</th></tr><tr><td>Umsetzung</td><td>Seile</td><td>Seile spannen</td><td>2 Teamer</td><td>20 min</td></tr></table>');
    form('neu', koord);
    await userEvent.click(await screen.findByLabelText('9–12 Jahre'));
    await userEvent.upload(screen.getByLabelText(/Aus einem Word-Plan/), new File(['x'], 'plan.docx'));
    expect(await screen.findByText(/Übernommen – bitte die Angaben prüfen/)).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Seilspiele');
    expect(screen.getByLabelText('Umsetzung')).toHaveValue('Seile spannen');
    expect(screen.getByLabelText('Dauer')).toHaveValue('20 Min.');
    expect(screen.getByLabelText('Personalbedarf')).toHaveValue('2 Teamer');
    expect(screen.getByLabelText('9–12 Jahre')).toBeChecked();
  });

  it('kaputte Word-Datei: verständliche Meldung', async () => {
    vi.mocked(wort.wordZuHtml).mockRejectedValue(new Error('kaputt'));
    form('neu', koord);
    await userEvent.upload(await screen.findByLabelText(/Aus einem Word-Plan/), new File(['x'], 'plan.docx'));
    expect(await screen.findByText(/Die Datei konnte nicht gelesen werden/)).toBeInTheDocument();
  });
});

describe('Vorschläge', () => {
  const v = (id: string, status: 'offen' | 'angenommen' | 'abgelehnt', name: string) => ({
    id, status, created_at: '2027-02-03T10:00:00Z', eingereicht_von: 'x', einreicher: 'Ben Baum', daten: { ...leeresAngebot('kreativ'), name, umsetzung: 'Bunte Bilder malen' },
  });
  beforeEach(() => {
    vi.mocked(api.listeVorschlaege).mockResolvedValue([v('1', 'offen', 'Malen'), v('2', 'angenommen', 'Basteln'), v('3', 'abgelehnt', 'Unsinn')]);
  });

  it('Koordination: offene und entschiedene getrennt, mit Einreicher', async () => {
    renderMitAuth(<Vorschlaege />, koord);
    const offen = await screen.findByRole('list', { name: 'Offene Vorschläge' });
    expect(within(offen).getByText('Malen')).toBeInTheDocument();
    expect(within(offen).getByText('von Ben Baum')).toBeInTheDocument();
    const fertig = screen.getByRole('list', { name: 'Entschiedene Vorschläge' });
    expect(within(fertig).getByText('Übernommen')).toBeInTheDocument();
    expect(within(fertig).getByText('Abgelehnt')).toBeInTheDocument();
    expect(within(fertig).queryByRole('button')).not.toBeInTheDocument();
  });

  it('Koordination übernimmt, lehnt ab (mit Rückfrage) und bearbeitet', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderMitAuth(<Vorschlaege />, koord);
    await userEvent.click(await screen.findByRole('button', { name: 'Vorschlag „Malen“ übernehmen' }));
    expect(api.uebernimmVorschlag).toHaveBeenCalledWith('1');
    expect(await screen.findByText('„Malen“ ist jetzt im Katalog.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Vorschlag „Malen“ ablehnen' }));
    expect(api.lehneVorschlagAb).toHaveBeenCalledWith('1');
    await userEvent.click(screen.getByRole('button', { name: 'Vorschlag „Malen“ bearbeiten' }));
    const dialog = await screen.findByRole('dialog');
    const name = within(dialog).getByLabelText('Name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Malen im Freien');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Speichern' }));
    expect(api.aendereVorschlag).toHaveBeenCalledWith('1', expect.objectContaining({ name: 'Malen im Freien', kategorie: 'kreativ' }));
  });

  it('Korrektur ohne Namen wird nicht gespeichert', async () => {
    renderMitAuth(<Vorschlaege />, koord);
    await userEvent.click(await screen.findByRole('button', { name: 'Vorschlag „Malen“ bearbeiten' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.clear(within(dialog).getByLabelText('Name'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Speichern' }));
    expect(within(dialog).getByText('Bitte einen Namen eingeben.')).toBeInTheDocument();
    expect(api.aendereVorschlag).not.toHaveBeenCalled();
  });

  it('TeamerIn sieht nur Status, keine Entscheidungsknöpfe und keinen Einreicher', async () => {
    renderMitAuth(<Vorschlaege />, teamer);
    expect(await screen.findByText('Meine Vorschläge', { selector: 'h1' })).toBeInTheDocument();
    expect(screen.getByText('Offen', { selector: '.badge' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /übernehmen/ })).not.toBeInTheDocument();
    expect(screen.queryByText('von Ben Baum')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Neuer Vorschlag' })).toHaveAttribute('href', '/katalog/vorschlagen');
  });

  it('meldet Fehler beim Übernehmen', async () => {
    vi.mocked(api.uebernimmVorschlag).mockRejectedValue(new Error('x'));
    renderMitAuth(<Vorschlaege />, koord);
    await userEvent.click(await screen.findByRole('button', { name: 'Vorschlag „Malen“ übernehmen' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('leer', async () => {
    vi.mocked(api.listeVorschlaege).mockResolvedValue([]);
    renderMitAuth(<Vorschlaege />, koord);
    expect(await screen.findByText('Keine Vorschläge')).toBeInTheDocument();
  });
});

describe('Katalog-Import', () => {
  const datei = (inhalt: unknown) => new File([typeof inhalt === 'string' ? inhalt : JSON.stringify(inhalt)], 'katalog.json', { type: 'application/json' });
  const waehle = async (inhalt: unknown) => {
    renderMitAuth(<KatalogImport />, koord);
    await userEvent.upload(await screen.findByLabelText('JSON-Datei'), datei(inhalt));
  };

  it('zeigt eine Vorschau und übernimmt die neuen Programmpunkte', async () => {
    await waehle([{ name: 'Fangen', kategorie: 'bewegung' }, { name: 'Neu A', category: 'wasser' }, { name: 'Neu B', category: 'planb' }, { name: 'Kaputt', kategorie: 'x' }]);
    expect(await screen.findByText('Vorschau: katalog.json')).toBeInTheDocument();
    const punkte = screen.getAllByRole('listitem').map((l) => l.textContent ?? '');
    expect(punkte.some((t) => t.startsWith('2 neue'))).toBe(true);
    expect(punkte.some((t) => t.startsWith('1 gibt es'))).toBe(true);
    expect(within(screen.getByRole('list', { name: 'Meldungen' })).getByText(/„Kaputt“.*unbekannt/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '2 Programmpunkte übernehmen' }));
    expect(api.importiereAngebote).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.importiereAngebote).mock.calls[0]![0].map((e) => e.name)).toEqual(['Neu A', 'Neu B']);
    expect(await screen.findByText(/2 Programmpunkte wurden übernommen/)).toBeInTheDocument();
  });

  it('Vorhandene lassen sich auf Wunsch doch mit übernehmen', async () => {
    await waehle([{ name: 'Fangen', kategorie: 'bewegung' }, { name: 'Neu', kategorie: 'wasser' }]);
    await userEvent.click(await screen.findByLabelText('Schon vorhandene überspringen (empfohlen)'));
    await userEvent.click(screen.getByRole('button', { name: '2 Programmpunkte übernehmen' }));
    expect(vi.mocked(api.importiereAngebote).mock.calls[0]![0]).toHaveLength(2);
  });

  it('nichts Neues: Knopf gesperrt', async () => {
    await waehle([{ name: 'Fangen', kategorie: 'bewegung' }]);
    expect(await screen.findByRole('button', { name: 'Nichts zu übernehmen' })).toBeDisabled();
  });

  it('keine gültige Datei: Meldung, nichts zu übernehmen', async () => {
    await waehle('{kaputt');
    expect(await screen.findByText('Die Datei ist kein gültiges JSON.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nichts zu übernehmen' })).toBeDisabled();
  });

  it('Fehler beim Import: Hinweis, dass nichts übernommen wurde', async () => {
    vi.mocked(api.importiereAngebote).mockRejectedValue(new Error('x'));
    await waehle([{ name: 'Neu', kategorie: 'wasser' }]);
    await userEvent.click(await screen.findByRole('button', { name: '1 Programmpunkt übernehmen' }));
    expect(await screen.findByText(/Es wurde nichts übernommen/)).toBeInTheDocument();
  });
});
