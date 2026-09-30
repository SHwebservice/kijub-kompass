import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import * as fzApi from '../freizeiten/api';
import * as treffApi from '../treffs/api';
import * as heuteApi from '../heute/api';
import * as katalogApi from '../katalog/api';
import * as geraet from '../mitteilungen/geraet';
import { Heute } from './Heute';
import { renderMitAuth, type Szene } from '../test-utils';
import { freizeit, inTagen, treff } from '../test-daten';
import type { OffeneNotiz } from '../heute/logik';

vi.mock('../freizeiten/api');
vi.mock('../treffs/api');
vi.mock('../heute/api');
vi.mock('../katalog/api');
vi.mock('../mitteilungen/geraet');

const laeuft = freizeit({ id: 'f1', name: 'Sommer-Sause', start_datum: inTagen(-1), ende_datum: inTagen(3), ort_id: 'o1', ort_name: 'Mörscher Au', ferienzeitraum: 'sommer', ferienwoche: 1 });

const notiz = (o: Partial<OffeneNotiz> & { id: string }): OffeneNotiz => ({
  art: 'hinweis', geltung: 'gesamt', datum: null, text: 'Text', created_at: '2027-01-01T10:00:00Z', freizeit_id: 'f1', treff_id: null, quelle: 'Sommer-Sause', bestaetigt_von: [], ...o,
});

const teamer: Szene = { freizeiten: [{ freizeit_id: 'f1', rolle: 'teamer' }] };
const leitung: Szene = { ich: { kategorie: 'Hauptamtliche*r' }, freizeiten: [{ freizeit_id: 'f1', rolle: 'leitung' }] };
const tzk: Szene = { ich: { id: 'ich', kategorie: 'TZK' }, treffs: [{ treff_id: 't1', rolle: 'betreuerin' }] };
const treffleitung: Szene = { ich: { id: 'ich', kategorie: 'Hauptamtliche*r' }, treffs: [{ treff_id: 't1', rolle: 'treffleitung' }] };
const koord: Szene = { ich: { ist_koordination: true, kategorie: 'Hauptamtliche*r' } };

beforeEach(() => {
  vi.resetAllMocks();
  window.localStorage.clear();
  vi.mocked(fzApi.listeFreizeiten).mockResolvedValue([laeuft]);
  vi.mocked(fzApi.meineBewerbungen).mockResolvedValue([]);
  vi.mocked(fzApi.holeVorlaufTage).mockResolvedValue(7);
  vi.mocked(fzApi.offeneBewerbungen).mockResolvedValue([]);
  vi.mocked(treffApi.listeTreffs).mockResolvedValue([{ ...treff({ id: 't1', name: 'Kindertreff' }), oeffnungszeiten: [] }]);
  vi.mocked(treffApi.listeMeineDienste).mockResolvedValue([]);
  vi.mocked(heuteApi.listeNotizenFuerHeute).mockResolvedValue([]);
  vi.mocked(heuteApi.listeTeamZeilen).mockResolvedValue([]);
  vi.mocked(heuteApi.listePlanHeute).mockResolvedValue([]);
  vi.mocked(heuteApi.listeKnappeLebensmittel).mockResolvedValue([]);
  vi.mocked(heuteApi.listeOffeneWuensche).mockResolvedValue([]);
  vi.mocked(heuteApi.zaehleEingereichteNachweise).mockResolvedValue(0);
  vi.mocked(heuteApi.listeOrtNamen).mockResolvedValue({ o1: 'Mörscher Au' });
  vi.mocked(heuteApi.listeTreffNamen).mockResolvedValue({ t1: 'Kindertreff' });
  vi.mocked(katalogApi.listeVorschlaege).mockResolvedValue([]);
  vi.mocked(geraet.pruefeStatus).mockResolvedValue('an');
  vi.mocked(geraet.istApple).mockReturnValue(false);
});

const zeige = (s: Szene) => renderMitAuth(<Heute />, s);
const kachelLink = (gruppe: string, name: string | RegExp) => within(screen.getByRole('list', { name: gruppe })).getByRole('link', { name });

