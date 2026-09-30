import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import * as geraet from '../mitteilungen/geraet';
import { Mehr } from './Mehr';
import { baueMenue, initialen } from './mehr/menue';
import { renderMitAuth, type Szene } from '../test-utils';
import { berechneRollen, type Ich } from '../lib/rollen';

vi.mock('../mitteilungen/geraet');

const BEIDE = { ist_koordination: true, ist_freizeitkoordination: true, ist_treffkoordination: true };
const rollenVon = (ich: Partial<Ich>, treffs: { treff_id: string; rolle: 'betreuerin' | 'treffleitung' }[] = []) =>
  berechneRollen({ id: 'i', vorname: 'A', nachname: 'B', mail: 'a@b.de', kategorie: 'TeamerIn', ist_koordination: false, ist_freizeitkoordination: false, ist_treffkoordination: false, ...ich }, [], treffs);

describe('Menü unter „Mehr“: Inhalt je Rolle', () => {
  const ids = (g: ReturnType<typeof baueMenue>) => g.map((x) => x.id);
  const pfade = (g: ReturnType<typeof baueMenue>) => g.flatMap((x) => x.eintraege.map((y) => y.pfad));

  it('TeamerIn: Wissen & Material, mit Vorschlagen, ohne Treffmappe und ohne Verwaltung', () => {
    const g = baueMenue(rollenVon({}));
    expect(ids(g)).toEqual(['wissen']);
    expect(pfade(g)).toEqual(['/teamermappe', '/formulare', '/quiz', '/katalog/vorschlagen']);
  });
  it('TZK im Treff bekommt zusätzlich die Treffmappe', () => {
    expect(pfade(baueMenue(rollenVon({ kategorie: 'TZK' }, [{ treff_id: 't', rolle: 'betreuerin' }])))).toContain('/treffmappe');
  });
  it('Koordination (beide Bereiche): Verwaltung in vier Gruppen, ohne „Programmpunkt vorschlagen“', () => {
    const g = baueMenue(rollenVon({ ...BEIDE, kategorie: 'Hauptamtliche*r' }));
    expect(ids(g)).toEqual(['wissen', 'personen', 'planung', 'inhalte', 'kommunikation']);
    expect(pfade(g)).toEqual(expect.arrayContaining(['/bewerbungen', '/personen', '/freizeiten/neu', '/treffs/neu', '/orte', '/katalog/vorschlaege', '/katalog/import', '/quiz/verwalten', '/mitteilungen', '/import']));
    expect(pfade(g)).not.toContain('/katalog/vorschlagen');
    expect(pfade(g)).toContain('/treffmappe');
  });
  it('Freizeitenkoordination: Bewerbungen, Neue Freizeit und KiJuKo – aber nicht „Neuer Treff“', () => {
    const p = pfade(baueMenue(rollenVon({ ist_koordination: true, ist_freizeitkoordination: true, kategorie: 'Hauptamtliche*r' })));
    expect(p).toEqual(expect.arrayContaining(['/bewerbungen', '/freizeiten/neu', '/import', '/personen', '/orte', '/mitteilungen', '/katalog/import', '/quiz/verwalten']));
    expect(p).not.toContain('/treffs/neu');
    expect(p).not.toContain('/treffmappe');
  });
  it('Treffkoordination: Neuer Treff und Treffmappe – aber keine Bewerbungen, Neue Freizeit, KiJuKo', () => {
    const p = pfade(baueMenue(rollenVon({ ist_koordination: true, ist_treffkoordination: true, kategorie: 'Hauptamtliche*r' })));
    expect(p).toEqual(expect.arrayContaining(['/treffs/neu', '/treffmappe', '/personen', '/orte', '/mitteilungen', '/katalog/import', '/quiz/verwalten']));
    for (const weg of ['/bewerbungen', '/freizeiten/neu', '/import']) expect(p).not.toContain(weg);
  });
  it('kein Eintrag doppelt, jeder mit Text', () => {
    const g = baueMenue(rollenVon({ ...BEIDE, kategorie: 'Hauptamtliche*r' }));
    const alle = g.flatMap((x) => x.eintraege);
    expect(new Set(alle.map((x) => x.pfad)).size).toBe(alle.length);
    expect(alle.every((x) => x.label && x.text && x.icon)).toBe(true);
  });
  it('ohne Rollen (noch nicht geladen): nur die Grundausstattung', () => {
    expect(ids(baueMenue(null))).toEqual(['wissen']);
  });
  it('Initialen', () => {
    expect(initialen('anna', 'adler')).toBe('AA');
    expect(initialen('Anna')).toBe('A');
    expect(initialen()).toBe('?');
  });
});

describe('Seite „Mehr“', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(geraet.pruefeStatus).mockResolvedValue('aus');
    vi.mocked(geraet.istApple).mockReturnValue(false);
  });
  const zeige = (s: Szene) => renderMitAuth(<Mehr />, s);

  it('Profil mit Name, Mail, Kategorie und Rollen', async () => {
    zeige({ ich: { vorname: 'Lea', nachname: 'Leitner', mail: 'lea@kijub.example', kategorie: 'Hauptamtliche*r' }, treffs: [{ treff_id: 't1', rolle: 'treffleitung' }] });
    expect(await screen.findByText('Lea Leitner')).toBeInTheDocument();
    expect(screen.getByText('lea@kijub.example')).toBeInTheDocument();
    expect(screen.getByText('LL')).toBeInTheDocument();
    expect(screen.getByText('Hauptamtliche*r')).toBeInTheDocument();
    expect(screen.getByText('Treffleitung')).toBeInTheDocument();
  });

  it('Gruppen mit Namen und Kurzbeschreibung; die Links führen an die richtigen Orte', async () => {
    zeige({ ich: { ist_koordination: true, kategorie: 'Hauptamtliche*r' } });      // alter Schreibweise: beide Bereiche
    const personen = (await screen.findByRole('heading', { name: 'Personen' })).closest('section')!;
    const link = within(personen).getByRole('link', { name: /Personen & Zugänge/ });
    expect(link).toHaveAttribute('href', '/personen');
    expect(link).toHaveTextContent('Personen anlegen, Zugänge und Zuordnungen verwalten');
    expect(screen.getByRole('heading', { name: 'Planung' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Inhalte' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Mitteilungen & Daten' })).toBeInTheDocument();
  });

  it('TeamerIn sieht keine Verwaltung', async () => {
    zeige({ ich: { kategorie: 'TeamerIn' } });
    await screen.findByRole('heading', { name: 'Wissen & Material' });
    expect(screen.queryByRole('heading', { name: 'Personen' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Personen & Zugänge/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Programmpunkt vorschlagen/ })).toBeInTheDocument();
  });

  it('Mein Konto: Mitteilungen, Passwort ändern (eingeklappt), Abmelden, Impressum und Datenschutz', async () => {
    zeige({ ich: { kategorie: 'TeamerIn' } });
    const konto = (await screen.findByRole('heading', { name: 'Mein Konto' })).closest('section')!;
    expect(within(konto).getByRole('button', { name: 'Abmelden' })).toBeInTheDocument();
    expect(konto.querySelector('details')).not.toHaveAttribute('open');
    expect(konto.querySelector('summary')).toHaveTextContent('Passwort ändern');
    expect(screen.getByRole('link', { name: 'Impressum' })).toHaveAttribute('href', '/impressum');
    expect(screen.getByRole('link', { name: 'Datenschutz' })).toHaveAttribute('href', '/datenschutz');
  });
});
