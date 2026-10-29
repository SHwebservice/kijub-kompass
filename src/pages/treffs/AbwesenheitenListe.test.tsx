import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '../../treffs/api';
import { AbwesenheitenListe } from './AbwesenheitenListe';
import { renderMitAuth, type Szene } from '../../test-utils';
import { treff, treffMitglied } from '../../test-daten';
import { addTage, type Dienst } from '../../treffs/dienstplan';
import { heuteIso } from '../../freizeiten/logik';
import { sendePush } from '../../mitteilungen/senden';

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
const morgen = addTage(heute, 1);
const dienst = (o: Partial<Dienst> & { id: string; datum: string }): Dienst => ({ von: '15:00', bis: '19:00', ist_sonder: false, bezeichnung: null, personen: [], wuensche: [], ...o });

const leitung: Szene = { ich: { id: 'lea', kategorie: 'Hauptamtliche*r' }, treffs: [{ treff_id: 't1', rolle: 'treffleitung' }] };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.holeTreffTeam).mockResolvedValue(team);
  vi.mocked(api.listeDienste).mockResolvedValue([]);
  vi.mocked(api.listeFeiertage).mockResolvedValue([]);
  vi.mocked(api.listeSchliesszeiten).mockResolvedValue([]);
  vi.mocked(api.listeAbwesenheiten).mockResolvedValue([]);
  vi.mocked(api.listeVeroeffentlicht).mockResolvedValue([]);
  for (const fn of [api.speichereAbwesenheit, api.loescheAbwesenheiten, api.speichereFeiertag, api.loescheFeiertag, api.setzeZuteilung] as const) {
    vi.mocked(fn as (...a: never[]) => Promise<void>).mockResolvedValue(undefined);
  }
});

const zeige = async (szene: Szene) => {
  renderMitAuth(<AbwesenheitenListe treffId={nord.id} team={team} heute={heute} />, szene);
  await screen.findByRole('button', { name: '+ Abwesenheit eintragen' });
};
const neu = async () => {
  await userEvent.click(screen.getByRole('button', { name: '+ Abwesenheit eintragen' }));
  return screen.findByRole('dialog', { name: 'Abwesenheit eintragen' });
};
const datum = async (fenster: HTMLElement, label: 'Von' | 'Bis', wert: string) => {
  await userEvent.clear(within(fenster).getByLabelText(label));
  await userEvent.type(within(fenster).getByLabelText(label), wert);
};

