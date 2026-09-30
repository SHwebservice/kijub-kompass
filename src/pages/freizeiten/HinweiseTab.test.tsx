import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '../../freizeiten/api';
import { HinweiseTab } from './HinweiseTab';
import { renderMitAuth } from '../../test-utils';
import { freizeitDetail, inTagen, mitglied } from '../../test-daten';
import type { Notiz } from '../../freizeiten/notizen';
import type { RolleInFreizeit } from '../../lib/rollen';

vi.mock('../../freizeiten/api');

const tag1 = inTagen(1);
const tag2 = inTagen(2);
const f = freizeitDetail({ id: 'f1', start_datum: tag1, ende_datum: tag2 });

const notiz = (o: Partial<Notiz> & { id: string }): Notiz => ({
  art: 'hinweis', geltung: 'gesamt', datum: null, text: 'Text', erstellt_von: 'lea', created_at: '2027-06-01T10:30:00Z',
  bestaetigungen: [], kommentare: [], ...o,
});
const hinweis = notiz({ id: 'h1', text: 'Bitte Sonnencreme mitbringen', bestaetigungen: [{ person_id: 't1', at: '' }] });
const tagesHinweis = notiz({ id: 'h2', text: 'Ausflug: festes Schuhwerk', geltung: 'tag', datum: tag2 });
const absprache = notiz({
  id: 'a1', art: 'absprache', text: 'Budget für den Ausflug klären', bestaetigungen: [{ person_id: 'lea', at: '' }],
  kommentare: [
    { id: 'k1', person_id: 'ich', text: 'Eigener Kommentar', created_at: '2027-06-02T08:00:00Z' },
    { id: 'k2', person_id: 'lea', text: 'Kommentar der Leitung', created_at: '2027-06-02T09:00:00Z' },
  ],
});
const team = [
  mitglied({ person_id: 'lea', vorname: 'Lea', nachname: 'Leitner', rolle: 'leitung' }),
  mitglied({ person_id: 't1', vorname: 'Tom', nachname: 'Zeh' }),
  mitglied({ person_id: 't2', vorname: 'Tina', nachname: 'Eck' }),
  mitglied({ person_id: 'ich', vorname: 'Anna', nachname: 'Adler' }),
];

const teamer = { freizeiten: [{ freizeit_id: 'f1', rolle: 'teamer' as const }] };
const leitung = { ich: { kategorie: 'Hauptamtliche*r' as const }, freizeiten: [{ freizeit_id: 'f1', rolle: 'leitung' as const }] };
const koord = { ich: { ist_koordination: true, kategorie: 'Hauptamtliche*r' as const } };

function zeige(rolle: RolleInFreizeit, szene = {}) {
  return renderMitAuth(<HinweiseTab freizeit={f} rolle={rolle} />, szene);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.listeNotizen).mockResolvedValue([hinweis, tagesHinweis, absprache]);
  vi.mocked(api.holeTeam).mockResolvedValue(team);
  vi.mocked(api.holeNamen).mockResolvedValue({});
  for (const fn of [api.legeNotizAn, api.aendereNotiz, api.loescheNotiz, api.bestaetige, api.bestaetigungZurueck, api.kommentiere, api.loescheKommentar] as const) {
    vi.mocked(fn as (...a: never[]) => Promise<void>).mockResolvedValue(undefined);
  }
});

describe('Hinweise: TeamerIn', () => {
  beforeEach(() => { vi.mocked(api.listeNotizen).mockResolvedValue([hinweis, tagesHinweis]); });   // die Datenbank liefert ihr keine Absprachen

  it('sieht Hinweise (ganze Freizeit und je Tag), aber keine Absprachen und keine Eingabe', async () => {
    zeige('teamer', teamer);
    expect(await screen.findByText('Bitte Sonnencreme mitbringen')).toBeInTheDocument();
    expect(screen.getByText('Ausflug: festes Schuhwerk')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^(Mo|Di|Mi|Do|Fr|Sa|So) \d\d\.\d\d\.$/ })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Absprachen mit der Koordination' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Neuer Hinweis')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bearbeiten' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Löschen' })).not.toBeInTheDocument();
    expect(screen.queryByText(/von \d+ gesehen/)).not.toBeInTheDocument();
  });

  it('bestätigt „gesehen" und nimmt es zurück', async () => {
    vi.mocked(api.listeNotizen).mockResolvedValue([hinweis, { ...tagesHinweis, bestaetigungen: [{ person_id: 'ich', at: '' }] }]);
    zeige('teamer', teamer);
    const erste = (await screen.findByText('Bitte Sonnencreme mitbringen')).closest('li')!;
    const knopf = within(erste).getByRole('button', { name: /Gesehen\?/ });
    expect(knopf).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(knopf);
    expect(api.bestaetige).toHaveBeenCalledWith('h1', 'ich');

    const zweite = screen.getByText('Ausflug: festes Schuhwerk').closest('li')!;
    const gesehen = within(zweite).getByRole('button', { name: /Gesehen/ });
    expect(gesehen).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(gesehen);
    expect(api.bestaetigungZurueck).toHaveBeenCalledWith('h2', 'ich');
  });

  it('Fehler beim Bestätigen werden angezeigt', async () => {
    vi.mocked(api.bestaetige).mockRejectedValue({ code: '42501', message: 'rls' });
    zeige('teamer', teamer);
    await userEvent.click((await screen.findAllByRole('button', { name: /Gesehen\?/ }))[0]!);
    expect(await screen.findByRole('alert')).toHaveTextContent('Dafür fehlt die Berechtigung.');
  });

  it('leerer Zustand', async () => {
    vi.mocked(api.listeNotizen).mockResolvedValue([]);
    zeige('teamer', teamer);
    expect(await screen.findByText('Noch keine Hinweise')).toBeInTheDocument();
  });
});

