import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as treffApi from '../../treffs/api';
import * as fzApi from '../../freizeiten/api';
import * as api from '../../tagesprotokoll/api';
import { NotizenTab } from './NotizenTab';
import { renderMitAuth, type Szene } from '../../test-utils';
import { treff, treffMitglied } from '../../test-daten';
import { heuteIso } from '../../freizeiten/logik';
import { addTage } from '../../treffs/dienstplan';
import type { Aufgabe } from '../../tagesprotokoll/logik';

vi.mock('../../treffs/api');
vi.mock('../../freizeiten/api');
vi.mock('../../tagesprotokoll/api');

const heute = heuteIso();
const nord = treff({ id: 't1', name: 'Treff Nord' });

const aufgabe = (o: Partial<Aufgabe> & { id: string }): Aufgabe => ({
  treff_id: 't1', art: 'todo', text: 'Flyer drucken', antwort: null, faellig_am: null, zustaendig: null, protokoll_datum: null, erledigt: false, erledigt_von: null,
  erledigt_am: null, erstellt_von: 'ben', created_at: `${heute}T10:00:00Z`, ...o,
});

const team = [
  treffMitglied({ person_id: 'lea', vorname: 'Lea', nachname: 'Leitner', rolle: 'treffleitung', kategorie: 'Hauptamtliche*r' }),
  treffMitglied({ person_id: 'ben', vorname: 'Ben', nachname: 'Baum', kategorie: 'TZK' }),
];

const tzk: Szene = { ich: { id: 'ich', kategorie: 'TZK' }, treffs: [{ treff_id: 't1', rolle: 'betreuerin' }] };
const zeige = () => renderMitAuth(<NotizenTab treff={nord} />, tzk);
const offene = async () => within(await screen.findByRole('list', { name: 'Offene Notizen' }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.listeAufgaben).mockResolvedValue([]);
  for (const f of [api.legeAufgabeAn, api.aendereAufgabe, api.setzeErledigt, api.loescheAufgabe] as const) vi.mocked(f as (...a: never[]) => Promise<void>).mockResolvedValue(undefined);
  vi.mocked(treffApi.holeTreffTeam).mockResolvedValue(team);
  vi.mocked(fzApi.holeNamen).mockResolvedValue({ ben: 'Ben Baum', lea: 'Lea Leitner', ich: 'Anna Adler' });
});

