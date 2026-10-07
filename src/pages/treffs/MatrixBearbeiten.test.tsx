import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '../../treffs/api';
import { sendePush } from '../../mitteilungen/senden';
import { MonatTab } from './MonatTab';
import { renderMitAuth, type Szene } from '../../test-utils';
import { treff, treffMitglied } from '../../test-daten';
import { isoWochentag, monatErster, monatTage, monatText, monatVersatz, type Dienst } from '../../treffs/dienstplan';
import { heuteIso } from '../../freizeiten/logik';
import { axeVerstoesse } from '../../test-a11y';

vi.mock('../../treffs/api');

const nord = treff({ id: 't1', name: 'Treff Nord', oeffnungszeiten: [{ wochentag: 1, von: '15:00', bis: '19:00' }, { wochentag: 3, von: '14:00', bis: '18:00' }] });
const team = [
  treffMitglied({ person_id: 'lea', vorname: 'Lea', nachname: 'Leitner', rolle: 'treffleitung', kategorie: 'Hauptamtliche*r' }),
  { ...treffMitglied({ person_id: 'ben', vorname: 'Ben', nachname: 'Baum' }), tzk_max_stunden: 10 },
];
const monat = monatErster(heuteIso());
const montage = monatTage(monat).filter((d) => isoWochentag(d) === 1);
const mittwoche = monatTage(monat).filter((d) => isoWochentag(d) === 3);
const tagLabel = (d: string) => `${['', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'][isoWochentag(d)]} ${Number(d.slice(8, 10))}.`;
const dienst = (o: Partial<Dienst> & { id: string; datum: string }): Dienst => ({ von: '15:00', bis: '19:00', ist_sonder: false, bezeichnung: null, personen: [], wuensche: [], ...o });

const leitung: Szene = { ich: { id: 'lea', kategorie: 'Hauptamtliche*r' }, treffs: [{ treff_id: 't1', rolle: 'treffleitung' }] };
const betreuerin: Szene = { ich: { kategorie: 'TZK' }, treffs: [{ treff_id: 't1', rolle: 'betreuerin' }] };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.holeTreffTeam).mockResolvedValue(team);
  vi.mocked(api.listeDienste).mockResolvedValue([dienst({ id: 'd1', datum: montage[0]!, personen: ['lea'] })]);
  vi.mocked(api.listeFeiertage).mockResolvedValue([]);
  vi.mocked(api.listeAbwesenheiten).mockResolvedValue([]);
  vi.mocked(api.dienstStatistik).mockResolvedValue([]);
  vi.mocked(api.wendeDienstplanAn).mockResolvedValue({ zugeteilt: 1, entfernt: 1 });
});

const oeffne = async () => {
  renderMitAuth(<MonatTab treff={nord} rolle="treffleitung" />, leitung);
  await userEvent.click(await screen.findByRole('button', { name: 'In der Tabelle einteilen' }));
};
const zelle = (name: string, datum: string) => screen.getByRole('button', { name: new RegExp(`^${name}, ${tagLabel(datum).replace('.', '\\.')}`) });

