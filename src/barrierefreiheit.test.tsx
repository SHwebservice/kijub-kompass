import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as zApi from './zuordnung/api';
import * as fzApi from './freizeiten/api';
import * as treffApi from './treffs/api';
import * as heuteApi from './heute/api';
import * as tpApi from './tagesprotokoll/api';
import * as fmApi from './fehlermeldungen/api';
import * as geraet from './mitteilungen/geraet';
import { Personen } from './pages/Personen';
import { Heute } from './pages/Heute';
import { Mehr } from './pages/Mehr';
import { Bewerbungen } from './pages/Bewerbungen';
import { Fehlermeldungen } from './pages/Fehlermeldungen';
import { ProtokollTab } from './pages/treffs/ProtokollTab';
import { NotizenTab } from './pages/treffs/NotizenTab';
import { Login } from './pages/Login';
import { renderMitAuth, type Szene } from './test-utils';
import { axeVerstoesse } from './test-a11y';
import { leererStand } from './test-heute';
import { freizeit, inTagen, treff, treffMitglied } from './test-daten';
import { heuteIso } from './freizeiten/logik';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('./zuordnung/api');
vi.mock('./freizeiten/api');
vi.mock('./treffs/api');
vi.mock('./heute/api');
vi.mock('./tagesprotokoll/api');
vi.mock('./fehlermeldungen/api');
vi.mock('./mitteilungen/geraet');

const heute = heuteIso();
const koord: Szene = { ich: { ist_koordination: true, kategorie: 'Hauptamtliche*r' } };
const nord = { ...treff({ id: 't1', name: 'Treff Nord' }), oeffnungszeiten: [1, 2, 3, 4, 5, 6, 7].map((wochentag) => ({ wochentag, von: '15:00', bis: '19:00' })) };

const person = (id: string, vorname: string, nachname: string, o: Partial<zApi.PersonZeile> = {}): zApi.PersonZeile => ({
  id, vorname, nachname, mail: `${vorname.toLowerCase()}@kijub.example`, kategorie: 'TeamerIn', aktiv: true, ist_freizeitkoordination: false, ist_treffkoordination: false, auth_user_id: 'u', eingeladen_am: null, ...o,
});

beforeEach(() => {
  vi.resetAllMocks();
  window.localStorage.clear();
  vi.mocked(zApi.listePersonenVoll).mockResolvedValue([person('a', 'Anna', 'Adler', { ist_freizeitkoordination: true }), person('b', 'Ben', 'Baum', { kategorie: 'TZK' }), person('c', 'Carla', 'Cord', { aktiv: false })]);
  vi.mocked(zApi.listeFreizeitTeams).mockResolvedValue([{ freizeit_id: 'f1', person_id: 'a', rolle: 'leitung' }]);
  vi.mocked(zApi.listeTreffTeams).mockResolvedValue([{ treff_id: 't1', person_id: 'b', rolle: 'betreuerin' }]);
  vi.mocked(fzApi.listeFreizeiten).mockResolvedValue([freizeit({ id: 'f1', name: 'Sommer 1', start_datum: inTagen(5), ende_datum: inTagen(9) }), freizeit({ id: 'f2', name: 'Sommer 2', start_datum: inTagen(7), ende_datum: inTagen(11) })]);
  vi.mocked(fzApi.meineBewerbungen).mockResolvedValue([]);
  vi.mocked(fzApi.holeVorlaufTage).mockResolvedValue(7);
  vi.mocked(fzApi.holeNamen).mockResolvedValue({ ben: 'Ben Baum' });
  vi.mocked(fzApi.offeneBewerbungen).mockResolvedValue([{ id: 'b1', notiz: 'Gern', created_at: '2027-06-01T10:00:00Z', person: { vorname: 'Ida', nachname: 'Neu', mail: 'i@x.de', kategorie: 'FSJ' }, freizeit: { id: 'f1', name: 'Sommer 1', start_datum: inTagen(5), ende_datum: inTagen(9) } }] as never);
  vi.mocked(treffApi.listeTreffs).mockResolvedValue([nord]);
  vi.mocked(treffApi.listeMeineDienste).mockResolvedValue([]);
  vi.mocked(treffApi.holeTreffTeam).mockResolvedValue([treffMitglied({ person_id: 'b', vorname: 'Ben', nachname: 'Baum', kategorie: 'TZK' })]);
  vi.mocked(treffApi.listeFeiertage).mockResolvedValue([]);
  vi.mocked(heuteApi.ladeHeute).mockResolvedValue({
    ...leererStand(), bewerbungen: 2, vorschlaege: 1, fehler: 1, bestand: [{ ort_id: 'o', name: 'Milch', einheit: 'l', rest: 1, status: 'knapp' }], orte: { o: 'Au' },
    seit: new Date(Date.now() - 7200000).toISOString(), neu: [{ zeit: new Date().toISOString(), art: 'hinweis', text: 'Sonnencreme', quelle: 'Sommer 1', url: '/freizeiten/f1/hinweise' }], neuGesamt: 1,
  });
  vi.mocked(tpApi.listeProtokolle).mockResolvedValue([{ id: 'p', treff_id: 't1', datum: heute, anz_m: 3, anz_w: 2, anz_d: 0, verlauf: 'Basteln', vorkommnisse: 'Streit', erstellt_von: 'b', bearbeitet_von: 'b', updated_at: `${heute}T17:00:00Z` }]);
  vi.mocked(tpApi.listeProtokollZahlen).mockResolvedValue([{ datum: heute, anz_m: 3, anz_w: 2, anz_d: 0 }]);
  vi.mocked(tpApi.listeAufgaben).mockResolvedValue([
    { id: 'x', treff_id: 't1', art: 'todo', text: 'Flyer drucken', antwort: null, faellig_am: inTagen(-1), zustaendig: 'b', protokoll_datum: null, erledigt: false, erledigt_von: null, erledigt_am: null, erstellt_von: 'b', created_at: `${heute}T10:00:00Z` },
    { id: 'y', treff_id: 't1', art: 'frage', text: 'Schlüssel?', antwort: null, faellig_am: null, zustaendig: null, protokoll_datum: null, erledigt: false, erledigt_von: null, erledigt_am: null, erstellt_von: 'b', created_at: `${heute}T10:00:00Z` },
  ]);
  vi.mocked(fmApi.listeFehlermeldungen).mockResolvedValue([{ id: 'f', version: 'abc', seite: '/x', meldung: 'kaputt', stapel: 'at x', anzahl: 2, erstmals: '2027-03-01T10:00:00Z', zuletzt: '2027-03-02T10:00:00Z', erledigt: false }]);
  vi.mocked(geraet.pruefeStatus).mockResolvedValue('aus');
  vi.mocked(geraet.istApple).mockReturnValue(false);
});