describe('Startseite: Schnellzugriff', () => {
  it('steht oben – vor „Heute“ und allen Karten', async () => {
    zeige(teamer);
    const nav = await screen.findByRole('navigation', { name: 'Schnellzugriff' });
    const heuteKarte = await screen.findByRole('heading', { name: /^Heute ·/ });
    expect(nav.compareDocumentPosition(heuteKarte) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('TeamerIn in einer Freizeit: direkte Kacheln in die Reiter, Wissen und Konto', async () => {
    zeige(teamer);
    await screen.findByRole('navigation', { name: 'Schnellzugriff' });
    expect(kachelLink('Freizeiten', 'Wochenplan')).toHaveAttribute('href', '/freizeiten/f1/plan');
    expect(kachelLink('Freizeiten', /^Hinweise/)).toHaveAttribute('href', '/freizeiten/f1/hinweise');
    expect(kachelLink('Freizeiten', 'Team')).toHaveAttribute('href', '/freizeiten/f1/team');
    expect(kachelLink('Wissen & Konto', 'Katalog')).toHaveAttribute('href', '/katalog');
    expect(kachelLink('Wissen & Konto', 'Teamermappe')).toHaveAttribute('href', '/teamermappe');
    expect(kachelLink('Wissen & Konto', 'Formulare')).toHaveAttribute('href', '/formulare');
    expect(kachelLink('Wissen & Konto', 'Quiz')).toHaveAttribute('href', '/quiz');
    expect(kachelLink('Wissen & Konto', /Mitteilungen & Konto/)).toHaveAttribute('href', '/mehr');
    expect(screen.queryByRole('list', { name: 'Treffs' })).not.toBeInTheDocument();
    expect(screen.queryByText('Verwaltung')).not.toBeInTheDocument();
  });

  it('die Zahl der offenen Hinweise hängt an der Kachel „Hinweise“', async () => {
    vi.mocked(heuteApi.listeNotizenFuerHeute).mockResolvedValue([notiz({ id: '1' }), notiz({ id: '2' }), notiz({ id: '3', bestaetigt_von: ['ich'] })]);
    zeige(teamer);
    expect(await screen.findByRole('link', { name: /Hinweise\s*Offen:\s*2/ })).toHaveAttribute('href', '/freizeiten/f1/hinweise');
  });

  it('mehrere Freizeiten: die Kachel klappt eine Auswahl auf', async () => {
    vi.mocked(fzApi.listeFreizeiten).mockResolvedValue([laeuft, freizeit({ id: 'f9', name: 'Zweite Freizeit', start_datum: inTagen(5), ende_datum: inTagen(9) })]);
    zeige({ freizeiten: [{ freizeit_id: 'f1', rolle: 'teamer' }, { freizeit_id: 'f9', rolle: 'teamer' }] });
    const nav = await screen.findByRole('navigation', { name: 'Schnellzugriff' });
    const auswahl = await within(nav).findByRole('list', { name: 'Wochenplan: Auswahl' });
    expect(within(auswahl).getByRole('link', { name: 'Sommer-Sause' })).toHaveAttribute('href', '/freizeiten/f1/plan');
    expect(within(auswahl).getByRole('link', { name: 'Zweite Freizeit' })).toHaveAttribute('href', '/freizeiten/f9/plan');
    expect(within(auswahl).getByRole('link', { name: 'Alle anzeigen' })).toHaveAttribute('href', '/freizeiten');
  });

  it('Leitung: Lebensmittel-Kachel mit der Zahl knapper Artikel (nur am Ort der eigenen Freizeit)', async () => {
    vi.mocked(heuteApi.listeKnappeLebensmittel).mockResolvedValue([
      { ort_id: 'o1', name: 'Milch', einheit: 'l', rest: 1, status: 'knapp' }, { ort_id: 'o1', name: 'Reis', einheit: 'kg', rest: 0, status: 'leer' }, { ort_id: 'o9', name: 'Salz', einheit: null, rest: 0, status: 'leer' },
    ] as never);
    zeige(leitung);
    expect(await screen.findByRole('link', { name: /Lebensmittel\s*Offen:\s*2/ })).toHaveAttribute('href', '/freizeiten/f1/lebensmittel');
  });

  it('BetreuerIn (TZK): Dienstplan mit „Dienste heute“, Nachweis, Absprachen, Treffmappe – kein Monatsplan', async () => {
    vi.mocked(treffApi.listeMeineDienste).mockResolvedValue([{ id: 'd', datum: inTagen(0), von: '15:00', bis: '19:00', ist_sonder: false, bezeichnung: null, treff_id: 't1', treff_name: 'Kindertreff' }] as never);
    zeige(tzk);
    await screen.findByRole('navigation', { name: 'Schnellzugriff' });
    expect(await within(screen.getByRole('list', { name: 'Treffs' })).findByRole('link', { name: /Dienstplan\s*Offen:\s*1/ })).toHaveAttribute('href', '/treffs/t1/dienstplan');
    expect(kachelLink('Treffs', /^Nachweis/)).toHaveAttribute('href', '/treffs/t1/nachweis');
    expect(kachelLink('Treffs', /^Absprachen/)).toHaveAttribute('href', '/treffs/t1/absprachen');
    expect(kachelLink('Treffs', 'Alle Treffs')).toHaveAttribute('href', '/treffs');
    expect(kachelLink('Wissen & Konto', 'Treffmappe')).toHaveAttribute('href', '/treffmappe');
    expect(screen.queryByRole('link', { name: /Monatsplan/ })).not.toBeInTheDocument();
  });

  it('Treffleitung: Wünsche, Monatsplan, Abwesenheit & Feiertage, Nachweise mit Zahl eingereichter', async () => {
    vi.mocked(heuteApi.listeOffeneWuensche).mockResolvedValue([{ person_id: 'b', datum: inTagen(2), treff_id: 't1' }] as never);
    vi.mocked(heuteApi.zaehleEingereichteNachweise).mockResolvedValue(3);
    zeige(treffleitung);
    const treffs = await screen.findByRole('list', { name: 'Treffs' });
    expect(await within(treffs).findByRole('link', { name: /Dienstwünsche\s*Offen:\s*1/ })).toHaveAttribute('href', '/treffs/t1/dienstplan');
    expect(await within(treffs).findByRole('link', { name: /Nachweis\s*Offen:\s*3/ })).toHaveAttribute('href', '/treffs/t1/nachweis');
    expect(within(treffs).getByRole('link', { name: 'Monatsplan' })).toHaveAttribute('href', '/treffs/t1/monat');
    expect(within(treffs).getByRole('link', { name: 'Abwesenheit & Feiertage' })).toHaveAttribute('href', '/treffs/t1/verwaltung');
  });

  it('Koordination: Verwaltung mit offenen Aufgaben, aufgeklappt, wenn etwas offen ist', async () => {
    vi.mocked(fzApi.offeneBewerbungen).mockResolvedValue([{ id: 'b1' }, { id: 'b2' }] as never);
    vi.mocked(katalogApi.listeVorschlaege).mockResolvedValue([{ status: 'offen' }] as never);
    zeige(koord);
    expect(await screen.findByText('3 offen')).toBeInTheDocument();
    const verwaltung = screen.getByRole('list', { name: 'Verwaltung' });
    expect(within(verwaltung).getByRole('link', { name: /Bewerbungen\s*Offen:\s*2/ })).toHaveAttribute('href', '/bewerbungen');
    expect(within(verwaltung).getByRole('link', { name: /Vorschläge\s*Offen:\s*1/ })).toHaveAttribute('href', '/katalog/vorschlaege');
    for (const pfad of ['/personen', '/freizeiten/neu', '/treffs/neu', '/orte', '/mitteilungen', '/import']) {
      expect(verwaltung.querySelector(`a[href="${pfad}"]`)).not.toBeNull();
    }
    expect(screen.queryByRole('link', { name: /Programmpunkt vorschlagen/ })).not.toBeInTheDocument();
  });

  it('Koordination ohne offene Aufgaben: Verwaltung ist eingeklappt', async () => {
    zeige(koord);
    await screen.findByRole('navigation', { name: 'Schnellzugriff' });
    expect(screen.getByText('Verwaltung').closest('details')).not.toHaveAttribute('open');
  });

  it('Hauptamtliche ohne Zuordnung: nur Wissen und Konto', async () => {
    zeige({ ich: { kategorie: 'Hauptamtliche*r' } });
    await screen.findByRole('navigation', { name: 'Schnellzugriff' });
    expect(screen.queryByRole('list', { name: 'Freizeiten' })).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Treffs' })).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Wissen & Konto' })).toBeInTheDocument();
  });

  it('mehrere Rollen: Leitung einer Freizeit und Treffleitung zugleich', async () => {
    zeige({ ich: { id: 'ich', kategorie: 'Hauptamtliche*r' }, freizeiten: [{ freizeit_id: 'f1', rolle: 'leitung' }], treffs: [{ treff_id: 't1', rolle: 'treffleitung' }] });
    await screen.findByRole('navigation', { name: 'Schnellzugriff' });
    expect(kachelLink('Freizeiten', /^Lebensmittel/)).toBeInTheDocument();
    expect(await within(screen.getByRole('list', { name: 'Treffs' })).findByRole('link', { name: /Dienstwünsche/ })).toBeInTheDocument();
  });
});
