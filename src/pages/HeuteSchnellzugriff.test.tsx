import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import * as fzApi from '../freizeiten/api';
import * as treffApi from '../treffs/api';
import * as heuteApi from '../heute/api';
import { leererStand } from '../test-heute';
import type { HeuteDaten } from '../heute/api';
import * as geraet from '../mitteilungen/geraet';
import { Heute } from './Heute';
import { renderMitAuth, type Szene } from '../test-utils';
import { freizeit, inTagen, treff } from '../test-daten';
import type { OffeneNotiz } from '../heute/logik';

vi.mock('../freizeiten/api');
vi.mock('../treffs/api');
vi.mock('../heute/api');
vi.mock('../mitteilungen/geraet');

let stand: HeuteDaten;

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
  vi.mocked(treffApi.listeTreffs).mockResolvedValue([{ ...treff({ id: 't1', name: 'Kindertreff' }), oeffnungszeiten: [] }]);
  vi.mocked(treffApi.listeMeineDienste).mockResolvedValue([]);
  stand = { ...leererStand(), orte: { o1: 'Mörscher Au' }, treffNamen: { t1: 'Kindertreff' } };
  vi.mocked(heuteApi.ladeHeute).mockImplementation(async () => ({ ...stand }));
  vi.mocked(heuteApi.quittiereBesuch).mockResolvedValue(undefined);
  vi.mocked(geraet.pruefeStatus).mockResolvedValue('an');
  vi.mocked(geraet.istApple).mockReturnValue(false);
});

const zeige = (s: Szene) => renderMitAuth(<Heute />, s);
const kachelLink = (gruppe: string, name: string | RegExp) => within(screen.getByRole('list', { name: gruppe })).getByRole('link', { name });

