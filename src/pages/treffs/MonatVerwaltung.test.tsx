import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '../../treffs/api';
import { sendePush } from '../../mitteilungen/senden';
import { MonatTab } from './MonatTab';
import { VerwaltungTab } from './VerwaltungTab';
import { renderMitAuth, type Szene } from '../../test-utils';
import { treff, treffMitglied } from '../../test-daten';
import { addTage, monatErster, monatText, monatVersatz, type Dienst } from '../../treffs/dienstplan';
import { heuteIso } from '../../freizeiten/logik';

vi.mock('../../treffs/api');

const nord = treff({
  id: 't1', name: 'Treff Nord',
  oeffnungszeiten: [{ wochentag: 1, von: '15:00', bis: '19:00' }, { wochentag: 3, von: '14:00', bis: '18:00' }],
});
const team = [
  treffMitglied({ person_id: 'lea', vorname: 'Lea', nachname: 'Leitner', rolle: 'treffleitung', kategorie: 'Hauptamtliche*r' }),
  treffMitglied({ person_id: 'ich', vorname: 'Anna', nachname: 'Adler' }),
  treffMitglied({ person_id: 'ben', vorname: 'Ben', nachname: 'Baum' }),
];
const heute = heuteIso();
const monat = monatErster(heute);
const dienst = (o: Partial<Dienst> & { id: string; datum: string }): Dienst => ({
  von: '15:00', bis: '19:00', ist_sonder: false, bezeichnung: null, personen: [], wuensche: [], ...o,
});

const betreuerin: Szene = { ich: { kategorie: 'TZK' }, treffs: [{ treff_id: 't1', rolle: 'betreuerin' }] };
const leitung: Szene = { ich: { id: 'lea', kategorie: 'Hauptamtliche*r' }, treffs: [{ treff_id: 't1', rolle: 'treffleitung' }] };
const koord: Szene = { ich: { ist_koordination: true, kategorie: 'Hauptamtliche*r' } };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.holeTreffTeam).mockResolvedValue(team);
  vi.mocked(api.listeDienste).mockResolvedValue([]);
  vi.mocked(api.listeFeiertage).mockResolvedValue([]);
  vi.mocked(api.listeAbwesenheiten).mockResolvedValue([]);
  vi.mocked(api.dienstStatistik).mockResolvedValue([]);
  vi.mocked(api.wendeMonatsmusterAn).mockResolvedValue(8);
  for (const fn of [api.speichereAbwesenheit, api.loescheAbwesenheiten, api.speichereFeiertag, api.loescheFeiertag] as const) {
    vi.mocked(fn as (...a: never[]) => Promise<void>).mockResolvedValue(undefined);
  }
});

describe('Monat: Übersicht und Statistik', () => {
  it('zeigt den Monat, die Dienste und die Statistik', async () => {
    const erster = monatTage1();
    vi.mocked(api.listeDienste).mockResolvedValue([dienst({ id: 'd', datum: erster, personen: ['lea', 'ben'] })]);
    vi.mocked(api.dienstStatistik).mockResolvedValue([{ person_id: 'lea', dienste: 4, stunden: 16 }, { person_id: 'ben', dienste: 2, stunden: 7.5 }]);
    renderMitAuth(<MonatTab treff={nord} rolle="betreuerin" />, betreuerin);
    expect(await screen.findByText(monatText(monat))).toBeInTheDocument();
    const liste = await screen.findByRole('list', { name: 'Dienste im Monat' });
    expect(within(liste).getByText('Lea Leitner, Ben Baum')).toBeInTheDocument();
    const tabelle = await screen.findByRole('table');
    expect(within(tabelle).getByRole('row', { name: /Ben Baum 2 7,5 h/ })).toBeInTheDocument();
    expect(within(tabelle).getByRole('row', { name: /Lea Leitner 4 16 h/ })).toBeInTheDocument();
    expect(screen.getByText(/nur deine/)).toBeInTheDocument();
    expect(screen.queryByText('Monatsmuster')).not.toBeInTheDocument();
  });

  it('blättert die Monate', async () => {
    renderMitAuth(<MonatTab treff={nord} rolle="betreuerin" />, betreuerin);
    await screen.findByText(monatText(monat));
    await userEvent.click(screen.getByRole('button', { name: 'Nächster Monat' }));
    expect(await screen.findByText(monatText(monatVersatz(monat, 1)))).toBeInTheDocument();
    expect(api.dienstStatistik).toHaveBeenLastCalledWith('t1', monatVersatz(monat, 1));
  });
});

