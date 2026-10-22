import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import * as api from '../../treffs/api';
import * as fzApi from '../../freizeiten/api';
import * as zuordnungApi from '../../zuordnung/api';
import * as aufgabenApi from '../../tagesprotokoll/api';
import { TreffeListe } from './TreffeListe';
import { TreffDetail } from './TreffDetail';
import { TreffForm } from './TreffForm';
import { renderMitAuth, type Szene } from '../../test-utils';
import { treff, treffMitglied } from '../../test-daten';
import type { Notiz } from '../../freizeiten/notizen';

vi.mock('../../treffs/api');
vi.mock('../../freizeiten/api');
vi.mock('../../zuordnung/api');
vi.mock('../../tagesprotokoll/api');

const nord = treff({
  id: 't1', name: 'Treff Nord', ort_id: 'o1', ort_name: 'Jugendhaus', ort_adresse: 'Hauptstr. 1, Frankenthal',
  oeffnungszeiten: [{ wochentag: 2, von: '15:00', bis: '19:00' }, { wochentag: 4, von: '14:00', bis: '18:30' }],
  wochenprogramm: { 2: 'Spielenachmittag' },
});

const leitung: Szene = { ich: { kategorie: 'Hauptamtliche*r' }, treffs: [{ treff_id: 't1', rolle: 'treffleitung' }] };
const betreuerin: Szene = { ich: { kategorie: 'TZK' }, treffs: [{ treff_id: 't1', rolle: 'betreuerin' }] };
const koord: Szene = { ich: { ist_koordination: true, kategorie: 'Hauptamtliche*r' } };

const tabNamen = () => screen.getAllByRole('link').filter((l) => l.classList.contains('tabs__tab')).map((l) => l.textContent);
const zeigeDetail = (szene: Szene, pfad = '/treffs/t1') => renderMitAuth(<TreffDetail />, { ...szene, pfad, route: '/treffs/:id/*' });
const zeigeTeam = () => renderMitAuth(<TreffForm />, { ...koord, pfad: '/treffs/t1/bearbeiten', route: '/treffs/:id/bearbeiten' });

const absprache = (o: Partial<Notiz> & { id: string }): Notiz => ({
  art: 'absprache', geltung: 'gesamt', datum: null, text: 'Text', erstellt_von: 'lea', created_at: '2027-06-01T10:30:00Z', bestaetigungen: [], kommentare: [], ...o,
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.listeTreffs).mockResolvedValue([nord, treff({ id: 't2', name: 'Treff Süd' })]);
  vi.mocked(api.holeTreff).mockResolvedValue(nord);
  vi.mocked(api.holeTreffTeam).mockResolvedValue([
    treffMitglied({ person_id: 'b', vorname: 'Ben', nachname: 'Baum' }),
    treffMitglied({ person_id: 'l', vorname: 'Lea', nachname: 'Leitner', rolle: 'treffleitung', kategorie: 'Hauptamtliche*r', mail: 'lea@kijub.example' }),
  ]);
  vi.mocked(api.listeTreffAbsprachen).mockResolvedValue([]);
  vi.mocked(aufgabenApi.listeAufgaben).mockResolvedValue([]);
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
    renderMitAuth(<TreffeListe />, { ...leitung, treffs: [{ treff_id: 't1', rolle: 'treffleitung' }, { treff_id: 't2', rolle: 'betreuerin' }] });
    const t1 = await screen.findByRole('link', { name: 'Treff Nord' });
    expect(t1).toHaveAttribute('href', '/treffs/t1');
    expect(screen.getByText('Di, Do')).toBeInTheDocument();
    expect(screen.getByText('Keine Öffnungstage')).toBeInTheDocument();
    expect(screen.getByText('Treffleitung')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Neuer Treff' })).not.toBeInTheDocument();
  });

  it('nur einem Treff zugeordnet: direkt auf die Seite des Treffs', async () => {
    renderMitAuth(<Routes><Route path="/treffs" element={<TreffeListe />} /><Route path="/treffs/:id/*" element={<TreffDetail />} /></Routes>, { ...betreuerin, pfad: '/treffs' });
    expect(await screen.findByRole('heading', { name: 'Treff Nord' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '← Alle Treffs' })).not.toBeInTheDocument();
  });

  it('mehreren Treffs zugeordnet: Liste', async () => {
    renderMitAuth(<TreffeListe />, { ich: { kategorie: 'TZK' }, treffs: [{ treff_id: 't1', rolle: 'betreuerin' }, { treff_id: 't2', rolle: 'betreuerin' }] });
    expect(await screen.findByRole('link', { name: 'Treff Süd' })).toBeInTheDocument();
  });

  it('Koordination kann einen Treff anlegen', async () => {
    renderMitAuth(<TreffeListe />, koord);
    expect(await screen.findByRole('link', { name: 'Neuer Treff' })).toHaveAttribute('href', '/treffs/neu');
  });

  it('leer: Hinweis je Rolle', async () => {
    vi.mocked(api.listeTreffs).mockResolvedValue([]);
    renderMitAuth(<TreffeListe />, { ich: { kategorie: 'TZK' } });
    expect(await screen.findByText('Du bist noch keinem Treff zugeordnet')).toBeInTheDocument();
  });
});

