import { describe, it, expect, vi, beforeEach } from 'vitest';
import { axeVerstoesse } from '../../test-a11y';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '../../treffs/api';
import { ApiFehler } from '../../lib/fehler';
import { sendePush } from '../../mitteilungen/senden';
import { DienstplanTab } from './DienstplanTab';
import { renderMitAuth, type Szene } from '../../test-utils';
import { treff, treffMitglied } from '../../test-daten';
import { addTage, montagVon, type Dienst } from '../../treffs/dienstplan';
import { formatKurz, heuteIso } from '../../freizeiten/logik';

vi.mock('../../treffs/api');

// Die Tests blättern in die nächste Woche, damit alle Tage sicher in der Zukunft liegen.
const mo = addTage(montagVon(heuteIso()), 7);
const mi = addTage(mo, 2);
const sa = addTage(mo, 5);

const nord = treff({
  id: 't1', name: 'Treff Nord',
  oeffnungszeiten: [{ wochentag: 1, von: '15:00', bis: '19:00' }, { wochentag: 3, von: '14:00', bis: '18:00' }],
});
const team = [
  treffMitglied({ person_id: 'lea', vorname: 'Lea', nachname: 'Leitner', rolle: 'treffleitung', kategorie: 'Hauptamtliche*r' }),
  treffMitglied({ person_id: 'ich', vorname: 'Anna', nachname: 'Adler' }),
  treffMitglied({ person_id: 'ben', vorname: 'Ben', nachname: 'Baum' }),
];
const dienst = (o: Partial<Dienst> & { id: string; datum: string }): Dienst => ({
  von: '15:00', bis: '19:00', ist_sonder: false, bezeichnung: null, personen: [], wuensche: [], ...o,
});

const betreuerin: Szene = { ich: { kategorie: 'TZK' }, treffs: [{ treff_id: 't1', rolle: 'betreuerin' }] };
const leitung: Szene = { ich: { id: 'lea', kategorie: 'Hauptamtliche*r' }, treffs: [{ treff_id: 't1', rolle: 'treffleitung' }] };

async function zeige(szene: Szene, rolle: 'betreuerin' | 'treffleitung' | 'koordination' = 'betreuerin') {
  renderMitAuth(<DienstplanTab treff={nord} rolle={rolle} />, szene);
  await screen.findByText(/KW \d+/);
  await userEvent.click(screen.getByRole('button', { name: 'Nächste Woche' }));
  await screen.findByRole('region', { name: `Dienst am ${formatKurz(mo)}` });
}
const tag = (d: string) => screen.getByRole('region', { name: `Dienst am ${formatKurz(d)}` });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.holeTreffTeam).mockResolvedValue(team);
  vi.mocked(api.listeDienste).mockResolvedValue([]);
  vi.mocked(api.listeFeiertage).mockResolvedValue([]);
  vi.mocked(api.listeSchliesszeiten).mockResolvedValue([]);
  vi.mocked(api.listeAbwesenheiten).mockResolvedValue([]);
  vi.mocked(api.listeTreffAbsprachen).mockResolvedValue([]);
  vi.mocked(api.listeDienstplanKommentare).mockResolvedValue([]);
  for (const fn of [api.wuenscheDienst, api.wunschZuruecknehmen, api.entscheideWunsch, api.setzeZuteilung, api.speichereSonderdienst, api.loescheDienst,
    api.legeDienstplanKommentarAn, api.loescheDienstplanKommentar] as const) {
    vi.mocked(fn as (...a: never[]) => Promise<void>).mockResolvedValue(undefined);
  }
  vi.mocked(api.dienstSicherstellen).mockResolvedValue('neuer-dienst');
});