describe('Einsatz-Matrix bearbeiten (Monat)', () => {
  it('nur Treffleitung und Koordination sehen den Bearbeiten-Knopf', async () => {
    renderMitAuth(<MonatTab treff={nord} rolle="betreuerin" />, betreuerin);
    await screen.findByText(monatText(monat));
    await screen.findByRole('table', { name: /an welchen Tagen eingeteilt/ });
    expect(screen.queryByRole('button', { name: 'In der Tabelle einteilen' })).not.toBeInTheDocument();
  });

  it('Klick teilt ein oder nimmt heraus; erst Speichern schickt alles in einem Schritt', async () => {
    await oeffne();
    await userEvent.click(zelle('Ben Baum', mittwoche[0]!));
    await userEvent.click(zelle('Lea Leitner', montage[0]!));
    expect(zelle('Ben Baum', mittwoche[0]!)).toHaveAttribute('aria-pressed', 'true');
    expect(zelle('Lea Leitner', montage[0]!)).toHaveAccessibleName(/wird herausgenommen/);
    expect(screen.getByText('1 neue Einteilung, 1 herausgenommen')).toBeInTheDocument();
    expect(api.wendeDienstplanAn).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(api.wendeDienstplanAn).toHaveBeenCalledWith('t1', monat, [{ datum: mittwoche[0], person: 'ben' }], [{ datum: montage[0], person: 'lea' }]);
    expect(await screen.findByText('1 Einteilung gespeichert, 1 Einteilung entfernt.')).toBeInTheDocument();
    expect(sendePush).toHaveBeenCalledWith('dienstplan', 't1', { personen: ['ben', 'lea'] });
    expect(screen.getByRole('button', { name: 'In der Tabelle einteilen' })).toBeInTheDocument();
  });

  it('Klick auf den Namen füllt die Zeile, ein zweiter leert sie; Urlaub wird ausgelassen', async () => {
    vi.mocked(api.listeAbwesenheiten).mockResolvedValue([{ id: 'u', person_id: 'ben', datum: montage[1]!, typ: 'urlaub', notiz: null }]);
    await oeffne();
    await userEvent.click(screen.getByRole('button', { name: /Ben Baum: an allen Öffnungstagen/ }));
    const offen = montage.length + mittwoche.length;
    expect(screen.getByText(`${offen - 1} neue Einteilungen`)).toBeInTheDocument();
    expect(screen.getByText(/Ben Baum: ein Tag mit Urlaub, Krankheit oder Feiertag ausgelassen/)).toBeInTheDocument();
    expect(zelle('Ben Baum', montage[1]!)).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(zelle('Ben Baum', montage[1]!));                                          // einzeln: trotzdem einteilen
    expect(zelle('Ben Baum', montage[1]!)).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: /Ben Baum: an allen Öffnungstagen/ }));
    expect(screen.getByText('Noch keine Änderungen.')).toBeInTheDocument();
  });

  it('Ziehen mit der Maus teilt mehrere Tage ein', async () => {
    await oeffne();
    const start = zelle('Ben Baum', montage[0]!);
    const ziel = zelle('Ben Baum', mittwoche[0]!);
    const vorher = document.elementFromPoint;
    document.elementFromPoint = () => ziel;
    try {
      fireEvent.pointerDown(start, { pointerType: 'mouse', button: 0 });
      fireEvent.pointerMove(start, { pointerType: 'mouse', clientX: 10, clientY: 10 });
      fireEvent.pointerUp(window);
    } finally { document.elementFromPoint = vorher; }
    expect(zelle('Ben Baum', montage[0]!)).toHaveAttribute('aria-pressed', 'true');
    expect(zelle('Ben Baum', mittwoche[0]!)).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('2 neue Einteilungen')).toBeInTheDocument();
  });

  it('zeigt die Stunden nach dem Entwurf und warnt über den Höchststunden', async () => {
    await oeffne();
    const zeile = () => within(screen.getByRole('table', { name: /an welchen Tagen eingeteilt/ })).getByRole('row', { name: /^Ben Baum/ });
    const stunden = () => within(zeile()).getAllByRole('cell').at(-1)!;
    expect(stunden()).toHaveTextContent(/^0 h$/);
    await userEvent.click(zelle('Ben Baum', montage[0]!));
    expect(stunden()).toHaveTextContent('4 h (+4 h)');
    expect(stunden()).not.toHaveClass('einsatz__zuviel');
    await userEvent.click(zelle('Ben Baum', mittwoche[0]!));
    await userEvent.click(zelle('Ben Baum', montage[1]!));
    expect(stunden()).toHaveTextContent('12 h (+12 h) – mehr als die höchstens 10 h');
    expect(stunden()).toHaveClass('einsatz__zuviel');
  });

  it('Verwerfen, Fertig mit Rückfrage und Blättern mit Rückfrage', async () => {
    await oeffne();
    await userEvent.click(zelle('Ben Baum', mittwoche[0]!));
    await userEvent.click(screen.getByRole('button', { name: 'Änderungen verwerfen' }));
    expect(screen.getByText('Noch keine Änderungen.')).toBeInTheDocument();

    await userEvent.click(zelle('Ben Baum', mittwoche[0]!));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await userEvent.click(screen.getByRole('button', { name: 'Nächster Monat' }));
    expect(screen.getByText(monatText(monat))).toBeInTheDocument();                                // abgebrochen: bleibt
    await userEvent.click(screen.getByRole('button', { name: 'Fertig' }));
    expect(screen.getByRole('button', { name: 'Speichern' })).toBeInTheDocument();
    confirm.mockReturnValue(true);
    await userEvent.click(screen.getByRole('button', { name: 'Fertig' }));
    expect(screen.getByRole('button', { name: 'In der Tabelle einteilen' })).toBeInTheDocument();
    expect(api.wendeDienstplanAn).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it('Fehler beim Speichern: Entwurf bleibt erhalten', async () => {
    vi.mocked(api.wendeDienstplanAn).mockRejectedValue(new Error('Person gehört nicht zu diesem Treff'));
    await oeffne();
    await userEvent.click(zelle('Ben Baum', mittwoche[0]!));
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(zelle('Ben Baum', mittwoche[0]!)).toHaveAttribute('aria-pressed', 'true');
  });

  it('Vormonat übernehmen: lädt den Vormonat und übernimmt ihn in den Entwurf', async () => {
    const vor = monatVersatz(monat, -1);
    const vorMontag = monatTage(vor).find((d) => isoWochentag(d) === 1)!;
    vi.mocked(api.listeDienste).mockImplementation(async (_t, von) => (von === vor
      ? [dienst({ id: 'v1', datum: vorMontag, personen: ['ben', 'weg'] })]
      : [dienst({ id: 'd1', datum: montage[0]!, personen: ['lea'] })]));
    await oeffne();
    await userEvent.click(screen.getByRole('button', { name: `${monatText(vor)} übernehmen` }));
    expect(await screen.findByText(`${monatText(vor)} übernommen: 1 Einteilung dazu.`)).toBeInTheDocument();
    expect(zelle('Ben Baum', montage[0]!)).toHaveAttribute('aria-pressed', 'true');
    expect(api.wendeDienstplanAn).not.toHaveBeenCalled();                                         // nur Entwurf
  });

  it('Woche kopieren: die gewählte Woche kommt in den folgenden Wochen dazu', async () => {
    await oeffne();
    await userEvent.click(zelle('Ben Baum', mittwoche[0]!));
    const erste = screen.getByRole('combobox', { name: 'Woche, deren Einteilung kopiert wird' });
    expect(erste).toHaveValue(within(erste).getAllByRole('option')[0]!.getAttribute('value'));
    // Woche des ersten Mittwochs wählen (kann im Monat die erste oder zweite Woche sein)
    const montagDerWoche = within(erste).getAllByRole('option').map((o) => o.getAttribute('value')!).filter((m) => m <= mittwoche[0]!).at(-1)!;
    await userEvent.selectOptions(erste, montagDerWoche);
    await userEvent.click(screen.getByRole('button', { name: 'auf die folgenden Wochen kopieren' }));
    for (const m of mittwoche.slice(1)) expect(zelle('Ben Baum', m)).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('status')).toHaveTextContent(/kopiert: \d+ Einteilungen? dazu/);
  });

  it('offene Wünsche des Monats gesammelt bestätigen; Konflikte bleiben offen', async () => {
    vi.mocked(api.bestaetigeWuensche).mockResolvedValue(1);
    vi.mocked(api.listeDienste).mockResolvedValue([
      dienst({ id: 'd1', datum: montage[0]!, personen: ['lea'], wuensche: [{ person_id: 'ben', status: 'offen' }] }),
      dienst({ id: 'd2', datum: montage[1]!, wuensche: [{ person_id: 'ben', status: 'offen' }] }),
    ]);
    vi.mocked(api.listeAbwesenheiten).mockResolvedValue([{ id: 'k', person_id: 'ben', datum: montage[1]!, typ: 'krank', notiz: null }]);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderMitAuth(<MonatTab treff={nord} rolle="treffleitung" />, leitung);
    await userEvent.click(await screen.findByRole('button', { name: 'Offenen Wunsch bestätigen' }));
    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/Den offenen Wunsch im Monat bestätigen/));
    expect(api.bestaetigeWuensche).toHaveBeenCalledWith('t1', [{ dienst: 'd1', person: 'ben', datum: montage[0] }]);
    expect(await screen.findByText('Ein Wunsch bestätigt.')).toBeInTheDocument();
    expect(sendePush).toHaveBeenCalledWith('dienstplan', 't1', { personen: ['ben'] });
    expect(screen.getByText(/Ein offener Wunsch an einem Tag mit Urlaub, Krankheit oder Feiertag – bitte einzeln entscheiden/)).toBeInTheDocument();
    confirm.mockRestore();
  });

  it('Barrierefreiheit (axe): keine Verstöße im Bearbeiten-Modus', async () => {
    await oeffne();
    await userEvent.click(zelle('Ben Baum', mittwoche[0]!));
    const karte = screen.getByRole('heading', { name: 'Wer arbeitet wann' }).closest('section, div')!;
    expect(await axeVerstoesse(karte as HTMLElement)).toEqual([]);
  });
});
