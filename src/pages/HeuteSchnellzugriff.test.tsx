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
import * as checklisteApi from '../checkliste/api';
import * as teamprotokollApi from '../teamprotokolle/api';

vi.mock('../freizeiten/api');
vi.mock('../treffs/api');
vi.mock('../heute/api');
vi.mock('../mitteilungen/geraet');
vi.mock('../checkliste/api');
vi.mock('../teamprotokolle/api');

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
  vi.mocked(checklisteApi.ladeCheckliste).mockResolvedValue([]);
  vi.mocked(teamprotokollApi.listeNeueTeamprotokolle).mockResolvedValue([]);
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
  it('steht unter dem Feed („Heute“) und „Als Nächstes“', async () => {
    zeige(teamer);
    const nav = await screen.findByRole('navigation', { name: 'Schnellzugriff' });
    const heuteKarte = await screen.findByRole('heading', { name: /^Heute ·/ });
    const naechstes = await screen.findByRole('heading', { name: 'Als Nächstes' });
    expect(heuteKarte.compareDocumentPosition(naechstes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(naechstes.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('TeamerIn in einer Freizeit: nur direkte Kacheln in die Reiter – nichts aus Navigation oder „Mehr“', async () => {
    zeige(teamer);
    await screen.findByRole('navigation', { name: 'Schnellzugriff' });
    expect(kachelLink('Freizeiten', 'Wochenplan')).toHaveAttribute('href', '/freizeiten/f1/plan');
    expect(kachelLink('Freizeiten', 'Hinweise')).toHaveAttribute('href', '/freizeiten/f1/hinweise');
    expect(kachelLink('Freizeiten', 'Team')).toHaveAttribute('href', '/freizeiten/f1/team');
    expect(screen.queryByRole('list', { name: 'Wissen & Konto' })).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Treffs' })).not.toBeInTheDocument();
    expect(screen.queryByText('Verwaltung')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Alle Freizeiten' })).not.toBeInTheDocument();
  });

  it('offene Hinweise stehen im Feed, nicht als Zahl an der Kachel', async () => {
    stand.notizen = [notiz({ id: '1' }), notiz({ id: '2' }), notiz({ id: '3', bestaetigt_von: ['ich'] })];
    zeige(teamer);
    await screen.findByRole('list', { name: 'Zu erledigen' });
    expect(kachelLink('Freizeiten', 'Hinweise')).not.toHaveTextContent(/Offen/);
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

  it('Leitung: knappe Lebensmittel als Karte im Feed (nur am Ort der eigenen Freizeit), die Kachel ohne Zahl', async () => {
    stand.bestand = [
      { ort_id: 'o1', name: 'Milch', einheit: 'l', rest: 1, status: 'knapp' }, { ort_id: 'o1', name: 'Reis', einheit: 'kg', rest: 0, status: 'leer' }, { ort_id: 'o9', name: 'Salz', einheit: null, rest: 0, status: 'leer' },
    ] as never;
    zeige(leitung);
    const karte = await screen.findByRole('list', { name: 'Zu erledigen' });
    expect(karte).toHaveTextContent('Milch');
    expect(karte).not.toHaveTextContent('Salz');
    expect(kachelLink('Freizeiten', 'Lebensmittel')).toHaveAttribute('href', '/freizeiten/f1/lebensmittel');
  });

  it('BetreuerIn (TZK): Tagesprotokoll, Notizen, Dienstplan, Nachweis – keine Wünsche, kein Monatsplan, keine Treffmappe', async () => {
    zeige(tzk);
    await screen.findByRole('navigation', { name: 'Schnellzugriff' });
    expect(await within(screen.getByRole('list', { name: 'Treffs' })).findByRole('link', { name: 'Dienstplan' })).toHaveAttribute('href', '/treffs/t1/dienstplan');
    expect(kachelLink('Treffs', 'Stundennachweis')).toHaveAttribute('href', '/treffs/t1/nachweis');
    for (const weg of [/Monatsplan/, /Dienstwünsche/, /Absprachen/, /Treffmappe/, /Alle Treffs/]) expect(screen.queryByRole('link', { name: weg })).not.toBeInTheDocument();
  });

  it('Treffleitung: Abwesenheiten, Nachweise mit Zahl eingereichter; Dienstwünsche stehen im Feed', async () => {
    stand.wuensche = [{ person_id: 'b', datum: inTagen(2), treff_id: 't1' }] as never;
    stand.nachweise = 3;
    zeige(treffleitung);
    const treffs = await screen.findByRole('list', { name: 'Treffs' });
    expect(await within(treffs).findByRole('link', { name: /Stundennachweis\s*Offen:\s*3/ })).toHaveAttribute('href', '/treffs/t1/nachweis');
    expect(within(treffs).getByRole('link', { name: 'Abwesenheiten' })).toHaveAttribute('href', '/treffs/t1/dienstplan?ansicht=monat&zeige=abwesenheiten');
    expect(within(treffs).queryByRole('link', { name: /Dienstwünsche|Monatsplan/ })).not.toBeInTheDocument();
    expect(await screen.findByRole('list', { name: 'Zu erledigen' })).toHaveTextContent('Kindertreff');
  });

  it('Koordination ohne eigene Freizeit oder Treff: kein Schnellzugriff, keine Verwaltung (die steht unter „Mehr“)', async () => {
    vi.mocked(fzApi.listeFreizeiten).mockResolvedValue([]);
    vi.mocked(treffApi.listeTreffs).mockResolvedValue([]);
    zeige(koord);
    await screen.findByRole('list', { name: 'Überblick der Koordination' });
    expect(screen.queryByRole('navigation', { name: 'Schnellzugriff' })).not.toBeInTheDocument();
    expect(screen.queryByText('Verwaltung')).not.toBeInTheDocument();
  });

  it('Hauptamtliche ohne Zuordnung: kein Schnellzugriff', async () => {
    zeige({ ich: { kategorie: 'Hauptamtliche*r' } });
    await screen.findByText('Willkommen im KiJuB-Kompass');
    expect(screen.queryByRole('navigation', { name: 'Schnellzugriff' })).not.toBeInTheDocument();
  });

  it('mehrere Rollen: Leitung einer Freizeit und Treffleitung zugleich', async () => {
    zeige({ ich: { id: 'ich', kategorie: 'Hauptamtliche*r' }, freizeiten: [{ freizeit_id: 'f1', rolle: 'leitung' }], treffs: [{ treff_id: 't1', rolle: 'treffleitung' }] });
    await screen.findByRole('navigation', { name: 'Schnellzugriff' });
    expect(kachelLink('Freizeiten', 'Lebensmittel')).toBeInTheDocument();
    expect(await within(screen.getByRole('list', { name: 'Treffs' })).findByRole('link', { name: 'Abwesenheiten' })).toBeInTheDocument();
  });
});

describe('Startseite: Tagesprotokoll und Notizen der Treffs', () => {
  const taeglichAb0 = [1, 2, 3, 4, 5, 6, 7].map((wochentag) => ({ wochentag, von: '00:00', bis: '23:59' }));
  const geoeffnet = () => vi.mocked(treffApi.listeTreffs).mockResolvedValue([{ ...treff({ id: 't1', name: 'Kindertreff' }), oeffnungszeiten: taeglichAb0 }]);

  it('heute geöffnet und noch kein Protokoll: Karte mit Link im Feed, die Kachel ohne Zahl', async () => {
    geoeffnet();
    zeige(tzk);
    const karte = await screen.findByRole('list', { name: 'Zu erledigen' });
    expect(within(karte).getByRole('link', { name: 'Tagesprotokoll fehlt' })).toHaveAttribute('href', '/treffs/t1/protokoll');
    expect(karte).toHaveTextContent('Kindertreff');
    expect(await within(screen.getByRole('list', { name: 'Treffs' })).findByRole('link', { name: 'Tagesprotokoll' })).toHaveAttribute('href', '/treffs/t1/protokoll');
  });

  it('Protokoll ist schon da: keine Karte, keine Zahl', async () => {
    geoeffnet();
    stand.protokolliert = ['t1'];
    zeige(tzk);
    await screen.findByRole('navigation', { name: 'Schnellzugriff' });
    expect(await screen.findByRole('link', { name: 'Tagesprotokoll' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Tagesprotokoll fehlt' })).not.toBeInTheDocument();
  });

  it('heute geschlossen (Feiertag oder Schließzeit): nichts fehlt', async () => {
    geoeffnet();
    stand.geschlossen = ['t1'];
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

  it('Freizeitenkoordination: Freizeit-Kacheln mit Lebensmittel – keine Treffs, keine Verwaltung', async () => {
    stand.bewerbungen = 2;
    zeige(fkOnly);
    await screen.findByRole('navigation', { name: 'Schnellzugriff' });
    expect(kachelLink('Freizeiten', 'Wochenplan')).toHaveAttribute('href', '/freizeiten/f1/plan');
    expect(kachelLink('Freizeiten', /^Lebensmittel/)).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Treffs' })).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Verwaltung' })).not.toBeInTheDocument();
    expect(screen.queryByText('Tagesprotokoll fehlt')).not.toBeInTheDocument();
    expect(treffApi.listeTreffs).not.toHaveBeenCalled();                       // die Treffs werden gar nicht erst geladen
  });

  it('Treffkoordination: Treff-Kacheln, Nachweise zählt der Überblick – keine Freizeiten, keine Verwaltung', async () => {
    vi.mocked(treffApi.listeTreffs).mockResolvedValue([{ ...treff({ id: 't1', name: 'Kindertreff' }), oeffnungszeiten: taeglich }]);
    stand.nachweise = 2;
    zeige(tkOnly);
    const treffs = await screen.findByRole('list', { name: 'Treffs' });
    // Tagesprotokoll: erreichbar, aber ohne „fehlt“ – die Treffkoordination liest es bei Bedarf im Treff nach (0026)
    expect(await within(treffs).findByRole('link', { name: /^Tagesprotokoll/ })).toHaveAttribute('href', '/treffs/t1/protokoll');
    expect(within(treffs).queryByRole('link', { name: /Tagesprotokoll\s*Offen/ })).not.toBeInTheDocument();
    expect(await within(treffs).findByRole('link', { name: 'Stundennachweis' })).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Überblick der Koordination' })).getByRole('link', { name: /^Nachweise/ })).toHaveTextContent('2');
    expect(screen.queryByRole('list', { name: 'Freizeiten' })).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Verwaltung' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Tagesprotokoll fehlt' })).not.toBeInTheDocument();
    expect(heuteApi.ladeHeute).toHaveBeenCalledWith(expect.objectContaining({ bewerbungen: false, bestand: false, kachelTreffs: ['t1'], protokollTreffs: [] }));
  });

  it('Kachelraster: Bewerbungen nur für die Freizeitenkoordination, Katalog-Vorschläge für beide; die Saison steht unter „Freizeiten“', async () => {
    stand.vorschlaege = 1;
    const { unmount } = zeige(fkOnly);
    const karte = (await screen.findByRole('list', { name: 'Überblick der Koordination' }));
    expect(within(karte).getByRole('link', { name: /^Bewerbungen/ })).toBeInTheDocument();
    expect(within(karte).getByRole('link', { name: /^Katalog-Vorschläge/ })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Saison-Überblick' })).not.toBeInTheDocument();
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
    expect(screen.queryByRole('list', { name: 'Verwaltung' })).not.toBeInTheDocument();
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