describe('Dienstplan: Anzeige', () => {
  it('zeigt die Öffnungstage der Woche mit Zeit und Eingeteilten', async () => {
    vi.mocked(api.listeDienste).mockResolvedValue([dienst({ id: 'd1', datum: mo, personen: ['lea', 'ben'] })]);
    await zeige(betreuerin);
    const k = tag(mo);
    expect(within(k).getByText('Lea Leitner')).toBeInTheDocument();
    expect(within(k).getByText('Ben Baum')).toBeInTheDocument();
    expect(k).toHaveTextContent('15:00–19:00 Uhr');
    expect(within(tag(mi)).getByText('Noch niemand eingeteilt')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: `Dienst am ${formatKurz(addTage(mo, 1))}` })).not.toBeInTheDocument();   // Dienstag: zu
  });

  it('die Wochen lassen sich blättern, „Zur aktuellen Woche“ springt zurück', async () => {
    await zeige(betreuerin);
    expect(api.listeDienste).toHaveBeenLastCalledWith('t1', mo, addTage(mo, 6));
    await userEvent.click(screen.getByRole('button', { name: 'Vorherige Woche' }));
    await userEvent.click(screen.getByRole('button', { name: 'Vorherige Woche' }));
    expect(api.listeDienste).toHaveBeenLastCalledWith('t1', addTage(mo, -14), addTage(mo, -8));
    await userEvent.click(screen.getByRole('button', { name: 'Zur aktuellen Woche' }));
    expect(api.listeDienste).toHaveBeenLastCalledWith('t1', addTage(mo, -7), addTage(mo, -1));
  });

  it('zeigt Feiertag, Absprache am Tag und Abwesende', async () => {
    vi.mocked(api.listeFeiertage).mockResolvedValue([{ id: 'f', treff_id: null, datum: mo, bezeichnung: 'Tag der Arbeit' }]);
    vi.mocked(api.listeTreffAbsprachen).mockResolvedValue([
      { id: 'a', art: 'absprache', geltung: 'tag', datum: mi, text: 'Schlüssel', erstellt_von: 'lea', created_at: '2027-01-01T10:00:00Z', bestaetigungen: [], kommentare: [] },
    ]);
    vi.mocked(api.listeAbwesenheiten).mockResolvedValue([{ id: 'x', person_id: 'ben', datum: mi, typ: 'urlaub', notiz: null }]);
    await zeige(leitung, 'treffleitung');
    expect(within(tag(mo)).getByText('Feiertag: Tag der Arbeit')).toBeInTheDocument();
    expect(within(tag(mi)).getByText(/Absprache/)).toBeInTheDocument();
    expect(within(tag(mi)).getByText('Ben Baum: Urlaub')).toBeInTheDocument();
  });

  it('Sonderdienst erscheint auch an einem Schließtag', async () => {
    vi.mocked(api.listeDienste).mockResolvedValue([dienst({ id: 's', datum: sa, ist_sonder: true, bezeichnung: 'Sommerfest', von: '10:00', bis: '16:00', personen: ['ich'] })]);
    await zeige(betreuerin);
    const k = tag(sa);
    expect(k).toHaveTextContent('Sonderdienst: Sommerfest');
    expect(k).toHaveTextContent('10:00–16:00 Uhr');
    expect(within(k).getByText('Anna Adler')).toBeInTheDocument();
  });

  it('meldet Ladefehler', async () => {
    vi.mocked(api.listeDienste).mockRejectedValue(new Error('kaputt'));
    renderMitAuth(<DienstplanTab treff={nord} rolle="betreuerin" />, betreuerin);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});

