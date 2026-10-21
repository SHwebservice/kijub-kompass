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
import { addTage, monatErster, montagVon, type Dienst } from '../../treffs/dienstplan';
import { formatDatum, formatKurz, heuteIso } from '../../freizeiten/logik';

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

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const tagKnopf = (d: string) => screen.getByRole('button', { name: new RegExp(`^${esc(formatKurz(d))} öffnen`) });

async function zeige(szene: Szene, rolle: 'betreuerin' | 'treffleitung' | 'koordination' = 'betreuerin') {
  renderMitAuth(<DienstplanTab treff={nord} rolle={rolle} />, szene);
  await screen.findByText(/KW \d+/);
  await userEvent.click(screen.getByRole('button', { name: 'Nächste Woche' }));
  await screen.findByRole('button', { name: new RegExp(`^${esc(formatKurz(mo))} öffnen`) });
}
/** Öffnet das Tagesfenster über die Kopfzeile der Tabelle. */
async function tag(d: string) {
  await userEvent.click(tagKnopf(d));
  return screen.findByRole('dialog', { name: new RegExp(esc(formatDatum(d))) });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.holeTreffTeam).mockResolvedValue(team);
  vi.mocked(api.listeDienste).mockResolvedValue([]);
  vi.mocked(api.listeFeiertage).mockResolvedValue([]);
  vi.mocked(api.listeSchliesszeiten).mockResolvedValue([]);
  vi.mocked(api.listeAbwesenheiten).mockResolvedValue([]);
  vi.mocked(api.listeTreffAbsprachen).mockResolvedValue([]);
  vi.mocked(api.listeDienstplanKommentare).mockResolvedValue([]);
  vi.mocked(api.listeVerhinderungen).mockResolvedValue([]);
  // Beide Monate der Woche sind veröffentlicht (sonst gehen bei Änderungen keine Mitteilungen raus)
  vi.mocked(api.listeVeroeffentlicht).mockResolvedValue([{ treff_id: 't1', monat: monatErster(mo) }, { treff_id: 't1', monat: monatErster(addTage(mo, 6)) }]);
  vi.mocked(api.holeDiensteGesehen).mockResolvedValue(null);
  for (const fn of [api.wuenscheDienst, api.wunschZuruecknehmen, api.entscheideWunsch, api.setzeZuteilung, api.speichereSonderdienst, api.loescheDienst,
    api.legeDienstplanKommentarAn, api.loescheDienstplanKommentar, api.trageVerhinderungEin, api.nimmVerhinderungZurueck, api.merkeDiensteGesehen] as const) {
    vi.mocked(fn as (...a: never[]) => Promise<void>).mockResolvedValue(undefined);
  }
  vi.mocked(api.dienstSicherstellen).mockResolvedValue('neuer-dienst');
});

