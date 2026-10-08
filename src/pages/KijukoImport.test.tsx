import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KijukoImport } from './KijukoImport';
import { hatAenderungen, summe, wertText, feldLabel, type ImportErgebnis } from '../import/ergebnis';
import { beispielBackup } from '../../tests/fixtures/kijuko';

const leer: ImportErgebnis = {
  angewendet: false, zaehler: {}, aenderungen: [], konflikte: [], entfallen: [], hinweise: [], uebersprungen: [],
};
const mit = (o: Partial<ImportErgebnis>): ImportErgebnis => ({ ...leer, ...o });

function datei(inhalt: unknown, name = 'KiJuKo-Backup.json') {
  return new File([typeof inhalt === 'string' ? inhalt : JSON.stringify(inhalt)], name, { type: 'application/json' });
}
async function laden(f: File) {
  await userEvent.upload(screen.getByLabelText('KiJuKo-Datei (.json)'), f);
}

describe('Hilfsfunktionen der Anzeige', () => {
  it('summe() zählt entfernt und gelöscht zusammen', () => {
    expect(summe({ neu: 2, geaendert: 1, unveraendert: 5, geloescht: 3, entfernt: 1 })).toEqual({ neu: 2, geaendert: 1, unveraendert: 5, weg: 4 });
    expect(summe(undefined)).toEqual({ neu: 0, geaendert: 0, unveraendert: 0, weg: 0 });
  });
  it('hatAenderungen() ignoriert Unverändertes', () => {
    expect(hatAenderungen(mit({ zaehler: { personen: { unveraendert: 10 } } }))).toBe(false);
    expect(hatAenderungen(mit({ zaehler: { personen: { unveraendert: 10 }, orte: { neu: 1 } } }))).toBe(true);
  });
  it('wertText() und feldLabel()', () => {
    expect(wertText(null)).toBe('—');
    expect(wertText('')).toBe('—');
    expect(wertText(true)).toBe('ja');
    expect(wertText('0170')).toBe('0170');
    expect(feldLabel('telefon')).toBe('Telefon');
    expect(feldLabel('unbekannt')).toBe('unbekannt');
  });
});

