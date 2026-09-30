import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '../freizeiten/api';
import { Orte } from './Orte';
import { Bewerbungen } from './Bewerbungen';
import { Heute } from './Heute';
import { renderMitAuth } from '../test-utils';
import { freizeit, inTagen } from '../test-daten';

vi.mock('../freizeiten/api');
beforeEach(() => { vi.resetAllMocks(); });

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
    expect(api.bewerbungAnnehmen).toHaveBeenCalledWith('b1');
    expect(await screen.findByText('Ida Neu ist jetzt im Team.')).toBeInTheDocument();
  });

  it('lehnt ab', async () => {
    vi.mocked(api.offeneBewerbungen).mockResolvedValue(offen);
    vi.mocked(api.bewerbungAblehnen).mockResolvedValue(undefined);
    renderMitAuth(<Bewerbungen />, koord);
    await userEvent.click(await screen.findByRole('button', { name: 'Ablehnen' }));
    expect(api.bewerbungAblehnen).toHaveBeenCalledWith('b1');
    expect(await screen.findByText(/Bewerbung von Ida Neu wurde abgelehnt/)).toBeInTheDocument();
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

describe('Startseite', () => {
  beforeEach(() => {
    vi.mocked(api.listeFreizeiten).mockResolvedValue([
      freizeit({ id: 'mein', name: 'Meine Kommende' }),
      freizeit({ id: 'lauf', name: 'Meine Laufende', start_datum: inTagen(-1), ende_datum: inTagen(3) }),
      freizeit({ id: 'alt', name: 'Meine Alte', start_datum: inTagen(-30), ende_datum: inTagen(-26) }),
      freizeit({ id: 'ab', name: 'Meine Abgesagte', status: 'abgesagt' }),
      freizeit({ id: 'fremd', name: 'Nicht meine' }),
    ]);
  });

  it('zeigt nur eigene, laufende oder kommende, nicht abgesagte Freizeiten', async () => {
    renderMitAuth(<Heute />, { freizeiten: ['mein', 'lauf', 'alt', 'ab'].map((id) => ({ freizeit_id: id, rolle: 'teamer' as const })) });
    expect(await screen.findByText('Meine Kommende')).toBeInTheDocument();
    expect(screen.getByText('Meine Laufende')).toBeInTheDocument();
    expect(screen.getByText('Läuft')).toBeInTheDocument();
    expect(screen.getByText('in 30 Tagen')).toBeInTheDocument();
    for (const n of ['Meine Alte', 'Meine Abgesagte', 'Nicht meine']) expect(screen.queryByText(n)).not.toBeInTheDocument();
  });

  it('ohne Zuordnung: Willkommenstext mit Hinweis auf die Bewerbung', async () => {
    renderMitAuth(<Heute />);
    expect(await screen.findByText('Willkommen im KiJuB-Kompass')).toBeInTheDocument();
    expect(screen.getByText(/kannst du dich für kommende Freizeiten bewerben/)).toBeInTheDocument();
  });

  it('Hauptamtliche ohne Zuordnung bekommen keinen Bewerbungs-Hinweis', async () => {
    renderMitAuth(<Heute />, { ich: { kategorie: 'Hauptamtliche*r' } });
    expect(await screen.findByText(/Sobald du einer Freizeit oder einem Treff zugeordnet bist/)).toBeInTheDocument();
  });
});
