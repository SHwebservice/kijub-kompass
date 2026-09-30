import { describe, it, expect, vi, beforeEach } from 'vitest';
import { axeVerstoesse } from '../../test-a11y';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '../../formulare/api';
import { FormularSeite } from './FormularSeite';
import { renderMitAuth, type Szene } from '../../test-utils';
import { BEISPIELE, leer } from '../../formulare/typen';

vi.mock('../../formulare/api');

const teamer: Szene = { freizeiten: [{ freizeit_id: 'f1', rolle: 'teamer' }] };
const koord: Szene = { ich: { ist_koordination: true, kategorie: 'Hauptamtliche*r' } };

const tab = (name: string) => screen.getByRole('tab', { name });
async function zeige(szene: Szene = teamer) {
  renderMitAuth(<FormularSeite />, szene);
  await screen.findByRole('heading', { name: 'Anwesenheitsliste' });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.holeBeispiele).mockResolvedValue(structuredClone(BEISPIELE));
  vi.mocked(api.holeEntwuerfe).mockResolvedValue({});
  vi.mocked(api.speichereEntwurf).mockResolvedValue(undefined);
  vi.mocked(api.speichereBeispiele).mockResolvedValue(undefined);
});

describe('Formulare: Anwesenheitsliste', () => {
  it('startet mit dem Beispiel', async () => {
    await zeige();
    expect(screen.getByLabelText('Name 1')).toHaveValue('Apfel, Amelie');
    expect(screen.getByLabelText('Status 2, Tag 4')).toHaveValue('E');
    expect(screen.getAllByRole('tab')).toHaveLength(5);
  });

  it('wird nie gespeichert (Namen von Kindern)', async () => {
    await zeige();
    await userEvent.clear(screen.getByLabelText('Name 1'));
    await userEvent.type(screen.getByLabelText('Name 1'), 'Neu');
    await new Promise((r) => setTimeout(r, 1000));
    expect(api.speichereEntwurf).not.toHaveBeenCalled();
    expect(screen.getByText(/wird deshalb nicht gespeichert/)).toBeInTheDocument();
  });

  it('Status: groß und höchstens zwei Zeichen; Zeilen und Tage hinzufügen und entfernen', async () => {
    await zeige();
    const feld = screen.getByLabelText('Status 1, Tag 1');
    await userEvent.clear(feld);
    await userEvent.type(feld, 'u');
    expect(feld).toHaveValue('U');
    await userEvent.click(screen.getByRole('button', { name: '+ Teilnehmer/in hinzufügen' }));
    expect(screen.getByLabelText('Name 9')).toHaveValue('');
    await userEvent.click(screen.getByRole('button', { name: '+ Tag hinzufügen' }));
    expect(screen.getByLabelText('Tag 11')).toBeInTheDocument();
    expect(screen.getByLabelText('Status 9, Tag 11')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Letzten Tag entfernen' }));
    expect(screen.queryByLabelText('Tag 11')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Zeile 9 entfernen' }));
    expect(screen.queryByLabelText('Name 9')).not.toBeInTheDocument();
  });
});

describe('Formulare: Entwürfe', () => {
  it('ein gespeicherter Entwurf ersetzt das Beispiel', async () => {
    vi.mocked(api.holeEntwuerfe).mockResolvedValue({ tagesbericht: { ...leer('tagesbericht'), teamer: 'Gespeichert' } });
    await zeige();
    await userEvent.click(tab('Tagesbericht'));
    expect(screen.getByLabelText('Teamer/in')).toHaveValue('Gespeichert');
    await userEvent.click(tab('Unfallbericht'));
    expect(screen.getByLabelText('Betreuungskraft')).toHaveValue('Miriam Mustermann');   // kein Entwurf → Beispiel
  });

  it('speichert automatisch – viele Tastenanschläge ergeben einen Aufruf mit dem Endstand', async () => {
    await zeige();
    await userEvent.click(tab('Tagesbericht'));
    const feld = screen.getByLabelText('Fehlende Kinder');
    await userEvent.clear(feld);
    await userEvent.type(feld, 'keine');
    await waitFor(() => expect(api.speichereEntwurf).toHaveBeenCalledTimes(1));
    expect(api.speichereEntwurf).toHaveBeenCalledWith('ich', 'tagesbericht', expect.objectContaining({ fehlendeKinder: 'keine' }));
    expect(await screen.findByText('Entwurf gespeichert')).toBeInTheDocument();
  });

  it('meldet Fehler beim Speichern', async () => {
    vi.mocked(api.speichereEntwurf).mockRejectedValue(new Error('x'));
    await zeige();
    await userEvent.click(tab('Tagesbericht'));
    await userEvent.type(screen.getByLabelText('Teamer/in'), 'x');
    expect(await screen.findByText('Der Entwurf konnte nicht gespeichert werden.')).toBeInTheDocument();
  });

  it('„Beispiel wiederherstellen“ und „Vordruck leeren“ fragen nach', async () => {
    const frage = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await zeige();
    await userEvent.click(tab('Unfallbericht'));
    await userEvent.click(screen.getByRole('button', { name: 'Vordruck leeren' }));
    expect(frage).toHaveBeenCalled();
    expect(screen.getByLabelText('Betreuungskraft')).toHaveValue('Miriam Mustermann');
    frage.mockReturnValue(true);
    await userEvent.click(screen.getByRole('button', { name: 'Vordruck leeren' }));
    expect(screen.getByLabelText('Betreuungskraft')).toHaveValue('');
    await userEvent.click(screen.getByRole('button', { name: 'Beispiel wiederherstellen' }));
    expect(screen.getByLabelText('Betreuungskraft')).toHaveValue('Miriam Mustermann');
    await waitFor(() => expect(api.speichereEntwurf).toHaveBeenCalled());
  });
});

describe('Formulare: Vordrucke', () => {
  it('Stundenmeldung rechnet die Endsumme und erlaubt neue Tage', async () => {
    await zeige();
    await userEvent.click(tab('Stundenmeldung'));
    const tabelle = screen.getByRole('table');
    expect(within(tabelle).getByText('22,5')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '+ Tag hinzufügen' }));
    await userEvent.type(screen.getByLabelText('Stunden 4'), '4');
    expect(within(tabelle).getByText('26,5')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Zeile 4 entfernen' }));
    expect(within(tabelle).getByText('22,5')).toBeInTheDocument();
  });

  it('Bescheinigung: Name der Freizeit nur bei „alleine“', async () => {
    await zeige();
    await userEvent.click(tab('Bescheinigung Abholen'));
    expect(screen.queryByLabelText('Name der Freizeit')).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('darf alleine von der Freizeit nach Hause gehen'));
    expect(screen.getByLabelText('Name der Freizeit')).toBeInTheDocument();
  });

  it('Original-PDF zum Herunterladen', async () => {
    await zeige();
    await userEvent.click(tab('Bescheinigung Abholen'));
    expect(screen.getByRole('link', { name: 'Original als PDF herunterladen' })).toHaveAttribute('href', '/formulare/Bescheinigung_Abholen.pdf');
  });

  it('Drucken: Titel mit Datum während des Drucks, danach zurück', async () => {
    let titel = '';
    const drucken = vi.spyOn(window, 'print').mockImplementation(() => { titel = document.title; });
    const vorher = document.title;
    await zeige();
    await userEvent.click(tab('Tagesbericht'));
    await userEvent.click(screen.getByRole('button', { name: 'Drucken / als PDF speichern' }));
    expect(drucken).toHaveBeenCalled();
    expect(titel).toBe('Tagesbericht_2026-08-15');
    expect(document.title).toBe(vorher);
  });
});

