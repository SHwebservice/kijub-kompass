import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '../../freizeiten/api';
import { FreizeitForm } from './FreizeitForm';
import { renderMitAuth } from '../../test-utils';
import { freizeitDetail } from '../../test-daten';

vi.mock('../../freizeiten/api');

const koord = { ich: { ist_koordination: true, kategorie: 'Hauptamtliche*r' as const } };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.listeOrte).mockResolvedValue([
    { id: 'o1', name: 'Mörscher Au', adresse: 'Au 1', lieferstelle_nr: '5', freizeiten: 1, treffs: 0 },
    { id: 'o2', name: 'Strandbad', adresse: null, lieferstelle_nr: null, freizeiten: 0, treffs: 0 },
  ]);
  vi.mocked(api.listeTags).mockResolvedValue(['Küche', 'Großfreizeit']);
  vi.mocked(api.speichereFreizeit).mockResolvedValue('neu-id');
  vi.mocked(api.loescheFreizeit).mockResolvedValue(undefined);
});

const neu = () => renderMitAuth(<FreizeitForm />, { ...koord, pfad: '/freizeiten/neu', route: '/freizeiten/neu' });
const bearbeiten = () => renderMitAuth(<FreizeitForm />, { ...koord, pfad: '/freizeiten/f1/bearbeiten', route: '/freizeiten/:id/bearbeiten' });