describe('Treff-Detail: Reiter je Rolle', () => {
  it('BetreuerIn: Übersicht, Dienstplan, Stundennachweis, Teamprotokolle', async () => {
    zeigeDetail(betreuerin);
    await screen.findByRole('heading', { name: 'Treff Nord' });
    expect(tabNamen()).toEqual(['Übersicht', 'Tagesprotokoll', 'Notizen', 'Dienstplan', 'Stundennachweis', 'Teamprotokolle']);
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
    expect(tabNamen()).toEqual(['Übersicht', 'Tagesprotokoll', 'Notizen', 'Dienstplan', 'Stundennachweis', 'Teamprotokolle', 'Abwesenheit & Feiertage']);
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
  it('zeigt Adresse und bei den Öffnungstagen das Wochenprogramm', async () => {
    zeigeDetail(betreuerin);
    expect(await screen.findByText('Hauptstr. 1, Frankenthal')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Öffnungszeiten und Wochenprogramm' })).toBeInTheDocument();
    const dienstag = screen.getByText('Spielenachmittag').closest('dd')!;
    expect(dienstag).toHaveTextContent('15:00–19:00 Uhr');
    expect(dienstag.previousElementSibling).toHaveTextContent('Dienstag');
    expect(screen.queryByRole('button', { name: 'Programm bearbeiten' })).not.toBeInTheDocument();
  });

  it('Treffleitung trägt das Programm je Öffnungstag ein; nur geänderte Tage werden gespeichert', async () => {
    vi.mocked(api.setzeWochenprogrammTag).mockResolvedValue(undefined);
    zeigeDetail(leitung);
    await userEvent.click(await screen.findByRole('button', { name: 'Programm bearbeiten' }));
    expect(screen.getByLabelText('Dienstag · 15:00–19:00 Uhr')).toHaveValue('Spielenachmittag');
    await userEvent.type(screen.getByLabelText('Donnerstag · 14:00–18:30 Uhr'), 'Kochen');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(api.setzeWochenprogrammTag).toHaveBeenCalledTimes(1);
    expect(api.setzeWochenprogrammTag).toHaveBeenCalledWith('t1', 4, 'Kochen');
    expect((await screen.findByText('Kochen')).closest('dd')).toHaveTextContent('14:00–18:30 Uhr');
  });

  it('Koordination leert einen Tag: das Programm wird entfernt', async () => {
    vi.mocked(api.setzeWochenprogrammTag).mockResolvedValue(undefined);
    zeigeDetail(koord);
    await userEvent.click(await screen.findByRole('button', { name: 'Programm bearbeiten' }));
    await userEvent.clear(screen.getByLabelText('Dienstag · 15:00–19:00 Uhr'));
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(api.setzeWochenprogrammTag).toHaveBeenCalledWith('t1', 2, '');
    expect(screen.queryByText('Spielenachmittag')).not.toBeInTheDocument();
  });
});

describe('Treff-Team (unter „Treff bearbeiten“)', () => {
  it('kein Team-Reiter mehr: der alte Link führt die Treffleitung zur Übersicht', async () => {
    zeigeDetail(leitung, '/treffs/t1/team');
    expect(await screen.findByRole('heading', { name: 'Öffnungszeiten und Wochenprogramm' })).toBeInTheDocument();
  });

  it('zeigt das Team mit Kontaktdaten', async () => {
    zeigeTeam();
    expect(await screen.findByRole('heading', { name: 'Team' })).toBeInTheDocument();
    expect(await screen.findByText('Lea Leitner')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'lea@kijub.example' })).toBeInTheDocument();
  });

  it('Koordination ordnet nur zulässige Kategorien zu', async () => {
    vi.mocked(fzApi.listePersonen).mockResolvedValue([
      { id: 'p1', vorname: 'Tim', nachname: 'Teamer', kategorie: 'TeamerIn', aktiv: true },
      { id: 'p2', vorname: 'Fia', nachname: 'Fsj', kategorie: 'FSJ', aktiv: true },
      { id: 'p3', vorname: 'Ina', nachname: 'Inaktiv', kategorie: 'TZK', aktiv: false },
      { id: 'b', vorname: 'Ben', nachname: 'Baum', kategorie: 'TZK', aktiv: true },
    ]);
    vi.mocked(zuordnungApi.treffTeamHinzufuegenViele).mockResolvedValue(undefined);
    zeigeTeam();
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
    zeigeTeam();
    await userEvent.selectOptions(await screen.findByLabelText('Rolle von Ben Baum'), 'treffleitung');
    expect(api.treffTeamRolleAendern).toHaveBeenCalledWith('t1', 'b', 'treffleitung');
    await userEvent.click(screen.getAllByRole('button', { name: 'Entfernen' })[1]!);
    expect(api.treffTeamEntfernen).toHaveBeenCalledWith('t1', 'b');
  });
});

describe('Treff-Absprachen (Art im Reiter Notizen)', () => {
  it('alte Links auf /absprachen führen zu den Notizen, gefiltert auf Absprachen', async () => {
    vi.mocked(api.listeTreffAbsprachen).mockResolvedValue([absprache({ id: 'a1', text: 'Schlüssel bitte zurückgeben' })]);
    zeigeDetail(betreuerin, '/treffs/t1/absprachen');
    expect(await screen.findByText('Schlüssel bitte zurückgeben')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Notizen' })).toHaveClass('active');
    expect(screen.getByRole('button', { name: /Absprachen \(1\)/ })).toHaveAttribute('aria-pressed', 'true');
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
    zeigeTeam();
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
    zeigeTeam();
    await userEvent.click((await screen.findAllByRole('button', { name: 'Entfernen' }))[1]!);
    expect(confirm.mock.calls[0]![0]).toBe('Ben Baum aus dem Team von „Treff Nord“ entfernen?');
    confirm.mockRestore();
  });

  it('lässt sich die Zahl nicht ermitteln, wird trotzdem gefragt', async () => {
    vi.mocked(api.zaehleZukuenftigeDienste).mockRejectedValue(new Error('x'));
    vi.mocked(api.treffTeamEntfernen).mockResolvedValue(undefined);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    zeigeTeam();
    await userEvent.click((await screen.findAllByRole('button', { name: 'Entfernen' }))[1]!);
    expect(confirm).toHaveBeenCalled();
    expect(api.treffTeamEntfernen).toHaveBeenCalled();
    confirm.mockRestore();
  });
});
