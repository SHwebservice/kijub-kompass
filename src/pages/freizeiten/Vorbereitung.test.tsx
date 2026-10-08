import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '../../checkliste/api';
import { VorbereitungTab } from './VorbereitungTab';
import { renderMitAuth } from '../../test-utils';
import { freizeitDetail, inTagen } from '../../test-daten';
import { axeVerstoesse } from '../../test-a11y';
import type { Punkt } from '../../checkliste/logik';

vi.mock('../../checkliste/api');

const fz = freizeitDetail({ id: 'f1', name: 'Zeltlager', start_datum: inTagen(20), ende_datum: inTagen(24) });
const punkt = (o: Partial<Punkt> & { id: string; titel: string }): Punkt => ({
  freizeit_id: 'f1', art: 'vorlage', beschreibung: '', faellig: inTagen(10), ziel: null, automatik: null, auto_erfuellt: false,
  status: 'offen', notiz: '', geaendert_von: null, geaendert_am: null, ...o,
});
const punkte: Punkt[] = [
  punkt({ id: 'a', titel: 'Vortreffen planen', faellig: inTagen(-2), ziel: 'hinweise', beschreibung: 'Termin als Hinweis eintragen.' }),
  punkt({ id: 'b', titel: 'Wochenplan steht', faellig: inTagen(3), ziel: 'plan', automatik: 'wochenplan' }),
  punkt({ id: 'c', titel: 'Leitung steht fest', faellig: inTagen(-30), automatik: 'leitung', auto_erfuellt: true }),
  punkt({ id: 'd', titel: 'Formulare vorbereitet', faellig: inTagen(13), ziel: 'formulare' }),
  punkt({ id: 'e', titel: 'Nachbesprechung', faellig: inTagen(38), status: 'nicht_relevant' }),
  punkt({ id: 'x', art: 'eigen', titel: 'Kanus reservieren', faellig: null }),
];

const leitung = { ich: { kategorie: 'Hauptamtliche*r' as const }, freizeiten: [{ freizeit_id: 'f1', rolle: 'leitung' as const }] };
const zeige = () => renderMitAuth(<VorbereitungTab freizeit={fz} />, leitung);
const liste = (name: string) => screen.getByRole('list', { name });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.ladeCheckliste).mockResolvedValue(punkte);
  vi.mocked(api.setzeStatus).mockResolvedValue(undefined);
  vi.mocked(api.legeEigenenAn).mockResolvedValue(undefined);
  vi.mocked(api.loescheEigenen).mockResolvedValue(undefined);
});

