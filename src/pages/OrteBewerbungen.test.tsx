import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { sendePush } from '../mitteilungen/senden';
import * as api from '../freizeiten/api';
import * as zuordnungApi from '../zuordnung/api';
import { Orte } from './Orte';
import { Bewerbungen } from './Bewerbungen';
import { renderMitAuth } from '../test-utils';

vi.mock('../freizeiten/api');
vi.mock('../zuordnung/api');
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.offeneZeitraumBewerbungen).mockResolvedValue([]);
  vi.mocked(api.listeFreizeiten).mockResolvedValue([]);
  vi.mocked(api.holeVorlaufTage).mockResolvedValue(7);
  vi.mocked(zuordnungApi.listeFreizeitTeams).mockResolvedValue([]);
});

const koord = { ich: { ist_koordination: true, kategorie: 'Hauptamtliche*r' as const } };

describe('Orte', () => {
  const orte = [
    { id: 'o1', name: 'Mörscher Au', adresse: 'Au 1', lieferstelle_nr: '5', freizeiten: 3, treffs: 0 },
    { id: 'o2', name: 'Kindertreff', adresse: null, lieferstelle_nr: null, freizeiten: 0, treffs: 1 },
    { id: 'o3', name: 'Strandbad', adresse: null, lieferstelle_nr: null, freizeiten: 0, treffs: 0 },
  ];
  beforeEach(() => {
    vi.mocked(api.listeOrte).mockResolvedValue(orte);
    vi.mocked(api.speichereOrt).mockResolvedValue(undefined);
    vi.mocked(api.loescheOrt).mockResolvedValue(undefined);
  });

  it('zeigt Nutzung je Ort; Löschen nur, wenn der Ort unbenutzt ist', async () => {
    renderMitAuth(<Orte />, koord);
    const zeile = async (n: string) => (await screen.findByText(n)).closest('li')!;
    expect(within(await zeile('Mörscher Au')).getByText('3 Freizeiten')).toBeInTheDocument();
    expect(within(await zeile('Mörscher Au')).getByText('Lieferstelle 5')).toBeInTheDocument();
    expect(within(await zeile('Mörscher Au')).getByRole('button', { name: 'Löschen' })).toBeDisabled();
    expect(within(await zeile('Kindertreff')).getByText('1 Treff')).toBeInTheDocument();
    expect(within(await zeile('Kindertreff')).getByRole('button', { name: 'Löschen' })).toBeDisabled();
    expect(within(await zeile('Strandbad')).getByRole('button', { name: 'Löschen' })).toBeEnabled();
  });

  it('legt einen Ort an; ohne Namen nicht', async () => {
    renderMitAuth(<Orte />, koord);
    await userEvent.click(await screen.findByRole('button', { name: 'Neuer Ort' }));
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Bitte einen Namen eingeben');
    expect(api.speichereOrt).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText('Name'), 'Bootshaus');
    await userEvent.type(screen.getByLabelText('Adresse'), 'Am Fluss 3');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(api.speichereOrt).toHaveBeenCalledWith(null, { name: 'Bootshaus', adresse: 'Am Fluss 3', lieferstelle_nr: '' });
  });

  it('ändert einen Ort mit vorbelegten Werten', async () => {
    renderMitAuth(<Orte />, koord);
    const z = (await screen.findByText('Mörscher Au')).closest('li')!;
    await userEvent.click(within(z).getByRole('button', { name: 'Bearbeiten' }));
    expect(screen.getByLabelText('Name')).toHaveValue('Mörscher Au');
    expect(screen.getByLabelText('Lieferstelle (Nr.)')).toHaveValue('5');
    await userEvent.clear(screen.getByLabelText('Adresse'));
    await userEvent.type(screen.getByLabelText('Adresse'), 'Neue Adresse');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(api.speichereOrt).toHaveBeenCalledWith('o1', { name: 'Mörscher Au', adresse: 'Neue Adresse', lieferstelle_nr: '5' });
  });

  it('löscht nach Rückfrage; zeigt Fehler verständlich', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(api.loescheOrt).mockRejectedValue({ code: '23503', message: 'fk' });
    renderMitAuth(<Orte />, koord);
    await userEvent.click(within((await screen.findByText('Strandbad')).closest('li')!).getByRole('button', { name: 'Löschen' }));
    expect(api.loescheOrt).toHaveBeenCalledWith('o3');
    expect(await screen.findByRole('alert')).toHaveTextContent('noch verwendet');
  });
});

