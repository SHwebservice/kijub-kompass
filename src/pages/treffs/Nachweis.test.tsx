import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { sendePush } from '../../mitteilungen/senden';
import * as api from '../../treffs/api';
import { NachweisTab } from './NachweisTab';
import { renderMitAuth, type Szene } from '../../test-utils';
import { treff, treffMitglied } from '../../test-daten';
import { monatErster, monatText, monatVersatz } from '../../treffs/dienstplan';
import { heuteIso } from '../../freizeiten/logik';
import type { Nachweis } from '../../treffs/nachweis';

vi.mock('../../treffs/api');

const nord = treff({ id: 't1', name: 'Treff Nord' });
const monat = monatErster(heuteIso());
const tag = (n: number) => `${monat.slice(0, 8)}${String(n).padStart(2, '0')}`;

const team = [
  treffMitglied({ person_id: 'lea', vorname: 'Lea', nachname: 'Leitner', rolle: 'treffleitung', kategorie: 'Hauptamtliche*r' }),
  treffMitglied({ person_id: 'ich', vorname: 'Anna', nachname: 'Adler', kategorie: 'TZK' }),
  treffMitglied({ person_id: 'ben', vorname: 'Ben', nachname: 'Baum', kategorie: 'TZK' }),
  treffMitglied({ person_id: 'fia', vorname: 'Fia', nachname: 'Fsj', kategorie: 'FSJ' }),
];

const nachweis = (o: Partial<Nachweis> = {}): Nachweis => ({
  id: 'n1', person_id: 'ich', monat, status: 'entwurf', unterschrift: null, freigegeben_von: null,
  zeilen: [
    { id: 'z1', datum: tag(5), zeiten: '15:00 - 19:00', stunden: 4, quelle: 'dienst' },
    { id: 'z2', datum: tag(7), zeiten: 'Urlaub', stunden: 4, quelle: 'abwesenheit' },
    { id: 'z3', datum: tag(9), zeiten: 'Aufbau', stunden: 1.5, quelle: 'manuell' },
  ],
  ...o,
});

const tzk: Szene = { ich: { kategorie: 'TZK' }, treffs: [{ treff_id: 't1', rolle: 'betreuerin' }] };
const leitung: Szene = { ich: { id: 'lea', kategorie: 'Hauptamtliche*r' }, treffs: [{ treff_id: 't1', rolle: 'treffleitung' }] };
const fsj: Szene = { ich: { kategorie: 'FSJ' }, treffs: [{ treff_id: 't1', rolle: 'betreuerin' }] };
const koord: Szene = { ich: { ist_koordination: true, kategorie: 'Hauptamtliche*r' } };

const zeige = (szene: Szene, rolle: 'betreuerin' | 'treffleitung' | 'koordination') =>
  renderMitAuth(<NachweisTab treff={nord} rolle={rolle} />, szene);
const tabelle = async () => screen.findByRole('table');

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.holeTreffTeam).mockResolvedValue(team);
  vi.mocked(api.listeNachweise).mockResolvedValue([]);
  vi.mocked(api.legeNachweisAn).mockResolvedValue('neu');
  for (const fn of [api.befuelleNachweis, api.speichereZeile, api.loescheZeile, api.speichereUnterschrift, api.setzeNachweisStatus, api.loescheNachweis] as const) {
    vi.mocked(fn as (...a: never[]) => Promise<void>).mockResolvedValue(undefined);
  }
});

