import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '../checkliste/api';
import { ChecklisteVorlage } from './ChecklisteVorlage';
import { renderMitAuth } from '../test-utils';
import type { VorlagePunkt } from '../checkliste/logik';

vi.mock('../checkliste/api');

const v = (o: Partial<VorlagePunkt> & { id: string; titel: string }): VorlagePunkt => ({
  beschreibung: '', bezug: 'start', tage: -14, ziel: null, automatik: null, position: 10, aktiv: true, termin_art: null, themen: [], ...o,
});
const punkte = [
  v({ id: 'a', titel: 'Wochenplan steht', ziel: 'plan', automatik: 'wochenplan', position: 10 }),
  v({ id: 'b', titel: 'Nachbesprechung', bezug: 'ende', tage: 14, position: 20 }),
  v({ id: 'c', titel: 'Alter Punkt', aktiv: false, position: 30 }),
];
const fk = { ich: { ist_freizeitkoordination: true, kategorie: 'Hauptamtliche*r' as const } };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.listeVorlage).mockResolvedValue(punkte);
  for (const fn of [api.speichereVorlagePunkt, api.setzeVorlageAktiv, api.ordneVorlage, api.loescheVorlagePunkt] as const) {
    vi.mocked(fn as (...a: never[]) => Promise<void>).mockResolvedValue(undefined);
  }
});

describe('Standard-Checkliste pflegen (Freizeitenkoordination)', () => {
  it('zeigt die Punkte mit Fälligkeit in Worten, Ziel, Automatik und deaktivierte', async () => {
    renderMitAuth(<ChecklisteVorlage />, fk);
    const liste = await screen.findByRole('list', { name: 'Standard-Checkliste' });
    const a = within(liste).getByText('Wochenplan steht').closest('li')!;
    expect(a).toHaveTextContent('2 Wochen vor Beginn');
    expect(a).toHaveTextContent('Zum Wochenplan');
    expect(a).toHaveTextContent('automatisch: jeder Tag hat am Vormittag und am Nachmittag einen Eintrag im Wochenplan');
    expect(within(liste).getByText('Nachbesprechung').closest('li')).toHaveTextContent('2 Wochen nach Ende');
    expect(within(liste).getByText('Alter Punkt').closest('li')).toHaveTextContent('deaktiviert');
  });

  it('neuer Punkt: Tage vor/nach Beginn oder Ende, Ziel und Automatik; ans Ende der Liste', async () => {
    const u = userEvent.setup();
    renderMitAuth(<ChecklisteVorlage />, fk);
    await u.click(await screen.findByRole('button', { name: '+ Neuer Punkt' }));
    const d = await screen.findByRole('dialog');
    await u.type(within(d).getByLabelText('Titel'), 'Bus bestellen');
    await u.clear(within(d).getByLabelText('Tage'));
    await u.type(within(d).getByLabelText('Tage'), '30');
    expect(within(d).getByText('= 30 Tage vor Beginn')).toBeInTheDocument();
    await u.selectOptions(within(d).getByLabelText('Führt zu (optional)'), 'hinweise');
    await u.click(within(d).getByRole('button', { name: 'Speichern' }));
    expect(api.speichereVorlagePunkt).toHaveBeenCalledWith(null, { titel: 'Bus bestellen', beschreibung: '', bezug: 'start', tage: -30, ziel: 'hinweise', automatik: '', termin_art: '', themen: '' }, 40);
  });

  it('„nach“ dem Ende; ohne Titel wird nicht gespeichert', async () => {
    const u = userEvent.setup();
    renderMitAuth(<ChecklisteVorlage />, fk);
    await u.click(await screen.findByRole('button', { name: '„Nachbesprechung“ bearbeiten' }));
    const d = await screen.findByRole('dialog');
    expect(within(d).getByLabelText('vor oder nach')).toHaveValue('nach');
    expect(within(d).getByLabelText('Bezug')).toHaveValue('ende');
    await u.clear(within(d).getByLabelText('Titel'));
    await u.click(within(d).getByRole('button', { name: 'Speichern' }));
    expect(within(d).getByText('Bitte einen Titel eingeben.')).toBeInTheDocument();
    expect(api.speichereVorlagePunkt).not.toHaveBeenCalled();
  });

  it('Reihenfolge, Deaktivieren und Löschen (mit Rückfrage)', async () => {
    const u = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderMitAuth(<ChecklisteVorlage />, fk);
    await u.click(await screen.findByRole('button', { name: '„Nachbesprechung“ nach oben' }));
    expect(vi.mocked(api.ordneVorlage).mock.calls[0]![0].map((p) => p.id)).toEqual(['b', 'a', 'c']);
    expect(screen.getByRole('button', { name: '„Wochenplan steht“ nach oben' })).toBeDisabled();
    await u.click(within(screen.getByText('Alter Punkt').closest('li')!).getByRole('button', { name: 'Aktivieren' }));
    expect(api.setzeVorlageAktiv).toHaveBeenCalledWith('c', true);
    await u.click(screen.getByRole('button', { name: '„Alter Punkt“ löschen' }));
    expect(api.loescheVorlagePunkt).toHaveBeenCalledWith('c');
  });
});
