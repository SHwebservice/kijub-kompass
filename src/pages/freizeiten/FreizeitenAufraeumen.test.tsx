import { describe, it, expect, vi, beforeEach } from 'vitest';
import { axeVerstoesse } from '../../test-a11y';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '../../freizeiten/api';
import { FreizeitenAufraeumen } from './FreizeitenAufraeumen';
import { renderMitAuth } from '../../test-utils';
import { freizeit, inTagen } from '../../test-daten';

vi.mock('../../freizeiten/api');

const FK = { ich: { ist_freizeitkoordination: true, kategorie: 'Hauptamtliche*r' as const } };
const jahr = Number(inTagen(0).slice(0, 4));

const liste = [
  freizeit({ id: 'a1', name: 'Ostern alt', start_datum: `${jahr - 1}-04-06`, ende_datum: `${jahr - 1}-04-10` }),
  freizeit({ id: 'a2', name: 'Sommer alt', start_datum: `${jahr - 1}-07-06`, ende_datum: `${jahr - 1}-07-10` }),
  freizeit({ id: 'k1', name: 'Kommende Freizeit', start_datum: `${jahr + 1}-04-01`, ende_datum: `${jahr + 1}-04-05` }),
];

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.listeFreizeiten).mockResolvedValue(liste);
  vi.mocked(api.loescheFreizeiten).mockResolvedValue(2);
  vi.mocked(api.zaehleZeitraumBewerbungenJeJahr).mockResolvedValue([]);
  vi.mocked(api.loescheZeitraumBewerbungenFuer).mockResolvedValue(undefined);
});

describe('Freizeiten aufräumen', () => {
  it('gruppiert nach Jahr; ein ganzes Jahr lässt sich auf einmal auswählen und löschen', async () => {
    renderMitAuth(<FreizeitenAufraeumen />, FK);
    expect(await screen.findByRole('heading', { name: new RegExp(`^${jahr - 1}`) })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: new RegExp(`^${jahr + 1}`) })).toBeInTheDocument();
    expect(screen.getByText('Noch keine Freizeit ausgewählt.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: `Alle aus ${jahr - 1} auswählen` }));
    expect(screen.getByRole('checkbox', { name: /Ostern alt/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Sommer alt/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Kommende Freizeit/ })).not.toBeChecked();
    expect(screen.getByText('2 Freizeiten ausgewählt.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Löschen …' }));
    const los = screen.getByRole('button', { name: '2 Freizeiten endgültig löschen' });
    expect(los).toBeDisabled();
    expect(screen.queryByText(/noch nicht vorbei/)).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Zur Bestätigung die Anzahl eingeben: 2'), '2');
    await userEvent.click(los);
    expect(api.loescheFreizeiten).toHaveBeenCalledWith(['a1', 'a2']);
    expect(await screen.findByText('2 Freizeiten wurden gelöscht.')).toBeInTheDocument();
    expect(api.listeFreizeiten).toHaveBeenCalledTimes(2);
  });

  it('Auswahl eines Jahres lässt sich wieder aufheben', async () => {
    renderMitAuth(<FreizeitenAufraeumen />, FK);
    await userEvent.click(await screen.findByRole('button', { name: `Alle aus ${jahr - 1} auswählen` }));
    await userEvent.click(screen.getByRole('button', { name: `Auswahl ${jahr - 1} aufheben` }));
    expect(screen.getByRole('checkbox', { name: /Ostern alt/ })).not.toBeChecked();
    expect(screen.getByText('Noch keine Freizeit ausgewählt.')).toBeInTheDocument();
  });

  it('warnt, wenn ausgewählte Freizeiten noch nicht vorbei sind', async () => {
    renderMitAuth(<FreizeitenAufraeumen />, FK);
    expect(await screen.findByText('Kommt noch')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: /Kommende Freizeit/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Löschen …' }));
    expect(screen.getByText('Eine ausgewählte Freizeit ist noch nicht vorbei.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Eine Freizeit endgültig löschen' })).toBeDisabled();
  });

  it('Fehler beim Löschen wird angezeigt, die Auswahl bleibt', async () => {
    vi.mocked(api.loescheFreizeiten).mockRejectedValue(new Error('kaputt'));
    renderMitAuth(<FreizeitenAufraeumen />, FK);
    await userEvent.click(await screen.findByRole('checkbox', { name: /Ostern alt/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Löschen …' }));
    await userEvent.type(screen.getByLabelText('Zur Bestätigung die Anzahl eingeben: 1'), '1');
    await userEvent.click(screen.getByRole('button', { name: 'Eine Freizeit endgültig löschen' }));
    expect(await screen.findByText('Die Freizeiten konnten nicht gelöscht werden.')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Ostern alt/ })).toBeChecked();
  });

  it('Bewerbungen für eine Ferienzeit: vergangene und laufende Jahre löschbar, nächstes Jahr nicht', async () => {
    vi.mocked(api.zaehleZeitraumBewerbungenJeJahr).mockResolvedValue([{ jahr: jahr - 1, anzahl: 1 }, { jahr, anzahl: 4 }, { jahr: jahr + 1, anzahl: 3 }]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderMitAuth(<FreizeitenAufraeumen />, FK);
    expect(await screen.findByText('4 Bewerbungen')).toBeInTheDocument();
    expect(screen.getByText('eine Bewerbung')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: `Für ${jahr + 1} löschen` })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: `Für ${jahr} löschen` }));
    expect(api.loescheZeitraumBewerbungenFuer).toHaveBeenCalledWith(jahr);
    expect(await screen.findByText(`Die Bewerbungen für die Ferien ${jahr} wurden gelöscht.`)).toBeInTheDocument();
  });

  it('ist barrierefrei', async () => {
    renderMitAuth(<FreizeitenAufraeumen />, FK);
    await screen.findByText('Ostern alt');
    expect(await axeVerstoesse(document.body)).toEqual([]);
  });
});
