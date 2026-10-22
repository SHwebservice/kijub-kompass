import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as fzApi from '../freizeiten/api';
import * as treffApi from '../treffs/api';
import * as heuteApi from '../heute/api';
import { leererStand } from '../test-heute';
import type { HeuteDaten } from '../heute/api';
import * as geraet from '../mitteilungen/geraet';
import { Heute } from './Heute';
import { renderMitAuth, type Szene } from '../test-utils';
import { freizeit, inTagen, treff } from '../test-daten';
import { formatKurz, formatTagMonat, wochentagLang } from '../freizeiten/logik';
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
  vi.mocked(checklisteApi.ladeCheckliste).mockResolvedValue([]);
  vi.mocked(teamprotokollApi.listeNeueTeamprotokolle).mockResolvedValue([]);
  window.localStorage.clear();
  vi.mocked(fzApi.listeFreizeiten).mockResolvedValue([laeuft, bald, fern]);
  vi.mocked(fzApi.meineBewerbungen).mockResolvedValue([]);
  vi.mocked(fzApi.holeVorlaufTage).mockResolvedValue(7);
  vi.mocked(treffApi.listeTreffs).mockResolvedValue([{ ...treff({ id: 't1', name: 'Kindertreff' }), oeffnungszeiten: [] }]);
  vi.mocked(treffApi.listeMeineDienste).mockResolvedValue([]);
  stand = { ...leererStand(), orte: { o1: 'Mörscher Au', o2: 'Strandbad' }, treffNamen: { t1: 'Kindertreff' } };
  vi.mocked(heuteApi.ladeHeute).mockImplementation(async () => ({ ...stand }));
  vi.mocked(heuteApi.quittiereBesuch).mockResolvedValue(undefined);
  vi.mocked(geraet.pruefeStatus).mockResolvedValue('an');
  vi.mocked(geraet.istApple).mockReturnValue(false);
});

const zeige = (s: Szene) => renderMitAuth(<Heute />, s);

