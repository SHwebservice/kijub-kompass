import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '../../treffs/api';
import { DienstplanTab } from './DienstplanTab';
import { renderMitAuth, type Szene } from '../../test-utils';
import { treff, treffMitglied } from '../../test-daten';
import { addTage, monatErster, monatTage, monatText, monatVersatz, montagVon, wochenText, type Dienst } from '../../treffs/dienstplan';
import { formatKurz, heuteIso } from '../../freizeiten/logik';

vi.mock('../../treffs/api');

/** Dienstplan: Woche und Monat in einem Reiter – umschaltbar, mit gemeinsamem Zeitraum; Zuteilen auch in der Monatsansicht. */
const heute = heuteIso();
const monat = monatErster(heute);
const naechsterMonat = monatVersatz(monat, 1);
/** Ein Montag im nächsten Monat: sicher in der Zukunft und ein Öffnungstag. */
const montag = monatTage(naechsterMonat).find((d) => new Date(`${d}T12:00:00Z`).getUTCDay() === 1)!;

const nord = treff({ id: 't1', name: 'Treff Nord', oeffnungszeiten: [{ wochentag: 1, von: '15:00', bis: '19:00' }, { wochentag: 3, von: '14:00', bis: '18:00' }] });
const team = [
  treffMitglied({ person_id: 'lea', vorname: 'Lea', nachname: 'Leitner', rolle: 'treffleitung', kategorie: 'Hauptamtliche*r' }),
  treffMitglied({ person_id: 'ich', vorname: 'Anna', nachname: 'Adler' }),
  treffMitglied({ person_id: 'ben', vorname: 'Ben', nachname: 'Baum' }),
];
const dienst = (o: Partial<Dienst> & { id: string; datum: string }): Dienst => ({ von: '15:00', bis: '19:00', ist_sonder: false, bezeichnung: null, personen: [], wuensche: [], ...o });

const betreuerin: Szene = { ich: { kategorie: 'TZK' }, treffs: [{ treff_id: 't1', rolle: 'betreuerin' }] };
const leitung: Szene = { ich: { id: 'lea', kategorie: 'Hauptamtliche*r' }, treffs: [{ treff_id: 't1', rolle: 'treffleitung' }] };

const zeige = (szene: Szene, rolle: 'betreuerin' | 'treffleitung' | 'koordination' = 'betreuerin') => renderMitAuth(<DienstplanTab treff={nord} rolle={rolle} />, szene);
const knopf = (name: string) => screen.getByRole('button', { name });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.holeTreffTeam).mockResolvedValue(team);
  vi.mocked(api.listeDienste).mockResolvedValue([]);
  vi.mocked(api.listeFeiertage).mockResolvedValue([]);
  vi.mocked(api.listeAbwesenheiten).mockResolvedValue([]);
  vi.mocked(api.listeTreffAbsprachen).mockResolvedValue([]);
  vi.mocked(api.listeDienstplanKommentare).mockResolvedValue([]);
  vi.mocked(api.dienstStatistik).mockResolvedValue([]);
  vi.mocked(api.setzeZuteilung).mockResolvedValue(undefined);
  vi.mocked(api.dienstSicherstellen).mockResolvedValue('neuer-dienst');
});

describe('Dienstplan: Umschalter Woche und Monat', () => {
  it('startet mit der Woche; ein Klick auf „Monat“ zeigt die Monatsansicht, „Woche“ führt zurück', async () => {
    zeige(betreuerin);
    expect(await screen.findByText(wochenText(montagVon(heute)))).toBeInTheDocument();
    expect(knopf('Woche')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('list', { name: 'Dienste im Monat' })).not.toBeInTheDocument();

    await userEvent.click(knopf('Monat'));
    expect(await screen.findByText(monatText(monat))).toBeInTheDocument();
    expect(await screen.findByRole('list', { name: 'Dienste im Monat' })).toBeInTheDocument();
    expect(knopf('Monat')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText(/^KW \d+/)).not.toBeInTheDocument();

    await userEvent.click(knopf('Woche'));
    expect(await screen.findByText(wochenText(montagVon(heute)))).toBeInTheDocument();       // im laufenden Monat: zur heutigen Woche
  });

  it('die Adresse bestimmt die Ansicht: ?ansicht=monat öffnet gleich den Monat', async () => {
    zeige({ ...betreuerin, pfad: '/treffs/t1/dienstplan?ansicht=monat' });
    expect(await screen.findByRole('list', { name: 'Dienste im Monat' })).toBeInTheDocument();
    expect(knopf('Monat')).toHaveAttribute('aria-pressed', 'true');
  });

  it('der Zeitraum bleibt beim Umschalten: Woche im nächsten Monat → Monat zeigt diesen Monat', async () => {
    zeige(betreuerin);
    await screen.findByText(wochenText(montagVon(heute)));
    // Wochen vorblättern, bis der Montag im nächsten Monat liegt
    let m = montagVon(heute);
    while (m.slice(0, 7) !== naechsterMonat.slice(0, 7)) { await userEvent.click(knopf('Nächste Woche')); m = addTage(m, 7); }
    await userEvent.click(knopf('Monat'));
    expect(await screen.findByText(monatText(naechsterMonat))).toBeInTheDocument();
  });

  it('der Zeitraum bleibt beim Umschalten: Monat vorblättern → Woche zeigt die Woche des Monatsanfangs', async () => {
    zeige({ ...betreuerin, pfad: '/treffs/t1/dienstplan?ansicht=monat' });
    await screen.findByText(monatText(monat));
    await userEvent.click(knopf('Nächster Monat'));
    expect(await screen.findByText(monatText(naechsterMonat))).toBeInTheDocument();
    await userEvent.click(knopf('Woche'));
    expect(await screen.findByText(wochenText(montagVon(naechsterMonat)))).toBeInTheDocument();
  });
});

