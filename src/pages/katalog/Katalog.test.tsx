import { describe, it, expect, vi, beforeEach } from 'vitest';
import { axeVerstoesse } from '../../test-a11y';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '../../katalog/api';
import { KatalogListe } from './KatalogListe';
import { AngebotDetail } from './AngebotDetail';
import { renderMitAuth, type Szene } from '../../test-utils';
import { leeresAngebot, type Angebot } from '../../katalog/logik';

vi.mock('../../katalog/api');

const a = (o: Partial<Angebot> & { id: string }): Angebot => ({ ...leeresAngebot('bewegung'), name: `Spiel ${o.id}`, ...o });
const fangen = a({ id: 'fangen', name: 'Fangen', kategorie: 'bewegung', dauer: '20 Min.', wetter: 'outdoor', alter_gruppen: ['6-8'], umsetzung: 'Ein Kind fängt die anderen auf der Wiese', material: 'Leibchen' });
const schatz = a({ id: 'schatz', name: 'Schatzsuche', kategorie: 'highlight', wetter: 'outdoor', alter_gruppen: ['9-12'], umsetzung: 'Die Gruppe sucht den Schatz im Wald mit der Karte', autor: 'Lea', gruppe: '8–12 Kinder' });
const wald = a({ id: 'wald', name: 'Waldspiele', kategorie: 'bewegung', umsetzung: 'Im Wald mit der Karte Schätze suchen' });
const knoten = a({ id: 'knoten', name: 'Menschenknoten', kategorie: 'kennenlernen', wetter: 'beides' });

const teamer: Szene = { freizeiten: [{ freizeit_id: 'f1', rolle: 'teamer' }] };
const koord: Szene = { ich: { ist_koordination: true, kategorie: 'Hauptamtliche*r' } };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.listeKatalog).mockResolvedValue([fangen, schatz, wald, knoten]);
  vi.mocked(api.holeBewertungen).mockResolvedValue({ fangen: { durchschnitt: 4.5, anzahl: 2 } });
  vi.mocked(api.meineFavoriten).mockResolvedValue(['schatz']);
  vi.mocked(api.meineBewertungen).mockResolvedValue({});
  vi.mocked(api.listeVorschlaege).mockResolvedValue([]);
  vi.mocked(api.listeAngebotKommentare).mockResolvedValue([]);
  for (const fn of [api.setzeFavorit, api.bewerte, api.entferneBewertung, api.kommentiereAngebot, api.loescheAngebotKommentar, api.loescheAngebot] as const) {
    vi.mocked(fn as (...x: never[]) => Promise<void>).mockResolvedValue(undefined);
  }
});

const zeigeListe = (s: Szene = teamer) => renderMitAuth(<KatalogListe />, s);
const zeigeDetail = (id: string, s: Szene = teamer) => renderMitAuth(<AngebotDetail />, { ...s, pfad: `/katalog/${id}`, route: '/katalog/:id' });
const chip = (name: string) => screen.getByRole('button', { name });

