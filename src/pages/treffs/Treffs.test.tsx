import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '../../treffs/api';
import * as fzApi from '../../freizeiten/api';
import * as zuordnungApi from '../../zuordnung/api';
import { sendePush } from '../../mitteilungen/senden';
import { TreffeListe } from './TreffeListe';
import { TreffDetail } from './TreffDetail';
import { TreffForm } from './TreffForm';
import { renderMitAuth, type Szene } from '../../test-utils';
import { treff, treffMitglied } from '../../test-daten';
import type { Notiz } from '../../freizeiten/notizen';

vi.mock('../../treffs/api');
vi.mock('../../freizeiten/api');
vi.mock('../../zuordnung/api');

const nord = treff({
  id: 't1', name: 'Treff Nord', ort_id: 'o1', ort_name: 'Jugendhaus', ort_adresse: 'Hauptstr. 1, Frankenthal',
  oeffnungszeiten: [{ wochentag: 2, von: '15:00', bis: '19:00' }, { wochentag: 4, von: '14:00', bis: '18:30' }],
});

const leitung: Szene = { ich: { kategorie: 'Hauptamtliche*r' }, treffs: [{ treff_id: 't1', rolle: 'treffleitung' }] };
const betreuerin: Szene = { ich: { kategorie: 'TZK' }, treffs: [{ treff_id: 't1', rolle: 'betreuerin' }] };
const koord: Szene = { ich: { ist_koordination: true, kategorie: 'Hauptamtliche*r' } };

const tabNamen = () => screen.getAllByRole('link').filter((l) => l.classList.contains('tabs__tab')).map((l) => l.textContent);
const zeigeDetail = (szene: Szene, pfad = '/treffs/t1') => renderMitAuth(<TreffDetail />, { ...szene, pfad, route: '/treffs/:id/*' });

const absprache = (o: Partial<Notiz> & { id: string }): Notiz => ({
  art: 'absprache', geltung: 'gesamt', datum: null, text: 'Text', erstellt_von: 'lea', created_at: '2027-06-01T10:30:00Z', bestaetigungen: [], kommentare: [], ...o,
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.listeTreffs).mockResolvedValue([nord, treff({ id: 't2', name: 'Treff Süd' })]);
  vi.mocked(api.holeTreff).mockResolvedValue(nord);
  vi.mocked(api.holeWochenprogramm).mockResolvedValue([
    { wochentag: 2, angebot_id: null, angebot_name: null, freitext: 'Spielenachmittag', notiz: 'Brettspiele' },
  ]);
  vi.mocked(api.holeTreffTeam).mockResolvedValue([
    treffMitglied({ person_id: 'b', vorname: 'Ben', nachname: 'Baum' }),
    treffMitglied({ person_id: 'l', vorname: 'Lea', nachname: 'Leitner', rolle: 'treffleitung', kategorie: 'Hauptamtliche*r', mail: 'lea@kijub.example' }),
  ]);
  vi.mocked(api.listeTreffAbsprachen).mockResolvedValue([]);
  vi.mocked(fzApi.listePersonen).mockResolvedValue([]);
  vi.mocked(fzApi.holeNamen).mockResolvedValue({});
  vi.mocked(fzApi.listeAngebote).mockResolvedValue([]);
  vi.mocked(fzApi.listeOrte).mockResolvedValue([
    { id: 'o1', name: 'Jugendhaus', adresse: null, lieferstelle_nr: null, freizeiten: 0, treffs: 1 },
    { id: 'o2', name: 'Strandbad', adresse: null, lieferstelle_nr: null, freizeiten: 0, treffs: 0 },
    { id: 'o3', name: 'Stadtpark', adresse: null, lieferstelle_nr: null, freizeiten: 0, treffs: 1 },
  ]);
});