describe('Neue Freizeit', () => {
  it('zeigt Fehler, wenn Pflichtangaben fehlen, und speichert nicht', async () => {
    neu();
    await userEvent.click(await screen.findByRole('button', { name: 'Freizeit anlegen' }));
    expect(screen.getByText('Bitte einen Namen eingeben.')).toBeInTheDocument();
    expect(screen.getByText('Bitte das Startdatum angeben.')).toBeInTheDocument();
    expect(screen.getByText('Bitte das Enddatum angeben.')).toBeInTheDocument();
    expect(api.speichereFreizeit).not.toHaveBeenCalled();
  });

  it('legt mit gültigen Angaben an und wechselt zur neuen Freizeit', async () => {
    neu();
    await userEvent.type(await screen.findByLabelText('Name'), '  Herbst im Siedlerheim ');
    await userEvent.type(screen.getByLabelText('Start'), '2027-10-11');
    await userEvent.type(screen.getByLabelText('Ende'), '2027-10-15');
    await userEvent.selectOptions(screen.getByLabelText('Ferienzeit'), 'herbst');
    await userEvent.selectOptions(screen.getByLabelText('Ferienwoche'), '2');
    await userEvent.selectOptions(screen.getByLabelText('Ort'), 'o2');
    await userEvent.click(screen.getByLabelText('Küche'));
    await userEvent.click(screen.getByRole('button', { name: 'Freizeit anlegen' }));
    expect(api.speichereFreizeit).toHaveBeenCalledTimes(1);
    const [id, form] = vi.mocked(api.speichereFreizeit).mock.calls[0]!;
    expect(id).toBeNull();
    expect(form).toMatchObject({ name: '  Herbst im Siedlerheim ', start_datum: '2027-10-11', ende_datum: '2027-10-15', ferienzeitraum: 'herbst', ferienwoche: 2, ort_id: 'o2', tags: ['Küche'], status: 'geplant' });
    expect(await screen.findByTestId('andere-seite')).toBeInTheDocument();
  });

  it('prüft Ende nach Start und Ferienwoche', async () => {
    neu();
    await userEvent.type(await screen.findByLabelText('Name'), 'X');
    await userEvent.type(screen.getByLabelText('Start'), '2027-10-15');
    await userEvent.type(screen.getByLabelText('Ende'), '2027-10-11');
    await userEvent.click(screen.getByRole('button', { name: 'Freizeit anlegen' }));
    expect(screen.getByText('Das Ende darf nicht vor dem Start liegen.')).toBeInTheDocument();
    expect(api.speichereFreizeit).not.toHaveBeenCalled();
  });

  it('Ferienwoche ist erst nach der Ferienzeit wählbar und zeigt genau so viele Wochen wie erlaubt', async () => {
    neu();
    const woche = await screen.findByLabelText('Ferienwoche');
    expect(woche).toBeDisabled();
    await userEvent.selectOptions(screen.getByLabelText('Ferienzeit'), 'ostern');
    expect(within(woche).getAllByRole('option')).toHaveLength(3);       // keine + 2 Wochen
    await userEvent.selectOptions(screen.getByLabelText('Ferienzeit'), 'sommer');
    expect(within(woche).getAllByRole('option')).toHaveLength(7);       // keine + 6 Wochen
  });

  it('ein Wechsel der Ferienzeit setzt die Woche zurück (keine ungültige Kombination)', async () => {
    neu();
    await userEvent.selectOptions(await screen.findByLabelText('Ferienzeit'), 'sommer');
    await userEvent.selectOptions(screen.getByLabelText('Ferienwoche'), '5');
    await userEvent.selectOptions(screen.getByLabelText('Ferienzeit'), 'ostern');
    expect(screen.getByLabelText('Ferienwoche')).toHaveValue('');
  });

  it('zeigt Serverfehler verständlich', async () => {
    vi.mocked(api.speichereFreizeit).mockRejectedValue({ code: '42501', message: 'row-level security' });
    neu();
    await userEvent.type(await screen.findByLabelText('Name'), 'X');
    await userEvent.type(screen.getByLabelText('Start'), '2027-10-11');
    await userEvent.type(screen.getByLabelText('Ende'), '2027-10-15');
    await userEvent.click(screen.getByRole('button', { name: 'Freizeit anlegen' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Dafür fehlt die Berechtigung.');
  });

  it('bietet zum Anlegen kein Löschen an', async () => {
    neu();
    await screen.findByLabelText('Name');
    expect(screen.queryByText('Freizeit löschen')).not.toBeInTheDocument();
  });
});

describe('Freizeit bearbeiten', () => {
  beforeEach(() => {
    vi.mocked(api.holeFreizeit).mockResolvedValue(freizeitDetail({
      id: 'f1', name: 'Sommer-Sause', start_datum: '2027-07-05', ende_datum: '2027-07-09', ferienzeitraum: 'sommer', ferienwoche: 1,
      ort_id: 'o1', alter_von: 6, alter_bis: 11, arbeitsbeginn: '07:30', tags: ['Küche'],
    }));
  });

  it('füllt das Formular mit den vorhandenen Werten', async () => {
    bearbeiten();
    expect(await screen.findByLabelText('Name')).toHaveValue('Sommer-Sause');
    expect(screen.getByLabelText('Start')).toHaveValue('2027-07-05');
    expect(screen.getByLabelText('Ferienzeit')).toHaveValue('sommer');
    expect(screen.getByLabelText('Ferienwoche')).toHaveValue('1');
    expect(screen.getByLabelText('Ort')).toHaveValue('o1');
    expect(screen.getByLabelText('Alter von')).toHaveValue(6);
    expect(screen.getByLabelText('Arbeitsbeginn')).toHaveValue('07:30');
    expect(screen.getByLabelText('Küche')).toBeChecked();
    expect(screen.getByLabelText('Großfreizeit')).not.toBeChecked();
  });

  it('speichert Änderungen unter der vorhandenen ID', async () => {
    bearbeiten();
    const name = await screen.findByLabelText('Name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Sommer-Sause (neu)');
    await userEvent.click(screen.getByRole('button', { name: 'Änderungen speichern' }));
    expect(api.speichereFreizeit).toHaveBeenCalledWith('f1', expect.objectContaining({ name: 'Sommer-Sause (neu)', ferienwoche: 1 }));
  });

  it('Löschen verlangt den Namen zur Bestätigung', async () => {
    bearbeiten();
    await userEvent.click(await screen.findByRole('button', { name: 'Löschen …' }));
    expect(screen.getByText('Das lässt sich nicht rückgängig machen.')).toBeInTheDocument();
    const loeschen = screen.getByRole('button', { name: 'Endgültig löschen' });
    expect(loeschen).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/Namen eingeben: Sommer-Sause/), 'Falsch');
    expect(loeschen).toBeDisabled();
    await userEvent.clear(screen.getByLabelText(/Namen eingeben/));
    await userEvent.type(screen.getByLabelText(/Namen eingeben/), 'sommer-sause');
    expect(loeschen).toBeEnabled();
    await userEvent.click(loeschen);
    expect(api.loescheFreizeit).toHaveBeenCalledWith('f1');
    expect(await screen.findByTestId('andere-seite')).toBeInTheDocument();
  });

  it('unbekannte Freizeit: verständliche Meldung statt Formular', async () => {
    vi.mocked(api.holeFreizeit).mockResolvedValue(null);
    bearbeiten();
    expect(await screen.findByRole('alert')).toHaveTextContent('nicht gefunden');
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
  });
});