describe('Hinweise und Absprachen: Leitung', () => {
  it('sieht beide Bereiche; Hinweise bestätigt sie nicht, Absprachen schon', async () => {
    zeige('leitung', leitung);
    expect(await screen.findByRole('heading', { name: 'Hinweise für das Team' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Absprachen mit der Koordination' })).toBeInTheDocument();
    const h = screen.getByText('Bitte Sonnencreme mitbringen').closest('li')!;
    expect(within(h).queryByRole('button', { name: /Gesehen/ })).not.toBeInTheDocument();
    const a = screen.getByText('Budget für den Ausflug klären').closest('li')!;
    expect(within(a).getByRole('button', { name: /Bestätigen/ })).toBeInTheDocument();
  });

  it('zeigt den Stand der Bestätigungen und wer noch fehlt (nur TeamerInnen zählen)', async () => {
    zeige('leitung', leitung);
    const h = (await screen.findByText('Bitte Sonnencreme mitbringen')).closest('li')!;
    const knopf = within(h).getByRole('button', { name: '1 von 3 gesehen' });
    await userEvent.click(knopf);
    expect(within(h).getByText(/Noch nicht gesehen: Anna Adler, Tina Eck/)).toBeInTheDocument();
  });

  it('legt einen Hinweis an; ohne Text nicht', async () => {
    zeige('leitung', leitung);
    const form = (await screen.findByLabelText('Neuer Hinweis')).closest('form')!;
    await userEvent.click(within(form).getByRole('button', { name: 'Speichern' }));
    expect(within(form).getByText('Bitte einen Text eingeben.')).toBeInTheDocument();
    expect(api.legeNotizAn).not.toHaveBeenCalled();
    await userEvent.type(within(form).getByLabelText('Neuer Hinweis'), '  Regenkleidung  ');
    await userEvent.click(within(form).getByRole('button', { name: 'Speichern' }));
    expect(api.legeNotizAn).toHaveBeenCalledWith('f1', 'hinweis', { text: '  Regenkleidung  ', geltung: 'gesamt', datum: null });
  });

  it('eine Tagesnotiz braucht einen Tag', async () => {
    zeige('leitung', leitung);
    const form = (await screen.findByLabelText('Neue Absprache')).closest('form')!;
    await userEvent.type(within(form).getByLabelText('Neue Absprache'), 'Schlüssel abholen');
    await userEvent.selectOptions(within(form).getByLabelText('Gilt für'), 'tag');
    await userEvent.click(within(form).getByRole('button', { name: 'Speichern' }));
    expect(within(form).getByText('Bitte einen Tag wählen.')).toBeInTheDocument();
    expect(api.legeNotizAn).not.toHaveBeenCalled();
    await userEvent.selectOptions(within(form).getByLabelText('Tag'), tag2);
    await userEvent.click(within(form).getByRole('button', { name: 'Speichern' }));
    expect(api.legeNotizAn).toHaveBeenCalledWith('f1', 'absprache', { text: 'Schlüssel abholen', geltung: 'tag', datum: tag2 });
  });

  it('bearbeitet eine Notiz mit vorbelegtem Formular', async () => {
    zeige('leitung', leitung);
    const h = (await screen.findByText('Bitte Sonnencreme mitbringen')).closest('li')!;
    await userEvent.click(within(h).getByRole('button', { name: 'Bearbeiten' }));
    const feld = screen.getByLabelText('Hinweis bearbeiten');
    expect(feld).toHaveValue('Bitte Sonnencreme mitbringen');
    await userEvent.clear(feld);
    await userEvent.type(feld, 'Sonnencreme UND Mütze');
    await userEvent.click(screen.getByRole('button', { name: 'Änderung speichern' }));
    expect(api.aendereNotiz).toHaveBeenCalledWith('h1', { text: 'Sonnencreme UND Mütze', geltung: 'gesamt', datum: null });
  });

  it('löscht nach Rückfrage', async () => {
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    zeige('leitung', leitung);
    const h = (await screen.findByText('Bitte Sonnencreme mitbringen')).closest('li')!;
    await userEvent.click(within(h).getByRole('button', { name: 'Löschen' }));
    expect(api.loescheNotiz).not.toHaveBeenCalled();
    await userEvent.click(within(h).getByRole('button', { name: 'Löschen' }));
    expect(api.loescheNotiz).toHaveBeenCalledWith('h1');
  });

  it('Absprache: bestätigt, zeigt wer bestätigt hat, Kommentare mit Namen', async () => {
    zeige('leitung', leitung);
    const a = (await screen.findByText('Budget für den Ausflug klären')).closest('li')!;
    expect(within(a).getByText('Bestätigt von Lea Leitner')).toBeInTheDocument();
    await userEvent.click(within(a).getByRole('button', { name: /Bestätigen/ }));
    expect(api.bestaetige).toHaveBeenCalledWith('a1', 'ich');
    const kommentare = within(a).getByRole('list', { name: 'Kommentare' });
    expect(within(kommentare).getByText('Eigener Kommentar')).toBeInTheDocument();
    expect(within(kommentare).getByText('Kommentar der Leitung')).toBeInTheDocument();
  });

  it('kommentiert; leerer Kommentar ist gesperrt', async () => {
    zeige('leitung', leitung);
    const a = (await screen.findByText('Budget für den Ausflug klären')).closest('li')!;
    const senden = within(a).getByRole('button', { name: 'Kommentar senden' });
    expect(senden).toBeDisabled();
    await userEvent.type(within(a).getByLabelText('Kommentar'), 'Klärung läuft');
    await userEvent.click(senden);
    expect(api.kommentiere).toHaveBeenCalledWith('a1', 'ich', 'Klärung läuft');
  });

  it('Kommentare: nur eigene löschbar (Leitung)', async () => {
    zeige('leitung', leitung);
    const a = (await screen.findByText('Budget für den Ausflug klären')).closest('li')!;
    const loeschen = within(a).getAllByRole('button', { name: 'Kommentar löschen' });
    expect(loeschen).toHaveLength(1);
    await userEvent.click(loeschen[0]!);
    expect(api.loescheKommentar).toHaveBeenCalledWith('k1');
  });

  it('die Tageshinweise erscheinen unter der Überschrift ihres Tages', async () => {
    zeige('leitung', leitung);
    const t = (await screen.findByText('Ausflug: festes Schuhwerk')).closest('li')!;
    expect(within(t).getByText(/^Nur \d\d\.\d\d\.\d{4}$/)).toBeInTheDocument();
  });
});

describe('Hinweise und Absprachen: Koordination', () => {
  it('sieht beides, kann Kommentare aller löschen und Absprachen bestätigen, Hinweise nicht', async () => {
    zeige('koordination', koord);
    const a = (await screen.findByText('Budget für den Ausflug klären')).closest('li')!;
    expect(within(a).getAllByRole('button', { name: 'Kommentar löschen' })).toHaveLength(2);
    expect(within(a).getByRole('button', { name: /Bestätigen/ })).toBeInTheDocument();
    const h = screen.getByText('Bitte Sonnencreme mitbringen').closest('li')!;
    expect(within(h).queryByRole('button', { name: /Gesehen/ })).not.toBeInTheDocument();
    expect(within(h).getByRole('button', { name: 'Bearbeiten' })).toBeInTheDocument();
  });
});

describe('Fehlerfälle', () => {
  it('Ladefehler', async () => {
    vi.mocked(api.listeNotizen).mockRejectedValue(new Error('x'));
    zeige('leitung', leitung);
    expect(await screen.findByRole('alert')).toHaveTextContent('konnten nicht geladen werden');
  });

  it('ein Fehler beim Speichern zeigt Hinweis, die Eingabe bleibt erhalten', async () => {
    vi.mocked(api.legeNotizAn).mockRejectedValue({ code: '42501', message: 'rls' });
    zeige('leitung', leitung);
    const feld = await screen.findByLabelText('Neuer Hinweis');
    await userEvent.type(feld, 'Wichtig');
    await userEvent.click(within(feld.closest('form')!).getByRole('button', { name: 'Speichern' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Dafür fehlt die Berechtigung.');
    expect(feld).toHaveValue('Wichtig');
  });
});
