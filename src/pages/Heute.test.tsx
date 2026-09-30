import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as fzApi from '../freizeiten/api';
import * as treffApi from '../treffs/api';
import * as heuteApi from '../heute/api';
import * as katalogApi from '../katalog/api';
import * as geraet from '../mitteilungen/geraet';
import { Heute } from './Heute';
import { renderMitAuth, type Szene } from '../test-utils';
import { freizeit, inTagen, treff } from '../test-daten';
import { formatKurz } from '../freizeiten/logik';
import type { OffeneNotiz } from '../heute/logik';

vi.mock('../freizeiten/api');
vi.mock('../treffs/api');
vi.mock('../heute/api');
vi.mock('../katalog/api');
vi.mock('../mitteilungen/geraet');

const laeuft = freizeit({ id: 'f1', name: 'Sommer-Sause', start_datum: inTagen(-1), ende_datum: inTagen(3), ort_id: 'o1', ort_name: 'Mörscher Au', ferienzeitraum: 'sommer', ferienwoche: 1 });
const bald = freizeit({ id: 'f2', name: 'Sommer-Sause 2', start_datum: inTagen(6), ende_datum: inTagen(10), ort_id: 'o2', ferienzeitraum: 'sommer', ferienwoche: 2 });
const fern = freizeit({ id: 'f3', name: 'Herbstfahrt', start_datum: inTagen(60), ende_datum: inTagen(64), ferienzeitraum: 'herbst', ferienwoche: 1 });

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
  vi.mocked(fzApi.listeFreizeiten).mockResolvedValue([laeuft, bald, fern]);
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
  vi.mocked(heuteApi.listeOrtNamen).mockResolvedValue({ o1: 'Mörscher Au', o2: 'Strandbad' });
  vi.mocked(heuteApi.listeTreffNamen).mockResolvedValue({ t1: 'Kindertreff' });
  vi.mocked(katalogApi.listeVorschlaege).mockResolvedValue([]);
  vi.mocked(geraet.pruefeStatus).mockResolvedValue('an');
  vi.mocked(geraet.istApple).mockReturnValue(false);
});

const zeige = (s: Szene) => renderMitAuth(<Heute />, s);

