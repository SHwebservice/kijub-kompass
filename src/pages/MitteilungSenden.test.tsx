import { describe, it, expect, vi, beforeEach } from 'vitest';
import { axeVerstoesse } from '../test-a11y';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as fzApi from '../freizeiten/api';
import * as treffApi from '../treffs/api';
import * as api from '../mitteilungen/api';
import * as senden from '../mitteilungen/senden';
import { MitteilungSenden } from './MitteilungSenden';
import { renderMitAuth } from '../test-utils';
import { freizeit, treff } from '../test-daten';

vi.mock('../freizeiten/api');
vi.mock('../treffs/api');
vi.mock('../mitteilungen/api');

const koord = { ich: { ist_koordination: true, kategorie: 'Hauptamtliche*r' as const } };
const vorschau = (anzahl: number, mit: number, namen: string[] = []) => ({ anzahl, mit_geraet: mit, personen: namen.map((name, i) => ({ id: `p${i}`, name })) });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(fzApi.listeFreizeiten).mockResolvedValue([freizeit({ id: 'f1', name: 'Sommer-Sause' })]);
  vi.mocked(treffApi.listeTreffs).mockResolvedValue([{ ...treff({ id: 't1', name: 'Kindertreff' }), oeffnungszeiten: [] }]);
  vi.mocked(api.ladeVorschau).mockResolvedValue(vorschau(12, 7, ['Anna Adler', 'Ben Baum']));
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

const zeige = () => renderMitAuth(<MitteilungSenden />, koord);
const reichweite = () => screen.getByRole('status', { name: 'Reichweite' });
const ausfuellen = async (titel = 'Wichtig', text = 'Bitte lesen') => {
  await userEvent.type(screen.getByLabelText('Titel'), titel);
  await userEvent.type(screen.getByLabelText('Text'), text);
};

