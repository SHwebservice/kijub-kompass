import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PersonEntfernen, folgenListe, nameBestaetigt, type Uebersicht } from './PersonEntfernen';

const leer: Uebersicht = {
  hat_zugang: true, ist_koordination: false, aktiv: true, freizeiten: 0, leitung_freizeiten: 0, treffs: 0,
  bewerbungen: 0, dienste: 0, abwesenheiten: 0, nachweise: 0, vorschlaege: 0, notizen_verfasst: 0,
};

function aufbau(u: Partial<Uebersicht> = {}, over: { ausfuehren?: () => Promise<string | null>; aktiv?: boolean } = {}) {
  const ausfuehren = vi.fn(over.ausfuehren ?? (async () => null));
  const schliessen = vi.fn();
  const ladeUebersicht = vi.fn().mockResolvedValue({ ...leer, ...u });
  render(<PersonEntfernen person={{ vorname: 'Tom', nachname: 'Müller', aktiv: over.aktiv ?? true }}
    ladeUebersicht={ladeUebersicht} ausfuehren={ausfuehren} schliessen={schliessen} />);
  return { ausfuehren, schliessen };
}

describe('folgenListe', () => {
  it('nennt nur Posten, die es gibt, mit richtiger Einzahl/Mehrzahl', () => {
    expect(folgenListe(leer)).toEqual([]);
    expect(folgenListe({ ...leer, freizeiten: 1, treffs: 2, nachweise: 1, abwesenheiten: 3 })).toEqual([
      'Zuordnung zu 1 Freizeit', 'Zuordnung zu 2 Treffs', '3 Abwesenheiten', '1 Zeitnachweis',
    ]);
  });
  it('weist die Leitungsrolle aus', () => {
    expect(folgenListe({ ...leer, freizeiten: 3, leitung_freizeiten: 2 })[0]).toBe('Zuordnung zu 3 Freizeiten (davon 2 Mal als Leitung)');
  });
});

describe('nameBestaetigt', () => {
  it('ignoriert Groß-/Kleinschreibung und Leerzeichen am Rand, nicht aber andere Namen oder Leere', () => {
    expect(nameBestaetigt('  müller ', 'Müller')).toBe(true);
    expect(nameBestaetigt('Mueller', 'Müller')).toBe(false);
    expect(nameBestaetigt('', '')).toBe(false);
  });
});

describe('PersonEntfernen', () => {
  it('bestätigen ist gesperrt, bis eine Option gewählt ist', async () => {
    aufbau();
    await screen.findByText('Deaktivieren');
    expect(screen.getByRole('button', { name: 'Bestätigen' })).toBeDisabled();
  });

  it('Deaktivieren und Zugang entziehen brauchen keine Namenseingabe', async () => {
    const { ausfuehren } = aufbau();
    await userEvent.click(await screen.findByLabelText(/Zugang entziehen/));
    const knopf = screen.getByRole('button', { name: 'Zugang entziehen' });
    expect(knopf).toBeEnabled();
    await userEvent.click(knopf);
    expect(ausfuehren).toHaveBeenCalledWith('zugang');
  });

  it('endgültiges Löschen verlangt den Nachnamen, zeigt die Folgen und löscht erst dann', async () => {
    const { ausfuehren } = aufbau({ freizeiten: 2, leitung_freizeiten: 1, nachweise: 4, notizen_verfasst: 3 });
    await userEvent.click(await screen.findByLabelText(/Person endgültig löschen/));
    expect(screen.getByText(/nicht rückgängig/)).toBeInTheDocument();
    expect(screen.getByText('Zuordnung zu 2 Freizeiten (davon 1 Mal als Leitung)')).toBeInTheDocument();
    expect(screen.getByText('4 Zeitnachweise')).toBeInTheDocument();
    expect(screen.getByText(/aufbewahrungspflichtig/)).toBeInTheDocument();
    expect(screen.getByText(/3 verfasste Hinweise\/Absprachen bleiben ohne Namen erhalten/)).toBeInTheDocument();

    const loeschen = screen.getByRole('button', { name: 'Endgültig löschen' });
    expect(loeschen).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/Nachnamen eingeben/), 'Schmidt');
    expect(loeschen).toBeDisabled();
    await userEvent.clear(screen.getByLabelText(/Nachnamen eingeben/));
    await userEvent.type(screen.getByLabelText(/Nachnamen eingeben/), 'müller');
    expect(loeschen).toBeEnabled();
    await userEvent.click(loeschen);
    expect(ausfuehren).toHaveBeenCalledWith('person');
  });

  it('ohne zugehörige Daten sagt die Warnung das ausdrücklich', async () => {
    aufbau();
    await userEvent.click(await screen.findByLabelText(/Person endgültig löschen/));
    expect(screen.getByText(/keine weiteren Daten/)).toBeInTheDocument();
  });

  it('nicht vorhandene Möglichkeiten sind gesperrt (kein Zugang, schon deaktiviert)', async () => {
    aufbau({ hat_zugang: false, aktiv: false });
    expect(await screen.findByLabelText(/Zugang entziehen/)).toBeDisabled();
    expect(screen.getByLabelText(/^Deaktivieren/)).toBeDisabled();
    expect(screen.getByLabelText(/Person endgültig löschen/)).toBeEnabled();
  });

  it('zeigt einen Fehler der Aktion und bleibt offen', async () => {
    const { schliessen } = aufbau({}, { ausfuehren: async () => 'Die letzte Koordination mit Zugang kann nicht entfernt werden.' });
    await userEvent.click(await screen.findByLabelText(/Zugang entziehen/));
    await userEvent.click(screen.getByRole('button', { name: 'Zugang entziehen' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('letzte Koordination');
    expect(schliessen).not.toHaveBeenCalled();
  });

  it('warnt bei Koordinations-Personen und lässt sich abbrechen', async () => {
    const { schliessen } = aufbau({ ist_koordination: true });
    expect(await screen.findByText('Koordination')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));
    expect(schliessen).toHaveBeenCalled();
  });

  it('zeigt einen Fehler, wenn die Übersicht nicht lädt, und erlaubt nichts', async () => {
    render(<PersonEntfernen person={{ vorname: 'A', nachname: 'B', aktiv: true }}
      ladeUebersicht={vi.fn().mockRejectedValue(new Error('x'))} ausfuehren={vi.fn()} schliessen={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Übersicht konnte nicht geladen werden'));
    expect(screen.getByRole('button', { name: 'Bestätigen' })).toBeDisabled();
  });
});