describe('Notizen: anzeigen und filtern', () => {
  const liste = [
    aufgabe({ id: '1', text: 'Flyer drucken', faellig_am: addTage(heute, -2), zustaendig: 'lea' }),
    aufgabe({ id: '2', art: 'einkauf', text: 'Saft' }),
    aufgabe({ id: '3', art: 'einkauf', text: 'Kekse' }),
    aufgabe({ id: '4', art: 'frage', text: 'Wer hat den Schlüssel?' }),
    aufgabe({ id: '5', text: 'Kicker reparieren', erledigt: true, erledigt_von: 'ben', erledigt_am: `${heute}T09:00:00Z` }),
    aufgabe({ id: '6', text: 'Uralt', erledigt: true, erledigt_von: 'ben', erledigt_am: `${addTage(heute, -90)}T09:00:00Z` }),
  ];

  it('offene Einträge mit Zahlen je Art; Überfälliges und Zuständigkeit sichtbar', async () => {
    vi.mocked(api.listeAufgaben).mockResolvedValue(liste);
    zeige();
    const l = await offene();
    expect(l.getAllByRole('listitem')).toHaveLength(4);
    expect(l.getAllByRole('listitem')[0]).toHaveTextContent('Flyer drucken');           // überfällig zuerst
    expect(l.getAllByRole('listitem')[0]).toHaveTextContent('Überfällig:');
    expect(await screen.findByText('zuständig: Lea Leitner')).toBeInTheDocument();
    const filter = screen.getByRole('navigation', { name: 'Notizen filtern' });
    expect(within(filter).getByRole('button', { name: 'Alle (4)' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(filter).getByRole('button', { name: /Einkaufsliste \(2\)/ })).toBeInTheDocument();
    expect(within(filter).getByRole('button', { name: /Offene Fragen \(1\)/ })).toBeInTheDocument();
    expect(within(filter).getByRole('button', { name: /To-dos \(1\)/ })).toBeInTheDocument();
  });

  it('Filter zeigt nur eine Art', async () => {
    vi.mocked(api.listeAufgaben).mockResolvedValue(liste);
    const u = userEvent.setup();
    zeige();
    await offene();
    await u.click(screen.getByRole('button', { name: /Einkaufsliste/ }));
    const l = await offene();
    expect(l.getAllByRole('listitem')).toHaveLength(2);
    expect(l.queryByText('Flyer drucken')).not.toBeInTheDocument();
    expect(l.getByText('Saft')).toBeInTheDocument();
    expect(l.getByText('Kekse')).toBeInTheDocument();
  });

  it('Erledigtes steht eingeklappt, mit wer und wann; sehr alte Einträge sind ausgeblendet', async () => {
    vi.mocked(api.listeAufgaben).mockResolvedValue(liste);
    zeige();
    await offene();
    const erledigt = screen.getByRole('list', { name: 'Erledigte Notizen', hidden: true });
    expect(within(erledigt).getAllByRole('listitem', { hidden: true })).toHaveLength(1);
    expect(erledigt).toHaveTextContent('Kicker reparieren');
    await waitFor(() => expect(erledigt).toHaveTextContent('erledigt von Ben Baum'));
    expect(screen.getByText(/1 ältere erledigte Eintrag ist ausgeblendet/)).toBeInTheDocument();
  });

  it('leer: „Nichts offen“', async () => {
    zeige();
    expect(await screen.findByText('Nichts offen')).toBeInTheDocument();
  });
});

describe('Notizen: anlegen, erledigen, ändern, löschen', () => {
  it('To-do mit Fälligkeit und Zuständigkeit anlegen; das Feld wird danach geleert', async () => {
    const u = userEvent.setup();
    zeige();
    await screen.findByText('Nichts offen');
    const form = screen.getByRole('heading', { name: 'Neue Notiz' }).closest('section')!;
    await u.type(within(form).getByLabelText('Notiz'), 'Plakat aufhängen');
    await u.type(within(form).getByLabelText('Bis wann? (optional)'), '2027-05-01');
    await u.selectOptions(within(form).getByLabelText('Zuständig (optional)'), 'lea');
    await u.click(within(form).getByRole('button', { name: 'Hinzufügen' }));
    expect(api.legeAufgabeAn).toHaveBeenCalledWith('t1', { art: 'todo', text: 'Plakat aufhängen', faellig_am: '2027-05-01', zustaendig: 'lea' });
    expect(within(form).getByLabelText('Notiz')).toHaveValue('');
  });

  it('Einkauf hat weder Fälligkeit noch Zuständigkeit', async () => {
    const u = userEvent.setup();
    zeige();
    await screen.findByText('Nichts offen');
    const form = screen.getByRole('heading', { name: 'Neue Notiz' }).closest('section')!;
    await u.selectOptions(within(form).getByLabelText('Art'), 'einkauf');
    expect(within(form).queryByLabelText('Bis wann? (optional)')).not.toBeInTheDocument();
    expect(within(form).queryByLabelText('Zuständig (optional)')).not.toBeInTheDocument();
    await u.type(within(form).getByLabelText('Was muss gekauft werden?'), 'Saft');
    await u.click(within(form).getByRole('button', { name: 'Hinzufügen' }));
    expect(api.legeAufgabeAn).toHaveBeenCalledWith('t1', expect.objectContaining({ art: 'einkauf', text: 'Saft' }));
  });

  it('ohne Text wird nichts gespeichert', async () => {
    const u = userEvent.setup();
    zeige();
    await screen.findByText('Nichts offen');
    await u.click(screen.getByRole('button', { name: 'Hinzufügen' }));
    expect(await screen.findByText('Bitte einen Text eingeben.')).toBeInTheDocument();
    expect(api.legeAufgabeAn).not.toHaveBeenCalled();
  });

  it('ein Tipp auf den Haken erledigt die Notiz', async () => {
    vi.mocked(api.listeAufgaben).mockResolvedValue([aufgabe({ id: '1' })]);
    const u = userEvent.setup();
    zeige();
    await u.click(await screen.findByRole('checkbox', { name: 'Flyer drucken – erledigt' }));
    expect(api.setzeErledigt).toHaveBeenCalledWith('1', true);
  });

  it('eine erledigte Notiz lässt sich wieder öffnen', async () => {
    vi.mocked(api.listeAufgaben).mockResolvedValue([aufgabe({ id: '1', erledigt: true, erledigt_am: `${heute}T09:00:00Z` })]);
    const u = userEvent.setup();
    zeige();
    await u.click(await screen.findByRole('checkbox', { name: 'Flyer drucken – erledigt', hidden: true }));
    expect(api.setzeErledigt).toHaveBeenCalledWith('1', false);
  });

  it('eine offene Frage wird mit Antwort erledigt', async () => {
    vi.mocked(api.listeAufgaben).mockResolvedValue([aufgabe({ id: '4', art: 'frage', text: 'Wer hat den Schlüssel?' })]);
    const u = userEvent.setup();
    zeige();
    await u.click(await screen.findByRole('checkbox', { name: 'Wer hat den Schlüssel? – erledigt' }));
    expect(api.setzeErledigt).not.toHaveBeenCalled();            // erst die Antwort
    await u.type(await screen.findByLabelText('Antwort'), 'Die Treffleitung');
    await u.click(screen.getByRole('button', { name: 'Mit Antwort erledigen' }));
    expect(api.setzeErledigt).toHaveBeenCalledWith('4', true, 'Die Treffleitung');
  });

  it('die Antwort einer erledigten Frage bleibt lesbar', async () => {
    vi.mocked(api.listeAufgaben).mockResolvedValue([aufgabe({ id: '4', art: 'frage', text: 'Wer hat den Schlüssel?', erledigt: true, erledigt_am: `${heute}T09:00:00Z`, antwort: 'Die Treffleitung' })]);
    zeige();
    await screen.findByText('Nichts offen');
    expect(screen.getByText('Die Treffleitung', { exact: false })).toBeInTheDocument();
  });

  it('bearbeiten ändert Text, Fälligkeit und Zuständigkeit', async () => {
    vi.mocked(api.listeAufgaben).mockResolvedValue([aufgabe({ id: '1' })]);
    const u = userEvent.setup();
    zeige();
    await u.click(await screen.findByRole('button', { name: 'Flyer drucken bearbeiten' }));
    const l = await offene();
    const feld = l.getByLabelText('Notiz');
    await u.clear(feld); await u.type(feld, 'Flyer kopieren');
    await u.selectOptions(l.getByLabelText('Zuständig (optional)'), 'ben');
    await u.click(l.getByRole('button', { name: 'Änderung speichern' }));
    expect(api.aendereAufgabe).toHaveBeenCalledWith('1', { art: 'todo', text: 'Flyer kopieren', faellig_am: '', zustaendig: 'ben' });
  });

  it('löschen mit Rückfrage', async () => {
    vi.mocked(api.listeAufgaben).mockResolvedValue([aufgabe({ id: '1' })]);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const u = userEvent.setup();
    zeige();
    const knopf = await screen.findByRole('button', { name: 'Flyer drucken löschen' });
    await u.click(knopf);
    expect(api.loescheAufgabe).not.toHaveBeenCalled();
    await u.click(knopf);
    expect(api.loescheAufgabe).toHaveBeenCalledWith('1');
    confirm.mockRestore();
  });

  it('ein Fehler wird angezeigt', async () => {
    vi.mocked(api.listeAufgaben).mockResolvedValue([aufgabe({ id: '1' })]);
    vi.mocked(api.setzeErledigt).mockRejectedValue(new Error('kaputt'));
    const u = userEvent.setup();
    zeige();
    await u.click(await screen.findByRole('checkbox', { name: 'Flyer drucken – erledigt' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