describe('Mitteilung senden (Koordination)', () => {
  it('zeigt sofort die Reichweite der ersten Gruppe und wer das ist', async () => {
    zeige();
    expect(await within(reichweite()).findByText('12 Personen – 7 davon haben Mitteilungen eingeschaltet.')).toBeInTheDocument();
    expect(api.ladeVorschau).toHaveBeenCalledWith({ art: 'alle' });
    await userEvent.click(screen.getByText('Wer das ist'));
    expect(within(screen.getByRole('list', { name: 'Empfänger' })).getAllByRole('listitem').map((l) => l.textContent)).toEqual(['Anna Adler', 'Ben Baum']);
  });

  it('die Vorschau folgt der Auswahl: feste Gruppen', async () => {
    zeige();
    await within(reichweite()).findByText(/12 Personen/);
    await userEvent.selectOptions(screen.getByLabelText('Gruppe'), 'leitungen');
    await vi.waitFor(() => expect(api.ladeVorschau).toHaveBeenLastCalledWith({ art: 'kategorie', kategorie: 'leitung' }));
    await userEvent.selectOptions(screen.getByLabelText('Gruppe'), 'teamer');
    await vi.waitFor(() => expect(api.ladeVorschau).toHaveBeenLastCalledWith({ art: 'kategorie', kategorie: 'teamer' }));
  });

  it('Freizeit: erst nach der Auswahl gibt es eine Vorschau; die Rolle grenzt ein', async () => {
    zeige();
    await userEvent.selectOptions(await screen.findByLabelText('Gruppe'), 'freizeit');
    await screen.findByRole('option', { name: 'Sommer-Sause' });
    expect(reichweite()).toBeEmptyDOMElement();
    expect(screen.getByRole('button', { name: 'Mitteilung senden' })).toBeDisabled();
    await userEvent.selectOptions(screen.getByLabelText('Freizeit'), 'f1');
    await vi.waitFor(() => expect(api.ladeVorschau).toHaveBeenLastCalledWith({ art: 'freizeit', id: 'f1' }));
    await userEvent.selectOptions(screen.getByLabelText('Wer in der Freizeit?'), 'teamer');
    await vi.waitFor(() => expect(api.ladeVorschau).toHaveBeenLastCalledWith({ art: 'freizeit', id: 'f1', rolle: 'teamer' }));
    expect(screen.getByRole('button', { name: 'Mitteilung senden' })).toBeEnabled();
  });

  it('Treff mit Rolle', async () => {
    zeige();
    await userEvent.selectOptions(await screen.findByLabelText('Gruppe'), 'treff');
    await screen.findByRole('option', { name: 'Kindertreff' });
    await userEvent.selectOptions(screen.getByLabelText('Treff'), 't1');
    await userEvent.selectOptions(screen.getByLabelText('Wer im Treff?'), 'treffleitung');
    await vi.waitFor(() => expect(api.ladeVorschau).toHaveBeenLastCalledWith({ art: 'treff', id: 't1', rolle: 'treffleitung' }));
  });

  it('ein Wechsel der Gruppe setzt Auswahl und Rolle zurück', async () => {
    zeige();
    await userEvent.selectOptions(await screen.findByLabelText('Gruppe'), 'freizeit');
    await screen.findByRole('option', { name: 'Sommer-Sause' });
    await userEvent.selectOptions(screen.getByLabelText('Freizeit'), 'f1');
    await userEvent.selectOptions(screen.getByLabelText('Gruppe'), 'treff');
    await screen.findByRole('option', { name: 'Kindertreff' });
    expect(screen.getByLabelText('Treff')).toHaveValue('');
  });

  it('prüft Titel und Text vor dem Senden', async () => {
    zeige();
    await within(reichweite()).findByText(/12 Personen/);
    await userEvent.click(screen.getByRole('button', { name: 'Mitteilung senden' }));
    expect(screen.getByText('Bitte einen Titel eingeben.')).toBeInTheDocument();
    expect(screen.getByText('Bitte einen Text eingeben.')).toBeInTheDocument();
    expect(senden.sendeMitteilung).not.toHaveBeenCalled();
  });

  it('fragt nach, sendet an die gewählte Gruppe und meldet das Ergebnis', async () => {
    vi.mocked(senden.sendeMitteilung).mockResolvedValue({ empfaenger: 12, geraete: 9, gesendet: 8, entfernt: 1, fehlgeschlagen: 0 });
    zeige();
    await within(reichweite()).findByText(/12 Personen/);
    await userEvent.selectOptions(screen.getByLabelText('Gruppe'), 'koordination');
    await ausfuellen('  Wichtig  ', 'Bitte lesen');
    await userEvent.click(screen.getByRole('button', { name: 'Mitteilung senden' }));
    expect(window.confirm).toHaveBeenCalledWith('Mitteilung „Wichtig“ an 12 Personen senden?');
    expect(senden.sendeMitteilung).toHaveBeenCalledWith('manuell', null, { ziel: { art: 'koordination' }, titel: 'Wichtig', text: 'Bitte lesen' });
    expect(await screen.findByText(/Gesendet an 8 Geräte von 12 Personen\./)).toBeInTheDocument();
    expect(screen.getByText(/1 nicht mehr gültige Geräteanmeldung wurde entfernt/)).toBeInTheDocument();
    expect(screen.getByLabelText('Titel')).toHaveValue('');                     // Formular ist danach leer
  });

  it('ohne Zustimmung beim Nachfragen wird nichts gesendet', async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    zeige();
    await within(reichweite()).findByText(/12 Personen/);
    await ausfuellen();
    await userEvent.click(screen.getByRole('button', { name: 'Mitteilung senden' }));
    expect(senden.sendeMitteilung).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Titel')).toHaveValue('Wichtig');
  });

  it('niemand erreichbar: Warnung statt Erfolgsmeldung', async () => {
    vi.mocked(senden.sendeMitteilung).mockResolvedValue({ empfaenger: 3, geraete: 0, gesendet: 0, entfernt: 0, fehlgeschlagen: 0 });
    zeige();
    await within(reichweite()).findByText(/12 Personen/);
    await ausfuellen();
    await userEvent.click(screen.getByRole('button', { name: 'Mitteilung senden' }));
    expect(await screen.findByText('An 3 Personen, aber kein Gerät erreichbar.')).toBeInTheDocument();
  });

  it('zeigt die Meldung der Funktion bei Fehlern und behält die Eingaben', async () => {
    vi.mocked(senden.sendeMitteilung).mockRejectedValue(new Error('Zu viele Mitteilungen in kurzer Zeit'));
    zeige();
    await within(reichweite()).findByText(/12 Personen/);
    await ausfuellen();
    await userEvent.click(screen.getByRole('button', { name: 'Mitteilung senden' }));
    expect(await screen.findByText('Zu viele Mitteilungen in kurzer Zeit')).toBeInTheDocument();
    expect(screen.getByLabelText('Titel')).toHaveValue('Wichtig');
  });

  it('Fehler bei der Vorschau werden angezeigt', async () => {
    vi.mocked(api.ladeVorschau).mockRejectedValue(new Error('x'));
    zeige();
    expect(await within(reichweite()).findByRole('alert')).toBeInTheDocument();
  });

  it('zählt die Zeichen des Textes', async () => {
    zeige();
    await userEvent.type(await screen.findByLabelText('Text'), 'Hallo');
    expect(screen.getByText('5 von 300 Zeichen')).toBeInTheDocument();
  });
});

describe('Barrierefreiheit (axe)', () => {
  it('keine Verstöße gegen gängige Regeln', async () => {
    zeige();
    await within(reichweite()).findByText('12 Personen – 7 davon haben Mitteilungen eingeschaltet.');
    expect(await axeVerstoesse(document.body)).toEqual([]);
  });
});