describe('Heute: Checkliste der Vorbereitung (0029)', () => {
  const punkt = (freizeit_id: string, faellig: string, o: Record<string, unknown> = {}) => ({
    freizeit_id, art: 'vorlage' as const, id: `${freizeit_id}-${faellig}`, titel: 'x', beschreibung: '', faellig, ziel: null, automatik: null,
    auto_erfuellt: false, status: 'offen' as const, notiz: '', geaendert_von: null, geaendert_am: null, ...o,
  });

  it('Leitung: Karte mit überfälligen Punkten der eigenen Freizeit, Link zur Checkliste', async () => {
    vi.mocked(checklisteApi.ladeCheckliste).mockResolvedValue([punkt('f1', inTagen(-1)), punkt('f1', inTagen(2)), punkt('f1', inTagen(30))]);
    zeige(leitung);
    const karte = await screen.findByRole('link', { name: /Vorbereitung: 1 Punkt ist überfällig/ });
    expect(karte).toHaveAttribute('href', '/freizeiten/f1/vorbereitung');
    expect(karte.closest('li')).toHaveTextContent('Sommer-Sause · 1 Punkt in den nächsten 7 Tagen');
    expect(checklisteApi.ladeCheckliste).toHaveBeenLastCalledWith(['f1']);
  });

  it('TeamerIn: keine Abfrage der Checkliste', async () => {
    zeige(teamer);
    await screen.findByRole('list', { name: 'Heute' });
    expect(checklisteApi.ladeCheckliste).not.toHaveBeenCalledWith(['f1']);
    expect(screen.queryByText(/Vorbereitung:/)).not.toBeInTheDocument();
  });

  it('Freizeitenkoordination: kein Stand fremder Freizeiten auf der Startseite (der steht in der Saison unter „Freizeiten“)', async () => {
    zeige(koord);
    await screen.findByRole('list', { name: 'Überblick der Koordination' });
    await waitFor(() => expect(heuteApi.ladeHeute).toHaveBeenCalled());
    expect(checklisteApi.ladeCheckliste).not.toHaveBeenCalledWith(expect.arrayContaining(['f2']));
    expect(screen.queryByText(/Vorbereitung \d|Vorbereitung:/)).not.toBeInTheDocument();
  });
});

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

  it('in einer laufenden Freizeit: „Heute“ mit Tagesprogramm, unter „Als Nächstes“ keine weitere, nichts zum Bewerben für die eigene', async () => {
    stand.plan = [
      { id: '1', freizeit_id: 'f1', titel: 'Schwimmen', slot: 'Nachmittag', position: 2 }, { id: '2', freizeit_id: 'f1', titel: 'Fangen', slot: 'Vormittag', position: 1 },
    ];
    zeige(teamer);
    const heute = await screen.findByRole('list', { name: 'Heute' });
    expect(within(heute).getByRole('link', { name: 'Sommer-Sause läuft' })).toHaveAttribute('href', '/freizeiten/f1/plan');
    const plan = await within(heute).findByRole('list', { name: 'Tagesprogramm Sommer-Sause läuft' });
    expect(within(plan).getAllByRole('listitem').map((l) => l.textContent)).toEqual(['Vormittag: Fangen', 'Nachmittag: Schwimmen']);
    expect(heuteApi.ladeHeute).toHaveBeenCalledWith(expect.objectContaining({ planFreizeiten: ['f1'], heute: inTagen(0) }));
    expect(await screen.findByText('Keine kommende Freizeit.')).toBeInTheDocument();
    expect(screen.queryByText('Willkommen im KiJuB-Kompass')).not.toBeInTheDocument();
  });

  it('ohne Programm für heute: Hinweis mit Link zum Wochenplan', async () => {
    zeige(teamer);
    expect(await screen.findByText('Für heute steht noch nichts im Wochenplan.')).toBeInTheDocument();
    const laufend = screen.getByRole('list', { name: 'Heute' });
    expect(within(laufend).getByRole('link', { name: 'Sommer-Sause läuft' })).toHaveAttribute('href', '/freizeiten/f1/plan');
  });

  it('„Zu erledigen“: unbestätigte Hinweise je Freizeit; Erledigtes und Fremdes fehlen', async () => {
    stand.notizen = [
      notiz({ id: '1' }), notiz({ id: '2' }), notiz({ id: '3', bestaetigt_von: ['ich'] }), notiz({ id: '4', art: 'absprache' }),
    ];
    zeige(teamer);
    const liste = await screen.findByRole('list', { name: 'Zu erledigen' });
    expect(within(liste).getByRole('link', { name: '2 Hinweise zum Bestätigen' })).toHaveAttribute('href', '/freizeiten/f1/hinweise');
    expect(within(liste).getByText('Sommer-Sause')).toBeInTheDocument();
    expect(within(liste).queryByText(/Absprache/)).not.toBeInTheDocument();     // TeamerInnen bestätigen keine Absprachen
    expect(heuteApi.ladeHeute).toHaveBeenCalledWith(expect.objectContaining({ notizFreizeiten: ['f1'], notizTreffs: [] }));
  });

  it('nichts offen: die Karte fehlt ganz', async () => {
    zeige(teamer);
    await screen.findByRole('list', { name: 'Heute' });
    expect(screen.queryByText('Zu erledigen')).not.toBeInTheDocument();
  });

  it('meldet Ladefehler der Freizeiten', async () => {
    vi.mocked(fzApi.listeFreizeiten).mockRejectedValue(new Error('x'));
    zeige(teamer);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});

