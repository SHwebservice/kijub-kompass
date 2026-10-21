import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '../../treffs/api';
import { VerwaltungTab } from './VerwaltungTab';
import { renderMitAuth, type Szene } from '../../test-utils';
import { treff, treffMitglied } from '../../test-daten';
import { addTage } from '../../treffs/dienstplan';
import { heuteIso } from '../../freizeiten/logik';

vi.mock('../../treffs/api');

const nord = treff({
  id: 't1', name: 'Treff Nord',
  oeffnungszeiten: [{ wochentag: 1, von: '15:00', bis: '19:00' }, { wochentag: 3, von: '14:00', bis: '18:00' }],
});
const team = [
  treffMitglied({ person_id: 'lea', vorname: 'Lea', nachname: 'Leitner', rolle: 'treffleitung', kategorie: 'Hauptamtliche*r' }),
  treffMitglied({ person_id: 'ich', vorname: 'Anna', nachname: 'Adler' }),
  treffMitglied({ person_id: 'ben', vorname: 'Ben', nachname: 'Baum' }),
];
const heute = heuteIso();

const leitung: Szene = { ich: { id: 'lea', kategorie: 'Hauptamtliche*r' }, treffs: [{ treff_id: 't1', rolle: 'treffleitung' }] };
const koord: Szene = { ich: { ist_koordination: true, kategorie: 'Hauptamtliche*r' } };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.holeTreffTeam).mockResolvedValue(team);
  vi.mocked(api.listeDienste).mockResolvedValue([]);
  vi.mocked(api.listeFeiertage).mockResolvedValue([]);
  vi.mocked(api.listeSchliesszeiten).mockResolvedValue([]);
  vi.mocked(api.listeAbwesenheiten).mockResolvedValue([]);
  for (const fn of [api.speichereAbwesenheit, api.loescheAbwesenheiten, api.speichereFeiertag, api.loescheFeiertag] as const) {
    vi.mocked(fn as (...a: never[]) => Promise<void>).mockResolvedValue(undefined);
  }
});

describe('Abwesenheit & Feiertage', () => {
  const morgen = addTage(heute, 1);
  const zeige = async (szene: Szene, rolle: 'treffleitung' | 'koordination' = 'treffleitung') => {
    renderMitAuth(<VerwaltungTab treff={nord} rolle={rolle} />, szene);
    await screen.findByRole('option', { name: 'Baum, Ben' });
  };

  it('trägt Urlaub für einen Zeitraum ein (jeder Tag einzeln)', async () => {
    await zeige(leitung);
    await userEvent.selectOptions(screen.getByLabelText('Person'), 'ben');
    await userEvent.type(screen.getByLabelText('Von'), morgen);
    expect(screen.getByLabelText('Bis')).toHaveValue(morgen);      // wird mit „Von“ vorbelegt
    await userEvent.clear(screen.getByLabelText('Bis'));
    await userEvent.type(screen.getByLabelText('Bis'), addTage(morgen, 2));
    await userEvent.type(screen.getByLabelText('Notiz (optional)'), 'Familienurlaub');
    await userEvent.click(screen.getByRole('button', { name: 'Eintragen' }));
    expect(api.speichereAbwesenheit).toHaveBeenCalledWith('ben', [morgen, addTage(morgen, 1), addTage(morgen, 2)], 'urlaub', 'Familienurlaub');
  });

  it('prüft Eingaben', async () => {
    await zeige(leitung);
    await userEvent.click(screen.getByRole('button', { name: 'Eintragen' }));
    expect(screen.getByText('Bitte eine Person wählen.')).toBeInTheDocument();
    expect(screen.getByText('Bitte Beginn und Ende angeben.')).toBeInTheDocument();
    expect(api.speichereAbwesenheit).not.toHaveBeenCalled();
  });

  it('fasst Tage zu einem Zeitraum zusammen, löscht den ganzen Block und ignoriert Fremde', async () => {
    vi.mocked(api.listeAbwesenheiten).mockResolvedValue([
      { id: '1', person_id: 'ben', datum: '2030-07-05', typ: 'krank', notiz: null },
      { id: '2', person_id: 'ben', datum: '2030-07-06', typ: 'krank', notiz: null },
      { id: '3', person_id: 'fremd', datum: '2030-07-05', typ: 'urlaub', notiz: null },
    ]);
    await zeige(leitung);
    expect(await screen.findByText('05.07.2030 – 06.07.2030')).toBeInTheDocument();
    expect(screen.queryByText('Jemand')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Abwesenheit von Ben Baum .* löschen/ }));
    expect(api.loescheAbwesenheiten).toHaveBeenCalledWith(['1', '2']);
  });

  it('Treffleitung trägt Feiertage nur für den eigenen Treff ein; Koordination auch für alle', async () => {
    await zeige(leitung);
    expect(screen.queryByLabelText('Gilt für alle Treffs')).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Datum'), morgen);
    await userEvent.type(screen.getByLabelText('Bezeichnung'), 'Stadtfest');
    await userEvent.click(screen.getByRole('button', { name: 'Feiertag eintragen' }));
    expect(api.speichereFeiertag).toHaveBeenCalledWith('t1', morgen, 'Stadtfest');
  });

  it('Koordination: Feiertag für alle Treffs', async () => {
    await zeige(koord, 'koordination');
    await userEvent.type(screen.getByLabelText('Datum'), morgen);
    await userEvent.type(screen.getByLabelText('Bezeichnung'), 'Neujahr');
    await userEvent.click(screen.getByLabelText('Gilt für alle Treffs'));
    await userEvent.click(screen.getByRole('button', { name: 'Feiertag eintragen' }));
    expect(api.speichereFeiertag).toHaveBeenCalledWith(null, morgen, 'Neujahr');
  });

  it('Treffleitung kann Feiertage „für alle“ sehen, aber nicht löschen', async () => {
    vi.mocked(api.listeFeiertage).mockResolvedValue([
      { id: 'a', treff_id: null, datum: '2030-01-01', bezeichnung: 'Neujahr' },
      { id: 'b', treff_id: 't1', datum: '2030-05-01', bezeichnung: 'Eigener' },
    ]);
    await zeige(leitung);
    expect(await screen.findByText('Neujahr')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Feiertag Neujahr löschen' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Feiertag Eigener löschen' }));
    expect(api.loescheFeiertag).toHaveBeenCalledWith('b');
  });

it('Schließzeiten stehen nicht mehr hier, sondern im Dienstplan (Hinweis mit Link)', async () => {    await zeige(leitung);    expect(screen.queryByLabelText('Geschlossen von')).not.toBeInTheDocument();    expect(screen.getByRole('link', { name: 'Dienstplan' })).toHaveAttribute('href', '/treffs/t1/dienstplan?ansicht=monat');  });
  it('verlangt Datum und Bezeichnung für Feiertage', async () => {
    await zeige(leitung);
    await userEvent.click(screen.getByRole('button', { name: 'Feiertag eintragen' }));
    expect(screen.getByText('Bitte Datum und Bezeichnung angeben.')).toBeInTheDocument();
    expect(api.speichereFeiertag).not.toHaveBeenCalled();
  });
});