describe('Treffs: Liste', () => {
  it('zeigt Treffs mit Öffnungstagen und eigener Rolle', async () => {
    renderMitAuth(<TreffeListe />, leitung);
    const t1 = await screen.findByRole('link', { name: 'Treff Nord' });
    expect(t1).toHaveAttribute('href', '/treffs/t1');
    expect(screen.getByText('Di, Do')).toBeInTheDocument();
    expect(screen.getByText('Keine Öffnungstage')).toBeInTheDocument();
    expect(screen.getByText('Treffleitung')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Neuer Treff' })).not.toBeInTheDocument();
  });

  it('Koordination kann einen Treff anlegen', async () => {
    renderMitAuth(<TreffeListe />, koord);
    expect(await screen.findByRole('link', { name: 'Neuer Treff' })).toHaveAttribute('href', '/treffs/neu');
  });

  it('leer: Hinweis je Rolle', async () => {
    vi.mocked(api.listeTreffs).mockResolvedValue([]);
    renderMitAuth(<TreffeListe />, betreuerin);
    expect(await screen.findByText('Du bist noch keinem Treff zugeordnet')).toBeInTheDocument();
  });
});

describe('Treff-Detail: Reiter je Rolle', () => {
  it('BetreuerIn: Übersicht, Dienstplan, Stundennachweis, Absprachen, Team', async () => {
    zeigeDetail(betreuerin);
    await screen.findByRole('heading', { name: 'Treff Nord' });
    expect(tabNamen()).toEqual(['Übersicht', 'Tagesprotokoll', 'Notizen', 'Dienstplan', 'Stundennachweis', 'Absprachen', 'Teamprotokolle', 'Team']);
    expect(screen.queryByRole('link', { name: 'Bearbeiten' })).not.toBeInTheDocument();
  });

  it('Gast sieht nur die Übersicht ohne Reiterleiste', async () => {
    zeigeDetail({ ich: { kategorie: 'TZK' } });
    await screen.findByRole('heading', { name: 'Treff Nord' });
    expect(tabNamen()).toEqual([]);
  });

  it('Treffleitung sieht zusätzlich „Abwesenheit & Feiertage“', async () => {
    zeigeDetail(leitung);
    await screen.findByRole('heading', { name: 'Treff Nord' });
    expect(tabNamen()).toEqual(['Übersicht', 'Tagesprotokoll', 'Notizen', 'Dienstplan', 'Stundennachweis', 'Absprachen', 'Teamprotokolle', 'Team', 'Abwesenheit & Feiertage']);
  });

  it('Koordination sieht „Bearbeiten“', async () => {
    zeigeDetail(koord);
    expect(await screen.findByRole('link', { name: 'Bearbeiten' })).toHaveAttribute('href', '/treffs/t1/bearbeiten');
  });

  it('unbekannter Treff', async () => {
    vi.mocked(api.holeTreff).mockResolvedValue(null);
    zeigeDetail(koord);
    expect(await screen.findByText('Treff nicht gefunden')).toBeInTheDocument();
  });
});

describe('Treff-Übersicht', () => {
  it('zeigt Adresse, Öffnungszeiten und Wochenprogramm', async () => {
    zeigeDetail(betreuerin);
    expect(await screen.findByText('Hauptstr. 1, Frankenthal')).toBeInTheDocument();
    expect(screen.getAllByText('15:00–19:00 Uhr').length).toBeGreaterThan(0);
    expect(await screen.findByText('Spielenachmittag')).toBeInTheDocument();
    expect(screen.getByText('Brettspiele')).toBeInTheDocument();
    expect(screen.getByText('Noch kein Programm')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ändern' })).not.toBeInTheDocument();
  });

  it('Treffleitung trägt einen Freitext für einen Öffnungstag ein', async () => {
    vi.mocked(api.speichereProgrammpunkt).mockResolvedValue(undefined);
    zeigeDetail(leitung);
    await screen.findByText('Spielenachmittag');
    await userEvent.click(screen.getByRole('button', { name: 'Eintragen' }));
    const dialog = await screen.findByRole('dialog', { name: 'Wochenprogramm · Donnerstag' });
    await userEvent.click(within(dialog).getByRole('tab', { name: 'Freitext' }));
    await userEvent.type(within(dialog).getByLabelText('Was steht an?'), 'Kochen');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Eintragen' }));
    expect(api.speichereProgrammpunkt).toHaveBeenCalledWith('t1', 4, { angebot_id: null, freitext: 'Kochen', notiz: null });
  });

  it('Notiz ändern behält den Programmpunkt, Entfernen fragt nach', async () => {
    vi.mocked(api.speichereProgrammpunkt).mockResolvedValue(undefined);
    vi.mocked(api.loescheProgrammpunkt).mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    zeigeDetail(leitung);
    await screen.findByText('Spielenachmittag');
    await userEvent.click(screen.getByRole('button', { name: 'Ändern' }));
    const dialog = await screen.findByRole('dialog', { name: 'Wochenprogramm · Dienstag' });
    const feld = within(dialog).getByLabelText('Notiz');
    await userEvent.clear(feld);
    await userEvent.type(feld, 'Mit Snacks');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Notiz speichern' }));
    expect(api.speichereProgrammpunkt).toHaveBeenCalledWith('t1', 2, { angebot_id: null, freitext: 'Spielenachmittag', notiz: 'Mit Snacks' });
  });

  it('Programmpunkt entfernen', async () => {
    vi.mocked(api.loescheProgrammpunkt).mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    zeigeDetail(koord);
    await screen.findByText('Spielenachmittag');
    await userEvent.click(screen.getByRole('button', { name: 'Ändern' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Entfernen' }));
    expect(api.loescheProgrammpunkt).toHaveBeenCalledWith('t1', 2);
  });
});

describe('Treff-Team', () => {
  it('Treffleitung steht oben und sieht Kontaktdaten, kann aber nichts verwalten', async () => {
    zeigeDetail(leitung, '/treffs/t1/team');
    const eintraege = await screen.findAllByRole('listitem');
    expect(eintraege[0]).toHaveTextContent('Lea Leitner');
    expect(screen.getByRole('link', { name: 'lea@kijub.example' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Entfernen' })).not.toBeInTheDocument();
    expect(screen.queryByText('Person zuordnen')).not.toBeInTheDocument();
  });

  it('BetreuerIn bekommt den Hinweis zu Kontaktdaten', async () => {
    zeigeDetail(betreuerin, '/treffs/t1/team');
    expect(await screen.findByText(/Kontaktdaten der anderen sehen nur/)).toBeInTheDocument();
  });

  it('Koordination ordnet nur zulässige Kategorien zu', async () => {
    vi.mocked(fzApi.listePersonen).mockResolvedValue([
      { id: 'p1', vorname: 'Tim', nachname: 'Teamer', kategorie: 'TeamerIn', aktiv: true },
      { id: 'p2', vorname: 'Fia', nachname: 'Fsj', kategorie: 'FSJ', aktiv: true },
      { id: 'p3', vorname: 'Ina', nachname: 'Inaktiv', kategorie: 'TZK', aktiv: false },
      { id: 'b', vorname: 'Ben', nachname: 'Baum', kategorie: 'TZK', aktiv: true },
    ]);
    vi.mocked(zuordnungApi.treffTeamHinzufuegenViele).mockResolvedValue(undefined);
    zeigeDetail(koord, '/treffs/t1/team');
    await screen.findByRole('checkbox', { name: /Fia Fsj/ });
    expect(screen.queryByRole('checkbox', { name: /Tim Teamer/ })).not.toBeInTheDocument();       // Kategorie darf nicht in einen Treff
    expect(screen.queryByRole('checkbox', { name: /Inaktiv/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Ben Baum/ })).not.toBeInTheDocument();         // schon im Team
    await userEvent.click(screen.getByRole('checkbox', { name: /Fia Fsj/ }));
    await userEvent.selectOptions(screen.getByLabelText('Rolle für alle Ausgewählten'), 'treffleitung');
    await userEvent.click(screen.getByRole('button', { name: '1 Person zuordnen' }));
    expect(zuordnungApi.treffTeamHinzufuegenViele).toHaveBeenCalledWith('t1', ['p2'], 'treffleitung');
  });

  it('Koordination ändert die Rolle und entfernt', async () => {
    vi.mocked(api.treffTeamRolleAendern).mockResolvedValue(undefined);
    vi.mocked(api.treffTeamEntfernen).mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    zeigeDetail(koord, '/treffs/t1/team');
    await userEvent.selectOptions(await screen.findByLabelText('Rolle von Ben Baum'), 'treffleitung');
    expect(api.treffTeamRolleAendern).toHaveBeenCalledWith('t1', 'b', 'treffleitung');
    await userEvent.click(screen.getAllByRole('button', { name: 'Entfernen' })[1]!);
    expect(api.treffTeamEntfernen).toHaveBeenCalledWith('t1', 'b');
  });
});

describe('Treff-Absprachen', () => {
  beforeEach(() => {
    vi.mocked(api.listeTreffAbsprachen).mockResolvedValue([
      absprache({ id: 'a1', text: 'Schlüssel bitte zurückgeben', datum: '2027-07-06', geltung: 'tag', bestaetigungen: [{ person_id: 'lea', at: '' }] }),
    ]);
    vi.mocked(fzApi.holeNamen).mockResolvedValue({ lea: 'Lea Leitner' });
    for (const fn of [fzApi.bestaetige, fzApi.bestaetigungZurueck, fzApi.aendereNotiz, fzApi.loescheNotiz, api.legeTreffAbspracheAn] as const) {
      vi.mocked(fn as (...a: never[]) => Promise<void>).mockResolvedValue(undefined);
    }
  });

  it('BetreuerIn bestätigt, schreibt aber nicht', async () => {
    zeigeDetail(betreuerin, '/treffs/t1/absprachen');
    expect(await screen.findByText('Schlüssel bitte zurückgeben')).toBeInTheDocument();
    expect(screen.getByText('Für 06.07.2027')).toBeInTheDocument();
    expect(await screen.findByText('Bestätigt von Lea Leitner')).toBeInTheDocument();
    expect(screen.queryByLabelText('Neue Absprache')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Löschen' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Bestätigen/ }));
    expect(fzApi.bestaetige).toHaveBeenCalledWith('a1', 'ich');
  });

  it('Treffleitung legt eine Absprache an, optional mit Datum', async () => {
    zeigeDetail(leitung, '/treffs/t1/absprachen');
    await screen.findByText('Schlüssel bitte zurückgeben');
    await userEvent.type(screen.getByLabelText('Neue Absprache'), 'Elterncafé am Freitag');
    await userEvent.type(screen.getByLabelText('Gilt für einen bestimmten Tag (optional)'), '2027-07-09');
    vi.mocked(api.legeTreffAbspracheAn).mockResolvedValue('n-treff');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(api.legeTreffAbspracheAn).toHaveBeenCalledWith('t1', { geltung: 'tag', datum: '2027-07-09', text: 'Elterncafé am Freitag' });
    expect(sendePush).toHaveBeenCalledWith('absprache_treff', 'n-treff');
  });

  it('verlangt einen Text', async () => {
    zeigeDetail(leitung, '/treffs/t1/absprachen');
    await screen.findByText('Schlüssel bitte zurückgeben');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(screen.getByText('Bitte einen Text eingeben.')).toBeInTheDocument();
    expect(api.legeTreffAbspracheAn).not.toHaveBeenCalled();
  });

  it('Treffleitung löscht nach Rückfrage', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    zeigeDetail(leitung, '/treffs/t1/absprachen');
    await userEvent.click(await screen.findByRole('button', { name: 'Löschen' }));
    expect(fzApi.loescheNotiz).toHaveBeenCalledWith('a1');
  });
});

describe('Treff-Formular', () => {
  const bereit = async () => { await screen.findByLabelText('Name'); await screen.findByRole('option', { name: 'Strandbad' }); };

  it('legt einen Treff mit Öffnungszeiten an', async () => {
    vi.mocked(api.speichereTreff).mockResolvedValue('neu-id');
    renderMitAuth(<TreffForm />, { ...koord, pfad: '/treffs/neu', route: '/treffs/neu' });
    await bereit();
    await userEvent.type(screen.getByLabelText('Name'), 'Treff Mitte');
    await userEvent.selectOptions(screen.getByLabelText('Ort'), 'o2');
    await userEvent.click(screen.getByLabelText('Mittwoch'));
    await userEvent.click(screen.getByRole('button', { name: 'Treff anlegen' }));
    const [id, f] = vi.mocked(api.speichereTreff).mock.calls[0]!;
    expect(id).toBeNull();
    expect(f).toMatchObject({ name: 'Treff Mitte', ort_id: 'o2' });
    expect(f.tage[3]).toEqual({ an: true, von: '15:00', bis: '19:00' });
    expect(await screen.findByTestId('andere-seite')).toBeInTheDocument();
  });

  it('bietet nur freie Orte an, bei der Bearbeitung zusätzlich den eigenen', async () => {
    renderMitAuth(<TreffForm />, { ...koord, pfad: '/treffs/t1/bearbeiten', route: '/treffs/:id/bearbeiten' });
    await bereit();
    expect(screen.getByRole('option', { name: 'Jugendhaus' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Stadtpark' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Dienstag')).toBeChecked();
    expect(screen.getByLabelText('Montag')).not.toBeChecked();
    expect(screen.getByLabelText('Dienstag von')).toHaveValue('15:00');
  });

  it('zeigt Fehler und speichert nicht', async () => {
    renderMitAuth(<TreffForm />, { ...koord, pfad: '/treffs/neu', route: '/treffs/neu' });
    await bereit();
    await userEvent.click(screen.getByLabelText('Montag'));
    await userEvent.clear(screen.getByLabelText('Montag bis'));
    await userEvent.type(screen.getByLabelText('Montag bis'), '10:00');
    await userEvent.click(screen.getByRole('button', { name: 'Treff anlegen' }));
    expect(screen.getByText('Bitte einen Namen eingeben.')).toBeInTheDocument();
    expect(screen.getByText(/Montag: Die Öffnungszeit/)).toBeInTheDocument();
    expect(api.speichereTreff).not.toHaveBeenCalled();
  });

  it('löscht erst nach Namensbestätigung', async () => {
    vi.mocked(api.loescheTreff).mockResolvedValue(undefined);
    renderMitAuth(<TreffForm />, { ...koord, pfad: '/treffs/t1/bearbeiten', route: '/treffs/:id/bearbeiten' });
    await bereit();
    await userEvent.click(screen.getByRole('button', { name: 'Löschen …' }));
    const knopf = screen.getByRole('button', { name: 'Endgültig löschen' });
    expect(knopf).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/Zur Bestätigung/), 'Treff Nord');
    await userEvent.click(knopf);
    expect(api.loescheTreff).toHaveBeenCalledWith('t1');
  });
});

describe('Treff-Team: Entfernen mit Warnung vor künftigen Diensten', () => {
  it('nennt die Zahl künftiger Dienste in der Rückfrage; bei „Abbrechen“ bleibt die Person', async () => {
    vi.mocked(api.zaehleZukuenftigeDienste).mockResolvedValue(3);
    vi.mocked(api.treffTeamEntfernen).mockResolvedValue(undefined);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    zeigeDetail(koord, '/treffs/t1/team');
    const knopf = (await screen.findAllByRole('button', { name: 'Entfernen' }))[1]!;
    await userEvent.click(knopf);
    expect(confirm.mock.calls[0]![0]).toMatch(/noch in 3 künftigen Diensten eingeteilt/);
    expect(confirm.mock.calls[0]![0]).toMatch(/Ben Baum aus dem Team von „Treff Nord“ entfernen\?/);
    expect(api.treffTeamEntfernen).not.toHaveBeenCalled();
    await userEvent.click(knopf);
    expect(api.treffTeamEntfernen).toHaveBeenCalledWith('t1', 'b');
    confirm.mockRestore();
  });

  it('ohne künftige Dienste: die schlichte Rückfrage', async () => {
    vi.mocked(api.zaehleZukuenftigeDienste).mockResolvedValue(0);
    vi.mocked(api.treffTeamEntfernen).mockResolvedValue(undefined);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    zeigeDetail(koord, '/treffs/t1/team');
    await userEvent.click((await screen.findAllByRole('button', { name: 'Entfernen' }))[1]!);
    expect(confirm.mock.calls[0]![0]).toBe('Ben Baum aus dem Team von „Treff Nord“ entfernen?');
    confirm.mockRestore();
  });

  it('lässt sich die Zahl nicht ermitteln, wird trotzdem gefragt', async () => {
    vi.mocked(api.zaehleZukuenftigeDienste).mockRejectedValue(new Error('x'));
    vi.mocked(api.treffTeamEntfernen).mockResolvedValue(undefined);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    zeigeDetail(koord, '/treffs/t1/team');
    await userEvent.click((await screen.findAllByRole('button', { name: 'Entfernen' }))[1]!);
    expect(confirm).toHaveBeenCalled();
    expect(api.treffTeamEntfernen).toHaveBeenCalled();
    confirm.mockRestore();
  });
});