describe('Abwesenheiten eintragen', () => {
  it('Urlaub für einen Zeitraum (jeder Tag einzeln); „Bis“ folgt einem späteren „Von“', async () => {
    await zeige(leitung);
    const f = await neu();
    await userEvent.selectOptions(within(f).getByLabelText('Person'), 'ben');
    await datum(f, 'Von', addTage(morgen, 5));
    expect(within(f).getByLabelText('Bis')).toHaveValue(addTage(morgen, 5));
    await datum(f, 'Von', morgen);
    await datum(f, 'Bis', addTage(morgen, 2));
    await userEvent.type(within(f).getByLabelText('Notiz (optional)'), 'Familienurlaub');
    await userEvent.click(within(f).getByRole('button', { name: 'Speichern' }));
    expect(api.speichereAbwesenheit).toHaveBeenCalledWith('ben', [morgen, addTage(morgen, 1), addTage(morgen, 2)], 'urlaub', 'Familienurlaub');
  });

  it('Schnellwahl: „Nur dieser Tag“ und „Ganze Woche“ setzen den Zeitraum', async () => {
    await zeige(leitung);
    const f = await neu();
    const gruppe = within(f).getByRole('group', { name: 'Zeitraum schnell wählen' });
    await userEvent.click(within(gruppe).getByRole('button', { name: 'Ganze Woche' }));
    const von = (within(f).getByLabelText('Von') as HTMLInputElement).value;
    expect(new Date(`${von}T12:00:00Z`).getUTCDay()).toBe(1);                                         // ab Montag
    expect(within(f).getByLabelText('Bis')).toHaveValue(addTage(von, 6));
    await userEvent.click(within(gruppe).getByRole('button', { name: '+1 Tag' }));
    expect(within(f).getByLabelText('Bis')).toHaveValue(addTage(von, 7));
  });

  it('„Sonstiges“ verlangt eine Notiz (z. B. Fortbildung)', async () => {
    await zeige(leitung);
    const f = await neu();
    await userEvent.selectOptions(within(f).getByLabelText('Person'), 'ben');
    await datum(f, 'Von', morgen);
    await userEvent.click(within(f).getByRole('button', { name: 'Sonstiges' }));
    await userEvent.click(within(f).getByRole('button', { name: 'Speichern' }));
    expect(within(f).getByText('Bitte angeben, was es ist (z. B. Fortbildung).')).toBeInTheDocument();
    expect(api.speichereAbwesenheit).not.toHaveBeenCalled();
    await userEvent.type(within(f).getByLabelText('Notiz (z. B. Fortbildung)'), 'Fortbildung');
    await userEvent.click(within(f).getByRole('button', { name: 'Speichern' }));
    expect(api.speichereAbwesenheit).toHaveBeenCalledWith('ben', [morgen], 'sonstiges', 'Fortbildung');
  });

  it('prüft Eingaben', async () => {
    await zeige(leitung);
    const f = await neu();
    await userEvent.click(within(f).getByRole('button', { name: 'Speichern' }));
    expect(within(f).getByText('Bitte eine Person wählen.')).toBeInTheDocument();
    expect(api.speichereAbwesenheit).not.toHaveBeenCalled();
  });

  it('betroffene Dienste (ab heute) werden angezeigt und beim Speichern herausgenommen – abgewählte bleiben', async () => {
    vi.mocked(api.listeVeroeffentlicht).mockResolvedValue([{ treff_id: 't1', monat: `${morgen.slice(0, 7)}-01` }]);
    vi.mocked(api.listeDienste).mockResolvedValue([
      dienst({ id: 'd1', datum: morgen, personen: ['ben', 'lea'] }),
      dienst({ id: 's1', datum: addTage(morgen, 1), ist_sonder: true, bezeichnung: 'Fest', personen: ['ben'] }),
      dienst({ id: 'd2', datum: addTage(morgen, 1), personen: ['lea'] }),
    ]);
    await zeige(leitung);
    const f = await neu();
    await userEvent.selectOptions(within(f).getByLabelText('Person'), 'ben');
    await datum(f, 'Von', morgen);
    await datum(f, 'Bis', addTage(morgen, 1));
    const liste = await within(f).findByRole('group', { name: /Ben Baum ist in diesem Zeitraum eingeteilt/ });
    expect(within(liste).getAllByRole('checkbox')).toHaveLength(2);
    await userEvent.click(within(liste).getByRole('checkbox', { name: /Sonderdienst Fest/ }));                // Sonderdienst bleibt
    await userEvent.click(within(f).getByRole('button', { name: 'Speichern und aus einem Dienst herausnehmen' }));
    expect(api.speichereAbwesenheit).toHaveBeenCalledWith('ben', [morgen, addTage(morgen, 1)], 'urlaub', '');
    expect(api.setzeZuteilung).toHaveBeenCalledTimes(1);
    expect(api.setzeZuteilung).toHaveBeenCalledWith('d1', [], ['ben']);
    expect(sendePush).toHaveBeenCalledWith('dienstplan', 't1', { personen: ['ben'] });
  });
});