describe('Bewerbungen', () => {
  const offen = [{
    id: 'b1', notiz: 'Gern in Woche 2', created_at: '2027-06-01T10:00:00Z',
    person: { vorname: 'Ida', nachname: 'Neu', mail: 'ida@test.example', kategorie: 'FSJ' },
    freizeit: { id: 'f1', name: 'Sommer-Sause', start_datum: '2027-07-05', ende_datum: '2027-07-09' },
  }];

  it('zeigt Bewerbende mit Freizeit, Kategorie und Nachricht', async () => {
    vi.mocked(api.offeneBewerbungen).mockResolvedValue(offen);
    renderMitAuth(<Bewerbungen />, koord);
    expect(await screen.findByText('Ida Neu')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sommer-Sause' })).toHaveAttribute('href', '/freizeiten/f1');
    expect(screen.getByText('FSJ')).toBeInTheDocument();
    expect(screen.getByText(/Gern in Woche 2/)).toBeInTheDocument();
    expect(screen.getByText('eingegangen 01.06.2027')).toBeInTheDocument();
  });

  it('nimmt an und meldet das Ergebnis', async () => {
    vi.mocked(api.offeneBewerbungen).mockResolvedValue(offen);
    vi.mocked(api.bewerbungAnnehmen).mockResolvedValue(undefined);
    renderMitAuth(<Bewerbungen />, koord);
    await userEvent.click(await screen.findByRole('button', { name: 'Annehmen' }));
    expect(api.bewerbungAnnehmen).toHaveBeenCalledWith('b1', 'teamer');
    expect(await screen.findByText('Ida Neu ist jetzt im Team.')).toBeInTheDocument();
    expect(sendePush).toHaveBeenCalledWith('bewerbung_angenommen', 'b1');           // die Person erfährt es
  });

  it('nimmt mit der gewählten Rolle an: als Leitung', async () => {
    vi.mocked(api.offeneBewerbungen).mockResolvedValue(offen);
    vi.mocked(api.bewerbungAnnehmen).mockResolvedValue(undefined);
    renderMitAuth(<Bewerbungen />, koord);
    const rolle = await screen.findByLabelText('Rolle für Ida Neu');
    expect((rolle as HTMLSelectElement).value).toBe('teamer');
    await userEvent.selectOptions(rolle, 'leitung');
    await userEvent.click(screen.getByRole('button', { name: 'Annehmen' }));
    expect(api.bewerbungAnnehmen).toHaveBeenCalledWith('b1', 'leitung');
    expect(await screen.findByText('Ida Neu ist jetzt Leitung.')).toBeInTheDocument();
    expect(sendePush).toHaveBeenCalledWith('bewerbung_angenommen', 'b1');
  });

  it('lehnt ab', async () => {
    vi.mocked(api.offeneBewerbungen).mockResolvedValue(offen);
    vi.mocked(api.bewerbungAblehnen).mockResolvedValue(undefined);
    renderMitAuth(<Bewerbungen />, koord);
    await userEvent.click(await screen.findByRole('button', { name: 'Ablehnen' }));
    expect(api.bewerbungAblehnen).toHaveBeenCalledWith('b1');
    expect(await screen.findByText(/Bewerbung von Ida Neu wurde abgelehnt/)).toBeInTheDocument();
    expect(sendePush).not.toHaveBeenCalled();                                        // eine Absage löst bewusst keine Mitteilung aus
  });

  it('zeigt einen leeren Zustand und Fehler', async () => {
    vi.mocked(api.offeneBewerbungen).mockResolvedValue([]);
    renderMitAuth(<Bewerbungen />, koord);
    expect(await screen.findByText('Keine offenen Bewerbungen')).toBeInTheDocument();
  });

  it('Entscheidungsfehler erscheinen als Hinweis', async () => {
    vi.mocked(api.offeneBewerbungen).mockResolvedValue(offen);
    vi.mocked(api.bewerbungAnnehmen).mockRejectedValue({ code: '42501', message: 'x' });
    renderMitAuth(<Bewerbungen />, koord);
    await userEvent.click(await screen.findByRole('button', { name: 'Annehmen' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Dafür fehlt die Berechtigung.');
  });
});

describe('Bewerbungen: Ferienzeiten und Frist (0030)', () => {
  const zeitraum = { id: 'z1', person_id: 'p1', jahr: 2027, ferienzeitraum: 'sommer' as const, wochen: [2], notiz: 'mit Tom', status: 'offen' as const,
    created_at: '2027-05-01T10:00:00Z', person: { vorname: 'Tina', nachname: 'Teamer', kategorie: 'TeamerIn' } };
  const fz = (id: string, woche: number, o: Record<string, unknown> = {}) => ({
    id, name: `Sommer ${woche}`, status: 'geplant' as const, ferienzeitraum: 'sommer' as const, ferienwoche: woche, start_datum: `2027-07-0${woche}`, ende_datum: '2027-07-09',
    ort_id: null, ort_name: null, max_teilnehmende: null, alter_von: null, alter_bis: null, tags: [], farbe: null, bewerbung_offen: true, ...o,
  });

  it('zeigt Zeitraum-Bewerbungen mit passenden Freizeiten; Zuordnen mit Rolle schickt „Bewerbung angenommen“', async () => {
    vi.mocked(api.offeneBewerbungen).mockResolvedValue([]);
    vi.mocked(api.offeneZeitraumBewerbungen).mockResolvedValue([zeitraum]);
    vi.mocked(api.listeFreizeiten).mockResolvedValue([fz('f1', 1), fz('f2', 2, { bewerbung_offen: false }), fz('f9', 9)]);
    vi.mocked(api.zeitraumZuordnen).mockResolvedValue('b-neu');
    const u = userEvent.setup();
    renderMitAuth(<Bewerbungen />, koord);
    const liste = await screen.findByRole('list', { name: 'Passende Freizeiten für Tina Teamer' });
    expect(screen.getByText('Sommer 2027 · Woche 2')).toBeInTheDocument();
    expect(within(liste).getAllByRole('listitem')).toHaveLength(1);                                         // nur Woche 2
    expect(within(liste).getByText('voll')).toBeInTheDocument();                                              // auch volle Freizeiten lassen sich zuordnen
    await u.selectOptions(within(liste).getByLabelText('Rolle für Tina Teamer in Sommer 2'), 'leitung');
    await u.click(within(liste).getByRole('button', { name: 'Tina Teamer „Sommer 2“ zuordnen' }));
    expect(api.zeitraumZuordnen).toHaveBeenCalledWith('z1', 'f2', 'leitung');
    expect(sendePush).toHaveBeenCalledWith('bewerbung_angenommen', 'b-neu');
    expect(await screen.findByText(/Tina Teamer ist jetzt Leitung von „Sommer 2“/)).toBeInTheDocument();
  });

  it('wer schon im Team ist, wird angezeigt statt „Zuordnen“; „Erledigt“ schließt die Bewerbung', async () => {
    vi.mocked(api.offeneBewerbungen).mockResolvedValue([]);
    vi.mocked(api.offeneZeitraumBewerbungen).mockResolvedValue([zeitraum]);
    vi.mocked(api.listeFreizeiten).mockResolvedValue([fz('f2', 2)]);
    vi.mocked(zuordnungApi.listeFreizeitTeams).mockResolvedValue([{ freizeit_id: 'f2', person_id: 'p1', rolle: 'teamer' }]);
    vi.mocked(api.zeitraumErledigt).mockResolvedValue(undefined);
    const u = userEvent.setup();
    renderMitAuth(<Bewerbungen />, koord);
    expect(await screen.findByText('ist im Team')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /zuordnen/ })).not.toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Bewerbung von Tina Teamer als erledigt markieren' }));
    expect(api.zeitraumErledigt).toHaveBeenCalledWith('z1');
  });

  it('Bewerbungsfrist: zeigt den Wert, speichert eine gültige Zahl, lehnt ungültige ab', async () => {
    vi.mocked(api.offeneBewerbungen).mockResolvedValue([]);
    vi.mocked(api.speichereVorlaufTage).mockResolvedValue(undefined);
    const u = userEvent.setup();
    renderMitAuth(<Bewerbungen />, koord);
    const feld = await screen.findByLabelText('Tage vor Beginn');
    await waitFor(() => expect(feld).toHaveValue(7));
    await u.clear(feld); await u.type(feld, '120');
    await u.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(screen.getByText('Bitte eine ganze Zahl von 0 bis 90 eingeben.')).toBeInTheDocument();
    await u.clear(feld); await u.type(feld, '14');
    await u.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(api.speichereVorlaufTage).toHaveBeenCalledWith(14);
    expect(await screen.findByText('Gespeichert.')).toBeInTheDocument();
  });
});