describe('Vorbereitung (Checkliste einer Freizeit)', () => {
  it('Stand und Gruppen: überfällig, in 7 Tagen, später, erledigt/nicht relevant', async () => {
    zeige();
    expect(await screen.findByText('1 von 5')).toBeInTheDocument();                 // „nicht relevant“ zählt nicht mit
    expect(screen.getByText('1 überfällig')).toBeInTheDocument();
    expect(within(liste('Überfällig')).getByText('Vortreffen planen')).toBeInTheDocument();
    expect(within(liste('Überfällig')).getByText(/seit 2 Tagen überfällig/)).toBeInTheDocument();
    expect(within(liste('In den nächsten 7 Tagen')).getByText('Wochenplan steht')).toBeInTheDocument();
    expect(within(liste('Später')).getAllByRole('listitem').map((li) => within(li).getByText(/./, { selector: '.list__title' }).textContent))
      .toEqual(['Formulare vorbereitet', 'Kanus reservieren']);
    const fertig = liste('Erledigt und nicht relevant');
    expect(within(fertig).getByText('Leitung steht fest')).toBeInTheDocument();
    expect(within(fertig).getByText(/automatisch erkannt: eine Leitung ist zugeordnet/)).toBeInTheDocument();
    expect(within(fertig).getByText('nicht relevant')).toBeInTheDocument();
  });

  it('Punkte führen direkt an die Stelle der App, an der man sie erledigt', async () => {
    zeige();
    await screen.findByText('Vortreffen planen');
    expect(within(liste('Überfällig')).getByRole('link', { name: 'Zu den Hinweisen →' })).toHaveAttribute('href', '/freizeiten/f1/hinweise');
    expect(within(liste('Später')).getByRole('link', { name: 'Zu den Formularen →' })).toHaveAttribute('href', '/formulare');
    expect(within(liste('In den nächsten 7 Tagen')).getByText(/Wird automatisch abgehakt, sobald gilt: jeder Tag hat einen Eintrag im Wochenplan/)).toBeInTheDocument();
  });

  it('abhaken, „nicht relevant“, wieder aufnehmen; automatisch erkannte Punkte lassen sich nicht abhaken', async () => {
    const u = userEvent.setup();
    zeige();
    await u.click(await screen.findByRole('checkbox', { name: 'Vortreffen planen erledigt' }));
    expect(api.setzeStatus).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), 'erledigt', undefined);
    await u.click(within(liste('In den nächsten 7 Tagen')).getByRole('button', { name: 'Nicht relevant' }));
    expect(api.setzeStatus).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'b' }), 'nicht_relevant', undefined);
    await u.click(within(liste('Erledigt und nicht relevant')).getByRole('button', { name: 'Wieder aufnehmen' }));
    expect(api.setzeStatus).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'e' }), 'offen', undefined);
    expect(screen.getByRole('checkbox', { name: 'Leitung steht fest erledigt' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Leitung steht fest erledigt' })).toBeDisabled();
    expect(api.ladeCheckliste).toHaveBeenCalledTimes(4);                             // nach jeder Änderung neu geladen
  });

  it('Notiz zu einem Punkt', async () => {
    const u = userEvent.setup();
    zeige();
    await screen.findByText('Formulare vorbereitet');
    await u.click(within(liste('Später')).getAllByRole('button', { name: 'Notiz' })[0]!);
    await u.type(screen.getByLabelText('Notiz zu „Formulare vorbereitet“'), 'liegt im Büro');
    await u.click(screen.getByRole('button', { name: 'Notiz speichern' }));
    expect(api.setzeStatus).toHaveBeenCalledWith(expect.objectContaining({ id: 'd' }), 'offen', 'liegt im Büro');
  });

  it('eigenen Punkt hinzufügen (Titel nötig) und löschen', async () => {
    const u = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    zeige();
    await screen.findByText('Kanus reservieren');
    await u.click(screen.getByRole('button', { name: 'Hinzufügen' }));
    expect(screen.getByText('Bitte beschreiben, was zu tun ist.')).toBeInTheDocument();
    await u.type(screen.getByLabelText('Was ist zu tun?'), 'Bus bestätigen');
    await u.type(screen.getByLabelText('Fällig am (optional)'), inTagen(5));
    await u.click(screen.getByRole('button', { name: 'Hinzufügen' }));
    expect(api.legeEigenenAn).toHaveBeenCalledWith('f1', { titel: 'Bus bestätigen', beschreibung: '', faellig_am: inTagen(5) });
    await u.click(screen.getByRole('button', { name: 'Punkt „Kanus reservieren“ löschen' }));
    expect(api.loescheEigenen).toHaveBeenCalledWith('x');
  });

  it('Fehler beim Speichern werden angezeigt', async () => {
    vi.mocked(api.setzeStatus).mockRejectedValue({ code: '42501', message: 'row-level security' });
    const u = userEvent.setup();
    zeige();
    await u.click(await screen.findByRole('checkbox', { name: 'Vortreffen planen erledigt' }));
    expect(await screen.findByText('Dafür fehlt die Berechtigung.')).toBeInTheDocument();
  });

  it('Barrierefreiheit (axe): keine Verstöße', async () => {
    const { container } = zeige();
    await screen.findByText('Vortreffen planen');
    expect(await axeVerstoesse(container)).toEqual([]);
  });
});