describe('Prüfung selbst', () => {
  it('erkennt echte Verstöße (Bild ohne Text, Knopf ohne Name, Feld ohne Beschriftung, Tabelle ohne Kopf)', async () => {
    const { container } = render(<main><img src="x.png" /><button /><input type="text" /><table><tbody><tr><td>1</td></tr></tbody></table></main>);
    const v = (await axeVerstoesse(container)).map((x) => x.split(':')[0]);
    expect(v).toEqual(expect.arrayContaining(['image-alt', 'button-name', 'label']));
  });
});

describe('Barrierefreiheit (axe): keine Verstöße gegen gängige Regeln', () => {
  it('Startseite der Koordination', async () => {
    const { container } = renderMitAuth(<Heute />, koord);
    await screen.findByRole('list', { name: 'Überblick der Koordination' });
    expect(await axeVerstoesse(container)).toEqual([]);
  });

  it('Personen: Liste, Tabelle mit Zuordnungen und das Fenster einer Person', async () => {
    const u = userEvent.setup();
    const { container } = renderMitAuth(<Personen />, koord);
    await screen.findByText('Anna Adler');
    expect(await axeVerstoesse(container)).toEqual([]);
    await u.click(screen.getByRole('button', { name: 'Zuordnungen' }));
    await screen.findByRole('table');
    expect(await axeVerstoesse(container)).toEqual([]);
    await u.click(screen.getByRole('button', { name: 'Zuordnungen von Ben Baum öffnen' }));
    await screen.findByRole('dialog');
    expect(await axeVerstoesse(document.body)).toEqual([]);
  });

  it('„Mehr“ (Koordination)', async () => {
    const { container } = renderMitAuth(<Mehr />, koord);
    await screen.findByRole('heading', { name: 'Personen' });
    expect(await axeVerstoesse(container)).toEqual([]);
  });

  it('Bewerbungen und Fehlermeldungen', async () => {
    const a = renderMitAuth(<Bewerbungen />, koord);
    await screen.findByText('Ida Neu');
    expect(await axeVerstoesse(a.container)).toEqual([]);
    a.unmount();
    const b = renderMitAuth(<Fehlermeldungen />, koord);
    await screen.findByText('kaputt');
    expect(await axeVerstoesse(b.container)).toEqual([]);
  });

  it('Tagesprotokoll (Liste, Auswertung, Formular) und Notizen', async () => {
    const u = userEvent.setup();
    const a = renderMitAuth(<ProtokollTab treff={nord} rolle="treffleitung" />, { ich: { id: 'lea', kategorie: 'Hauptamtliche*r' }, treffs: [{ treff_id: 't1', rolle: 'treffleitung' }] });
    await screen.findByRole('table');
    expect(await axeVerstoesse(a.container)).toEqual([]);
    await u.click(screen.getByRole('button', { name: 'Heutiges Protokoll bearbeiten' }));
    await screen.findByRole('dialog');
    expect(await axeVerstoesse(document.body)).toEqual([]);
    a.unmount();
    const b = renderMitAuth(<NotizenTab treff={nord} />, { ich: { id: 'b', kategorie: 'TZK' }, treffs: [{ treff_id: 't1', rolle: 'betreuerin' }] });
    await screen.findByRole('list', { name: 'Offene Notizen' });
    expect(await axeVerstoesse(b.container)).toEqual([]);
  });

  it('Anmeldeseite', async () => {
    const { container } = render(<MemoryRouter><Login anmelden={async () => null} konfiguriert nachAnmeldung={() => undefined} /></MemoryRouter>);
    expect(await axeVerstoesse(container)).toEqual([]);
    expect(within(container).getByRole('button', { name: 'Anmelden' })).toBeInTheDocument();
  });
});
