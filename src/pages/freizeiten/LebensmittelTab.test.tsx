import { describe, it, expect, vi, beforeEach } from 'vitest';
import { axeVerstoesse } from '../../test-a11y';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { sendePush } from '../../mitteilungen/senden';
import * as api from '../../freizeiten/api';
import { LebensmittelTab } from './LebensmittelTab';
import { renderMitAuth } from '../../test-utils';
import { freizeitDetail, inTagen } from '../../test-daten';
import { heuteIso, formatDatum } from '../../freizeiten/logik';

vi.mock('../../freizeiten/api');

const start = inTagen(-1);
const ende = inTagen(3);
const f = freizeitDetail({ id: 'f1', ort_id: 'o1', ort_name: 'Mörscher Au', start_datum: start, ende_datum: ende });
const heute = heuteIso();

const eingaenge = [
  { id: 'e1', name: 'Milch', menge: 100, einheit: 'l', datum: inTagen(-3), freizeit_id: 'f1' },
  { id: 'e2', name: 'Kakao', menge: 1000, einheit: 'g', datum: inTagen(-3), freizeit_id: 'f1' },
  { id: 'e3', name: 'Reis', menge: 10, einheit: 'kg', datum: inTagen(-3), freizeit_id: 'f1' },
];
const verbrauch = [
  { id: 'v1', name: 'Milch', menge: 30, datum: start, freizeit_id: 'f1' },
  { id: 'v2', name: 'Kakao', menge: 1000, datum: start, freizeit_id: 'f1' },
  { id: 'v3', name: 'Reis', menge: 8, datum: start, freizeit_id: 'f1' },
];
const leitung = { ich: { kategorie: 'Hauptamtliche*r' as const }, freizeiten: [{ freizeit_id: 'f1', rolle: 'leitung' as const }] };
const karte = (name: string) => screen.getByText(name, { selector: 'strong' }).closest('li')!;

function zeige(detail = f) { return renderMitAuth(<LebensmittelTab freizeit={detail} />, leitung); }

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.listeEingaenge).mockResolvedValue(eingaenge);
  vi.mocked(api.listeVerbrauch).mockResolvedValue(verbrauch);
  for (const fn of [api.trageEingangEin, api.trageVerbrauchEin, api.aendereEingang, api.aendereVerbrauch, api.loescheEingang, api.loescheVerbrauch] as const) {
    vi.mocked(fn as (...a: never[]) => Promise<void>).mockResolvedValue(undefined);
  }
});