describe('Heute: TeamerIn', () => {
  it('ohne Zuordnung: Willkommen und Freizeiten zum Bewerben (nur bewerbbare, nicht die laufende)', async () => {
    zeige({ ich: { kategorie: 'TeamerIn' } });
    expect(await screen.findByText('Willkommen im KiJuB-Kompass')).toBeInTheDocument();
    const liste = await screen.findByRole('list', { name: 'Freizeiten zum Bewerben' });
    // Die laufende Freizeit und die in 6 Tagen beginnende (Vorlauf 7 Tage) sind nicht mehr bewerbbar
    expect(within(liste).getAllByRole('listitem').map((l) => l.textContent)).toEqual([expect.stringContaining('Herbstfahrt')]);
    expect(screen.queryByText('Für die Koordination')).not.toBeInTheDocument();
    expect(screen.queryByText('Für die Leitung')).not.toBeInTheDocument();
  });

  it('bereits beworbene Freizeiten und der Hinweis auf offene Bewerbungen', async () => {
    vi.mocked(fzApi.meineBewerbungen).mockResolvedValue([{ freizeit_id: 'f3', status: 'offen' }]);
    vi.mocked(fzApi.listeFreizeiten).mockResolvedValue([laeuft, bald, fern, freizeit({ id: 'f4', name: 'Winterfahrt', start_datum: inTagen(90), ende_datum: inTagen(94) })]);
    zeige({ ich: { kategorie: 'TeamerIn' } });
    const liste = await screen.findByRole('list', { name: 'Freizeiten zum Bewerben' });
    expect(within(liste).queryByText('Herbstfahrt')).not.toBeInTheDocument();
    expect(within(liste).getByText('Winterfahrt')).toBeInTheDocument();
    expect(screen.getByText(/Eine Bewerbung von dir wartet/)).toBeInTheDocument();
  });

  it('in einer laufenden Freizeit: „Heute“ mit Tagesprogramm, „Meine Freizeiten“, nichts zum Bewerben für die eigene', async () => {
    vi.mocked(heuteApi.listePlanHeute).mockResolvedValue([
      { id: '1', freizeit_id: 'f1', titel: 'Schwimmen', slot: 'Nachmittag', position: 2 }, { id: '2', freizeit_id: 'f1', titel: 'Fangen', slot: 'Vormittag', position: 1 },
    ]);
    zeige(teamer);
    const heute = await screen.findByRole('list', { name: 'Laufende Freizeiten' });
    expect(within(heute).getByRole('link', { name: 'Sommer-Sause' })).toHaveAttribute('href', '/freizeiten/f1');
    const plan = await within(heute).findByRole('list', { name: 'Tagesprogramm Sommer-Sause' });
    expect(within(plan).getAllByRole('listitem').map((l) => l.textContent)).toEqual(['Vormittag: Fangen', 'Nachmittag: Schwimmen']);
    expect(heuteApi.listePlanHeute).toHaveBeenCalledWith(['f1'], inTagen(0));
    const meine = screen.getByRole('list', { name: 'Meine Freizeiten' });
    expect(within(meine).getByText('Läuft')).toBeInTheDocument();
    expect(screen.queryByText('Willkommen im KiJuB-Kompass')).not.toBeInTheDocument();
  });

  it('ohne Programm für heute: Hinweis mit Link zum Wochenplan', async () => {
    zeige(teamer);
    expect(await screen.findByText(/Für heute steht noch nichts im/)).toBeInTheDocument();
    const laufend = screen.getByRole('list', { name: 'Laufende Freizeiten' });
    expect(within(laufend).getByRole('link', { name: 'Wochenplan' })).toHaveAttribute('href', '/freizeiten/f1/plan');
  });

  it('„Das wartet auf dich“: unbestätigte Hinweise je Freizeit; Erledigtes und Fremdes fehlen', async () => {
    vi.mocked(heuteApi.listeNotizenFuerHeute).mockResolvedValue([
      notiz({ id: '1' }), notiz({ id: '2' }), notiz({ id: '3', bestaetigt_von: ['ich'] }), notiz({ id: '4', art: 'absprache' }),
    ]);
    zeige(teamer);
    const liste = await screen.findByRole('list', { name: 'Offene Hinweise und Absprachen' });
    expect(within(liste).getByRole('link', { name: 'Sommer-Sause' })).toHaveAttribute('href', '/freizeiten/f1/hinweise');
    expect(within(liste).getByText('2 Hinweise zum Bestätigen')).toBeInTheDocument();
    expect(within(liste).queryByText(/Absprache/)).not.toBeInTheDocument();     // TeamerInnen bestätigen keine Absprachen
    expect(heuteApi.listeNotizenFuerHeute).toHaveBeenCalledWith(['f1'], []);
  });

  it('nichts offen: die Karte fehlt ganz', async () => {
    zeige(teamer);
    await screen.findByRole('list', { name: 'Laufende Freizeiten' });
    expect(screen.queryByText('Das wartet auf dich')).not.toBeInTheDocument();
  });

  it('meldet Ladefehler der Freizeiten', async () => {
    vi.mocked(fzApi.listeFreizeiten).mockRejectedValue(new Error('x'));
    zeige(teamer);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});

describe('Heute: Meine Freizeiten und Willkommen', () => {
  it('zeigt nur eigene, laufende oder kommende, nicht abgesagte Freizeiten', async () => {
    vi.mocked(fzApi.listeFreizeiten).mockResolvedValue([
      freizeit({ id: 'mein', name: 'Meine Kommende' }),
      freizeit({ id: 'lauf', name: 'Meine Laufende', start_datum: inTagen(-1), ende_datum: inTagen(3) }),
      freizeit({ id: 'alt', name: 'Meine Alte', start_datum: inTagen(-30), ende_datum: inTagen(-26) }),
      freizeit({ id: 'ab', name: 'Meine Abgesagte', status: 'abgesagt' }),
      freizeit({ id: 'fremd', name: 'Nicht meine' }),
    ]);
    zeige({ freizeiten: ['mein', 'lauf', 'alt', 'ab'].map((id) => ({ freizeit_id: id, rolle: 'teamer' as const })) });
    const meine = await screen.findByRole('list', { name: 'Meine Freizeiten' });
    expect(within(meine).getByText('Meine Kommende')).toBeInTheDocument();
    expect(within(meine).getByText('Meine Laufende')).toBeInTheDocument();
    expect(within(meine).getByText('Läuft')).toBeInTheDocument();
    expect(within(meine).getByText('in 30 Tagen')).toBeInTheDocument();
    for (const n of ['Meine Alte', 'Meine Abgesagte', 'Nicht meine']) expect(within(meine).queryByText(n)).not.toBeInTheDocument();
  });

  it('ohne Zuordnung: Willkommenstext mit Hinweis auf die Bewerbung', async () => {
    zeige({});
    expect(await screen.findByText('Willkommen im KiJuB-Kompass')).toBeInTheDocument();
    expect(screen.getByText(/kannst du dich für kommende Freizeiten bewerben/)).toBeInTheDocument();
  });

  it('Hauptamtliche ohne Zuordnung bekommen keinen Bewerbungs-Hinweis und keine Bewerbungs-Karte', async () => {
    zeige({ ich: { kategorie: 'Hauptamtliche*r' } });
    expect(await screen.findByText(/Sobald du einer Freizeit oder einem Treff zugeordnet bist/)).toBeInTheDocument();
    expect(screen.queryByText('Freizeiten zum Bewerben')).not.toBeInTheDocument();
  });
});

describe('Heute: Treffs', () => {
  const dienst = (id: string, datum: string, o: object = {}) => ({ id, datum, von: '15:00', bis: '19:00', ist_sonder: false, bezeichnung: null, treff_id: 't1', treff_name: 'Kindertreff', ...o });

  it('Dienste von heute stehen oben, die späteren in „Meine nächsten Dienste“', async () => {
    vi.mocked(treffApi.listeMeineDienste).mockResolvedValue([dienst('d1', inTagen(0)), dienst('d2', inTagen(3), { ist_sonder: true, bezeichnung: 'Sommerfest' })]);
    zeige(tzk);
    const heute = await screen.findByRole('list', { name: 'Dienste heute' });
    expect(within(heute).getByRole('link')).toHaveTextContent('Dienst · 15:00–19:00 Uhr');
    const spaeter = await screen.findByRole('list', { name: 'Meine Dienste' });
    const eintraege = within(spaeter).getAllByRole('listitem');
    expect(eintraege).toHaveLength(1);
    expect(eintraege[0]).toHaveTextContent(formatKurz(inTagen(3)));
    expect(eintraege[0]).toHaveTextContent('Sonderdienst: Sommerfest');
    expect(treffApi.listeMeineDienste).toHaveBeenCalledWith('ich', inTagen(0), inTagen(14));
  });

  it('nur heute ein Dienst: „Nach heute sind keine Dienste eingeteilt“', async () => {
    vi.mocked(treffApi.listeMeineDienste).mockResolvedValue([dienst('d1', inTagen(0))]);
    zeige(tzk);
    expect(await screen.findByText('Nach heute sind keine Dienste eingeteilt.')).toBeInTheDocument();
  });

  it('ohne Dienste: Hinweis', async () => {
    zeige(tzk);
    expect(await screen.findByText('Keine Dienste eingeteilt.')).toBeInTheDocument();
  });

  it('offene Treff-Absprachen warten auf die Bestätigung', async () => {
    vi.mocked(heuteApi.listeNotizenFuerHeute).mockResolvedValue([notiz({ id: 'a', art: 'absprache', freizeit_id: null, treff_id: 't1', quelle: 'Kindertreff' })]);
    zeige(tzk);
    const liste = await screen.findByRole('list', { name: 'Offene Hinweise und Absprachen' });
    expect(within(liste).getByRole('link', { name: 'Kindertreff' })).toHaveAttribute('href', '/treffs/t1/absprachen');
    expect(heuteApi.listeNotizenFuerHeute).toHaveBeenCalledWith([], ['t1']);
  });

  it('Treffleitung sieht offene Dienstwünsche; BetreuerIn nicht', async () => {
    vi.mocked(heuteApi.listeOffeneWuensche).mockResolvedValue([{ person_id: 'b', datum: inTagen(2), treff_id: 't1' }, { person_id: 'c', datum: inTagen(5), treff_id: 't1' }]);
    const { unmount } = zeige(treffleitung);
    const liste = await screen.findByRole('list', { name: 'Offene Dienstwünsche' });
    expect(within(liste).getByRole('link', { name: 'Kindertreff' })).toHaveAttribute('href', '/treffs/t1/dienstplan');
    expect(within(liste).getByText(new RegExp(`2 Wünsche warten auf Antwort, der nächste für ${formatKurz(inTagen(2))}`))).toBeInTheDocument();
    expect(heuteApi.listeOffeneWuensche).toHaveBeenCalledWith(['t1'], inTagen(0));
    unmount();
    vi.mocked(heuteApi.listeOffeneWuensche).mockClear();
    zeige(tzk);
    await screen.findByRole('list', { name: 'Meine Treffs' });
    expect(screen.queryByText('Offene Dienstwünsche')).not.toBeInTheDocument();
    expect(heuteApi.listeOffeneWuensche).not.toHaveBeenCalled();
  });
});

describe('Heute: Leitung', () => {
  it('knappe Lebensmittel am Ort der Freizeit, mit Link zum Lebensmittel-Reiter; andere Orte fehlen', async () => {
    vi.mocked(heuteApi.listeKnappeLebensmittel).mockResolvedValue([
      { ort_id: 'o1', name: 'Milch', einheit: 'l', rest: 3.5, status: 'knapp' }, { ort_id: 'o1', name: 'Reis', einheit: 'kg', rest: 0, status: 'leer' },
      { ort_id: 'o9', name: 'Salz', einheit: null, rest: 0, status: 'leer' },
    ]);
    zeige(leitung);
    const liste = await screen.findByRole('list', { name: 'Knappe Lebensmittel' });
    expect(within(liste).getByRole('link', { name: 'Mörscher Au' })).toHaveAttribute('href', '/freizeiten/f1/lebensmittel');
    expect(within(liste).getByText('1 leer')).toBeInTheDocument();
    expect(within(liste).getByText('1 knapp')).toBeInTheDocument();
    expect(within(liste).getByText('Reis (leer)')).toBeInTheDocument();
    expect(within(liste).getByText('Milch (3,5 l)')).toBeInTheDocument();
    expect(within(liste).queryByText(/Salz/)).not.toBeInTheDocument();
  });

  it('Hinweise, die noch nicht alle TeamerInnen gesehen haben', async () => {
    vi.mocked(heuteApi.listeNotizenFuerHeute).mockResolvedValue([notiz({ id: '1', bestaetigt_von: ['t1'] }), notiz({ id: '2', bestaetigt_von: ['t1', 't2'] })]);
    vi.mocked(heuteApi.listeTeamZeilen).mockResolvedValue([
      { freizeit_id: 'f1', person_id: 'lea', rolle: 'leitung' }, { freizeit_id: 'f1', person_id: 't1', rolle: 'teamer' }, { freizeit_id: 'f1', person_id: 't2', rolle: 'teamer' },
    ]);
    zeige(leitung);
    const liste = await screen.findByRole('list', { name: 'Nicht gesehene Hinweise' });
    expect(within(liste).getByRole('link', { name: 'Sommer-Sause' })).toHaveAttribute('href', '/freizeiten/f1/hinweise');
    expect(within(liste).getByText('1 Hinweis mit offenen Bestätigungen im Team')).toBeInTheDocument();
  });

  it('die Leitung sieht nur die Hinweise und Lebensmittel ihrer eigenen Freizeiten, TeamerInnen gar nichts davon', async () => {
    zeige(teamer);
    await screen.findByRole('list', { name: 'Laufende Freizeiten' });
    expect(heuteApi.listeKnappeLebensmittel).not.toHaveBeenCalled();
    expect(screen.queryByText('Für die Leitung')).not.toBeInTheDocument();
  });

  it('nichts knapp und nichts offen: die Karte fehlt', async () => {
    zeige(leitung);
    await screen.findByRole('list', { name: 'Laufende Freizeiten' });
    expect(screen.queryByText('Für die Leitung')).not.toBeInTheDocument();
  });
});

describe('Heute: Koordination', () => {
  it('offene Bewerbungen und Vorschläge mit Zahlen und Links', async () => {
    vi.mocked(fzApi.offeneBewerbungen).mockResolvedValue([{ id: 'b1' }, { id: 'b2' }] as never);
    vi.mocked(katalogApi.listeVorschlaege).mockResolvedValue([{ status: 'offen' }, { status: 'angenommen' }] as never);
    zeige(koord);
    const liste = await screen.findByRole('list', { name: 'Offene Aufgaben der Koordination' });
    expect(await within(liste).findByText('2 Bewerbungen warten auf Entscheidung')).toBeInTheDocument();
    expect(within(liste).getByText('1 Vorschlag wartet auf Prüfung')).toBeInTheDocument();
    expect(within(liste).getByRole('link', { name: 'Bewerbungen' })).toHaveAttribute('href', '/bewerbungen');
    expect(within(liste).getByRole('link', { name: 'Katalog-Vorschläge' })).toHaveAttribute('href', '/katalog/vorschlaege');
  });

  it('nichts offen: freundliche Zeilen statt Zahlen', async () => {
    zeige(koord);
    expect(await screen.findByText('Keine offenen Bewerbungen')).toBeInTheDocument();
    expect(screen.getByText('Keine offenen Vorschläge')).toBeInTheDocument();
  });

  it('Saison-Überblick: aktuelle Freizeiten nach Ferienzeit, Warnung bei fehlender Leitung', async () => {
    vi.mocked(heuteApi.listeTeamZeilen).mockResolvedValue([{ freizeit_id: 'f1', person_id: 'lea', rolle: 'leitung' }]);
    zeige(koord);
    const sommer = await screen.findByRole('region', { name: 'Sommer' });
    expect(within(sommer).getByRole('link', { name: 'Sommer-Sause' })).toBeInTheDocument();
    expect(within(sommer).getByRole('link', { name: 'Sommer-Sause 2' })).toBeInTheDocument();
    expect(await screen.findByText(/Eine Freizeit hat noch keine Leitung: Sommer-Sause 2\./)).toBeInTheDocument();
    expect(within(sommer).getByText('Keine Leitung')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Herbstfahrt' })).not.toBeInTheDocument();           // liegt weit in der Zukunft
  });

  it('die Koordination sieht laufende Freizeiten aller, keine „Freizeiten zum Bewerben“, aber Lebensmittel', async () => {
    vi.mocked(heuteApi.listeKnappeLebensmittel).mockResolvedValue([{ ort_id: 'o2', name: 'Brot', einheit: null, rest: 0, status: 'leer' }]);
    zeige(koord);
    const laufend = await screen.findByRole('list', { name: 'Laufende Freizeiten' });
    expect(within(laufend).getByRole('link', { name: 'Sommer-Sause' })).toBeInTheDocument();
    expect(await screen.findByRole('list', { name: 'Knappe Lebensmittel' })).toBeInTheDocument();
    expect(screen.queryByText('Freizeiten zum Bewerben')).not.toBeInTheDocument();
    expect(heuteApi.listeOffeneWuensche).toHaveBeenCalledWith(null, inTagen(0));                  // alle Treffs
  });

  it('Fehler bei den Zahlen werden angezeigt', async () => {
    vi.mocked(fzApi.offeneBewerbungen).mockRejectedValue(new Error('x'));
    zeige(koord);
    expect((await screen.findAllByRole('alert')).length).toBeGreaterThan(0);
  });
});

describe('Heute: Hinweis zu Mitteilungen', () => {
  it('erscheint, wenn Mitteilungen noch aus sind, verlinkt nach „Mehr“ und lässt sich dauerhaft wegklicken', async () => {
    vi.mocked(geraet.pruefeStatus).mockResolvedValue('aus');
    const { unmount } = zeige(teamer);
    expect(await screen.findByRole('link', { name: 'Mitteilungen einschalten' })).toHaveAttribute('href', '/mehr');
    await userEvent.click(screen.getByRole('button', { name: 'Hinweis ausblenden' }));
    expect(screen.queryByRole('link', { name: 'Mitteilungen einschalten' })).not.toBeInTheDocument();
    unmount();
    zeige(teamer);
    await screen.findByRole('list', { name: 'Laufende Freizeiten' });
    expect(screen.queryByRole('link', { name: 'Mitteilungen einschalten' })).not.toBeInTheDocument();     // gemerkt
  });

  it('fehlt, wenn die Mitteilungen schon an, blockiert oder nicht eingerichtet sind', async () => {
    for (const status of ['an', 'verweigert', 'nicht_eingerichtet'] as const) {
      vi.mocked(geraet.pruefeStatus).mockResolvedValue(status);
      const { unmount } = zeige(teamer);
      await screen.findByRole('list', { name: 'Laufende Freizeiten' });
      expect(screen.queryByRole('link', { name: 'Mitteilungen einschalten' })).not.toBeInTheDocument();
      unmount();
    }
  });

  it('auf dem iPhone ohne Home-Bildschirm-App: Anleitung', async () => {
    vi.mocked(geraet.pruefeStatus).mockResolvedValue('nicht_unterstuetzt');
    vi.mocked(geraet.istApple).mockReturnValue(true);
    zeige(teamer);
    expect(await screen.findByText(/füge diese Seite zum Home-Bildschirm hinzu/)).toBeInTheDocument();
  });

  it('auf anderen Geräten ohne Unterstützung bleibt es still; ein Fehler bei der Prüfung auch', async () => {
    vi.mocked(geraet.pruefeStatus).mockResolvedValue('nicht_unterstuetzt');
    const { unmount } = zeige(teamer);
    await screen.findByRole('list', { name: 'Laufende Freizeiten' });
    expect(screen.queryByText(/Home-Bildschirm/)).not.toBeInTheDocument();
    unmount();
    vi.mocked(geraet.pruefeStatus).mockRejectedValue(new Error('x'));
    zeige(teamer);
    await screen.findByRole('list', { name: 'Laufende Freizeiten' });
    expect(screen.queryByRole('link', { name: 'Mitteilungen einschalten' })).not.toBeInTheDocument();
  });
});