describe('KijukoImport', () => {
  it('zeigt zuerst nur die Dateiauswahl', () => {
    render(<KijukoImport vorschau={vi.fn()} anwenden={vi.fn()} />);
    expect(screen.getByLabelText('KiJuKo-Datei (.json)')).toBeInTheDocument();
    expect(screen.queryByText('Import durchführen')).not.toBeInTheDocument();
  });

  it('lehnt Dateien ab, die keine JSON-Datei sind, ohne den Server zu fragen', async () => {
    const vorschau = vi.fn();
    render(<KijukoImport vorschau={vorschau} anwenden={vi.fn()} />);
    await laden(datei('das ist kein json'));
    expect(await screen.findByRole('alert')).toHaveTextContent('keine gültige JSON-Datei');
    expect(vorschau).not.toHaveBeenCalled();
  });

  it('lehnt JSON ab, das keine KiJuKo-Datei ist', async () => {
    const vorschau = vi.fn();
    render(<KijukoImport vorschau={vorschau} anwenden={vi.fn()} />);
    await laden(datei({ irgendwas: 1 }));
    expect(await screen.findByRole('alert')).toHaveTextContent('keine Datei aus KiJuKo');
    expect(vorschau).not.toHaveBeenCalled();
  });

  it('prüft die Datei, schickt nur den schlanken Plan (keine privaten Felder) und zeigt die Vorschau', async () => {
    const vorschau = vi.fn().mockResolvedValue(mit({
      zaehler: { orte: { neu: 3 }, personen: { neu: 8 }, freizeiten: { neu: 3 }, zuteilungen: { neu: 7 } },
      uebersprungen: [{ art: 'Person', name: 'Ohne Mail', grund: 'Keine gültige Mail-Adresse' }],
      hinweise: ['Kurt Komisch: Unbekannte Kategorie „Sonderstatus" – als TeamerIn übernommen.'],
    }));
    render(<KijukoImport vorschau={vorschau} anwenden={vi.fn()} />);
    await laden(datei(beispielBackup()));
    expect(await screen.findByText('Vorschau')).toBeInTheDocument();
    expect(screen.getByText('Noch nichts verändert')).toBeInTheDocument();

    const [plan, entscheidungen] = vorschau.mock.calls[0]!;
    expect(entscheidungen).toEqual({});
    const json = JSON.stringify(plan);
    for (const privat of ['1990-01-01', 'Musterstraße', 'ZUGANG1', 'Nicht importieren']) expect(json).not.toContain(privat);

    const tabelle = screen.getByRole('table');
    expect(within(tabelle).getByRole('row', { name: /Personen\s*8/ })).toBeInTheDocument();
    expect(screen.getByText(/Keine gültige Mail-Adresse/)).toBeInTheDocument();
    expect(screen.getByText(/Unbekannte Kategorie/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import durchführen' })).toBeInTheDocument();
  });

  it('übernimmt Entscheidungen und Häkchen beim Import', async () => {
    const konflikt = { schluessel: 'personen:1:telefon', art: 'Person', name: 'Anna Adler', feld: 'telefon', kompass: '0160 A', kijuko: '0170 B' };
    const vorschau = vi.fn().mockResolvedValue(mit({
      konflikte: [konflikt, { ...konflikt, schluessel: 'personen:2:telefon', name: 'Ben Baum' }],
      entfallen: [{ art: 'Zuteilung', name: 'Ben Baum in Sommer-Sause', schluessel: 'entfallen:f:p' }, { art: 'Person', name: 'Weg Person', schluessel: 'person:x' }],
    }));
    const anwenden = vi.fn().mockResolvedValue(mit({ angewendet: true, zaehler: { personen: { geaendert: 1 } } }));
    render(<KijukoImport vorschau={vorschau} anwenden={anwenden} />);
    await laden(datei(beispielBackup(), 'mein-backup.json'));
    await screen.findByText('Konflikte (2)');

    // Erster Konflikt: KiJuKo übernehmen; zweiter bleibt offen
    const erste = screen.getByRole('group', { name: /Anna Adler/ });
    await userEvent.click(within(erste).getByLabelText(/KiJuKo übernehmen/));
    const zweite = screen.getByRole('group', { name: /Ben Baum/ });
    expect(within(zweite).getByLabelText('Später entscheiden')).toBeChecked();
    // Entfallene Zuteilung entfernen
    await userEvent.click(screen.getByLabelText(/Ben Baum in Sommer-Sause – aus dem Kompass entfernen/));
    // Entfallene Person: nur Information, keine Auswahl
    expect(screen.getByText('Weg Person')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Import durchführen' }));
    await waitFor(() => expect(anwenden).toHaveBeenCalled());
    const [, entscheidungen, info] = anwenden.mock.calls[0]!;
    expect(entscheidungen).toEqual({ 'personen:1:telefon': 'kijuko', 'entfallen:f:p': 'kijuko' });
    expect(info.name).toBe('mein-backup.json');
    expect(info.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(await screen.findByText('Import abgeschlossen')).toBeInTheDocument();
    expect(screen.getByText('Gespeichert')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Import durchführen' })).not.toBeInTheDocument();
  });

  it('bei einem Fehler im Lauf bleibt die Vorschau stehen und nichts gilt als gespeichert', async () => {
    const vorschau = vi.fn().mockResolvedValue(mit({ zaehler: { orte: { neu: 1 } } }));
    const anwenden = vi.fn().mockRejectedValue(new Error('boom'));
    render(<KijukoImport vorschau={vorschau} anwenden={anwenden} />);
    await laden(datei(beispielBackup()));
    await userEvent.click(await screen.findByRole('button', { name: 'Import durchführen' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Es wurde nichts verändert');
    expect(screen.getByText('Noch nichts verändert')).toBeInTheDocument();
  });

  it('sagt ausdrücklich, wenn es nichts zu tun gibt', async () => {
    const vorschau = vi.fn().mockResolvedValue(mit({ zaehler: { personen: { unveraendert: 77 } } }));
    render(<KijukoImport vorschau={vorschau} anwenden={vi.fn()} />);
    await laden(datei(beispielBackup()));
    expect(await screen.findByText(/keine Änderungen/)).toBeInTheDocument();
  });

  it('Abbrechen führt zurück zur Dateiauswahl', async () => {
    render(<KijukoImport vorschau={vi.fn().mockResolvedValue(leer)} anwenden={vi.fn()} />);
    await laden(datei(beispielBackup()));
    await userEvent.click(await screen.findByRole('button', { name: 'Abbrechen' }));
    expect(screen.getByLabelText('KiJuKo-Datei (.json)')).toBeInTheDocument();
  });

  it('Fehler der Vorschau werden verständlich gemeldet, mit technischer Angabe', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<KijukoImport vorschau={vi.fn().mockRejectedValue(new Error('x'))} anwenden={vi.fn()} />);
    await laden(datei(beispielBackup()));
    const hinweis = await screen.findByRole('alert');
    expect(hinweis).toHaveTextContent('konnte nicht geprüft werden');
    expect(hinweis).toHaveTextContent('Technische Angabe');
    expect(screen.getByText('x', { selector: 'code' })).toBeInTheDocument();
  });

  it('fehlt die Import-Funktion in der Datenbank, sagt die Meldung, dass Migration 0010 fehlt', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fehlt = { code: 'PGRST202', message: 'Could not find the function public.fn_kijuko_import in the schema cache' };
    render(<KijukoImport vorschau={vi.fn().mockRejectedValue(fehlt)} anwenden={vi.fn()} />);
    await laden(datei(beispielBackup()));
    expect(await screen.findByRole('alert')).toHaveTextContent('Migration „0010_kijuko_import.sql“ wurde noch nicht eingespielt');
    expect(screen.getByText(/PGRST202/)).toBeInTheDocument();
    expect(console.error).toHaveBeenCalled();
  });

  it('die technische Angabe verschwindet beim nächsten Versuch', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<KijukoImport vorschau={vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(leer)} anwenden={vi.fn()} />);
    await laden(datei(beispielBackup()));
    await screen.findByText('Technische Angabe');
    await laden(datei(beispielBackup()));
    await screen.findByRole('button', { name: 'Abbrechen' });
    expect(screen.queryByText('Technische Angabe')).not.toBeInTheDocument();
  });
});