describe('Abwesenheiten: Übersicht und Ändern', () => {
  it('je Person, Tage zu einem Zeitraum zusammengefasst; Fremde fehlen; Sonstiges mit Notiz', async () => {
    vi.mocked(api.listeAbwesenheiten).mockResolvedValue([
      { id: '1', person_id: 'ben', datum: addTage(heute, 3), typ: 'krank', notiz: null },
      { id: '2', person_id: 'ben', datum: addTage(heute, 4), typ: 'krank', notiz: null },
      { id: '3', person_id: 'fremd', datum: addTage(heute, 3), typ: 'urlaub', notiz: null },
      { id: '4', person_id: 'ich', datum: addTage(heute, 10), typ: 'sonstiges', notiz: 'Fortbildung' },
    ]);
    await zeige(leitung);
    const ben = await screen.findByRole('region', { name: 'Abwesenheiten von Ben Baum' });
    expect(within(ben).getAllByRole('listitem')).toHaveLength(1);
    expect(within(ben).getByText('Krank')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Abwesenheiten von Anna Adler' })).getByText('Fortbildung')).toBeInTheDocument();
    expect(screen.queryByText(/fremd/i)).not.toBeInTheDocument();
  });

  it('ein Eintrag lässt sich antippen und ändern: verkürzen löscht die Tage außerhalb', async () => {
    const t3 = addTage(heute, 3); const t4 = addTage(heute, 4); const t5 = addTage(heute, 5);
    vi.mocked(api.listeAbwesenheiten).mockResolvedValue([
      { id: '1', person_id: 'ben', datum: t3, typ: 'krank', notiz: null },
      { id: '2', person_id: 'ben', datum: t4, typ: 'krank', notiz: null },
      { id: '3', person_id: 'ben', datum: t5, typ: 'krank', notiz: null },
    ]);
    await zeige(leitung);
    await userEvent.click(await screen.findByRole('button', { name: /^Abwesenheit von Ben Baum .* ändern$/ }));
    const f = await screen.findByRole('dialog', { name: 'Abwesenheit ändern' });
    expect(within(f).getByLabelText('Person')).toHaveValue('ben');
    expect(within(f).getByRole('button', { name: 'Krank' })).toHaveAttribute('aria-pressed', 'true');
    await datum(f, 'Bis', t4);
    await userEvent.click(within(f).getByRole('button', { name: 'Speichern' }));
    expect(api.speichereAbwesenheit).toHaveBeenCalledWith('ben', [t3, t4], 'krank', '');
    expect(api.loescheAbwesenheiten).toHaveBeenCalledWith(['3']);
  });

  it('löschen im Fenster entfernt den ganzen Zeitraum (nach Rückfrage)', async () => {
    vi.mocked(api.listeAbwesenheiten).mockResolvedValue([
      { id: '1', person_id: 'ben', datum: addTage(heute, 3), typ: 'urlaub', notiz: null },
      { id: '2', person_id: 'ben', datum: addTage(heute, 4), typ: 'urlaub', notiz: null },
    ]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await zeige(leitung);
    await userEvent.click(await screen.findByRole('button', { name: /^Abwesenheit von Ben Baum .* ändern$/ }));
    const f = await screen.findByRole('dialog', { name: 'Abwesenheit ändern' });
    await userEvent.click(within(f).getByRole('button', { name: 'Löschen' }));
    expect(api.loescheAbwesenheiten).toHaveBeenCalledWith(['1', '2']);
  });

  it('vergangene sind eingeklappt', async () => {
    vi.mocked(api.listeAbwesenheiten).mockResolvedValue([{ id: '1', person_id: 'ben', datum: addTage(heute, -10), typ: 'krank', notiz: null }]);
    await zeige(leitung);
    const knopf = await screen.findByRole('button', { name: 'Vergangene (60 Tage) anzeigen' });
    expect(screen.queryByRole('region', { name: 'Vergangene Abwesenheiten von Ben Baum' })).not.toBeInTheDocument();
    await userEvent.click(knopf);
    expect(screen.getByRole('region', { name: 'Vergangene Abwesenheiten von Ben Baum' })).toBeInTheDocument();
  });
});
