import { describe, it, expect, vi, beforeEach } from 'vitest';
import { axeVerstoesse } from '../../test-a11y';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '../../mappen/api';
import * as fzApi from '../../freizeiten/api';
import { MappeSeite } from './MappeSeite';
import { renderMitAuth, type Szene } from '../../test-utils';
import { MAX_KACHELN, TEAMERMAPPE_STANDARD, TREFFMAPPE_STANDARD } from '../../mappen/standard';

vi.mock('../../mappen/api');
vi.mock('../../freizeiten/api');

const koord: Szene = { ich: { ist_koordination: true, kategorie: 'Hauptamtliche*r' } };
const teamer: Szene = { freizeiten: [{ freizeit_id: 'f1', rolle: 'teamer' }] };

const zeige = (szene: Szene = teamer, schluessel: 'teamermappe' | 'treffmappe' = 'teamermappe') =>
  renderMitAuth(<MappeSeite schluessel={schluessel} titel={schluessel === 'teamermappe' ? 'Teamermappe' : 'Treffmappe'} untertitel="Untertitel" mitSchlagworten={schluessel === 'teamermappe'} />, szene);

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.holeMappe).mockImplementation(async (s) => ({ daten: structuredClone(s === 'teamermappe' ? TEAMERMAPPE_STANDARD : TREFFMAPPE_STANDARD), aktualisiert: '2027-05-03T10:00:00Z' }));
  vi.mocked(api.schlagworteMeinerFreizeiten).mockResolvedValue([]);
  vi.mocked(api.speichereMappe).mockResolvedValue(undefined);
  vi.mocked(fzApi.listeTags).mockResolvedValue(['Küche', 'Schwimmen/Wasser']);
});