describe('Dienstplan: Anzeige', () => {
  it('die Tabelle zeigt die Öffnungstage als Spalten; das Tagesfenster zeigt Zeit und Eingeteilte', async () => {
    vi.mocked(api.listeDienste).mockResolvedValue([dienst({ id: 'd1', datum: mo, personen: ['lea', 'ben'] })]);
    await zeige(betreuerin);
    expect(screen.queryByRole('button', { name: new RegExp(`^${esc(formatKurz(addTage(mo, 1)))} öffnen`) })).not.toBeInTheDocument();   // Dienstag: zu
    const k = await tag(mo);
    expect(within(k).getByText('Lea Leitner')).toBeInTheDocument();
    expect(within(k).getByText('Ben Baum')).toBeInTheDocument();
    expect(k).toHaveTextContent('15:00–19:00');
    await userEvent.click(within(k).getByRole('button', { name: 'Schließen' }));
    expect(within(await tag(mi)).getByText('Noch niemand eingeteilt')).toBeInTheDocument();
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

  it('zeigt Feiertag, Absprache am Tag und Abwesende im Tagesfenster', async () => {
    vi.mocked(api.listeFeiertage).mockResolvedValue([{ id: 'f', treff_id: null, datum: mo, bezeichnung: 'Tag der Arbeit' }]);
    vi.mocked(api.listeTreffAbsprachen).mockResolvedValue([
      { id: 'a', art: 'absprache', geltung: 'tag', datum: mi, text: 'Schlüssel', erstellt_von: 'lea', created_at: '2027-01-01T10:00:00Z', bestaetigungen: [], kommentare: [] },
    ]);
    vi.mocked(api.listeAbwesenheiten).mockResolvedValue([{ id: 'x', person_id: 'ben', datum: mi, typ: 'urlaub', notiz: null }]);
    await zeige(leitung, 'treffleitung');
    const montag = await tag(mo);
    expect(within(montag).getByText('Feiertag: Tag der Arbeit')).toBeInTheDocument();
    await userEvent.click(within(montag).getByRole('button', { name: 'Schließen' }));
    const mittwoch = await tag(mi);
    expect(within(mittwoch).getByText('Schlüssel')).toBeInTheDocument();
    expect(within(mittwoch).getByText('Ben Baum: Urlaub')).toBeInTheDocument();
  });

  it('Sonderdienst erscheint auch an einem Schließtag (eigene Spalte, im Tagesfenster mit Zeit)', async () => {
    vi.mocked(api.listeDienste).mockResolvedValue([dienst({ id: 's', datum: sa, ist_sonder: true, bezeichnung: 'Sommerfest', von: '10:00', bis: '16:00', personen: ['ich'] })]);
    await zeige(betreuerin);
    const k = await tag(sa);
    expect(k).toHaveTextContent('Sonderdienst: Sommerfest');
    expect(k).toHaveTextContent('10:00–16:00 Uhr');
    expect(within(k).getByText('Anna Adler')).toBeInTheDocument();
  });

  it('„Deine Dienste“ zeigt die eigenen Dienste der Woche mit Stunden; die eigene Zeile steht oben', async () => {
    vi.mocked(api.listeDienste).mockResolvedValue([dienst({ id: 'd1', datum: mo, personen: ['ich', 'ben'] }), dienst({ id: 'd2', datum: mi, von: '14:00', bis: '18:00', personen: ['ben'] })]);
    await zeige(betreuerin);
    const mein = screen.getByRole('list', { name: 'Meine Dienste im Zeitraum' });
    expect(within(mein).getAllByRole('listitem')).toHaveLength(1);
    expect(mein).toHaveTextContent('15:00–19:00 Uhr');
    expect(screen.getByText(/Ein Dienst/).closest('span')).toHaveTextContent('Ein Dienst · 4 h');
    const zeilen = within(screen.getByRole('region', { name: 'Einsatzplan Woche' })).getAllByRole('rowheader');
    expect(zeilen[0]).toHaveTextContent('Anna Adler');
  });

  it('„nur mich zeigen“ blendet die anderen Zeilen aus', async () => {
    await zeige(betreuerin);
    await userEvent.click(screen.getByLabelText('In der Tabelle nur mich zeigen'));
    const tabelle = screen.getByRole('region', { name: 'Einsatzplan Woche' });
    expect(within(tabelle).queryByText('Ben Baum')).not.toBeInTheDocument();
    expect(within(tabelle).getByText('Anna Adler')).toBeInTheDocument();
  });

  it('neu seit dem letzten Besuch eingeteilte Dienste sind markiert; der Besuch wird gemerkt', async () => {
    vi.mocked(api.holeDiensteGesehen).mockResolvedValue('2020-01-01T00:00:00Z');
    vi.mocked(api.listeDienste).mockResolvedValue([dienst({ id: 'd1', datum: mo, personen: ['ich'], seit: { ich: '2026-01-01T00:00:00Z' } })]);
    await zeige(betreuerin);
    expect(await within(screen.getByRole('list', { name: 'Meine Dienste im Zeitraum' })).findByText('neu')).toBeInTheDocument();
    expect(api.merkeDiensteGesehen).toHaveBeenCalledWith('ich');
  });

  it('meldet Ladefehler', async () => {
    vi.mocked(api.listeDienste).mockRejectedValue(new Error('kaputt'));
    renderMitAuth(<DienstplanTab treff={nord} rolle="betreuerin" />, betreuerin);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});

describe('Dienstplan: veröffentlichen', () => {
  it('Monat in Planung: das Team sieht „vorläufig“', async () => {
    vi.mocked(api.listeVeroeffentlicht).mockResolvedValue([]);
    await zeige(betreuerin);
    expect(screen.getAllByText(/ist noch in Planung und kann sich ändern/).length).toBeGreaterThan(0);
  });

  it('Treffleitung veröffentlicht: Rückfrage, Speichern, eine Mitteilung ans Team', async () => {
    vi.mocked(api.listeVeroeffentlicht).mockResolvedValue([]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await zeige(leitung, 'treffleitung');
    const knopf = screen.getAllByRole('button', { name: /veröffentlichen$/ })[0]!;
    await userEvent.click(knopf);
    expect(api.veroeffentliche).toHaveBeenCalledWith('t1', monatErster(mo));
    await vi.waitFor(() => expect(sendePush).toHaveBeenCalledWith('dienstplan_veroeffentlicht', 't1', { monat: monatErster(mo) }));
  });

  it('solange ein Monat in Planung ist, löst Zuteilen keine Mitteilung aus', async () => {
    vi.mocked(api.listeVeroeffentlicht).mockResolvedValue([]);
    await zeige(leitung, 'treffleitung');
    const dialog = await tag(mi);
    await userEvent.click(within(dialog).getByLabelText(/Ben Baum/));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Zuteilung speichern' }));
    await vi.waitFor(() => expect(api.setzeZuteilung).toHaveBeenCalled());
    expect(sendePush).not.toHaveBeenCalled();
  });

  it('veröffentlichter Monat: die Treffleitung kann ihn zurück in die Planung nehmen', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await zeige(leitung, 'treffleitung');
    await userEvent.click(screen.getAllByRole('button', { name: 'Zurück in Planung' })[0]!);
    expect(api.nimmVeroeffentlichungZurueck).toHaveBeenCalledWith('t1', monatErster(mo));
  });
});

describe('Dienstplan: Wünsche und „kann nicht“ der BetreuerInnen', () => {
  it('wünscht einen Tag; Zuteilen und Sonderdienst gibt es nicht', async () => {
    await zeige(betreuerin);
    expect(screen.queryByRole('button', { name: '+ Sonderdienst' })).not.toBeInTheDocument();
    const k = await tag(mi);
    expect(within(k).queryByRole('button', { name: 'Zuteilung speichern' })).not.toBeInTheDocument();
    await userEvent.click(within(k).getByRole('button', { name: 'Dienst wünschen' }));
    expect(api.wuenscheDienst).toHaveBeenCalledWith('t1', mi);
  });

  it('die eigene Zeile ist anklickbar und öffnet den Tag', async () => {
    await zeige(betreuerin);
    await userEvent.click(screen.getByRole('button', { name: new RegExp(`^Mein Tag: .*${esc(formatKurz(mi))}`) }));
    expect(await screen.findByRole('dialog', { name: new RegExp(esc(formatDatum(mi))) })).toBeInTheDocument();
  });

  it('zeigt den Stand des Wunsches und erlaubt das Zurücknehmen eines offenen', async () => {
    vi.mocked(api.listeDienste).mockResolvedValue([
      dienst({ id: 'd1', datum: mo, wuensche: [{ person_id: 'ich', status: 'offen' }] }),
      dienst({ id: 'd2', datum: mi, wuensche: [{ person_id: 'ich', status: 'abgelehnt' }] }),
    ]);
    await zeige(betreuerin);
    const montag = await tag(mo);
    expect(within(montag).getByText('Wunsch offen')).toBeInTheDocument();
    expect(within(montag).queryByRole('button', { name: 'Dienst wünschen' })).not.toBeInTheDocument();
    await userEvent.click(within(montag).getByRole('button', { name: 'Wunsch zurücknehmen' }));
    expect(api.wunschZuruecknehmen).toHaveBeenCalledWith('d1', 'ich');
    await userEvent.click(within(montag).getByRole('button', { name: 'Schließen' }));
    const mittwoch = await tag(mi);
    expect(within(mittwoch).getByText('Wunsch abgelehnt')).toBeInTheDocument();
    expect(within(mittwoch).getByRole('button', { name: 'Dienst wünschen' })).toBeInTheDocument();   // nach Ablehnung erneut möglich
  });

  it('wer schon eingeteilt ist, sieht keinen Wunsch-Knopf', async () => {
    vi.mocked(api.listeDienste).mockResolvedValue([dienst({ id: 'd1', datum: mo, personen: ['ich'] })]);
    await zeige(betreuerin);
    expect(within(await tag(mo)).queryByRole('button', { name: 'Dienst wünschen' })).not.toBeInTheDocument();
  });

  it('„kann nicht“ eintragen und zurücknehmen; eingeteilt: die Treffleitung bekommt eine Mitteilung', async () => {
    vi.mocked(api.listeDienste).mockResolvedValue([dienst({ id: 'd1', datum: mo, personen: ['ich'] })]);
    await zeige(betreuerin);
    await userEvent.click(within(await tag(mo)).getByRole('button', { name: 'Kann an diesem Tag nicht' }));
    expect(api.trageVerhinderungEin).toHaveBeenCalledWith('t1', 'ich', mo);
    await vi.waitFor(() => expect(sendePush).toHaveBeenCalledWith('verhindert', 't1', { datum: mo }));

    vi.mocked(api.listeVerhinderungen).mockResolvedValue([{ treff_id: 't1', person_id: 'ich', datum: mi }]);
    await userEvent.click(screen.getByRole('button', { name: 'Schließen' }));
    await userEvent.click(screen.getByRole('button', { name: 'Nächste Woche' }));
    await userEvent.click(screen.getByRole('button', { name: 'Vorherige Woche' }));
    const mittwoch = await tag(mi);
    await userEvent.click(within(mittwoch).getByRole('button', { name: 'Kann doch' }));
    expect(api.nimmVerhinderungZurueck).toHaveBeenCalledWith('t1', 'ich', mi);
    expect(sendePush).toHaveBeenCalledTimes(1);
  });

  it('zeigt Fehler der Datenbank', async () => {
    vi.mocked(api.wuenscheDienst).mockRejectedValue(new ApiFehler({ code: '23514', message: 'Du bist an diesem Tag schon eingeteilt' }));
    await zeige(betreuerin);
    await userEvent.click(within(await tag(mo)).getByRole('button', { name: 'Dienst wünschen' }));
    expect(await screen.findByText(/schon eingeteilt/)).toBeInTheDocument();
  });
});

describe('Dienstplan: Treffleitung', () => {
  it('beantwortet Wünsche im Tagesfenster; die „?“-Zelle öffnet es', async () => {
    vi.mocked(api.listeDienste).mockResolvedValue([dienst({ id: 'd1', datum: mo, wuensche: [{ person_id: 'ben', status: 'offen' }, { person_id: 'ich', status: 'bestaetigt' }] })]);
    await zeige(leitung, 'treffleitung');
    expect(screen.getByText(/Ein offener Dienstwunsch in dieser Woche/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^Ben Baum: .*Wunsch beantworten$/ }));
    const k = await screen.findByRole('dialog');
    await userEvent.click(within(k).getByRole('button', { name: 'Wunsch von Ben Baum bestätigen' }));
    expect(api.entscheideWunsch).toHaveBeenCalledWith('d1', 'ben', true);
    await userEvent.click(within(k).getByRole('button', { name: 'Wunsch von Ben Baum ablehnen' }));
    expect(api.entscheideWunsch).toHaveBeenCalledWith('d1', 'ben', false);
    expect(within(k).queryByRole('button', { name: /Wunsch von Anna Adler/ })).not.toBeInTheDocument();   // schon beantwortet
  });

  it('teilt an einem Tag ohne Dienst zu: der Dienst wird erst beim Speichern angelegt', async () => {
    await zeige(leitung, 'treffleitung');
    const dialog = await tag(mi);
    await userEvent.click(within(dialog).getByLabelText(/Ben Baum/));
    await userEvent.click(within(dialog).getByLabelText(/Lea Leitner/));
    expect(api.dienstSicherstellen).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Zuteilung speichern' }));
    expect(api.dienstSicherstellen).toHaveBeenCalledWith('t1', mi);
    expect(api.setzeZuteilung).toHaveBeenCalledWith('neuer-dienst', ['ben', 'lea'], []);
  });

  it('ändert die Zuteilung eines bestehenden Dienstes (nur die Differenz)', async () => {
    vi.mocked(api.listeDienste).mockResolvedValue([dienst({ id: 'd1', datum: mo, personen: ['lea', 'ben'] })]);
    await zeige(leitung, 'treffleitung');
    const dialog = await tag(mo);
    expect(within(dialog).getByLabelText(/Ben Baum/)).toBeChecked();
    await userEvent.click(within(dialog).getByLabelText(/Ben Baum/));
    await userEvent.click(within(dialog).getByLabelText(/Anna Adler/));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Zuteilung speichern' }));
    expect(api.dienstSicherstellen).not.toHaveBeenCalled();
    expect(api.setzeZuteilung).toHaveBeenCalledWith('d1', ['ich'], ['ben']);
  });

  it('markiert Abwesende und „kann nicht“ im Tagesfenster', async () => {
    vi.mocked(api.listeAbwesenheiten).mockResolvedValue([{ id: 'x', person_id: 'ben', datum: mo, typ: 'krank', notiz: null }]);
    vi.mocked(api.listeVerhinderungen).mockResolvedValue([{ treff_id: 't1', person_id: 'ich', datum: mo }]);
    await zeige(leitung, 'treffleitung');
    const dialog = await tag(mo);
    expect(within(dialog).getByText(/abwesend: krank/)).toBeInTheDocument();
    expect(within(dialog).getByText(/– kann nicht/)).toBeInTheDocument();
  });

  it('Feiertag (seit 0027): Tag ist zu – Schild, kein Zuteilen', async () => {
    vi.mocked(api.listeFeiertage).mockResolvedValue([{ id: 'f', treff_id: 't1', datum: mo, bezeichnung: 'Feiertag X' }]);
    await zeige(leitung, 'treffleitung');
    const dialog = await tag(mo);
    expect(within(dialog).getByText('Feiertag: Feiertag X')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Zuteilung speichern' })).not.toBeInTheDocument();
  });

  it('meldet Fehler beim Speichern und lässt das Fenster offen', async () => {
    vi.mocked(api.setzeZuteilung).mockRejectedValue(new ApiFehler({ code: '23514', message: 'Die Person gehört nicht zu diesem Treff' }));
    await zeige(leitung, 'treffleitung');
    const dialog = await tag(mo);
    await userEvent.click(within(dialog).getByLabelText(/Ben Baum/));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Zuteilung speichern' }));
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

  it('legt aus dem Tagesfenster einen Sonderdienst an diesem Tag an', async () => {
    await zeige(leitung, 'treffleitung');
    await userEvent.click(within(await tag(mi)).getByRole('button', { name: '+ Sonderdienst an diesem Tag' }));
    const dialog = await screen.findByRole('dialog', { name: 'Neuer Sonderdienst' });
    expect(within(dialog).getByLabelText('Datum')).toHaveValue(mi);
  });

  it('bearbeitet und löscht einen Sonderdienst', async () => {
    vi.mocked(api.listeDienste).mockResolvedValue([dienst({ id: 's', datum: sa, ist_sonder: true, bezeichnung: 'Fest', von: '10:00', bis: '12:00', personen: ['ben'] })]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await zeige(leitung, 'treffleitung');
    await userEvent.click(within(await tag(sa)).getByRole('button', { name: 'Sonderdienst bearbeiten' }));
    const dialog = await screen.findByRole('dialog', { name: 'Sonderdienst bearbeiten' });
    expect(within(dialog).getByLabelText('Bezeichnung')).toHaveValue('Fest');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Löschen' }));
    expect(api.loescheDienst).toHaveBeenCalledWith('s');
  });

  it('ändert die Mindestbesetzung; unterbesetzte Tage werden gemeldet', async () => {
    vi.mocked(api.listeDienste).mockResolvedValue([dienst({ id: 'd1', datum: mo, personen: ['ben'] }), dienst({ id: 'd2', datum: mi, personen: ['ben', 'ich'] })]);
    vi.mocked(api.setzeMindestbesetzung).mockResolvedValue(undefined);
    await zeige(leitung, 'treffleitung');
    expect(screen.queryByText(/weniger als/)).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Mindestens'), '2');
    expect(api.setzeMindestbesetzung).toHaveBeenCalledWith('t1', 2);
    expect(await screen.findByText('Ein Öffnungstag hat weniger als 2 Personen (orange markiert).')).toBeInTheDocument();
  });

  it('Stunden je Person stehen für die Treffleitung immer in der Tabelle', async () => {
    vi.mocked(api.listeDienste).mockResolvedValue([dienst({ id: 'd1', datum: mo, personen: ['ben'] })]);
    await zeige(leitung, 'treffleitung');
    expect(within(screen.getByRole('region', { name: 'Einsatzplan Woche' })).getByRole('columnheader', { name: 'Std.' })).toBeInTheDocument();
    expect(within(screen.getByRole('row', { name: /Ben Baum/ })).getByText('4 h')).toBeInTheDocument();
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
    await userEvent.click(within(await tag(mi)).getByRole('button', { name: 'Dienst wünschen' }));
    expect(sendePush).toHaveBeenCalledWith('wunsch_neu', 't1', { datum: mi });
    expect(sendePush).toHaveBeenCalledTimes(1);
  });

  it('gescheiterter Wunsch: keine Mitteilung', async () => {
    vi.mocked(api.wuenscheDienst).mockRejectedValue(new ApiFehler({ code: '23514', message: 'Du bist an diesem Tag schon eingeteilt' }));
    await zeige(betreuerin);
    await userEvent.click(within(await tag(mo)).getByRole('button', { name: 'Dienst wünschen' }));
    await screen.findByText(/schon eingeteilt/);
    expect(sendePush).not.toHaveBeenCalled();
  });

  it('Wunsch bestätigt oder abgelehnt: die Person bekommt eine Mitteilung', async () => {
    vi.mocked(api.listeDienste).mockResolvedValue([dienst({ id: 'd1', datum: mo, wuensche: [{ person_id: 'ben', status: 'offen' }] })]);
    await zeige(leitung, 'treffleitung');
    const k = await tag(mo);
    await userEvent.click(within(k).getByRole('button', { name: 'Wunsch von Ben Baum bestätigen' }));
    expect(sendePush).toHaveBeenCalledWith('wunsch_antwort', 'd1', { person: 'ben' });
    await userEvent.click(within(k).getByRole('button', { name: 'Wunsch von Ben Baum ablehnen' }));
    expect(sendePush).toHaveBeenCalledTimes(2);
  });

  it('Zuteilung: nur wer neu eingeteilt oder herausgenommen wurde, wird benachrichtigt', async () => {
    vi.mocked(api.listeDienste).mockResolvedValue([dienst({ id: 'd1', datum: mo, personen: ['lea', 'ben'] })]);
    await zeige(leitung, 'treffleitung');
    const dialog = await tag(mo);
    await userEvent.click(within(dialog).getByLabelText(/Ben Baum/));          // heraus
    await userEvent.click(within(dialog).getByLabelText(/Anna Adler/));        // neu
    await userEvent.click(within(dialog).getByRole('button', { name: 'Zuteilung speichern' }));
    await vi.waitFor(() => expect(sendePush).toHaveBeenCalledWith('dienstplan', 't1', { personen: ['ich', 'ben'] }));
  });

  it('Zuteilung ohne Änderung: Speichern ist gesperrt', async () => {
    vi.mocked(api.listeDienste).mockResolvedValue([dienst({ id: 'd1', datum: mo, personen: ['lea'] })]);
    await zeige(leitung, 'treffleitung');
    expect(within(await tag(mo)).getByRole('button', { name: 'Zuteilung speichern' })).toBeDisabled();
  });

  it('Sonderdienst anlegen: die Eingeteilten werden benachrichtigt; löschen: die bisher Eingeteilten', async () => {
    vi.mocked(api.listeDienste).mockResolvedValue([dienst({ id: 's', datum: sa, ist_sonder: true, bezeichnung: 'Fest', von: '10:00', bis: '12:00', personen: ['ben'] })]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await zeige(leitung, 'treffleitung');
    await userEvent.click(screen.getByRole('button', { name: '+ Sonderdienst' }));
    const neu = await screen.findByRole('dialog', { name: 'Neuer Sonderdienst' });
    await userEvent.clear(within(neu).getByLabelText('Datum'));
    await userEvent.type(within(neu).getByLabelText('Datum'), mi);
    await userEvent.type(within(neu).getByLabelText('Bezeichnung'), 'Aufbau');
    await userEvent.click(within(neu).getByLabelText(/Anna Adler/));
    await userEvent.click(within(neu).getByRole('button', { name: 'Speichern' }));
    await vi.waitFor(() => expect(sendePush).toHaveBeenCalledWith('dienstplan', 't1', { personen: ['ich'] }));

    await userEvent.click(within(await tag(sa)).getByRole('button', { name: 'Sonderdienst bearbeiten' }));
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
  it('keine Verstöße in der Ansicht und im Tagesfenster', async () => {
    vi.mocked(api.listeDienste).mockResolvedValue([dienst({ id: 'd1', datum: mo, personen: ['lea', 'ben'] })]);
    await zeige(betreuerin);
    expect(await axeVerstoesse(document.body)).toEqual([]);
    await tag(mo);
    expect(await axeVerstoesse(document.body)).toEqual([]);
  });
});

describe('Dienstplan: Schließzeiten direkt eintragen', () => {
  it('„Schließzeiten …“ über der Tabelle: eintragen („bis“ mit „von“ vorbelegt), Dienstplan wird neu geladen', async () => {
    vi.mocked(api.speichereSchliesszeit).mockResolvedValue(undefined);
    await zeige(leitung, 'treffleitung');
    await userEvent.click(screen.getByRole('button', { name: 'Schließzeiten …' }));
    const fenster = await screen.findByRole('dialog', { name: 'Schließzeiten' });
    await userEvent.type(within(fenster).getByLabelText('Geschlossen von'), mi);
    expect(within(fenster).getByLabelText('Geschlossen bis')).toHaveValue(mi);
    await userEvent.type(within(fenster).getByLabelText('Grund (optional)'), 'Fortbildung');
    const aufrufe = vi.mocked(api.listeSchliesszeiten).mock.calls.length;
    await userEvent.click(within(fenster).getByRole('button', { name: 'Schließzeit eintragen' }));
    expect(api.speichereSchliesszeit).toHaveBeenCalledWith('t1', mi, mi, 'Fortbildung');
    await vi.waitFor(() => expect(vi.mocked(api.listeSchliesszeiten).mock.calls.length).toBeGreaterThan(aufrufe));
  });

  it('Ende vor Beginn wird abgelehnt; vorhandene lassen sich nach Rückfrage löschen', async () => {
    vi.mocked(api.loescheSchliesszeit).mockResolvedValue(undefined);
    vi.mocked(api.listeSchliesszeiten).mockResolvedValue([{ id: 's1', treff_id: 't1', von: '2030-07-01', bis: '2030-07-21', grund: 'Sommerpause' }]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await zeige(leitung, 'treffleitung');
    await userEvent.click(screen.getByRole('button', { name: 'Schließzeiten …' }));
    const fenster = await screen.findByRole('dialog', { name: 'Schließzeiten' });
    expect(await within(fenster).findByText('Sommerpause')).toBeInTheDocument();
    await userEvent.type(within(fenster).getByLabelText('Geschlossen von'), sa);
    await userEvent.clear(within(fenster).getByLabelText('Geschlossen bis'));
    await userEvent.type(within(fenster).getByLabelText('Geschlossen bis'), mo);
    await userEvent.click(within(fenster).getByRole('button', { name: 'Schließzeit eintragen' }));
    expect(within(fenster).getByText('Das Ende darf nicht vor dem Beginn liegen.')).toBeInTheDocument();
    expect(api.speichereSchliesszeit).not.toHaveBeenCalled();
    await userEvent.click(within(fenster).getByRole('button', { name: /^Schließzeit .* löschen$/ }));
    expect(api.loescheSchliesszeit).toHaveBeenCalledWith('s1');
  });

  it('aus dem Tagesfenster: „Treff an diesem Tag schließen“ belegt den Tag vor', async () => {
    await zeige(leitung, 'treffleitung');
    await userEvent.click(within(await tag(mi)).getByRole('button', { name: 'Treff an diesem Tag schließen …' }));
    const fenster = await screen.findByRole('dialog', { name: 'Schließzeiten' });
    expect(within(fenster).getByLabelText('Geschlossen von')).toHaveValue(mi);
    expect(within(fenster).getByLabelText('Geschlossen bis')).toHaveValue(mi);
  });

  it('BetreuerInnen sehen keine Schließzeiten-Knöpfe', async () => {
    await zeige(betreuerin);
    expect(screen.queryByRole('button', { name: 'Schließzeiten …' })).not.toBeInTheDocument();
    expect(within(await tag(mi)).queryByRole('button', { name: /Treff an diesem Tag schließen/ })).not.toBeInTheDocument();
  });
});
