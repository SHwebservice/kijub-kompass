import { describe, it, expect, vi, beforeEach } from 'vitest';
import { axeVerstoesse } from '../../test-a11y';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '../../quiz/api';
import * as fzApi from '../../freizeiten/api';
import { QuizSeite } from './QuizSeite';
import { QuizVerwaltung } from './QuizVerwaltung';
import { renderMitAuth, type Szene } from '../../test-utils';
import { STANDARDFRAGEN } from '../../quiz/standardfragen';
import type { Frage } from '../../quiz/logik';

vi.mock('../../quiz/api');
vi.mock('../../freizeiten/api');

const teamer: Szene = { freizeiten: [{ freizeit_id: 'f1', rolle: 'teamer' }] };
const koord: Szene = { ich: { ist_koordination: true, kategorie: 'Hauptamtliche*r' } };

const frage = (o: Partial<Frage> & { id: string }): Frage => ({
  thema: 'schwimmen', frage: `Frage ${o.id}`, antworten: ['falsch A', 'richtig', 'falsch B'], korrekt: [1], erklaerung: `Erklärung ${o.id}`, ...o,
});

const einzeln = [frage({ id: '1' }), frage({ id: '2' })];
const mehrfach = frage({ id: 'm', frage: 'Mehrfachfrage', antworten: ['R1', 'F', 'R2'], korrekt: [0, 2] });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.listeFragen).mockResolvedValue({ fragen: [...einzeln, mehrfach, frage({ id: 'a', thema: 'aufsicht' })], standard: false });
  vi.mocked(api.meineBestwerte).mockResolvedValue([]);
  vi.mocked(api.meldeErgebnis).mockResolvedValue(true);
  vi.mocked(api.alleErgebnisse).mockResolvedValue([]);
  vi.mocked(fzApi.holeNamen).mockResolvedValue({});
});

const starte = async (thema: string) => { await userEvent.click(await screen.findByRole('button', { name: `Quiz starten: ${thema}` })); };
const antwort = (text: string) => screen.getByRole('button', { name: new RegExp(`^${text}`) });