describe('Lebensmittel: Anzeige', () => {
  it('ohne Ort: Hinweis, keine Abfrage', async () => {
    zeige({ ...f, ort_id: null, ort_name: null });
    expect(await screen.findByText('Dieser Freizeit ist noch kein Ort zugeordnet')).toBeInTheDocument();
    expect(api.listeEingaenge).not.toHaveBeenCalled();
  });

  it('kritische Artikel zuerst und oben als Warnung; Rest und Ampel stimmen', async () => {
    zeige();
    await screen.findByText('Kakao', { selector: 'strong' });
    const namen = screen.getAllByRole('progressbar').map((b) => b.getAttribute('aria-label'));
    expect(namen).toEqual(['Bestand Kakao', 'Bestand Reis', 'Bestand Milch']);      // leer, knapp (20 %), ok (70 %)
    expect(screen.getByText(/Kakao \(leer\), Reis \(bald leer\)/)).toBeInTheDocument();
    expect(within(karte('Kakao')).getByText('Leer')).toBeInTheDocument();
    expect(within(karte('Reis')).getByText('Bald leer')).toBeInTheDocument();
    expect(within(karte('Milch')).queryByText(/Leer|Bald/)).not.toBeInTheDocument();
    expect(within(karte('Milch')).getByText('70 l')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Bestand Milch' })).toHaveAttribute('aria-valuenow', '70');
    expect(within(karte('Milch')).getByText('Erhalten: 100 l')).toBeInTheDocument();
    expect(within(karte('Milch')).getByText('Verbraucht: 30 l')).toBeInTheDocument();
  });

  it('Hochrechnung: warnt, wenn der Rest nicht für die übrigen Tage reicht', async () => {
    zeige();
    await screen.findByText('Milch', { selector: 'strong' });
    expect(within(karte('Reis')).getByText(/reicht voraussichtlich nicht/)).toBeInTheDocument();   // 8 pro Tag × 4 Tage
    expect(within(karte('Milch')).getByText(/Hochrechnung: etwa 120 l.*reicht voraussichtlich nicht/)).toBeInTheDocument();
  });

  it('leerer Zustand', async () => {
    vi.mocked(api.listeEingaenge).mockResolvedValue([]);
    vi.mocked(api.listeVerbrauch).mockResolvedValue([]);
    zeige();
    expect(await screen.findByText('Noch keine Lebensmittel eingetragen')).toBeInTheDocument();
  });

  it('Ladefehler', async () => {
    vi.mocked(api.listeEingaenge).mockRejectedValue({ code: '42501', message: 'rls' });
    zeige();
    expect(await screen.findByRole('alert')).toHaveTextContent('Dafür fehlt die Berechtigung.');
  });
});

describe('Lebensmittel: Wareneingang', () => {
  it('prüft Name und Menge', async () => {
    zeige();
    await userEvent.click(await screen.findByRole('button', { name: 'Eingang eintragen' }));
    expect(screen.getByText('Bitte ein Lebensmittel angeben.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Lebensmittel'), 'Butter');
    await userEvent.type(screen.getByLabelText('Menge'), 'viel');
    await userEvent.click(screen.getByRole('button', { name: 'Eingang eintragen' }));
    expect(screen.getByText('Bitte eine Menge größer 0 eingeben.')).toBeInTheDocument();
    expect(api.trageEingangEin).not.toHaveBeenCalled();
  });

  it('trägt ein (Komma als Dezimalzeichen), mit Datum heute, und leert das Formular', async () => {
    zeige();
    await userEvent.type(await screen.findByLabelText('Lebensmittel'), 'Butter');
    await userEvent.type(screen.getByLabelText('Menge'), '2,5');
    await userEvent.type(screen.getByLabelText('Einheit'), 'kg');
    await userEvent.click(screen.getByRole('button', { name: 'Eingang eintragen' }));
    expect(api.trageEingangEin).toHaveBeenCalledWith('o1', 'f1', { name: 'Butter', menge: 2.5, einheit: 'kg', datum: heute });
    await vi.waitFor(() => expect(screen.getByLabelText('Lebensmittel')).toHaveValue(''));
  });

  it('übernimmt die Einheit eines vorhandenen Artikels, wenn keine angegeben ist', async () => {
    zeige();
    await userEvent.type(await screen.findByLabelText('Lebensmittel'), 'milch');
    await userEvent.type(screen.getByLabelText('Menge'), '20');
    await userEvent.click(screen.getByRole('button', { name: 'Eingang eintragen' }));
    expect(api.trageEingangEin).toHaveBeenCalledWith('o1', 'f1', expect.objectContaining({ name: 'milch', einheit: 'l' }));
  });

  it('Fehler: Hinweis, Eingaben bleiben stehen', async () => {
    vi.mocked(api.trageEingangEin).mockRejectedValue({ code: '42501', message: 'rls' });
    zeige();
    await userEvent.type(await screen.findByLabelText('Lebensmittel'), 'Butter');
    await userEvent.type(screen.getByLabelText('Menge'), '2');
    await userEvent.click(screen.getByRole('button', { name: 'Eingang eintragen' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Dafür fehlt die Berechtigung.');
    expect(screen.getByLabelText('Lebensmittel')).toHaveValue('Butter');
  });
});

describe('Lebensmittel: Verbrauch und Buchungen', () => {
  async function oeffne(name: string) {
    await screen.findByText(name, { selector: 'strong' });
    await userEvent.click(within(karte(name)).getByText(`Buchungen von „${name}“`));
    return karte(name);
  }

  it('trägt Verbrauch für den heutigen Tag ein; ungültige Menge wird abgelehnt', async () => {
    zeige();
    const milch = await oeffne('Milch');
    const knopf = within(milch).getByRole('button', { name: 'Verbrauch eintragen' });
    await userEvent.click(knopf);
    expect(within(milch).getByText('Bitte eine Menge größer 0 eingeben.')).toBeInTheDocument();
    await userEvent.type(within(milch).getByLabelText('Verbrauch von Milch'), '12,5');
    await userEvent.click(knopf);
    expect(api.trageVerbrauchEin).toHaveBeenCalledWith('o1', 'f1', { name: 'Milch', menge: 12.5, datum: heute });
    expect(sendePush).toHaveBeenCalledWith('lebensmittel', 'o1', { name: 'Milch' });   // die Datenbank entscheidet, ob es knapp genug ist
  });

  it('der Tag ist wählbar und auf die Tage der Freizeit begrenzt', async () => {
    zeige();
    const milch = await oeffne('Milch');
    const auswahl = within(milch).getByLabelText('Tag', { selector: '#verbrauch-tag-Milch' });
    expect(within(auswahl).getAllByRole('option')).toHaveLength(5);
    await userEvent.selectOptions(auswahl, ende);
    await userEvent.type(within(milch).getByLabelText('Verbrauch von Milch'), '5');
    await userEvent.click(within(milch).getByRole('button', { name: 'Verbrauch eintragen' }));
    expect(api.trageVerbrauchEin).toHaveBeenCalledWith('o1', 'f1', { name: 'Milch', menge: 5, datum: ende });
  });

  it('ändert eine Verbrauchsbuchung', async () => {
    zeige();
    const milch = await oeffne('Milch');
    await userEvent.click(within(milch).getByRole('button', { name: `Verbrauch vom ${formatDatum(start)} ändern` }));
    const feld = within(milch).getByLabelText(/Menge \(Verbrauch vom/);
    await userEvent.clear(feld);
    await userEvent.type(feld, '35');
    await userEvent.click(within(milch).getByRole('button', { name: 'Speichern' }));
    expect(api.aendereVerbrauch).toHaveBeenCalledWith('v1', { menge: 35, datum: start });
  });

  it('bleibt im Bearbeiten-Modus und zeigt den Fehler, wenn das Speichern scheitert', async () => {
    vi.mocked(api.aendereVerbrauch).mockRejectedValue({ code: '42501', message: 'rls' });
    zeige();
    const milch = await oeffne('Milch');
    await userEvent.click(within(milch).getByRole('button', { name: `Verbrauch vom ${formatDatum(start)} ändern` }));
    await userEvent.click(within(milch).getByRole('button', { name: 'Speichern' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Dafür fehlt die Berechtigung.');
    expect(within(milch).getByLabelText(/Menge \(Verbrauch vom/)).toBeInTheDocument();
  });

  it('ändert einen Wareneingang (nur die Menge) und löscht nach Rückfrage', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    zeige();
    const milch = await oeffne('Milch');
    const eingang = within(within(milch).getByRole('list', { name: 'Wareneingänge von Milch' }));
    await userEvent.click(eingang.getByRole('button', { name: /Eingang vom .* ändern/ }));
    expect(within(milch).queryByLabelText('Tag', { selector: '[id^="bz-tag-Eingang"]' })).not.toBeInTheDocument();
    const feld = within(milch).getByLabelText(/Menge \(Eingang vom/);
    await userEvent.clear(feld);
    await userEvent.type(feld, '120');
    await userEvent.click(within(milch).getByRole('button', { name: 'Speichern' }));
    expect(api.aendereEingang).toHaveBeenCalledWith('e1', 120);

    await userEvent.click(within(milch).getAllByRole('button', { name: /Verbrauch vom .* löschen/ })[0]!);
    expect(api.loescheVerbrauch).not.toHaveBeenCalled();
    await userEvent.click(within(milch).getAllByRole('button', { name: /Verbrauch vom .* löschen/ })[0]!);
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(api.loescheVerbrauch).toHaveBeenCalledWith('v1');
  });
});

describe('Barrierefreiheit (axe)', () => {
  it('keine Verstöße gegen gängige Regeln', async () => {
    zeige();
    await screen.findByText('Kakao', { selector: 'strong' });
    expect(await axeVerstoesse(document.body)).toEqual([]);
  });
});