/** Erster Tag des Monats, an dem der Treff offen ist (Montag oder Mittwoch). */
function monatTage1(): string {
  for (let i = 0; i < 7; i++) {
    const d = addTage(monat, i);
    const w = new Date(`${d}T00:00:00Z`).getUTCDay() || 7;
    if (w === 1 || w === 3) return d;
  }
  throw new Error('unerreichbar');
}

describe('Monat: Monatsmuster', () => {
  it('wendet das Muster nach Rückfrage an und meldet das Ergebnis', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderMitAuth(<MonatTab treff={nord} rolle="treffleitung" />, leitung);
    await screen.findByText('Monatsmuster');
    const knopf = screen.getByRole('button', { name: 'Auf den Monat anwenden' });
    expect(knopf).toBeDisabled();
    await userEvent.click(screen.getByLabelText(/An allen Montagen einteilen/));
    await userEvent.click(screen.getByLabelText('Montag: Ben Baum'));
    await userEvent.click(screen.getByLabelText('Montag: Lea Leitner'));
    const anwenden = screen.getByRole('button', { name: /^Auf \d+ Tage anwenden$/ });
    await userEvent.click(anwenden);
    expect(window.confirm).toHaveBeenCalledWith(expect.stringMatching(/Die Zuteilung an \d+ Tagen im .* wird ersetzt/));
    expect(api.wendeMonatsmusterAn).toHaveBeenCalledWith('t1', monat, { 1: ['ben', 'lea'] });
    expect(await screen.findByText('Das Muster wurde auf 8 Tage angewendet.')).toBeInTheDocument();
    expect(sendePush).toHaveBeenCalledWith('dienstplan', 't1', { personen: ['ben', 'lea'] });      // wer im Muster steht, erfährt es
  });

  it('bricht ohne Rückfrage-Zustimmung ab', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderMitAuth(<MonatTab treff={nord} rolle="koordination" />, koord);
    await screen.findByText('Monatsmuster');
    await userEvent.click(screen.getByLabelText(/An allen Mittwochen einteilen/));
    await userEvent.click(screen.getByRole('button', { name: /^Auf \d+ Tage anwenden$/ }));
    expect(api.wendeMonatsmusterAn).not.toHaveBeenCalled();
  });

  it('ein Wochentag ohne Häkchen wird nicht gesendet; Abwählen entfernt ihn wieder', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderMitAuth(<MonatTab treff={nord} rolle="treffleitung" />, leitung);
    await screen.findByText('Monatsmuster');
    await userEvent.click(screen.getByLabelText(/An allen Montagen einteilen/));
    await userEvent.click(screen.getByLabelText(/An allen Mittwochen einteilen/));
    await userEvent.click(screen.getByLabelText('Mittwoch: Ben Baum'));
    await userEvent.click(screen.getByLabelText(/An allen Montagen einteilen/));     // Montag wieder weg
    await userEvent.click(screen.getByRole('button', { name: /^Auf \d+ Tage anwenden$/ }));
    expect(api.wendeMonatsmusterAn).toHaveBeenCalledWith('t1', monat, { 3: ['ben'] });
    expect(sendePush).toHaveBeenCalledWith('dienstplan', 't1', { personen: ['ben'] });
  });

  it('zeigt Fehler der Datenbank', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(api.wendeMonatsmusterAn).mockRejectedValue(new Error('x'));
    renderMitAuth(<MonatTab treff={nord} rolle="treffleitung" />, leitung);
    await screen.findByText('Monatsmuster');
    await userEvent.click(screen.getByLabelText(/An allen Montagen einteilen/));
    await userEvent.click(screen.getByRole('button', { name: /^Auf \d+ Tage anwenden$/ }));
    expect(await screen.findByText('Das Muster konnte nicht angewendet werden.')).toBeInTheDocument();
  });
});