describe('Katalog: Liste', () => {
  it('zeigt die Programmpunkte nach Kategorien, mit Eckdaten, Bewertung und Favorit', async () => {
    zeigeListe();
    expect(await screen.findByRole('link', { name: 'Fangen' })).toHaveAttribute('href', '/katalog/fangen');
    expect(screen.getByRole('region', { name: 'Bewegungsspiele' })).toHaveTextContent('Bewegungsspiele (2)');
    expect(screen.getByRole('region', { name: 'Highlights' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Kreativangebote' })).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Bewegungsspiele' })).getByText('⏱ 20 Min.')).toBeInTheDocument();
    expect(screen.getByLabelText(/Bewertung 4,5 \(2\)/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Favorit: Schatzsuche' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Favorit: Fangen' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('status')).toHaveTextContent('4 von 4 Programmpunkten');
  });

  it('suchen, filtern und zurücksetzen', async () => {
    zeigeListe();
    await screen.findByRole('link', { name: 'Fangen' });
    await userEvent.type(screen.getByLabelText('Suchen'), 'wald');
    expect(screen.queryByRole('link', { name: 'Fangen' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Schatzsuche' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Waldspiele' })).toBeInTheDocument();
    await userEvent.click(chip('🏃 Bewegungsspiele'));
    expect(screen.queryByRole('link', { name: 'Schatzsuche' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('1 von 4');
    await userEvent.click(screen.getByRole('button', { name: 'Filter zurücksetzen' }));
    expect(screen.getByRole('status')).toHaveTextContent('4 von 4');
    await userEvent.click(chip('🌳 Outdoor'));
    expect(screen.getByRole('status')).toHaveTextContent('2 von 4');
    await userEvent.click(chip('9–12 Jahre'));
    expect(screen.getByRole('status')).toHaveTextContent('1 von 4');
    await userEvent.click(chip('9–12 Jahre'));                      // nochmal: Filter aus
    expect(screen.getByRole('status')).toHaveTextContent('2 von 4');
  });

  it('nur Favoriten', async () => {
    zeigeListe();
    await screen.findByRole('link', { name: 'Fangen' });
    await userEvent.click(chip('★ Favoriten'));
    expect(screen.getAllByRole('link').filter((l) => l.classList.contains('list__title')).map((l) => l.textContent)).toEqual(['Schatzsuche']);
  });

  it('ohne Treffer: Hinweis', async () => {
    zeigeListe();
    await screen.findByRole('link', { name: 'Fangen' });
    await userEvent.type(screen.getByLabelText('Suchen'), 'xyzxyz');
    expect(screen.getByText('Nichts gefunden')).toBeInTheDocument();
  });

  it('Kategorien lassen sich einklappen', async () => {
    zeigeListe();
    await screen.findByRole('link', { name: 'Fangen' });
    const kopf = screen.getByRole('button', { name: /Bewegungsspiele \(2\)/ });
    await userEvent.click(kopf);
    expect(screen.queryByRole('link', { name: 'Fangen' })).not.toBeInTheDocument();
    expect(kopf).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(kopf);
    expect(screen.getByRole('link', { name: 'Fangen' })).toBeInTheDocument();
  });

  it('Favorit umschalten', async () => {
    zeigeListe();
    await userEvent.click(await screen.findByRole('button', { name: 'Favorit: Fangen' }));
    expect(api.setzeFavorit).toHaveBeenCalledWith('fangen', 'ich', true);
    await userEvent.click(screen.getByRole('button', { name: 'Favorit: Schatzsuche' }));
    expect(api.setzeFavorit).toHaveBeenCalledWith('schatz', 'ich', false);
  });

  it('leerer Katalog: Hinweis je Rolle', async () => {
    vi.mocked(api.listeKatalog).mockResolvedValue([]);
    zeigeListe();
    expect(await screen.findByText(/Du kannst auch selbst welche vorschlagen/)).toBeInTheDocument();
  });

  it('TeamerIn: vorschlagen statt anlegen, eigene Vorschläge', async () => {
    zeigeListe();
    expect(await screen.findByRole('link', { name: 'Programmpunkt vorschlagen' })).toHaveAttribute('href', '/katalog/vorschlagen');
    expect(screen.getByRole('link', { name: 'Meine Vorschläge' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Neuer Programmpunkt' })).not.toBeInTheDocument();
    expect(api.listeVorschlaege).not.toHaveBeenCalled();
  });

  it('Koordination: anlegen, Vorschläge mit Zähler, Import', async () => {
    vi.mocked(api.listeVorschlaege).mockResolvedValue([
      { id: 'v1', status: 'offen', created_at: '2027-01-01T10:00:00Z', eingereicht_von: 'x', einreicher: 'X', daten: leeresAngebot() },
      { id: 'v2', status: 'abgelehnt', created_at: '2027-01-01T10:00:00Z', eingereicht_von: 'x', einreicher: 'X', daten: leeresAngebot() },
    ]);
    zeigeListe(koord);
    expect(await screen.findByRole('link', { name: 'Neuer Programmpunkt' })).toHaveAttribute('href', '/katalog/neu');
    expect(await screen.findByRole('link', { name: 'Vorschläge (1)' })).toHaveAttribute('href', '/katalog/vorschlaege');
    expect(screen.queryByRole('link', { name: 'Importieren' })).not.toBeInTheDocument();          // der einmalige Import des alten Katalogs ist erledigt
  });

  it('meldet Ladefehler', async () => {
    vi.mocked(api.listeKatalog).mockRejectedValue(new Error('x'));
    zeigeListe();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});

describe('Katalog: Detail', () => {
  it('zeigt alle Angaben, Bewertung und ähnliche Programmpunkte', async () => {
    zeigeDetail('schatz');
    expect(await screen.findByRole('heading', { name: 'Schatzsuche' })).toBeInTheDocument();
    // Die Druckvorlage enthält den Text ein zweites Mal (aria-hidden); hier zählt die sichtbare Angabe.
    const daten = screen.getAllByRole('definition');
    expect(daten.map((d) => d.textContent)).toEqual(expect.arrayContaining(['Die Gruppe sucht den Schatz im Wald mit der Karte', '8–12 Kinder', '9–12 Jahre', 'Lea']));
    expect(screen.getByRole('button', { name: 'Favorit entfernen' })).toHaveAttribute('aria-pressed', 'true');
    const aehnlich = screen.getByRole('list', { name: 'Ähnliche Programmpunkte' });
    expect(within(aehnlich).getByRole('link', { name: 'Waldspiele' })).toHaveAttribute('href', '/katalog/wald');
    expect(screen.queryByRole('link', { name: 'Bearbeiten' })).not.toBeInTheDocument();
  });

  it('unbekannter Programmpunkt', async () => {
    zeigeDetail('gibtsnicht');
    expect(await screen.findByText('Programmpunkt nicht gefunden')).toBeInTheDocument();
  });

  it('bewerten, ändern und wieder entfernen', async () => {
    vi.mocked(api.meineBewertungen).mockResolvedValue({ schatz: 4 });
    zeigeDetail('schatz');
    await screen.findByRole('heading', { name: 'Schatzsuche' });
    const gruppe = await screen.findByRole('group', { name: 'Bewertung' });
    expect(await within(gruppe).findByRole('button', { name: '4 Sterne' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(within(gruppe).getByRole('button', { name: '5 Sterne' }));
    expect(api.bewerte).toHaveBeenCalledWith('schatz', 'ich', 5);
    await userEvent.click(within(gruppe).getByRole('button', { name: '4 Sterne' }));
    expect(api.entferneBewertung).toHaveBeenCalledWith('schatz', 'ich');
  });

  it('zum ersten Mal bewerten', async () => {
    zeigeDetail('fangen');
    const gruppe = await screen.findByRole('group', { name: 'Bewertung' });
    await userEvent.click(within(gruppe).getByRole('button', { name: '1 Stern' }));
    expect(api.bewerte).toHaveBeenCalledWith('fangen', 'ich', 1);
    expect(screen.getByText(/Durchschnitt: 4,5 \(2\)/)).toBeInTheDocument();
  });

  it('Favorit umschalten', async () => {
    zeigeDetail('fangen');
    await userEvent.click(await screen.findByRole('button', { name: 'Als Favorit merken' }));
    expect(api.setzeFavorit).toHaveBeenCalledWith('fangen', 'ich', true);
  });

  it('Kommentare: lesen mit Namen, eigene löschen, schreiben', async () => {
    vi.mocked(api.listeAngebotKommentare).mockResolvedValue([
      { id: 'k1', person_id: 'ich', text: 'Mein Kommentar', created_at: '2027-03-01T10:00:00Z', vorname: 'Anna', nachname: 'Adler' },
      { id: 'k2', person_id: 'ben', text: 'Von Ben', created_at: '2027-03-02T10:00:00Z', vorname: 'Ben', nachname: 'Baum' },
    ]);
    zeigeDetail('fangen');
    expect(await screen.findByText('Von Ben')).toBeInTheDocument();
    expect(screen.getByText('Ben Baum')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Kommentar löschen' })).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Kommentar löschen' }));
    expect(api.loescheAngebotKommentar).toHaveBeenCalledWith('k1');
    await userEvent.type(screen.getByLabelText('Kommentar schreiben'), ' Super! ');
    await userEvent.click(screen.getByRole('button', { name: 'Kommentar senden' }));
    expect(api.kommentiereAngebot).toHaveBeenCalledWith('fangen', 'ich', ' Super! ');
  });

  it('Koordination löscht fremde Kommentare', async () => {
    vi.mocked(api.listeAngebotKommentare).mockResolvedValue([{ id: 'k2', person_id: 'ben', text: 'Von Ben', created_at: '2027-03-02T10:00:00Z', vorname: 'Ben', nachname: 'Baum' }]);
    zeigeDetail('fangen', koord);
    await userEvent.click(await screen.findByRole('button', { name: 'Kommentar löschen' }));
    expect(api.loescheAngebotKommentar).toHaveBeenCalledWith('k2');
  });

  it('Koordination: bearbeiten und löschen mit Rückfrage', async () => {
    const frage = vi.spyOn(window, 'confirm').mockReturnValue(false);
    zeigeDetail('fangen', koord);
    expect(await screen.findByRole('link', { name: 'Bearbeiten' })).toHaveAttribute('href', '/katalog/fangen/bearbeiten');
    await userEvent.click(screen.getByRole('button', { name: 'Löschen' }));
    expect(api.loescheAngebot).not.toHaveBeenCalled();
    frage.mockReturnValue(true);
    await userEvent.click(screen.getByRole('button', { name: 'Löschen' }));
    expect(api.loescheAngebot).toHaveBeenCalledWith('fangen');
    expect(await screen.findByTestId('andere-seite')).toBeInTheDocument();
  });

  it('Link kopieren und drucken', async () => {
    const schreibe = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: schreibe }, configurable: true });
    let titel = '';
    vi.spyOn(window, 'print').mockImplementation(() => { titel = document.title; });
    zeigeDetail('fangen');
    await userEvent.click(await screen.findByRole('button', { name: 'Link kopieren' }));
    expect(schreibe).toHaveBeenCalled();
    expect(await screen.findByText('Link kopiert ✓')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Drucken / als PDF speichern' }));
    expect(titel).toBe('Fangen');
  });
});

describe('Barrierefreiheit (axe)', () => {
  it('keine Verstöße gegen gängige Regeln', async () => {
    zeigeListe();
    await screen.findByRole('link', { name: 'Fangen' });
    expect(await axeVerstoesse(document.body)).toEqual([]);
  });
});