describe('Dienstplan: Zuteilen in der Monatsansicht', () => {
  const imMonat = async (szene: Szene, rolle: 'betreuerin' | 'treffleitung' | 'koordination') => {
    zeige({ ...szene, pfad: '/treffs/t1/dienstplan?ansicht=monat' }, rolle);
    await screen.findByText(monatText(monat));
    await userEvent.click(knopf('Nächster Monat'));
    await screen.findByText(monatText(naechsterMonat));
  };

  it('die Treffleitung teilt an einem Tag ohne Dienst zu: der Dienst wird erst beim Speichern angelegt', async () => {
    await imMonat(leitung, 'treffleitung');
    await userEvent.click(await screen.findByRole('button', { name: `Zuteilen am ${formatKurz(montag)}` }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByLabelText(/Ben Baum/));
    expect(api.dienstSicherstellen).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Speichern' }));
    expect(api.dienstSicherstellen).toHaveBeenCalledWith('t1', montag);
    expect(api.setzeZuteilung).toHaveBeenCalledWith('neuer-dienst', ['ben'], []);
  });

  it('ändert die Zuteilung eines bestehenden Dienstes und lädt danach Dienste und Statistik neu', async () => {
    vi.mocked(api.listeDienste).mockResolvedValue([dienst({ id: 'd1', datum: montag, personen: ['lea'] })]);
    await imMonat(leitung, 'treffleitung');
    await userEvent.click(await screen.findByRole('button', { name: `Zuteilen am ${formatKurz(montag)}` }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText(/Lea Leitner/)).toBeChecked();
    await userEvent.click(within(dialog).getByLabelText(/Anna Adler/));
    const dienstAufrufe = vi.mocked(api.listeDienste).mock.calls.length;
    const statistikAufrufe = vi.mocked(api.dienstStatistik).mock.calls.length;
    await userEvent.click(within(dialog).getByRole('button', { name: 'Speichern' }));
    expect(api.setzeZuteilung).toHaveBeenCalledWith('d1', ['ich'], []);      // nur die Differenz
    await vi.waitFor(() => expect(vi.mocked(api.listeDienste).mock.calls.length).toBeGreaterThan(dienstAufrufe));
    expect(vi.mocked(api.dienstStatistik).mock.calls.length).toBeGreaterThan(statistikAufrufe);
  });

  it('Abwesende werden im Zuteilungsfenster der Monatsansicht markiert', async () => {
    vi.mocked(api.listeAbwesenheiten).mockResolvedValue([{ id: 'x', person_id: 'ben', datum: montag, typ: 'urlaub', notiz: null }]);
    await imMonat(leitung, 'treffleitung');
    await userEvent.click(await screen.findByRole('button', { name: `Zuteilen am ${formatKurz(montag)}` }));
    expect(await within(await screen.findByRole('dialog')).findByText(/abwesend: Urlaub/)).toBeInTheDocument();
  });

  it('Sonderdienste lassen sich anlegen und bearbeiten', async () => {
    vi.mocked(api.listeDienste).mockResolvedValue([dienst({ id: 's1', datum: montag, ist_sonder: true, bezeichnung: 'Sommerfest', personen: ['ben'] })]);
    await imMonat(leitung, 'treffleitung');
    await userEvent.click(await screen.findByRole('button', { name: `Sonderdienst Sommerfest am ${formatKurz(montag)} bearbeiten` }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('offene Dienstwünsche erscheinen für die Treffleitung als Hinweis am Tag', async () => {
    vi.mocked(api.listeDienste).mockResolvedValue([dienst({ id: 'd1', datum: montag, wuensche: [{ person_id: 'ben', status: 'offen' }, { person_id: 'ich', status: 'offen' }] })]);
    await imMonat(leitung, 'treffleitung');
    expect(await screen.findByText('2 Wünsche')).toBeInTheDocument();
  });

  it('TeilzeitkräfteInnen sehen die Monatsansicht, aber keinen Zuteilen-Knopf und keinen Sonderdienst', async () => {
    await imMonat(betreuerin, 'betreuerin');
    await screen.findByRole('list', { name: 'Dienste im Monat' });
    expect(screen.queryByRole('button', { name: /Zuteilen/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Sonderdienst/ })).not.toBeInTheDocument();
  });
});