describe('Abwesenheit & Feiertage', () => {
  const morgen = addTage(heute, 1);
  const zeige = async (szene: Szene, rolle: 'treffleitung' | 'koordination' = 'treffleitung') => {
    renderMitAuth(<VerwaltungTab treff={nord} rolle={rolle} />, szene);
    await screen.findByRole('option', { name: 'Baum, Ben' });
  };

  it('trägt Urlaub für einen Zeitraum ein (jeder Tag einzeln)', async () => {
    await zeige(leitung);
    await userEvent.selectOptions(screen.getByLabelText('Person'), 'ben');
    await userEvent.type(screen.getByLabelText('Von'), morgen);
    expect(screen.getByLabelText('Bis')).toHaveValue(morgen);      // wird mit „Von“ vorbelegt
    await userEvent.clear(screen.getByLabelText('Bis'));
    await userEvent.type(screen.getByLabelText('Bis'), addTage(morgen, 2));
    await userEvent.type(screen.getByLabelText('Notiz (optional)'), 'Familienurlaub');
    await userEvent.click(screen.getByRole('button', { name: 'Eintragen' }));
    expect(api.speichereAbwesenheit).toHaveBeenCalledWith('ben', [morgen, addTage(morgen, 1), addTage(morgen, 2)], 'urlaub', 'Familienurlaub');
  });

  it('prüft Eingaben', async () => {
    await zeige(leitung);
    await userEvent.click(screen.getByRole('button', { name: 'Eintragen' }));
    expect(screen.getByText('Bitte eine Person wählen.')).toBeInTheDocument();
    expect(screen.getByText('Bitte Beginn und Ende angeben.')).toBeInTheDocument();
    expect(api.speichereAbwesenheit).not.toHaveBeenCalled();
  });

  it('fasst Tage zu einem Zeitraum zusammen, löscht den ganzen Block und ignoriert Fremde', async () => {
    vi.mocked(api.listeAbwesenheiten).mockResolvedValue([
      { id: '1', person_id: 'ben', datum: '2030-07-05', typ: 'krank', notiz: null },
      { id: '2', person_id: 'ben', datum: '2030-07-06', typ: 'krank', notiz: null },
      { id: '3', person_id: 'fremd', datum: '2030-07-05', typ: 'urlaub', notiz: null },
    ]);
    await zeige(leitung);
    expect(await screen.findByText('05.07.2030 – 06.07.2030')).toBeInTheDocument();
    expect(screen.queryByText('Jemand')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Abwesenheit von Ben Baum .* löschen/ }));
    expect(api.loescheAbwesenheiten).toHaveBeenCalledWith(['1', '2']);
  });

  it('Treffleitung trägt Feiertage nur für den eigenen Treff ein; Koordination auch für alle', async () => {
    await zeige(leitung);
    expect(screen.queryByLabelText('Gilt für alle Treffs')).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Datum'), morgen);
    await userEvent.type(screen.getByLabelText('Bezeichnung'), 'Stadtfest');
    await userEvent.click(screen.getByRole('button', { name: 'Feiertag eintragen' }));
    expect(api.speichereFeiertag).toHaveBeenCalledWith('t1', morgen, 'Stadtfest');
  });

  it('Koordination: Feiertag für alle Treffs', async () => {
    await zeige(koord, 'koordination');
    await userEvent.type(screen.getByLabelText('Datum'), morgen);
    await userEvent.type(screen.getByLabelText('Bezeichnung'), 'Neujahr');
    await userEvent.click(screen.getByLabelText('Gilt für alle Treffs'));
    await userEvent.click(screen.getByRole('button', { name: 'Feiertag eintragen' }));
    expect(api.speichereFeiertag).toHaveBeenCalledWith(null, morgen, 'Neujahr');
  });

  it('Treffleitung kann Feiertage „für alle“ sehen, aber nicht löschen', async () => {
    vi.mocked(api.listeFeiertage).mockResolvedValue([
      { id: 'a', treff_id: null, datum: '2030-01-01', bezeichnung: 'Neujahr' },
      { id: 'b', treff_id: 't1', datum: '2030-05-01', bezeichnung: 'Eigener' },
    ]);
    await zeige(leitung);
    expect(await screen.findByText('Neujahr')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Feiertag Neujahr löschen' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Feiertag Eigener löschen' }));
    expect(api.loescheFeiertag).toHaveBeenCalledWith('b');
  });

  it('verlangt Datum und Bezeichnung für Feiertage', async () => {
    await zeige(leitung);
    await userEvent.click(screen.getByRole('button', { name: 'Feiertag eintragen' }));
    expect(screen.getByText('Bitte Datum und Bezeichnung angeben.')).toBeInTheDocument();
    expect(api.speichereFeiertag).not.toHaveBeenCalled();
  });
});