describe('Formulare: Beispiele (Koordination)', () => {
  it('TeamerInnen sehen keine Bearbeitung der Beispiele', async () => {
    await zeige();
    expect(screen.queryByRole('button', { name: 'Beispiele bearbeiten' })).not.toBeInTheDocument();
  });

  it('die Koordination ändert ein Beispiel und speichert alle', async () => {
    await zeige(koord);
    await userEvent.click(screen.getByRole('button', { name: 'Beispiele bearbeiten' }));
    expect(screen.getByText(/Bearbeitungsmodus/)).toBeInTheDocument();
    await userEvent.click(tab('Tagesbericht'));
    const feld = screen.getByLabelText('Teamer/in');
    await userEvent.clear(feld);
    await userEvent.type(feld, 'Erika Beispiel');
    await userEvent.click(screen.getByRole('button', { name: 'Beispiele speichern' }));
    expect(api.speichereBeispiele).toHaveBeenCalledTimes(1);
    const [daten, personId] = vi.mocked(api.speichereBeispiele).mock.calls[0]!;
    expect(personId).toBe('ich');
    expect(daten.tagesbericht.teamer).toBe('Erika Beispiel');
    expect(daten.unfallbericht).toEqual(BEISPIELE.unfallbericht);
    expect(api.speichereEntwurf).not.toHaveBeenCalled();      // Beispiel-Modus erzeugt keine persönlichen Entwürfe
    expect(await screen.findByText('Beispiele gespeichert')).toBeInTheDocument();
  });

  it('Bearbeiten beenden verwirft die Änderungen', async () => {
    await zeige(koord);
    await userEvent.click(screen.getByRole('button', { name: 'Beispiele bearbeiten' }));
    await userEvent.click(tab('Tagesbericht'));
    await userEvent.type(screen.getByLabelText('Teamer/in'), 'XYZ');
    await userEvent.click(screen.getByRole('button', { name: 'Bearbeiten beenden' }));
    expect(screen.getByLabelText('Teamer/in')).toHaveValue('Miriam Mustermann');
    expect(api.speichereBeispiele).not.toHaveBeenCalled();
  });

  it('meldet Fehler beim Speichern der Beispiele', async () => {
    vi.mocked(api.speichereBeispiele).mockRejectedValue(new Error('x'));
    await zeige(koord);
    await userEvent.click(screen.getByRole('button', { name: 'Beispiele bearbeiten' }));
    await userEvent.click(screen.getByRole('button', { name: 'Beispiele speichern' }));
    expect(await screen.findByText('Die Beispiele konnten nicht gespeichert werden.')).toBeInTheDocument();
  });
});

describe('Barrierefreiheit (axe)', () => {
  it('keine Verstöße gegen gängige Regeln', async () => {
    await zeige();
    expect(await axeVerstoesse(document.body)).toEqual([]);
  });
});