describe('Startseite: Schnellzugriff', () => {
  it('steht unter dem Feed („Heute“) und vor „Meine Freizeiten“', async () => {
    zeige(teamer);
    const nav = await screen.findByRole('navigation', { name: 'Schnellzugriff' });
    const heuteKarte = await screen.findByRole('heading', { name: /^Heute ·/ });
    const meine = await screen.findByRole('heading', { name: 'Meine Freizeiten' });
    expect(heuteKarte.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(nav.compareDocumentPosition(meine) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
    stand.notizen = [notiz({ id: '1' }), notiz({ id: '2' }), notiz({ id: '3', bestaetigt_von: ['ich'] })];
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
    stand.bestand = [
      { ort_id: 'o1', name: 'Milch', einheit: 'l', rest: 1, status: 'knapp' }, { ort_id: 'o1', name: 'Reis', einheit: 'kg', rest: 0, status: 'leer' }, { ort_id: 'o9', name: 'Salz', einheit: null, rest: 0, status: 'leer' },
    ] as never;
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
    stand.wuensche = [{ person_id: 'b', datum: inTagen(2), treff_id: 't1' }] as never;
    stand.nachweise = 3;
    zeige(treffleitung);
    const treffs = await screen.findByRole('list', { name: 'Treffs' });
    expect(await within(treffs).findByRole('link', { name: /Dienstwünsche\s*Offen:\s*1/ })).toHaveAttribute('href', '/treffs/t1/dienstplan');
    expect(await within(treffs).findByRole('link', { name: /Nachweis\s*Offen:\s*3/ })).toHaveAttribute('href', '/treffs/t1/nachweis');
    expect(within(treffs).getByRole('link', { name: 'Monatsplan' })).toHaveAttribute('href', '/treffs/t1/monat');
    expect(within(treffs).getByRole('link', { name: 'Abwesenheit & Feiertage' })).toHaveAttribute('href', '/treffs/t1/verwaltung');
  });

  it('Koordination: Verwaltung mit offenen Aufgaben, aufgeklappt, wenn etwas offen ist', async () => {
    stand.bewerbungen = 2;
    stand.vorschlaege = 1;
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

describe('Startseite: Tagesprotokoll und Notizen der Treffs', () => {
  const taeglichAb0 = [1, 2, 3, 4, 5, 6, 7].map((wochentag) => ({ wochentag, von: '00:00', bis: '23:59' }));
  const geoeffnet = () => vi.mocked(treffApi.listeTreffs).mockResolvedValue([{ ...treff({ id: 't1', name: 'Kindertreff' }), oeffnungszeiten: taeglichAb0 }]);

  it('heute geöffnet und noch kein Protokoll: Karte mit Link und Zahl an der Kachel', async () => {
    geoeffnet();
    zeige(tzk);
    const karte = await screen.findByRole('list', { name: 'Zu erledigen' });
    expect(within(karte).getByRole('link', { name: 'Tagesprotokoll fehlt' })).toHaveAttribute('href', '/treffs/t1/protokoll');
    expect(karte).toHaveTextContent('Kindertreff');
    expect(await within(screen.getByRole('list', { name: 'Treffs' })).findByRole('link', { name: /Tagesprotokoll\s*Offen:\s*1/ })).toHaveAttribute('href', '/treffs/t1/protokoll');
  });

  it('Protokoll ist schon da: keine Karte, keine Zahl', async () => {
    geoeffnet();
    stand.protokolliert = ['t1'];
    zeige(tzk);
    await screen.findByRole('navigation', { name: 'Schnellzugriff' });
    expect(await screen.findByRole('link', { name: 'Tagesprotokoll' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Tagesprotokoll fehlt' })).not.toBeInTheDocument();
  });

  it('Treff ohne Öffnung heute: nichts fehlt', async () => {
    zeige(tzk);          // Standard-Treff ohne Öffnungszeiten
    await screen.findByRole('navigation', { name: 'Schnellzugriff' });
    expect(screen.queryByText('Tagesprotokoll fehlt')).not.toBeInTheDocument();
  });

  it('offene Notizen: Zahl an der Kachel „Notizen“', async () => {
    stand.offeneNotizen = { t1: 3 };
    zeige(tzk);
    expect(await within(await screen.findByRole('list', { name: 'Treffs' })).findByRole('link', { name: /Notizen\s*Offen:\s*3/ })).toHaveAttribute('href', '/treffs/t1/notizen');
  });
});

describe('Startseite: Koordination getrennt nach Bereichen', () => {
  const fkOnly: Szene = { ich: { ist_freizeitkoordination: true, kategorie: 'Hauptamtliche*r' } };
  const tkOnly: Szene = { ich: { ist_treffkoordination: true, kategorie: 'Hauptamtliche*r' } };
  const taeglich = [1, 2, 3, 4, 5, 6, 7].map((wochentag) => ({ wochentag, von: '00:00', bis: '23:59' }));

  it('Freizeitenkoordination: Freizeiten, Lebensmittel, Bewerbungen, KiJuKo – keine Treffs', async () => {
    stand.bewerbungen = 2;
    zeige(fkOnly);
    await screen.findByRole('navigation', { name: 'Schnellzugriff' });
    expect(kachelLink('Freizeiten', 'Wochenplan')).toHaveAttribute('href', '/freizeiten/f1/plan');
    expect(kachelLink('Freizeiten', /^Lebensmittel/)).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Treffs' })).not.toBeInTheDocument();
    const verwaltung = await screen.findByRole('list', { name: 'Verwaltung' });
    expect(within(verwaltung).getByRole('link', { name: /Bewerbungen/ })).toHaveAttribute('href', '/bewerbungen');
    expect(verwaltung.querySelector('a[href="/import"]')).not.toBeNull();
    expect(verwaltung.querySelector('a[href="/freizeiten/neu"]')).not.toBeNull();
    expect(verwaltung.querySelector('a[href="/treffs/neu"]')).toBeNull();
    expect(screen.queryByText('Tagesprotokoll fehlt')).not.toBeInTheDocument();
    expect(treffApi.listeTreffs).not.toHaveBeenCalled();                       // die Treffs werden gar nicht erst geladen
  });

  it('Treffkoordination: Treffs, Protokolle, Nachweise – keine Freizeiten, Lebensmittel, Bewerbungen', async () => {
    vi.mocked(treffApi.listeTreffs).mockResolvedValue([{ ...treff({ id: 't1', name: 'Kindertreff' }), oeffnungszeiten: taeglich }]);
    stand.nachweise = 2;
    zeige(tkOnly);
    const treffs = await screen.findByRole('list', { name: 'Treffs' });
    expect(await within(treffs).findByRole('link', { name: /Tagesprotokoll\s*Offen:\s*1/ })).toHaveAttribute('href', '/treffs/t1/protokoll');
    expect(await within(treffs).findByRole('link', { name: /Nachweis\s*Offen:\s*2/ })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Freizeiten' })).not.toBeInTheDocument();
    const verwaltung = screen.getByRole('list', { name: 'Verwaltung' });
    expect(verwaltung.querySelector('a[href="/treffs/neu"]')).not.toBeNull();
    for (const weg of ['/bewerbungen', '/import', '/freizeiten/neu']) expect(verwaltung.querySelector(`a[href="${weg}"]`)).toBeNull();
    expect(await screen.findByRole('link', { name: 'Tagesprotokoll fehlt' })).toBeInTheDocument();
    expect(heuteApi.ladeHeute).toHaveBeenCalledWith(expect.objectContaining({ bewerbungen: false, bestand: false }));         // gar nicht erst angefragt
  });

  it('Kachelraster: Bewerbungen nur für die Freizeitenkoordination, Katalog-Vorschläge für beide', async () => {
    stand.vorschlaege = 1;
    const { unmount } = zeige(fkOnly);
    const karte = (await screen.findByRole('list', { name: 'Überblick der Koordination' }));
    expect(within(karte).getByRole('link', { name: /^Bewerbungen/ })).toBeInTheDocument();
    expect(within(karte).getByRole('link', { name: /^Katalog-Vorschläge/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Saison-Überblick' })).toBeInTheDocument();
    unmount();

    zeige(tkOnly);
    const karte2 = (await screen.findByRole('list', { name: 'Überblick der Koordination' }));
    expect(within(karte2).queryByRole('link', { name: /^Bewerbungen/ })).not.toBeInTheDocument();
    expect(within(karte2).getByRole('link', { name: /^Katalog-Vorschläge/ })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Saison-Überblick' })).not.toBeInTheDocument();
  });

  it('wer beide Bereiche hat, sieht beides', async () => {
    zeige({ ich: { ist_freizeitkoordination: true, ist_treffkoordination: true, kategorie: 'Hauptamtliche*r' } });
    await screen.findByRole('navigation', { name: 'Schnellzugriff' });
    expect(screen.getByRole('list', { name: 'Freizeiten' })).toBeInTheDocument();
    expect(await screen.findByRole('list', { name: 'Treffs' })).toBeInTheDocument();
    const verwaltung = screen.getByRole('list', { name: 'Verwaltung' });
    for (const ziel of ['/bewerbungen', '/import', '/freizeiten/neu', '/treffs/neu']) expect(verwaltung.querySelector(`a[href="${ziel}"]`)).not.toBeNull();
  });

  it('Hinweise der Freizeit-Absprachen bestätigt nur die Freizeitenkoordination – die der Treffs nur die Treffkoordination', async () => {
    stand.notizen = [
      notiz({ id: 'fa', art: 'absprache', text: 'Budget' }),
      notiz({ id: 'ta', art: 'absprache', text: 'Schlüssel', freizeit_id: null, treff_id: 't1', quelle: 'Kindertreff' }),
    ];
    vi.mocked(treffApi.listeTreffs).mockResolvedValue([{ ...treff({ id: 't1', name: 'Kindertreff' }), oeffnungszeiten: [] }]);
    const { unmount } = zeige(fkOnly);
    const karte = await screen.findByRole('list', { name: 'Zu erledigen' });
    expect(within(karte).getAllByRole('listitem')).toHaveLength(1);
    expect(karte).toHaveTextContent('Sommer-Sause');
    unmount();
    zeige(tkOnly);
    const karte2 = await screen.findByRole('list', { name: 'Zu erledigen' });
    expect(within(karte2).getAllByRole('listitem')).toHaveLength(1);
    expect(karte2).toHaveTextContent('Kindertreff');
  });
});