describe('Mappe: Lesen', () => {
  it('zeigt Kacheln eingeklappt, Kodex, Fragen und Notfall-Box', async () => {
    zeige();
    expect(await screen.findByRole('button', { name: /Aufsichtspflicht/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/Präsenzpflicht: Sei immer da/)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Empathie zuerst' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Wie bewerbe ich mich/ })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Notfall-Management' })).toHaveTextContent('06233-89-858');
    expect(screen.getByText(/Zuletzt aktualisiert am 03.05.2027/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bearbeiten' })).not.toBeInTheDocument();
  });

  it('klappt Kacheln und Fragen auf und zu', async () => {
    zeige();
    const kopf = await screen.findByRole('button', { name: /Aufsichtspflicht/ });
    await userEvent.click(kopf);
    expect(kopf).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/Präsenzpflicht: Sei immer da/)).toBeInTheDocument();
    await userEvent.click(kopf);
    expect(screen.queryByText(/Präsenzpflicht: Sei immer da/)).not.toBeInTheDocument();
    const frage = screen.getByRole('button', { name: /Wie bewerbe ich mich/ });
    await userEvent.click(frage);
    expect(screen.getByText(/Wunschprojekt/)).toBeInTheDocument();
  });

  it('Suche: klappt Treffer auf, hebt sie hervor und blendet den Rest aus', async () => {
    zeige();
    await screen.findByRole('button', { name: /Aufsichtspflicht/ });
    await userEvent.type(screen.getByLabelText('In der Mappe suchen'), 'Flipflops');
    expect(screen.getByRole('button', { name: /Kleidung, Handy/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Flipflops', { selector: 'mark' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Aufsichtspflicht/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Qualitäts-Kodex' })).not.toBeInTheDocument();
  });

  it('Suche ohne Treffer', async () => {
    zeige();
    await screen.findByRole('button', { name: /Aufsichtspflicht/ });
    await userEvent.type(screen.getByLabelText('In der Mappe suchen'), 'xyzxyz');
    expect(screen.getByText('Keine Treffer für „xyzxyz“')).toBeInTheDocument();
  });

  it('stuft Kacheln zurück, die nicht zu den Schlagworten meiner Freizeiten passen', async () => {
    vi.mocked(api.schlagworteMeinerFreizeiten).mockResolvedValue(['Küche']);
    zeige();
    expect(await screen.findAllByText(/Vermutlich nicht relevant für deine Freizeit/)).toHaveLength(2);
    const kacheln = within(screen.getByRole('region', { name: 'Themen' })).getAllByRole('button').map((b) => b.textContent ?? '');
    // Die zurückgestuften („Kleidung…“, „Schwimmen…“) stehen ganz am Ende.
    expect(kacheln[kacheln.length - 1]).toMatch(/Schwimmen/);
    expect(kacheln[kacheln.length - 2]).toMatch(/Kleidung/);
    expect(api.schlagworteMeinerFreizeiten).toHaveBeenCalledWith(['f1']);
  });

  it('Treffmappe: keine Abfrage der Schlagworte', async () => {
    zeige({ ich: { kategorie: 'TZK' }, treffs: [{ treff_id: 't', rolle: 'betreuerin' }] }, 'treffmappe');
    expect(await screen.findByRole('button', { name: /Ankommen & Abschließen/ })).toBeInTheDocument();
    expect(api.schlagworteMeinerFreizeiten).not.toHaveBeenCalled();
  });

  it('meldet Ladefehler', async () => {
    vi.mocked(api.holeMappe).mockRejectedValue(new Error('x'));
    zeige();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});

describe('Mappe: Bearbeiten (Koordination)', () => {
  const bearbeiten = async (schluessel: 'teamermappe' | 'treffmappe' = 'treffmappe') => {
    zeige(koord, schluessel);
    await userEvent.click(await screen.findByRole('button', { name: 'Bearbeiten' }));
    await screen.findByText('Kachel 1');
  };

  it('ändert Titel und Punkte und speichert bereinigt', async () => {
    await bearbeiten();
    const titel = screen.getAllByLabelText('Titel')[0]!;
    await userEvent.clear(titel);
    await userEvent.type(titel, '  Neuer Titel ');
    const punkte = screen.getAllByLabelText('Punkte (eine Zeile je Punkt)')[0]!;
    await userEvent.clear(punkte);
    await userEvent.type(punkte, 'Erster{Enter}{Enter}Zweiter');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(api.speichereMappe).toHaveBeenCalledTimes(1);
    const [schluessel, daten, personId] = vi.mocked(api.speichereMappe).mock.calls[0]!;
    expect(schluessel).toBe('treffmappe');
    expect(personId).toBe('ich');
    expect(daten.sections[0]).toMatchObject({ title: 'Neuer Titel', items: ['Erster', 'Zweiter'] });
    expect(daten.sections).toHaveLength(TREFFMAPPE_STANDARD.sections.length);
    expect(await screen.findByText('Gespeichert.')).toBeInTheDocument();
  });

  it('verlangt Titel', async () => {
    await bearbeiten();
    await userEvent.clear(screen.getAllByLabelText('Titel')[1]!);
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(screen.getByText('Kachel 2 hat keinen Titel.')).toBeInTheDocument();
    expect(api.speichereMappe).not.toHaveBeenCalled();
  });

  it('verschiebt und entfernt Kacheln', async () => {
    await bearbeiten();
    await userEvent.click(screen.getByRole('button', { name: 'Kachel 1 nach unten' }));
    await userEvent.click(screen.getByRole('button', { name: 'Kachel 5 entfernen' }));
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    const daten = vi.mocked(api.speichereMappe).mock.calls[0]![1];
    expect(daten.sections.map((s) => s.title).slice(0, 2)).toEqual(['Aufsichtspflicht', 'Ankommen & Abschließen']);
    expect(daten.sections).toHaveLength(TREFFMAPPE_STANDARD.sections.length - 1);
  });

  it('fügt Kacheln bis zur Obergrenze hinzu', async () => {
    await bearbeiten();
    const neu = screen.getByRole('button', { name: '+ Kachel hinzufügen' });
    for (let i = TREFFMAPPE_STANDARD.sections.length; i < MAX_KACHELN; i++) await userEvent.click(neu);
    expect(neu).toBeDisabled();
    expect(screen.getByText(`Kachel ${MAX_KACHELN}`)).toBeInTheDocument();
  });

  it('Fragen: hinzufügen, nur mit beiden Feldern speichern, löschen', async () => {
    await bearbeiten();
    await userEvent.click(screen.getByRole('button', { name: '+ Frage hinzufügen' }));
    const fragen = screen.getAllByLabelText('Frage');
    await userEvent.type(fragen[fragen.length - 1]!, 'Neue Frage?');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(screen.getByText(/Frage 5 braucht Frage und Antwort/)).toBeInTheDocument();
    const antworten = screen.getAllByLabelText('Antwort');
    await userEvent.type(antworten[antworten.length - 1]!, 'Neue Antwort');
    await userEvent.click(screen.getByRole('button', { name: 'Frage 1 löschen' }));
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    const daten = vi.mocked(api.speichereMappe).mock.calls[0]![1];
    expect(daten.faqs).toHaveLength(4);
    expect(daten.faqs[3]).toEqual({ q: 'Neue Frage?', a: 'Neue Antwort' });
  });

  it('ändert Kodex und Notfalltext', async () => {
    await bearbeiten();
    const notfall = screen.getByLabelText('Notfalltext');
    await userEvent.clear(notfall);
    await userEvent.type(notfall, 'Anrufen: 112');
    const kodex = screen.getAllByLabelText('Kodex-Titel')[0]!;
    await userEvent.clear(kodex);
    await userEvent.type(kodex, 'Tür auf');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    const daten = vi.mocked(api.speichereMappe).mock.calls[0]![1];
    expect(daten.emergencyText).toBe('Anrufen: 112');
    expect(daten.standards[0]!.title).toBe('Tür auf');
  });

  it('Teamermappe: Schlagworte je Kachel auswählbar', async () => {
    await bearbeiten('teamermappe');
    const feld = screen.getAllByRole('group', { name: /Nur relevant für Freizeiten mit Schlagwort/ })[0]!;
    await userEvent.click(await within(feld).findByLabelText('Küche'));
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(vi.mocked(api.speichereMappe).mock.calls[0]![1].sections[0]!.tags).toEqual(['Küche']);
  });

  it('Abbrechen ohne Änderung fragt nicht, mit Änderung schon', async () => {
    const frage = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await bearbeiten();
    await userEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));
    expect(frage).not.toHaveBeenCalled();
    expect(screen.queryByText('Kachel 1')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Bearbeiten' }));
    await userEvent.type(screen.getAllByLabelText('Titel')[0]!, 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));
    expect(frage).toHaveBeenCalled();
    expect(screen.getByText('Kachel 1')).toBeInTheDocument();          // abgelehnt → bleibt im Bearbeiten
    frage.mockReturnValue(true);
    await userEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));
    expect(screen.queryByText('Kachel 1')).not.toBeInTheDocument();
    expect(api.speichereMappe).not.toHaveBeenCalled();
  });

  it('meldet Speicherfehler und bleibt im Bearbeiten', async () => {
    vi.mocked(api.speichereMappe).mockRejectedValue(new Error('x'));
    await bearbeiten();
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(await screen.findByText('Die Mappe konnte nicht gespeichert werden.')).toBeInTheDocument();
    expect(screen.getByText('Kachel 1')).toBeInTheDocument();
  });
});

describe('Barrierefreiheit (axe)', () => {
  it('keine Verstöße gegen gängige Regeln', async () => {
    zeige();
    await screen.findByRole('button', { name: /Aufsichtspflicht/ });
    expect(await axeVerstoesse(document.body)).toEqual([]);
  });
});