describe('Quiz: Themenwahl', () => {
  it('zeigt alle Themen mit Fragenzahl und Bestwert; Themen ohne Fragen sind gesperrt', async () => {
    vi.mocked(api.meineBestwerte).mockResolvedValue([{ thema: 'schwimmen', bester_wert: 2, gesamt: 3 }]);
    renderMitAuth(<QuizSeite zufall={() => 0} />, teamer);
    const knopf = await screen.findByRole('button', { name: 'Quiz starten: Schwimmen & Wasser' });
    expect(knopf).toBeEnabled();
    expect(await screen.findByText('Bestwert: 2/3')).toBeInTheDocument();
    expect(screen.getByText('3 Fragen')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quiz starten: Datenschutz (DSGVO)' })).toBeDisabled();
    expect(screen.queryByRole('link', { name: 'Fragen verwalten' })).not.toBeInTheDocument();
  });

  it('Koordination sieht den Link zur Verwaltung', async () => {
    renderMitAuth(<QuizSeite zufall={() => 0} />, koord);
    expect(await screen.findByRole('link', { name: 'Fragen verwalten' })).toHaveAttribute('href', '/quiz/verwalten');
  });
});

describe('Quiz: Ablauf', () => {
  it('Einzelantwort: sofortige Auswertung, Erklärung, dann weiter bis zum Ergebnis mit Bestwert', async () => {
    vi.mocked(api.listeFragen).mockResolvedValue({ fragen: einzeln, standard: false });
    renderMitAuth(<QuizSeite zufall={() => 0} />, teamer);
    await starte('Schwimmen & Wasser');
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent('Frage 1 von 2');
    await userEvent.click(antwort('richtig'));
    expect(screen.getByText('✓ Richtig!')).toBeInTheDocument();
    expect(screen.getByText(/Erklärung/)).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Antworten' })).getAllByRole('button').every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Nächste Frage' }));
    await userEvent.click(antwort('falsch A'));
    expect(screen.getByText('✗ Leider falsch.')).toBeInTheDocument();
    expect(antwort('richtig')).toHaveTextContent('(richtige Antwort)');
    expect(antwort('falsch A')).toHaveTextContent('(falsch)');
    await userEvent.click(screen.getByRole('button', { name: 'Ergebnis anzeigen' }));
    expect(await screen.findByText('1 von 2')).toBeInTheDocument();
    expect(api.meldeErgebnis).toHaveBeenCalledWith('ich', 'schwimmen', 1, 2, undefined);
    expect(screen.getByText('Neuer Bestwert')).toBeInTheDocument();
    expect(screen.getByText('Noch etwas üben')).toBeInTheDocument();
  });

  it('Mehrfachfrage: Auswahl, Bestätigung, nur vollständig richtig zählt', async () => {
    vi.mocked(api.listeFragen).mockResolvedValue({ fragen: [mehrfach], standard: false });
    renderMitAuth(<QuizSeite zufall={() => 0} />, teamer);
    await starte('Schwimmen & Wasser');
    expect(screen.getByText(/Mehrere Antworten sind richtig/)).toBeInTheDocument();
    await userEvent.click(antwort('R1'));
    expect(antwort('R1')).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Antwort bestätigen' }));
    expect(screen.getByText('✗ Leider falsch.')).toBeInTheDocument();      // R2 fehlt
    await userEvent.click(screen.getByRole('button', { name: 'Ergebnis anzeigen' }));
    expect(await screen.findByText('0 von 1')).toBeInTheDocument();
  });

  it('Mehrfachfrage: alle richtigen gewählt ist richtig; Abwählen möglich; ohne Auswahl Hinweis', async () => {
    vi.mocked(api.listeFragen).mockResolvedValue({ fragen: [mehrfach], standard: false });
    renderMitAuth(<QuizSeite zufall={() => 0} />, teamer);
    await starte('Schwimmen & Wasser');
    await userEvent.click(screen.getByRole('button', { name: 'Antwort bestätigen' }));
    expect(screen.getByText('Bitte mindestens eine Antwort auswählen.')).toBeInTheDocument();
    await userEvent.click(antwort('F'));
    await userEvent.click(antwort('F'));                                   // wieder abwählen
    await userEvent.click(antwort('R1'));
    await userEvent.click(antwort('R2'));
    await userEvent.click(screen.getByRole('button', { name: 'Antwort bestätigen' }));
    expect(screen.getByText('✓ Richtig!')).toBeInTheDocument();
  });

  it('kein neuer Bestwert: nichts Besonderes angezeigt', async () => {
    vi.mocked(api.listeFragen).mockResolvedValue({ fragen: [einzeln[0]!], standard: false });
    vi.mocked(api.meineBestwerte).mockResolvedValue([{ thema: 'schwimmen', bester_wert: 1, gesamt: 1 }]);
    vi.mocked(api.meldeErgebnis).mockResolvedValue(false);
    renderMitAuth(<QuizSeite zufall={() => 0} />, teamer);
    await starte('Schwimmen & Wasser');
    await userEvent.click(antwort('richtig'));
    await userEvent.click(screen.getByRole('button', { name: 'Ergebnis anzeigen' }));
    expect(await screen.findByText('Perfekt!')).toBeInTheDocument();
    expect(screen.queryByText('Neuer Bestwert')).not.toBeInTheDocument();
    expect(api.meldeErgebnis).toHaveBeenCalledWith('ich', 'schwimmen', 1, 1, { thema: 'schwimmen', bester_wert: 1, gesamt: 1 });
  });

  it('Speicherfehler beim Ergebnis: Ergebnis trotzdem sichtbar, Fehler gemeldet', async () => {
    vi.mocked(api.listeFragen).mockResolvedValue({ fragen: [einzeln[0]!], standard: false });
    vi.mocked(api.meldeErgebnis).mockRejectedValue(new Error('x'));
    renderMitAuth(<QuizSeite zufall={() => 0} />, teamer);
    await starte('Schwimmen & Wasser');
    await userEvent.click(antwort('richtig'));
    await userEvent.click(screen.getByRole('button', { name: 'Ergebnis anzeigen' }));
    expect(await screen.findByText('Perfekt!')).toBeInTheDocument();
    expect(screen.getByText('Das Ergebnis konnte nicht gespeichert werden.')).toBeInTheDocument();
  });

  it('nochmal versuchen, zur Themenwahl und Abbrechen', async () => {
    vi.mocked(api.listeFragen).mockResolvedValue({ fragen: [einzeln[0]!], standard: false });
    renderMitAuth(<QuizSeite zufall={() => 0} />, teamer);
    await starte('Schwimmen & Wasser');
    await userEvent.click(screen.getByRole('button', { name: 'Quiz abbrechen' }));
    expect(screen.getByRole('button', { name: 'Quiz starten: Schwimmen & Wasser' })).toBeInTheDocument();
    await starte('Schwimmen & Wasser');
    await userEvent.click(antwort('richtig'));
    await userEvent.click(screen.getByRole('button', { name: 'Ergebnis anzeigen' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Nochmal versuchen' }));
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent('Frage 1 von 1');
    await userEvent.click(screen.getByRole('button', { name: 'Quiz abbrechen' }));
  });

  it('meldet Ladefehler', async () => {
    vi.mocked(api.listeFragen).mockRejectedValue(new Error('x'));
    renderMitAuth(<QuizSeite zufall={() => 0} />, teamer);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});

describe('Quiz-Verwaltung', () => {
  beforeEach(() => {
    for (const fn of [api.speichereFrage, api.loescheFrage, api.uebernimmStandardfragen] as const) {
      vi.mocked(fn as (...a: never[]) => Promise<void>).mockResolvedValue(undefined);
    }
  });
  /** Die Verwaltung startet beim ersten Thema (Aufsicht); die Testfragen gehören zu „Schwimmen & Wasser“. */
  const zeige = async (thema = 'Schwimmen & Wasser') => {
    renderMitAuth(<QuizVerwaltung />, koord);
    await userEvent.click(await screen.findByRole('tab', { name: thema }));
  };

  it('listet die Fragen des gewählten Themas', async () => {
    await zeige();
    expect(await screen.findByText('Frage 1')).toBeInTheDocument();
    expect(screen.getByText('Mehrfachfrage')).toBeInTheDocument();
    expect(screen.queryByText('Frage a')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Aufsicht & Abholung' }));
    expect(screen.getByText('Frage a')).toBeInTheDocument();
  });

  it('legt eine Frage an: leere Antworten fallen weg, Nummern der richtigen werden angepasst', async () => {
    await zeige();
    await userEvent.click(await screen.findByRole('button', { name: '+ Neue Frage' }));
    await userEvent.type(screen.getByLabelText('Frage'), 'Wie viele?');
    await userEvent.type(screen.getByLabelText('Antwort 1'), 'Eins');
    await userEvent.type(screen.getByLabelText('Antwort 3'), 'Drei');
    await userEvent.click(screen.getByLabelText('Antwort 3 ist richtig'));
    await userEvent.type(screen.getByLabelText(/Erklärung/), 'Weil drei.');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(api.speichereFrage).toHaveBeenCalledWith(null, { thema: 'schwimmen', frage: 'Wie viele?', antworten: ['Eins', 'Drei'], korrekt: [1], erklaerung: 'Weil drei.' });
    expect(await screen.findByText('Gespeichert.')).toBeInTheDocument();
  });

  it('prüft die Eingabe', async () => {
    await zeige();
    await userEvent.click(await screen.findByRole('button', { name: '+ Neue Frage' }));
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(screen.getByText('Bitte eine Frage eingeben.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Frage'), 'F?');
    await userEvent.type(screen.getByLabelText('Antwort 1'), 'A');
    await userEvent.type(screen.getByLabelText('Antwort 2'), 'B');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(screen.getByText('Bitte mindestens eine richtige Antwort markieren.')).toBeInTheDocument();
    expect(api.speichereFrage).not.toHaveBeenCalled();
  });

  it('ändert eine vorhandene Frage', async () => {
    await zeige();
    await userEvent.click(await screen.findByRole('button', { name: 'Frage bearbeiten: Mehrfachfrage' }));
    expect(screen.getByLabelText('Antwort 1 ist richtig')).toBeChecked();
    expect(screen.getByLabelText('Antwort 2 ist richtig')).not.toBeChecked();
    await userEvent.click(screen.getByLabelText('Antwort 2 ist richtig'));
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(screen.getByText('Nicht alle Antworten können richtig sein.')).toBeInTheDocument();
    expect(api.speichereFrage).not.toHaveBeenCalled();
    await userEvent.click(screen.getByLabelText('Antwort 1 ist richtig'));
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(api.speichereFrage).toHaveBeenCalledWith('m', expect.objectContaining({ korrekt: [1, 2], antworten: ['R1', 'F', 'R2'] }));
  });

  it('löscht nach Rückfrage', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await zeige();
    await userEvent.click(await screen.findByRole('button', { name: 'Frage löschen: Frage 1' }));
    expect(api.loescheFrage).toHaveBeenCalledWith('1');
  });

  it('Standardfragen: Hinweis, Übernahme, Standardfragen lassen sich nicht löschen', async () => {
    vi.mocked(api.listeFragen).mockResolvedValue({ fragen: STANDARDFRAGEN.map((f, i) => ({ ...f, id: `standard-${i}` })), standard: true });
    await zeige('Aufsicht & Abholung');
    expect(await screen.findByText(/es gelten die 35 Standardfragen/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Frage löschen/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Standardfragen übernehmen' }));
    expect(api.uebernimmStandardfragen).toHaveBeenCalled();
  });

  it('eine geänderte Standardfrage wird als neue Frage gespeichert', async () => {
    vi.mocked(api.listeFragen).mockResolvedValue({ fragen: [frage({ id: 'standard-0' })], standard: true });
    await zeige();
    await userEvent.click(await screen.findByRole('button', { name: /Frage bearbeiten/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(api.speichereFrage).toHaveBeenCalledWith(null, expect.anything());
  });

  it('zeigt die Bestwerte der Personen mit Namen', async () => {
    vi.mocked(api.alleErgebnisse).mockResolvedValue([
      { person_id: 'p2', thema: 'regeln', bester_wert: 3, gesamt: 4 }, { person_id: 'p1', thema: 'schwimmen', bester_wert: 5, gesamt: 5 },
    ]);
    vi.mocked(fzApi.holeNamen).mockResolvedValue({ p1: 'Anna Adler', p2: 'Ben Baum' });
    await zeige();
    const tabelle = await screen.findByRole('table');
    const zeilen = await within(tabelle).findAllByRole('row');
    expect(zeilen[1]).toHaveTextContent('Anna Adler');
    expect(zeilen[1]).toHaveTextContent('5/5 (100 %)');
    expect(zeilen[2]).toHaveTextContent('Ben Baum');
    expect(zeilen[2]).toHaveTextContent('Kleidung, Verhalten & Regeln');
  });
});

describe('Barrierefreiheit (axe)', () => {
  it('keine Verstöße gegen gängige Regeln', async () => {
    vi.mocked(api.meineBestwerte).mockResolvedValue([{ thema: 'schwimmen', bester_wert: 2, gesamt: 3 }]);
    renderMitAuth(<QuizSeite zufall={() => 0} />, teamer);
    await screen.findByRole('button', { name: 'Quiz starten: Schwimmen & Wasser' });
    expect(await axeVerstoesse(document.body)).toEqual([]);
  });
});