describe('Nachweis: TZK (eigener Nachweis)', () => {
  it('bietet an, den Nachweis anzulegen', async () => {
    zeige(tzk, 'betreuerin');
    await userEvent.click(await screen.findByRole('button', { name: 'Nachweis anlegen' }));
    expect(api.legeNachweisAn).toHaveBeenCalledWith('t1', 'ich', monat);
  });

  it('zeigt Zeilen, Herkunft und Summe', async () => {
    vi.mocked(api.listeNachweise).mockResolvedValue([nachweis()]);
    zeige(tzk, 'betreuerin');
    const t = await tabelle();
    expect(within(t).getByText('Aufbau')).toBeInTheDocument();
    expect(within(t).getByText('Dienst')).toBeInTheDocument();
    expect(within(t).getByText('Abwesenheit')).toBeInTheDocument();
    expect(within(t).getByText('9,5 Stunden')).toBeInTheDocument();
    expect(screen.getByText('Entwurf', { selector: '.badge' })).toBeInTheDocument();
    expect(screen.queryByText('Teilzeitkräfte im', { exact: false })).not.toBeInTheDocument();
  });

  it('legt eine Zeile an; aus „14:00 - 17:30“ werden die Stunden berechnet', async () => {
    vi.mocked(api.listeNachweise).mockResolvedValue([nachweis()]);
    zeige(tzk, 'betreuerin');
    await tabelle();
    await userEvent.type(screen.getByLabelText('Tag'), tag(12));
    await userEvent.type(screen.getByLabelText('Zeiten'), '14:00 - 17:30');
    expect(screen.getByLabelText('Stunden')).toHaveValue('3,5');
    await userEvent.click(screen.getByRole('button', { name: 'Zeile hinzufügen' }));
    expect(api.speichereZeile).toHaveBeenCalledWith('n1', null, { datum: tag(12), zeiten: '14:00 - 17:30', stunden: 3.5 });
  });

  it('prüft die Zeile: Tag im Monat, sinnvolle Stunden', async () => {
    vi.mocked(api.listeNachweise).mockResolvedValue([nachweis()]);
    zeige(tzk, 'betreuerin');
    await tabelle();
    await userEvent.click(screen.getByRole('button', { name: 'Zeile hinzufügen' }));
    expect(screen.getByText('Bitte einen Tag angeben.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Tag'), monatErster(monatVersatz(monat, 1)));
    await userEvent.click(screen.getByRole('button', { name: 'Zeile hinzufügen' }));
    expect(screen.getByText('Der Tag liegt nicht in diesem Monat.')).toBeInTheDocument();
    expect(api.speichereZeile).not.toHaveBeenCalled();
  });

  it('ändert und löscht Zeilen', async () => {
    vi.mocked(api.listeNachweise).mockResolvedValue([nachweis()]);
    zeige(tzk, 'betreuerin');
    await tabelle();
    await userEvent.click(screen.getByRole('button', { name: `Zeile vom ${tag(9).slice(8)}.${tag(9).slice(5, 7)}.${tag(9).slice(0, 4)} bearbeiten` }));
    const zeit = screen.getAllByLabelText('Zeiten')[0]!;
    expect(zeit).toHaveValue('Aufbau');
    await userEvent.clear(zeit);
    await userEvent.type(zeit, '10:00 - 12:00');
    await userEvent.click(screen.getByRole('button', { name: 'Zeile speichern' }));
    expect(api.speichereZeile).toHaveBeenCalledWith('n1', 'z3', { datum: tag(9), zeiten: '10:00 - 12:00', stunden: 2 });
    await userEvent.click(screen.getByRole('button', { name: `Zeile vom ${tag(5).slice(8)}.${tag(5).slice(5, 7)}.${tag(5).slice(0, 4)} löschen` }));
    expect(api.loescheZeile).toHaveBeenCalledWith('z1');
  });

  it('aktualisiert aus dem Dienstplan', async () => {
    vi.mocked(api.listeNachweise).mockResolvedValue([nachweis()]);
    zeige(tzk, 'betreuerin');
    await tabelle();
    await userEvent.click(screen.getByRole('button', { name: 'Aus Dienstplan aktualisieren' }));
    expect(api.befuelleNachweis).toHaveBeenCalledWith('n1');
  });

  it('Einreichen braucht die Unterschrift', async () => {
    vi.mocked(api.listeNachweise).mockResolvedValue([nachweis()]);
    zeige(tzk, 'betreuerin');
    await tabelle();
    const einreichen = screen.getByRole('button', { name: 'Einreichen' });
    expect(einreichen).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Name als Unterschrift'), 'Anna Adler');
    await userEvent.click(einreichen);
    expect(api.setzeNachweisStatus).toHaveBeenCalledWith('n1', 'eingereicht', 'Anna Adler');
    expect(sendePush).toHaveBeenCalledWith('nachweis_eingereicht', 'n1');           // die Treffleitung erfährt es
  });

  it('eingereicht: gesperrt, keine Bearbeitung, Hinweis', async () => {
    vi.mocked(api.listeNachweise).mockResolvedValue([nachweis({ status: 'eingereicht', unterschrift: 'Anna Adler' })]);
    zeige(tzk, 'betreuerin');
    await tabelle();
    expect(screen.getByText(/Eingereicht – die Treffleitung prüft/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Zeile hinzufügen' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /bearbeiten$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Einreichen' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Löschen' })).not.toBeInTheDocument();
  });

  it('löscht den Entwurf nach Rückfrage', async () => {
    vi.mocked(api.listeNachweise).mockResolvedValue([nachweis()]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    zeige(tzk, 'betreuerin');
    await tabelle();
    await userEvent.click(screen.getByRole('button', { name: 'Löschen' }));
    expect(api.loescheNachweis).toHaveBeenCalledWith('n1');
  });

  it('PDF: setzt den Dateinamen als Titel und druckt', async () => {
    vi.mocked(api.listeNachweise).mockResolvedValue([nachweis()]);
    const drucken = vi.spyOn(window, 'print').mockImplementation(() => { titelBeimDruck = document.title; });
    let titelBeimDruck = '';
    const vorher = document.title;
    zeige(tzk, 'betreuerin');
    await tabelle();
    await userEvent.click(screen.getByRole('button', { name: 'Als PDF speichern / drucken' }));
    expect(drucken).toHaveBeenCalled();
    expect(titelBeimDruck).toBe(`${monat.slice(2, 4)}_${monat.slice(5, 7)}_Adler_Anna`);
    expect(document.title).toBe(vorher);
  });

  it('blättert die Monate und lädt neu', async () => {
    zeige(tzk, 'betreuerin');
    await screen.findByText(monatText(monat));
    await userEvent.click(screen.getByRole('button', { name: 'Vorheriger Monat' }));
    expect(await screen.findByText(monatText(monatVersatz(monat, -1)))).toBeInTheDocument();
    expect(api.listeNachweise).toHaveBeenLastCalledWith('t1', monatVersatz(monat, -1));
  });

  it('zeigt Fehler beim Anlegen', async () => {
    vi.mocked(api.legeNachweisAn).mockRejectedValue(new Error('x'));
    zeige(tzk, 'betreuerin');
    await userEvent.click(await screen.findByRole('button', { name: 'Nachweis anlegen' }));
    expect(await screen.findByText('Der Nachweis konnte nicht angelegt werden.')).toBeInTheDocument();
  });
});

describe('Nachweis: andere Kategorien', () => {
  it('FSJ: Hinweis statt Nachweis', async () => {
    zeige(fsj, 'betreuerin');
    expect(await screen.findByText(/Den Nachweis führen Teilzeitkräfte/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nachweis anlegen' })).not.toBeInTheDocument();
  });
});

describe('Nachweis: Treffleitung und Koordination', () => {
  beforeEach(() => {
    vi.mocked(api.listeNachweise).mockResolvedValue([
      nachweis({ status: 'eingereicht', unterschrift: 'Anna Adler' }),
      nachweis({ id: 'n2', person_id: 'ben', zeilen: [] }),
    ]);
  });

  it('listet die TZK des Teams mit Stand; Nicht-TZK fehlen', async () => {
    zeige(leitung, 'treffleitung');
    const liste = await screen.findByRole('list');
    expect(within(liste).getByText('Anna Adler')).toBeInTheDocument();
    expect(within(liste).getByText('Ben Baum')).toBeInTheDocument();
    expect(within(liste).queryByText('Fia Fsj')).not.toBeInTheDocument();
    expect(within(liste).getByText('9,5 Stunden')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nachweis anlegen' })).not.toBeInTheDocument();
  });

  it('öffnet einen eingereichten Nachweis und gibt ihn frei', async () => {
    zeige(leitung, 'treffleitung');
    const liste = await screen.findByRole('list');
    await userEvent.click(within(liste).getAllByRole('button', { name: 'Öffnen' })[0]!);
    await screen.findByRole('heading', { name: new RegExp(`Anna Adler · ${monatText(monat)}`) });
    await userEvent.click(screen.getByRole('button', { name: 'Freigeben' }));
    expect(api.setzeNachweisStatus).toHaveBeenCalledWith('n1', 'freigegeben');
  });

  it('gibt einen eingereichten Nachweis zur Überarbeitung zurück und darf Zeilen ändern', async () => {
    zeige(koord, 'koordination');
    const liste = await screen.findByRole('list');
    await userEvent.click(within(liste).getAllByRole('button', { name: 'Öffnen' })[0]!);
    await screen.findByRole('heading', { name: /Anna Adler/ });
    expect(screen.getByRole('button', { name: 'Zeile hinzufügen' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Zur Überarbeitung zurückgeben' }));
    expect(api.setzeNachweisStatus).toHaveBeenCalledWith('n1', 'entwurf');
  });

  it('freigegebener Nachweis: gesperrt, Freigabe lässt sich aufheben', async () => {
    vi.mocked(api.listeNachweise).mockResolvedValue([nachweis({ status: 'freigegeben', unterschrift: 'Anna Adler' })]);
    zeige(leitung, 'treffleitung');
    const liste = await screen.findByRole('list');
    await userEvent.click(within(liste).getByRole('button', { name: 'Öffnen' }));
    await screen.findByText(/Freigegeben\. Der Nachweis ist gesperrt/);
    expect(screen.queryByRole('button', { name: 'Zeile hinzufügen' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Freigabe aufheben' }));
    expect(api.setzeNachweisStatus).toHaveBeenCalledWith('n1', 'eingereicht');
  });

  it('Treffleitung darf fremde Nachweise nicht löschen, Koordination schon', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { unmount } = zeige(leitung, 'treffleitung');
    const liste = await screen.findByRole('list');
    await userEvent.click(within(liste).getAllByRole('button', { name: 'Öffnen' })[0]!);
    await screen.findByRole('heading', { name: /Anna Adler/ });
    expect(screen.queryByRole('button', { name: 'Löschen' })).not.toBeInTheDocument();
    unmount();
    zeige(koord, 'koordination');
    const liste2 = await screen.findByRole('list');
    await userEvent.click(within(liste2).getAllByRole('button', { name: 'Öffnen' })[0]!);
    await userEvent.click(await screen.findByRole('button', { name: 'Löschen' }));
    expect(api.loescheNachweis).toHaveBeenCalledWith('n1');
  });
});