describe('Heute: Als Nächstes und Willkommen', () => {
  it('zeigt die nächste eigene, kommende, nicht abgesagte Freizeit – laufende stehen unter „Heute“', async () => {
    vi.mocked(fzApi.listeFreizeiten).mockResolvedValue([
      freizeit({ id: 'spaeter', name: 'Meine Spätere', start_datum: inTagen(40), ende_datum: inTagen(44) }),
      freizeit({ id: 'mein', name: 'Meine Kommende' }),
      freizeit({ id: 'lauf', name: 'Meine Laufende', start_datum: inTagen(-1), ende_datum: inTagen(3) }),
      freizeit({ id: 'alt', name: 'Meine Alte', start_datum: inTagen(-30), ende_datum: inTagen(-26) }),
      freizeit({ id: 'ab', name: 'Meine Abgesagte', status: 'abgesagt', start_datum: inTagen(2), ende_datum: inTagen(5) }),
      freizeit({ id: 'fremd', name: 'Nicht meine', start_datum: inTagen(2), ende_datum: inTagen(5) }),
    ]);
    zeige({ freizeiten: ['spaeter', 'mein', 'lauf', 'alt', 'ab'].map((id) => ({ freizeit_id: id, rolle: 'teamer' as const })) });
    const naechste = await screen.findByRole('region', { name: 'Nächste Freizeit' });
    const link = within(naechste).getByRole('link', { name: /Meine Kommende/ });
    expect(link).toHaveAttribute('href', '/freizeiten/mein');
    expect(link).toHaveTextContent(`in 30 Tagen · ${wochentagLang(inTagen(30))}`);
    for (const n of ['Meine Spätere', 'Meine Laufende', 'Meine Alte', 'Meine Abgesagte', 'Nicht meine']) expect(within(naechste).queryByText(n)).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Meine Freizeiten' })).not.toBeInTheDocument();
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

  it('Dienste von heute stehen im Feed; unter „Als Nächstes“ der nächste groß mit „Morgen“, die folgenden kompakt', async () => {
    vi.mocked(treffApi.listeMeineDienste).mockResolvedValue([
      dienst('d1', inTagen(0)), dienst('d2', inTagen(1)), dienst('d3', inTagen(3), { ist_sonder: true, bezeichnung: 'Sommerfest', von: '14:30' }),
      dienst('d4', inTagen(5)), dienst('d5', inTagen(8)),
    ]);
    zeige(tzk);
    const heute = await screen.findByRole('list', { name: 'Heute' });
    expect(within(heute).getByRole('link')).toHaveTextContent('Dienst heute · 15:00–19:00 Uhr');
    const bereich = await screen.findByRole('region', { name: 'Meine nächsten Dienste' });
    const naechster = within(bereich).getAllByRole('link')[0]!;
    expect(naechster).toHaveTextContent(`Morgen · ${wochentagLang(inTagen(1))}, ${formatTagMonat(inTagen(1))}`);
    expect(naechster).toHaveTextContent('15–19 Uhr');
    expect(naechster).toHaveTextContent('Kindertreff');
    expect(naechster).toHaveAttribute('href', `/treffs/t1/dienstplan?datum=${inTagen(1)}`);
    const weitere = within(bereich).getAllByRole('listitem');
    expect(weitere).toHaveLength(2);                                  // insgesamt höchstens drei
    expect(weitere[0]).toHaveTextContent(formatKurz(inTagen(3)));
    expect(weitere[0]).toHaveTextContent('in 3 Tagen');
    expect(weitere[0]).toHaveTextContent('14:30–19 Uhr');
    expect(weitere[0]).toHaveTextContent('Sonderdienst: Sommerfest');
    expect(weitere[1]).toHaveTextContent('in 5 Tagen');
    expect(screen.getByRole('heading', { name: 'Danach' })).toBeInTheDocument();
    expect(treffApi.listeMeineDienste).toHaveBeenCalledWith('ich', inTagen(0), inTagen(14));
  });

  it('nur ein kommender Dienst: groß, ohne „Danach“', async () => {
    vi.mocked(treffApi.listeMeineDienste).mockResolvedValue([dienst('d2', inTagen(2))]);
    zeige(tzk);
    const bereich = await screen.findByRole('region', { name: 'Meine nächsten Dienste' });
    expect(within(bereich).getAllByRole('link')[0]).toHaveTextContent('Übermorgen');
    expect(screen.queryByRole('heading', { name: 'Danach' })).not.toBeInTheDocument();
  });

  it('nur heute ein Dienst: „Nach heute sind keine Dienste eingeteilt“', async () => {
    vi.mocked(treffApi.listeMeineDienste).mockResolvedValue([dienst('d1', inTagen(0))]);
    zeige(tzk);
    expect(await screen.findByText('Nach heute sind keine Dienste eingeteilt.')).toBeInTheDocument();
  });

  it('ohne Dienste: Hinweis', async () => {
    zeige(tzk);
    expect(await screen.findByText('Keine Dienste in den nächsten 14 Tagen.')).toBeInTheDocument();
  });

  it('offene Treff-Absprachen warten auf die Bestätigung', async () => {
    stand.notizen = [notiz({ id: 'a', art: 'absprache', freizeit_id: null, treff_id: 't1', quelle: 'Kindertreff' })];
    zeige(tzk);
    const liste = await screen.findByRole('list', { name: 'Zu erledigen' });
    expect(within(liste).getByRole('link', { name: '1 Absprache zum Bestätigen' })).toHaveAttribute('href', '/treffs/t1/notizen?art=absprache');
    expect(heuteApi.ladeHeute).toHaveBeenCalledWith(expect.objectContaining({ notizFreizeiten: [], notizTreffs: ['t1'] }));
  });

  it('Treffleitung sieht offene Dienstwünsche; BetreuerIn nicht', async () => {
    stand.wuensche = [{ person_id: 'b', datum: inTagen(2), treff_id: 't1' }, { person_id: 'c', datum: inTagen(5), treff_id: 't1' }];
    const { unmount } = zeige(treffleitung);
    const liste = await screen.findByRole('list', { name: 'Zu erledigen' });
    expect(within(liste).getByRole('link', { name: 'Dienstwünsche warten' })).toHaveAttribute('href', '/treffs/t1/dienstplan');
    expect(within(liste).getByText(new RegExp(`2 Wünsche warten auf Antwort, der nächste für ${formatKurz(inTagen(2))}`))).toBeInTheDocument();
    expect(heuteApi.ladeHeute).toHaveBeenCalledWith(expect.objectContaining({ wuensche: ['t1'] }));
    unmount();
    vi.mocked(heuteApi.ladeHeute).mockClear();
    zeige(tzk);
    await screen.findByRole('region', { name: 'Meine nächsten Dienste' });
    await waitFor(() => expect(heuteApi.ladeHeute).toHaveBeenCalled());
    expect(screen.queryByText('Dienstwünsche warten')).not.toBeInTheDocument();
    expect(heuteApi.ladeHeute).toHaveBeenCalledWith(expect.not.objectContaining({ wuensche: expect.anything() }));          // Wünsche werden gar nicht erst angefragt
  });
});

describe('Heute: Leitung', () => {
  it('knappe Lebensmittel am Ort der Freizeit, mit Link zum Lebensmittel-Reiter; andere Orte fehlen', async () => {
    stand.bestand = [
      { ort_id: 'o1', name: 'Milch', einheit: 'l', rest: 3.5, status: 'knapp' }, { ort_id: 'o1', name: 'Reis', einheit: 'kg', rest: 0, status: 'leer' },
      { ort_id: 'o9', name: 'Salz', einheit: null, rest: 0, status: 'leer' },
    ];
    zeige(leitung);
    const liste = await screen.findByRole('list', { name: 'Zu erledigen' });
    expect(within(liste).getByRole('link', { name: 'Lebensmittel werden knapp' })).toHaveAttribute('href', '/freizeiten/f1/lebensmittel');
    expect(within(liste).getByText(/^Mörscher Au:/)).toBeInTheDocument();
    expect(within(liste).getByText(/Reis \(leer\)/)).toBeInTheDocument();
    expect(within(liste).getByText(/Milch \(3,5 l\)/)).toBeInTheDocument();
    expect(within(liste).queryByText(/Salz/)).not.toBeInTheDocument();
  });

  it('Hinweise, die noch nicht alle TeamerInnen gesehen haben', async () => {
    stand.notizen = [notiz({ id: '1', bestaetigt_von: ['t1'] }), notiz({ id: '2', bestaetigt_von: ['t1', 't2'] })];
    stand.team = [
      { freizeit_id: 'f1', person_id: 'lea', rolle: 'leitung' }, { freizeit_id: 'f1', person_id: 't1', rolle: 'teamer' }, { freizeit_id: 'f1', person_id: 't2', rolle: 'teamer' },
    ];
    zeige(leitung);
    const liste = await screen.findByRole('list', { name: 'Zu erledigen' });
    expect(within(liste).getByRole('link', { name: 'Hinweise noch nicht von allen gesehen' })).toHaveAttribute('href', '/freizeiten/f1/hinweise');
    expect(within(liste).getByText('Sommer-Sause: 1 Hinweis mit offenen Bestätigungen im Team')).toBeInTheDocument();
  });

  it('die Leitung sieht nur die Hinweise und Lebensmittel ihrer eigenen Freizeiten, TeamerInnen gar nichts davon', async () => {
    zeige(teamer);
    await screen.findByRole('list', { name: 'Heute' });
    expect(heuteApi.ladeHeute).toHaveBeenCalledWith(expect.objectContaining({ bestand: false }));          // Bestände werden gar nicht erst angefragt
    expect(screen.queryByText('Für die Leitung')).not.toBeInTheDocument();
  });

  it('nichts knapp und nichts offen: die Karte fehlt', async () => {
    zeige(leitung);
    await screen.findByRole('list', { name: 'Heute' });
    expect(screen.queryByText('Für die Leitung')).not.toBeInTheDocument();
  });
});

describe('Heute: Koordination', () => {
  it('offene Bewerbungen und Vorschläge mit Zahlen und Links', async () => {
    stand.bewerbungen = 2;
    stand.vorschlaege = 1;
    zeige(koord);
    const raster = await screen.findByRole('list', { name: 'Überblick der Koordination' });
    expect(await within(raster).findByRole('link', { name: /Bewerbungen\s*2\s*warten auf Entscheidung/ })).toHaveAttribute('href', '/bewerbungen');
    expect(within(raster).getByRole('link', { name: /Katalog-Vorschläge\s*1\s*warten auf Prüfung/ })).toHaveAttribute('href', '/katalog/vorschlaege');
  });

  it('nichts offen: Nullen mit ruhiger Beschriftung statt Warnung', async () => {
    zeige(koord);
    const raster = await screen.findByRole('list', { name: 'Überblick der Koordination' });
    const bewerbungen = await within(raster).findByRole('link', { name: /Bewerbungen\s*0\s*keine offen/ });
    expect(bewerbungen.closest('li')).toHaveClass('bento__kachel--ruhig');
    expect(within(raster).getByRole('link', { name: /Katalog-Vorschläge\s*0\s*keine offen/ })).toBeInTheDocument();
  });

  it('der Saison-Überblick steht nicht mehr auf der Startseite (sondern unter „Freizeiten“)', async () => {
    zeige(koord);
    await screen.findByRole('list', { name: 'Überblick der Koordination' });
    expect(screen.queryByRole('heading', { name: 'Saison-Überblick' })).not.toBeInTheDocument();
  });

  it('die Koordination sieht laufende Freizeiten aller, keine „Freizeiten zum Bewerben“; knappe Lebensmittel zählt der Überblick', async () => {
    stand.bestand = [{ ort_id: 'o2', name: 'Brot', einheit: null, rest: 0, status: 'leer' }];
    zeige(koord);
    const laufend = await screen.findByRole('list', { name: 'Heute' });
    expect(within(laufend).getByRole('link', { name: 'Sommer-Sause läuft' })).toBeInTheDocument();
    expect(await within(screen.getByRole('list', { name: 'Überblick der Koordination' })).findByRole('link', { name: /Lebensmittels*1s*knapp oder leer/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Lebensmittel werden knapp' })).not.toBeInTheDocument();
    expect(screen.queryByText('Freizeiten zum Bewerben')).not.toBeInTheDocument();
    expect(heuteApi.ladeHeute).toHaveBeenCalledWith(expect.objectContaining({ wuensche: 'alle' }));                  // alle Treffs
  });

  it('Fehler bei den Zahlen werden angezeigt', async () => {
    vi.mocked(heuteApi.ladeHeute).mockRejectedValue(new Error('x'));
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
    await screen.findByRole('list', { name: 'Heute' });
    expect(screen.queryByRole('link', { name: 'Mitteilungen einschalten' })).not.toBeInTheDocument();     // gemerkt
  });

  it('fehlt, wenn die Mitteilungen schon an, blockiert oder nicht eingerichtet sind', async () => {
    for (const status of ['an', 'verweigert', 'nicht_eingerichtet'] as const) {
      vi.mocked(geraet.pruefeStatus).mockResolvedValue(status);
      const { unmount } = zeige(teamer);
      await screen.findByRole('list', { name: 'Heute' });
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
    await screen.findByRole('list', { name: 'Heute' });
    expect(screen.queryByText(/Home-Bildschirm/)).not.toBeInTheDocument();
    unmount();
    vi.mocked(geraet.pruefeStatus).mockRejectedValue(new Error('x'));
    zeige(teamer);
    await screen.findByRole('list', { name: 'Heute' });
    expect(screen.queryByRole('link', { name: 'Mitteilungen einschalten' })).not.toBeInTheDocument();
  });
});

describe('Heute: alles in einem Aufruf', () => {
  it('nach dem Laden von Freizeiten und Treffs genau EIN Aufruf für alles Übrige', async () => {
    zeige(teamer);
    await screen.findByRole('list', { name: 'Heute' });
    expect(heuteApi.ladeHeute).toHaveBeenCalledTimes(1);
    expect(heuteApi.ladeHeute).toHaveBeenCalledWith(expect.objectContaining({
      heute: inTagen(0), notizFreizeiten: ['f1'], teamFreizeiten: [], planFreizeiten: ['f1'], kachelTreffs: [], besuch: true,
      bestand: false, bewerbungen: false, vorschlaege: false, nachweise: false, fehler: false,
    }));
  });

  it('die Leitung fragt Bestände und Team an, die Koordination zusätzlich Bewerbungen, Vorschläge und Fehler', async () => {
    zeige(leitung);
    await screen.findByRole('list', { name: 'Heute' });
    expect(heuteApi.ladeHeute).toHaveBeenLastCalledWith(expect.objectContaining({ bestand: true, teamFreizeiten: ['f1'], bewerbungen: false, fehler: false }));
  });

  it('die Koordination fragt nach Bewerbungen, Vorschlägen und Fehlern', async () => {
    zeige(koord);
    await screen.findByRole('list', { name: 'Heute' });
    expect(heuteApi.ladeHeute).toHaveBeenLastCalledWith(expect.objectContaining({ bewerbungen: true, vorschlaege: true, fehler: true, nachweise: true, wuensche: 'alle' }));
  });

  it('ein Fehler des Aufrufs erscheint als Meldung', async () => {
    vi.mocked(heuteApi.ladeHeute).mockRejectedValue(new Error('kaputt'));
    zeige(teamer);
    expect((await screen.findAllByRole('alert')).length).toBeGreaterThan(0);
  });
});

describe('Heute: Neu seit deinem letzten Besuch', () => {
  it('zeigt, was andere seitdem angelegt haben, und „Alles gesehen“ quittiert und lädt neu', async () => {
    stand.seit = new Date(Date.now() - 3 * 3600000).toISOString();
    stand.neu = [{ zeit: new Date(Date.now() - 600000).toISOString(), art: 'hinweis', text: 'Sonnencreme', quelle: 'Sommer-Sause', url: '/freizeiten/f1/hinweise' }];
    stand.neuGesamt = 1;
    const u = userEvent.setup();
    zeige(teamer);
    const liste = await screen.findByRole('list', { name: 'Neu seit deinem letzten Besuch' });
    expect(within(liste).getByRole('link')).toHaveAttribute('href', '/freizeiten/f1/hinweise');
    const aufrufe = vi.mocked(heuteApi.ladeHeute).mock.calls.length;
    stand.neu = []; stand.neuGesamt = 0;
    await u.click(screen.getByRole('button', { name: 'Alles gesehen' }));
    expect(heuteApi.quittiereBesuch).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(vi.mocked(heuteApi.ladeHeute).mock.calls.length).toBeGreaterThan(aufrufe));
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Neu seit deinem letzten Besuch' })).not.toBeInTheDocument());
  });

  it('ohne Neuigkeiten oder beim ersten Besuch keine Karte', async () => {
    zeige(teamer);
    await screen.findByRole('list', { name: 'Heute' });
    expect(screen.queryByText('Neu seit deinem letzten Besuch')).not.toBeInTheDocument();
  });
});

describe('Heute: Fehlermeldungen der App (Koordination)', () => {
  it('Überblick „Fehlermeldungen“ mit der Zahl offener Fehler – nur für die Koordination', async () => {
    stand.fehler = 3;
    const { unmount } = zeige(koord);
    expect(await within(await screen.findByRole('list', { name: 'Überblick der Koordination' })).findByRole('link', { name: /Fehlermeldungens*3s*in der App aufgetreten/ })).toHaveAttribute('href', '/fehler');
    unmount();
    zeige(teamer);
    await screen.findByRole('list', { name: 'Heute' });
    expect(screen.queryByRole('link', { name: /Fehlermeldungen/ })).not.toBeInTheDocument();
  });
});