describe('Dienstplan: Wünsche der BetreuerInnen', () => {
  it('wünscht einen Tag; Zuteilen und Sonderdienst gibt es nicht', async () => {
    await zeige(betreuerin);
    expect(screen.queryByRole('button', { name: 'Zuteilen' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ Sonderdienst' })).not.toBeInTheDocument();
    await userEvent.click(within(tag(mi)).getByRole('button', { name: 'Dienst wünschen' }));
    expect(api.wuenscheDienst).toHaveBeenCalledWith('t1', mi);
  });

  it('zeigt den Stand des Wunsches und erlaubt das Zurücknehmen eines offenen', async () => {
    vi.mocked(api.listeDienste).mockResolvedValue([
      dienst({ id: 'd1', datum: mo, wuensche: [{ person_id: 'ich', status: 'offen' }] }),
      dienst({ id: 'd2', datum: mi, wuensche: [{ person_id: 'ich', status: 'abgelehnt' }] }),
    ]);
    await zeige(betreuerin);
    expect(within(tag(mo)).getByText('Wunsch offen')).toBeInTheDocument();
    expect(within(tag(mo)).queryByRole('button', { name: 'Dienst wünschen' })).not.toBeInTheDocument();
    await userEvent.click(within(tag(mo)).getByRole('button', { name: 'Wunsch zurücknehmen' }));
    expect(api.wunschZuruecknehmen).toHaveBeenCalledWith('d1', 'ich');
    expect(within(tag(mi)).getByText('Wunsch abgelehnt')).toBeInTheDocument();
    expect(within(tag(mi)).getByRole('button', { name: 'Dienst wünschen' })).toBeInTheDocument();   // nach Ablehnung erneut möglich
  });

  it('wer schon eingeteilt ist, sieht keinen Wunsch-Knopf', async () => {
    vi.mocked(api.listeDienste).mockResolvedValue([dienst({ id: 'd1', datum: mo, personen: ['ich'] })]);
    await zeige(betreuerin);
    expect(within(tag(mo)).queryByRole('button', { name: 'Dienst wünschen' })).not.toBeInTheDocument();
  });

  it('zeigt Fehler der Datenbank', async () => {
    vi.mocked(api.wuenscheDienst).mockRejectedValue(new ApiFehler({ code: '23514', message: 'Du bist an diesem Tag schon eingeteilt' }));
    await zeige(betreuerin);
    await userEvent.click(within(tag(mo)).getByRole('button', { name: 'Dienst wünschen' }));
    expect(await screen.findByText(/schon eingeteilt/)).toBeInTheDocument();
  });
});

describe('Dienstplan: Treffleitung', () => {
  it('beantwortet Wünsche', async () => {
    vi.mocked(api.listeDienste).mockResolvedValue([dienst({ id: 'd1', datum: mo, wuensche: [{ person_id: 'ben', status: 'offen' }, { person_id: 'ich', status: 'bestaetigt' }] })]);
    await zeige(leitung, 'treffleitung');
    expect(screen.getByText('Ein offener Dienstwunsch in dieser Woche.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Wunsch von Ben Baum bestätigen' }));
    expect(api.entscheideWunsch).toHaveBeenCalledWith('d1', 'ben', true);
    await userEvent.click(screen.getByRole('button', { name: 'Wunsch von Ben Baum ablehnen' }));
    expect(api.entscheideWunsch).toHaveBeenCalledWith('d1', 'ben', false);
    expect(screen.queryByRole('button', { name: /Wunsch von Anna Adler/ })).not.toBeInTheDocument();   // schon beantwortet
  });

  it('teilt an einem Tag ohne Dienst zu: der Dienst wird erst beim Speichern angelegt', async () => {
    await zeige(leitung, 'treffleitung');
    await userEvent.click(within(tag(mi)).getByRole('button', { name: 'Zuteilen' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByLabelText(/Ben Baum/));
    await userEvent.click(within(dialog).getByLabelText(/Lea Leitner/));
    expect(api.dienstSicherstellen).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Speichern' }));
    expect(api.dienstSicherstellen).toHaveBeenCalledWith('t1', mi);
    expect(api.setzeZuteilung).toHaveBeenCalledWith('neuer-dienst', ['ben', 'lea'], []);
  });

  it('ändert die Zuteilung eines bestehenden Dienstes (nur die Differenz)', async () => {
    vi.mocked(api.listeDienste).mockResolvedValue([dienst({ id: 'd1', datum: mo, personen: ['lea', 'ben'] })]);
    await zeige(leitung, 'treffleitung');
    await userEvent.click(within(tag(mo)).getByRole('button', { name: 'Zuteilen' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText(/Ben Baum/)).toBeChecked();
    await userEvent.click(within(dialog).getByLabelText(/Ben Baum/));
    await userEvent.click(within(dialog).getByLabelText(/Anna Adler/));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Speichern' }));
    expect(api.dienstSicherstellen).not.toHaveBeenCalled();
    expect(api.setzeZuteilung).toHaveBeenCalledWith('d1', ['ich'], ['ben']);
  });

  it('markiert Abwesende im Zuteilungsfenster', async () => {
    vi.mocked(api.listeAbwesenheiten).mockResolvedValue([{ id: 'x', person_id: 'ben', datum: mo, typ: 'krank', notiz: null }]);
    await zeige(leitung, 'treffleitung');
    await userEvent.click(within(tag(mo)).getByRole('button', { name: 'Zuteilen' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/abwesend: krank/)).toBeInTheDocument();
  });

  it('Feiertag (seit 0027): Tag ist zu – Schild, kein Zuteilen, kein Wünschen', async () => {
    vi.mocked(api.listeFeiertage).mockResolvedValue([{ id: 'f', treff_id: 't1', datum: mo, bezeichnung: 'Feiertag X' }]);
    await zeige(leitung, 'treffleitung');
    expect(await within(tag(mo)).findByText('Feiertag: Feiertag X')).toBeInTheDocument();
    expect(within(tag(mo)).queryByRole('button', { name: 'Zuteilen' })).not.toBeInTheDocument();
  });

  it('meldet Fehler beim Speichern und lässt das Fenster offen', async () => {
    vi.mocked(api.setzeZuteilung).mockRejectedValue(new ApiFehler({ code: '23514', message: 'Die Person gehört nicht zu diesem Treff' }));
    await zeige(leitung, 'treffleitung');
    await userEvent.click(within(tag(mo)).getByRole('button', { name: 'Zuteilen' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByLabelText(/Ben Baum/));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Speichern' }));
    expect(await within(dialog).findByText(/gehört nicht zu diesem Treff/)).toBeInTheDocument();
  });

  it('legt einen Sonderdienst an und prüft vorher die Eingabe', async () => {
    await zeige(leitung, 'treffleitung');
    await userEvent.click(screen.getByRole('button', { name: '+ Sonderdienst' }));
    const dialog = await screen.findByRole('dialog', { name: 'Neuer Sonderdienst' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Speichern' }));
    expect(within(dialog).getByText('Bitte eine Bezeichnung angeben.')).toBeInTheDocument();
    expect(api.speichereSonderdienst).not.toHaveBeenCalled();
    await userEvent.type(within(dialog).getByLabelText('Bezeichnung'), 'Sommerfest');
    await userEvent.click(within(dialog).getByLabelText(/Ben Baum/));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Speichern' }));
    expect(api.speichereSonderdienst).toHaveBeenCalledTimes(1);
    const [treffId, id, w, personen, alt] = vi.mocked(api.speichereSonderdienst).mock.calls[0]!;
    expect([treffId, id, personen, alt]).toEqual(['t1', null, ['ben'], []]);
    expect(w).toMatchObject({ bezeichnung: 'Sommerfest', von: '15:00', bis: '19:00' });
  });

  it('bearbeitet und löscht einen Sonderdienst', async () => {
    vi.mocked(api.listeDienste).mockResolvedValue([dienst({ id: 's', datum: sa, ist_sonder: true, bezeichnung: 'Fest', von: '10:00', bis: '12:00', personen: ['ben'] })]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await zeige(leitung, 'treffleitung');
    await userEvent.click(within(tag(sa)).getByRole('button', { name: 'Bearbeiten' }));
    const dialog = await screen.findByRole('dialog', { name: 'Sonderdienst bearbeiten' });
    expect(within(dialog).getByLabelText('Bezeichnung')).toHaveValue('Fest');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Löschen' }));
    expect(api.loescheDienst).toHaveBeenCalledWith('s');
  });
});

describe('Dienstplan: Kommentare', () => {
  beforeEach(() => {
    vi.mocked(api.listeDienstplanKommentare).mockResolvedValue([
      { id: 'k1', person_id: 'ich', text: 'Eigener', created_at: '2027-01-01T10:00:00Z' },
      { id: 'k2', person_id: 'ben', text: 'Von Ben', created_at: '2027-01-01T11:00:00Z' },
    ]);
  });

  it('BetreuerIn löscht nur den eigenen Kommentar', async () => {
    await zeige(betreuerin);
    expect(await screen.findByText('Von Ben')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Kommentar löschen' })).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Kommentar löschen' }));
    expect(api.loescheDienstplanKommentar).toHaveBeenCalledWith('k1');
  });

  it('Treffleitung löscht alle', async () => {
    await zeige(leitung, 'treffleitung');
    await screen.findByText('Von Ben');
    expect(screen.getAllByRole('button', { name: 'Kommentar löschen' })).toHaveLength(2);
  });

  it('schreibt einen Kommentar zur angezeigten Woche', async () => {
    await zeige(betreuerin);
    await userEvent.type(screen.getByLabelText('Kommentar schreiben'), '  Bitte Schlüssel holen ');
    await userEvent.click(screen.getByRole('button', { name: 'Kommentar senden' }));
    expect(api.legeDienstplanKommentarAn).toHaveBeenCalledWith('t1', mo, 'ich', '  Bitte Schlüssel holen ');
  });
});

describe('Dienstplan: Mitteilungen werden ausgelöst', () => {
  it('Dienstwunsch: die Treffleitung bekommt eine Mitteilung (mit dem Tag)', async () => {
    await zeige(betreuerin);
    await userEvent.click(within(tag(mi)).getByRole('button', { name: 'Dienst wünschen' }));
    expect(sendePush).toHaveBeenCalledWith('wunsch_neu', 't1', { datum: mi });
    expect(sendePush).toHaveBeenCalledTimes(1);
  });

  it('gescheiterter Wunsch: keine Mitteilung', async () => {
    vi.mocked(api.wuenscheDienst).mockRejectedValue(new ApiFehler({ code: '23514', message: 'Du bist an diesem Tag schon eingeteilt' }));
    await zeige(betreuerin);
    await userEvent.click(within(tag(mo)).getByRole('button', { name: 'Dienst wünschen' }));
    await screen.findByText(/schon eingeteilt/);
    expect(sendePush).not.toHaveBeenCalled();
  });

  it('Wunsch bestätigt oder abgelehnt: die Person bekommt eine Mitteilung', async () => {
    vi.mocked(api.listeDienste).mockResolvedValue([dienst({ id: 'd1', datum: mo, wuensche: [{ person_id: 'ben', status: 'offen' }] })]);
    await zeige(leitung, 'treffleitung');
    await userEvent.click(screen.getByRole('button', { name: 'Wunsch von Ben Baum bestätigen' }));
    expect(sendePush).toHaveBeenCalledWith('wunsch_antwort', 'd1', { person: 'ben' });
    await userEvent.click(screen.getByRole('button', { name: 'Wunsch von Ben Baum ablehnen' }));
    expect(sendePush).toHaveBeenCalledTimes(2);
  });

  it('Zuteilung: nur wer neu eingeteilt oder herausgenommen wurde, wird benachrichtigt', async () => {
    vi.mocked(api.listeDienste).mockResolvedValue([dienst({ id: 'd1', datum: mo, personen: ['lea', 'ben'] })]);
    await zeige(leitung, 'treffleitung');
    await userEvent.click(within(tag(mo)).getByRole('button', { name: 'Zuteilen' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByLabelText(/Ben Baum/));          // heraus
    await userEvent.click(within(dialog).getByLabelText(/Anna Adler/));        // neu
    await userEvent.click(within(dialog).getByRole('button', { name: 'Speichern' }));
    await vi.waitFor(() => expect(sendePush).toHaveBeenCalledWith('dienstplan', 't1', { personen: ['ich', 'ben'] }));
  });

  it('Zuteilung ohne Änderung: keine Mitteilung', async () => {
    vi.mocked(api.listeDienste).mockResolvedValue([dienst({ id: 'd1', datum: mo, personen: ['lea'] })]);
    await zeige(leitung, 'treffleitung');
    await userEvent.click(within(tag(mo)).getByRole('button', { name: 'Zuteilen' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Speichern' }));
    await vi.waitFor(() => expect(api.setzeZuteilung).toHaveBeenCalled());
    expect(sendePush).not.toHaveBeenCalled();
  });

  it('Sonderdienst anlegen: die Eingeteilten werden benachrichtigt; löschen: die bisher Eingeteilten', async () => {
    vi.mocked(api.listeDienste).mockResolvedValue([dienst({ id: 's', datum: sa, ist_sonder: true, bezeichnung: 'Fest', von: '10:00', bis: '12:00', personen: ['ben'] })]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await zeige(leitung, 'treffleitung');
    await userEvent.click(screen.getByRole('button', { name: '+ Sonderdienst' }));
    const neu = await screen.findByRole('dialog', { name: 'Neuer Sonderdienst' });
    await userEvent.type(within(neu).getByLabelText('Bezeichnung'), 'Aufbau');
    await userEvent.click(within(neu).getByLabelText(/Anna Adler/));
    await userEvent.click(within(neu).getByRole('button', { name: 'Speichern' }));
    await vi.waitFor(() => expect(sendePush).toHaveBeenCalledWith('dienstplan', 't1', { personen: ['ich'] }));

    await userEvent.click(within(tag(sa)).getByRole('button', { name: 'Bearbeiten' }));
    const bearbeiten = await screen.findByRole('dialog', { name: 'Sonderdienst bearbeiten' });
    await userEvent.click(within(bearbeiten).getByRole('button', { name: 'Löschen' }));
    await vi.waitFor(() => expect(sendePush).toHaveBeenCalledWith('dienstplan', 't1', { personen: ['ben'] }));
  });

  it('Kommentar: das Team bekommt eine Mitteilung', async () => {
    vi.mocked(api.legeDienstplanKommentarAn).mockResolvedValue('k-neu');
    await zeige(betreuerin);
    await userEvent.type(screen.getByLabelText('Kommentar schreiben'), 'Hallo');
    await userEvent.click(screen.getByRole('button', { name: 'Kommentar senden' }));
    await vi.waitFor(() => expect(sendePush).toHaveBeenCalledWith('dienstplan_kommentar', 'k-neu'));
  });
});

describe('Barrierefreiheit (axe)', () => {
  it('keine Verstöße gegen gängige Regeln', async () => {
    vi.mocked(api.listeDienste).mockResolvedValue([dienst({ id: 'd1', datum: mo, personen: ['lea', 'ben'] })]);
    await zeige(betreuerin);
    tag(mo);
    expect(await axeVerstoesse(document.body)).toEqual([]);
  });
});
