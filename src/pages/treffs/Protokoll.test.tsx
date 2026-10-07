import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as treffApi from '../../treffs/api';
import * as fzApi from '../../freizeiten/api';
import * as api from '../../tagesprotokoll/api';
import * as datei from '../../lib/datei';
import { ProtokollTab } from './ProtokollTab';
import { renderMitAuth, type Szene } from '../../test-utils';
import { treff } from '../../test-daten';
import { heuteIso } from '../../freizeiten/logik';
import { addTage } from '../../treffs/dienstplan';
import type { Protokoll } from '../../tagesprotokoll/logik';

vi.mock('../../treffs/api');
vi.mock('../../freizeiten/api');
vi.mock('../../tagesprotokoll/api');
vi.mock('../../lib/datei');

const heute = heuteIso();
const taeglich = [1, 2, 3, 4, 5, 6, 7].map((wochentag) => ({ wochentag, von: '15:00', bis: '19:00' }));
const nord = treff({ id: 't1', name: 'Treff Nord', oeffnungszeiten: taeglich });
const geschlossen = treff({ id: 't1', name: 'Treff Nord', oeffnungszeiten: [] });

const protokoll = (o: Partial<Protokoll> & { datum: string }): Protokoll => ({
  id: `p-${o.datum}`, treff_id: 't1', anz_m: 4, anz_w: 5, anz_d: 1, verlauf: 'Basteln und Kicker', vorkommnisse: '', erstellt_von: 'ben', bearbeitet_von: 'ben',
  updated_at: `${o.datum}T17:30:00Z`, ...o,
});

const tzk: Szene = { ich: { id: 'ich', kategorie: 'TZK' }, treffs: [{ treff_id: 't1', rolle: 'betreuerin' }] };
const leitung: Szene = { ich: { id: 'lea', kategorie: 'Hauptamtliche*r' }, treffs: [{ treff_id: 't1', rolle: 'treffleitung' }] };

const zeige = (szene: Szene, rolle: 'betreuerin' | 'treffleitung' | 'koordination' = 'betreuerin', t = nord) =>
  renderMitAuth(<ProtokollTab treff={t} rolle={rolle} />, szene);

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.listeProtokolle).mockResolvedValue([]);
  vi.mocked(api.listeVorlagen).mockResolvedValue([]);
  vi.mocked(api.listeProtokollZahlen).mockResolvedValue([]);
  vi.mocked(api.listeProtokolleImZeitraum).mockResolvedValue([]);
  vi.mocked(api.speichereProtokoll).mockResolvedValue(undefined);
  vi.mocked(api.loescheProtokoll).mockResolvedValue(undefined);
  vi.mocked(api.legeAufgabeAn).mockResolvedValue(undefined);
  vi.mocked(treffApi.listeFeiertage).mockResolvedValue([]);
  vi.mocked(treffApi.listeSchliesszeiten).mockResolvedValue([]);
  vi.mocked(fzApi.holeNamen).mockResolvedValue({ ben: 'Ben Baum' });
});

describe('Vorlagen je Wochentag (0028)', () => {
  const wt = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay() || 7;
  const gestern = addTage(heute, -1);

  it('ein neues Protokoll startet mit der Vorlage des Wochentags; beim Tageswechsel kommt die des anderen Tages', async () => {
    vi.mocked(api.listeVorlagen).mockResolvedValue([
      { treff_id: 't1', wochentag: wt(heute), text: 'Programm: Kochen\nStimmung:' },
      { treff_id: 't1', wochentag: wt(gestern), text: 'Programm: Fußball' },
    ]);
    const u = userEvent.setup();
    zeige(tzk);
    await screen.findByRole('button', { name: 'Protokoll für heute schreiben' });
    await u.click(screen.getByRole('button', { name: 'Anderen Tag nachtragen' }));
    const dialog = await screen.findByRole('dialog');
    const verlauf = within(dialog).getByLabelText(/Was war los/);
    expect(verlauf).toHaveValue('Programm: Kochen\nStimmung:');
    expect(within(dialog).getByText(/Vorgabe aus der Vorlage/)).toBeInTheDocument();
    await u.selectOptions(within(dialog).getByLabelText('Tag'), gestern);
    expect(verlauf).toHaveValue('Programm: Fußball');
    await u.type(verlauf, ' und Basteln');
    await u.selectOptions(within(dialog).getByLabelText('Tag'), heute);
    expect(verlauf).toHaveValue('Programm: Fußball und Basteln');                   // Geschriebenes bleibt
    await u.click(within(dialog).getByRole('button', { name: 'Speichern' }));
    expect(api.speichereProtokoll).toHaveBeenCalledWith('t1', heute, expect.objectContaining({ verlauf: 'Programm: Fußball und Basteln', anz_m: 0 }), { erwartet: null });
  });

  it('ein bestehendes Protokoll ohne Text: „Vorlage einfügen“', async () => {
    vi.mocked(api.listeVorlagen).mockResolvedValue([{ treff_id: 't1', wochentag: wt(heute), text: 'Programm:' }]);
    vi.mocked(api.listeProtokolle).mockResolvedValue([protokoll({ datum: heute, verlauf: '' })]);
    const u = userEvent.setup();
    zeige(tzk);
    await u.click(await screen.findByRole('button', { name: 'Heutiges Protokoll bearbeiten' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText(/Was war los/)).toHaveValue('');
    await u.click(within(dialog).getByRole('button', { name: /^Vorlage für .* einfügen$/ }));
    expect(within(dialog).getByLabelText(/Was war los/)).toHaveValue('Programm:');
  });

  it('Treffleitung pflegt die Vorlagen je Öffnungstag; BetreuerInnen sehen den Bereich nicht', async () => {
    vi.mocked(api.speichereVorlage).mockResolvedValue(undefined);
    vi.mocked(api.listeVorlagen).mockResolvedValue([{ treff_id: 't1', wochentag: 3, text: 'Kochen' }]);
    const u = userEvent.setup();
    const { unmount } = zeige(tzk);
    await screen.findByRole('button', { name: 'Protokoll für heute schreiben' });
    expect(screen.queryByText('Vorlagen je Wochentag')).not.toBeInTheDocument();
    unmount();

    zeige(leitung, 'treffleitung');
    await u.click(await screen.findByText('Vorlagen je Wochentag'));
    expect(screen.getByText('(1 von 7)')).toBeInTheDocument();
    expect(screen.getByLabelText('Mittwoch')).toHaveValue('Kochen');
    expect(screen.getByRole('button', { name: 'Vorlage für Montag speichern' })).toBeDisabled();
    await u.type(screen.getByLabelText('Montag'), 'Hausaufgaben');
    await u.click(screen.getByRole('button', { name: 'Vorlage für Montag speichern' }));
    expect(api.speichereVorlage).toHaveBeenCalledWith('t1', 1, 'Hausaufgaben');
    expect(await screen.findByText('Gespeichert.')).toBeInTheDocument();
    await u.clear(screen.getByLabelText('Mittwoch'));
    await u.click(screen.getByRole('button', { name: 'Vorlage für Mittwoch speichern' }));
    expect(api.speichereVorlage).toHaveBeenLastCalledWith('t1', 3, '');
    expect(await screen.findByText('Vorlage entfernt.')).toBeInTheDocument();
  });
});

describe('Tagesprotokoll: schreiben', () => {
  it('Protokoll für heute: Zähler, Gesamtzahl, Texte – gespeichert wird für heute', async () => {
    const u = userEvent.setup();
    zeige(tzk);
    await u.click(await screen.findByRole('button', { name: 'Protokoll für heute schreiben' }));
    const dialog = await screen.findByRole('dialog');
    await u.click(within(dialog).getByRole('button', { name: 'männlich erhöhen' }));
    await u.click(within(dialog).getByRole('button', { name: 'männlich erhöhen' }));
    await u.click(within(dialog).getByRole('button', { name: 'weiblich erhöhen' }));
    await u.click(within(dialog).getByRole('button', { name: 'divers erhöhen' }));
    await u.click(within(dialog).getByRole('button', { name: 'divers verringern' }));
    expect(within(dialog).getByText('Gesamt:').parentElement).toHaveTextContent('Gesamt: 3');
    await u.type(within(dialog).getByLabelText(/Was war los/), 'Basteln');
    await u.type(within(dialog).getByLabelText('Besondere Vorkommnisse'), 'Streit um den Kicker');
    await u.click(within(dialog).getByRole('button', { name: 'Speichern' }));
    expect(api.speichereProtokoll).toHaveBeenCalledWith('t1', heute, { anz_m: 2, anz_w: 1, anz_d: 0, verlauf: 'Basteln', vorkommnisse: 'Streit um den Kicker' }, { erwartet: null });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.listeProtokolle).toHaveBeenCalledTimes(2);      // Liste wird neu geladen
  });

  it('Zahl tippen statt klicken; ungültige Zahlen werden nicht übernommen, zu große abgelehnt', async () => {
    const u = userEvent.setup();
    zeige(tzk);
    await u.click(await screen.findByRole('button', { name: 'Protokoll für heute schreiben' }));
    const dialog = await screen.findByRole('dialog');
    const m = within(dialog).getByLabelText('Anzahl männlich');
    await u.clear(m); await u.type(m, '12');
    expect(within(dialog).getByText('Gesamt:').parentElement).toHaveTextContent('Gesamt: 12');
    await u.clear(m); await u.type(m, '501');
    await u.click(within(dialog).getByRole('button', { name: 'Speichern' }));
    expect(await within(dialog).findByText(/0 bis 500/)).toBeInTheDocument();
    expect(api.speichereProtokoll).not.toHaveBeenCalled();
  });

  it('das Protokoll bleibt offen, wenn das Speichern scheitert', async () => {
    vi.mocked(api.speichereProtokoll).mockRejectedValue(new Error('kaputt'));
    const u = userEvent.setup();
    zeige(tzk);
    await u.click(await screen.findByRole('button', { name: 'Protokoll für heute schreiben' }));
    const dialog = await screen.findByRole('dialog');
    await u.type(within(dialog).getByLabelText(/Was war los/), 'Text');
    await u.click(within(dialog).getByRole('button', { name: 'Speichern' }));
    expect(await within(dialog).findByRole('alert')).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Was war los/)).toHaveValue('Text');
  });

  it('„Anderen Tag nachtragen“ bietet die Tage ohne Protokoll an, schon belegte nicht', async () => {
    vi.mocked(api.listeProtokolle).mockResolvedValue([protokoll({ datum: addTage(heute, -1) })]);
    const u = userEvent.setup();
    zeige(tzk);
    await u.click(await screen.findByRole('button', { name: 'Anderen Tag nachtragen' }));
    const dialog = await screen.findByRole('dialog');
    const auswahl = within(dialog).getByLabelText('Tag') as HTMLSelectElement;
    const werte = [...auswahl.options].map((o) => o.value);
    expect(werte[0]).toBe(heute);
    expect(werte).not.toContain(addTage(heute, -1));
    expect(werte).toContain(addTage(heute, -2));
    await u.selectOptions(auswahl, addTage(heute, -2));
    await u.click(within(dialog).getByRole('button', { name: 'Speichern' }));
    expect(api.speichereProtokoll).toHaveBeenCalledWith('t1', addTage(heute, -2), expect.any(Object), { erwartet: null });
  });

  it('Nebenbei eine Notiz anlegen: wird mit dem Tag des Protokolls gespeichert', async () => {
    const u = userEvent.setup();
    zeige(tzk);
    await u.click(await screen.findByRole('button', { name: 'Protokoll für heute schreiben' }));
    const dialog = await screen.findByRole('dialog');
    await u.selectOptions(within(dialog).getByLabelText('Art'), 'einkauf');
    await u.type(within(dialog).getByLabelText('Notiz'), 'Saft{Enter}');
    expect(api.legeAufgabeAn).toHaveBeenCalledWith('t1', { art: 'einkauf', text: 'Saft', faellig_am: '', zustaendig: '' }, heute);
    expect(await within(dialog).findByText(/✔ Saft/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Notiz')).toHaveValue('');
    expect(api.speichereProtokoll).not.toHaveBeenCalled();         // das Protokoll selbst wird dadurch nicht gespeichert
  });

  it('Schließen mit Escape und Abbrechen speichert nichts', async () => {
    const u = userEvent.setup();
    zeige(tzk);
    await u.click(await screen.findByRole('button', { name: 'Protokoll für heute schreiben' }));
    await screen.findByRole('dialog');
    await u.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.speichereProtokoll).not.toHaveBeenCalled();
  });
});

describe('Tagesprotokoll: Liste, Bearbeiten, Fehlendes', () => {
  it('zeigt Protokolle mit Zahlen, Gesamtzahl und Vorkommnis-Markierung', async () => {
    vi.mocked(api.listeProtokolle).mockResolvedValue([
      protokoll({ datum: addTage(heute, -1), vorkommnisse: 'Streit' }),
      protokoll({ datum: addTage(heute, -3), anz_m: 1, anz_w: 0, anz_d: 0, verlauf: '' }),
    ]);
    zeige(tzk);
    const liste = await screen.findByRole('list', { name: 'Protokolle' });
    const zeilen = within(liste).getAllByRole('listitem');
    expect(zeilen[0]).toHaveTextContent('m 4 · w 5 · d 1');
    expect(zeilen[0]).toHaveTextContent('10 Kinder');
    expect(zeilen[0]).toHaveTextContent('Vorkommnis');
    expect(zeilen[0]).toHaveTextContent('Basteln und Kicker');
    expect(zeilen[1]).toHaveTextContent('1 Kind');
    expect(zeilen[1]).not.toHaveTextContent('Vorkommnis');
  });

  it('heutiges Protokoll bearbeiten: alles aus dem Team darf, auch fremde; zeigt, wer zuletzt bearbeitet hat', async () => {
    vi.mocked(api.listeProtokolle).mockResolvedValue([protokoll({ datum: heute, anz_m: 3, anz_w: 2, anz_d: 0 })]);
    const u = userEvent.setup();
    zeige(tzk);
    await u.click(await screen.findByRole('button', { name: 'Heutiges Protokoll bearbeiten' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Zuletzt bearbeitet von Ben Baum/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Anzahl männlich')).toHaveValue('3');
    expect(within(dialog).queryByLabelText('Tag')).not.toBeInTheDocument();
    await u.click(within(dialog).getByRole('button', { name: 'weiblich erhöhen' }));
    await u.click(within(dialog).getByRole('button', { name: 'Speichern' }));
    expect(api.speichereProtokoll).toHaveBeenCalledWith('t1', heute, expect.objectContaining({ anz_m: 3, anz_w: 3, anz_d: 0, verlauf: 'Basteln und Kicker' }), { erwartet: `${heute}T17:30:00Z` });
  });

  it('ein Protokoll aus der Liste öffnen', async () => {
    const d = addTage(heute, -2);
    vi.mocked(api.listeProtokolle).mockResolvedValue([protokoll({ datum: d })]);
    const u = userEvent.setup();
    zeige(tzk);
    const liste = await screen.findByRole('list', { name: 'Protokolle' });
    await u.click(within(liste).getByRole('button'));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('fehlende Protokolle der letzten zwei Wochen werden aufgelistet und lassen sich nachtragen', async () => {
    vi.mocked(api.listeProtokolle).mockResolvedValue([protokoll({ datum: addTage(heute, -1) })]);
    const u = userEvent.setup();
    zeige(tzk);
    const fehlend = await screen.findByRole('list', { name: 'Fehlende Protokolle' });
    const eintraege = within(fehlend).getAllByRole('listitem');
    expect(eintraege).toHaveLength(12);                               // 14 Tage bis heute, abzüglich heute und gestern
    await u.click(within(eintraege[0]!).getByRole('button', { name: 'Nachtragen' }));
    const dialog = await screen.findByRole('dialog');
    expect((within(dialog).getByLabelText('Tag') as HTMLSelectElement).value).toBe(addTage(heute, -2));
  });

  it('Feiertage zählen nicht als fehlend', async () => {
    vi.mocked(treffApi.listeFeiertage).mockResolvedValue([{ id: 'f', treff_id: null, datum: addTage(heute, -2), bezeichnung: 'Feiertag' }]);
    vi.mocked(api.listeProtokolle).mockResolvedValue([]);
    zeige(tzk);
    const fehlend = await screen.findByRole('list', { name: 'Fehlende Protokolle' });
    expect(within(fehlend).getAllByRole('listitem')).toHaveLength(12);       // 13 Tage ohne heute, minus Feiertag
  });

  it('ohne Öffnungstage gibt es keine Warnung', async () => {
    zeige(tzk, 'betreuerin', geschlossen);
    await screen.findByRole('heading', { name: 'Tagesprotokoll' });
    expect(screen.queryByRole('list', { name: 'Fehlende Protokolle' })).not.toBeInTheDocument();
  });

  it('Hinweis, wenn heute geöffnet ist und noch nichts geschrieben wurde', async () => {
    zeige(tzk);
    expect(await screen.findByText('Heute ist geöffnet – das Protokoll fehlt noch.')).toBeInTheDocument();
  });

  it('leerer Zustand', async () => {
    zeige(tzk);
    expect(await screen.findByText('Noch keine Protokolle')).toBeInTheDocument();
  });

  it('Löschen nur für Treffleitung und Koordination, mit Rückfrage', async () => {
    vi.mocked(api.listeProtokolle).mockResolvedValue([protokoll({ datum: heute })]);
    const u = userEvent.setup();
    const { unmount } = zeige(tzk);
    await u.click(await screen.findByRole('button', { name: 'Heutiges Protokoll bearbeiten' }));
    expect(screen.queryByRole('button', { name: 'Löschen' })).not.toBeInTheDocument();
    unmount();

    zeige(leitung, 'treffleitung');
    await u.click(await screen.findByRole('button', { name: 'Heutiges Protokoll bearbeiten' }));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    await u.click(screen.getByRole('button', { name: 'Löschen' }));
    expect(api.loescheProtokoll).not.toHaveBeenCalled();
    await u.click(screen.getByRole('button', { name: 'Löschen' }));
    expect(api.loescheProtokoll).toHaveBeenCalledWith(`p-${heute}`);
    confirm.mockRestore();
  });
});

describe('Tagesprotokoll: Auswertung', () => {
  const zahlen = [
    { datum: `${new Date().getFullYear()}-01-06`, anz_m: 4, anz_w: 5, anz_d: 0 },
    { datum: `${new Date().getFullYear()}-01-08`, anz_m: 2, anz_w: 3, anz_d: 1 },
    { datum: `${new Date().getFullYear()}-02-03`, anz_m: 1, anz_w: 1, anz_d: 0 },
  ];

  it('BetreuerInnen sehen keine Auswertung', async () => {
    zeige(tzk);
    await screen.findByRole('heading', { name: 'Tagesprotokoll' });
    expect(screen.queryByRole('heading', { name: 'Auswertung' })).not.toBeInTheDocument();
  });

  it('Treffleitung: Tabelle je Monat mit Summe und Anteilen', async () => {
    vi.mocked(api.listeProtokollZahlen).mockResolvedValue(zahlen);
    zeige(leitung, 'treffleitung');
    const tabelle = await screen.findByRole('table');
    const zeilen = within(tabelle).getAllByRole('row');
    expect(zeilen[1]).toHaveTextContent(/Januar.*2.*6.*8.*1.*15.*7,5/);
    expect(zeilen[2]).toHaveTextContent(/Februar.*1.*0.*2.*2/);
    expect(zeilen[3]).toHaveTextContent(/Summe.*3.*7.*9.*1.*17/);
    expect(screen.getByText(/männlich 41 %, weiblich 53 %, divers 6 %/)).toBeInTheDocument();
  });

  it('Koordination sieht die Auswertung ebenfalls; ohne Daten gibt es einen Hinweis', async () => {
    zeige({ ich: { ist_koordination: true, kategorie: 'Hauptamtliche*r' } }, 'koordination');
    expect(await screen.findByText(/gibt es noch keine Protokolle/)).toBeInTheDocument();
  });

  it('Jahr wechseln lädt neu; ins Jahr nach heute geht es nicht', async () => {
    const u = userEvent.setup();
    zeige(leitung, 'treffleitung');
    await screen.findByRole('heading', { name: 'Auswertung' });
    expect(screen.getByRole('button', { name: 'Nächstes Jahr' })).toBeDisabled();
    await u.click(screen.getByRole('button', { name: 'Vorheriges Jahr' }));
    const jahr = new Date().getFullYear() - 1;
    expect(api.listeProtokollZahlen).toHaveBeenLastCalledWith('t1', `${jahr}-01-01`, `${jahr}-12-31`);
  });

  it('CSV-Export lädt die vollständigen Protokolle des Jahres als Datei', async () => {
    vi.mocked(api.listeProtokolleImZeitraum).mockResolvedValue([protokoll({ datum: `${new Date().getFullYear()}-01-06`, verlauf: 'Basteln; Malen' })]);
    vi.mocked(datei.dateiName).mockReturnValue('Treff-Nord');
    const u = userEvent.setup();
    zeige(leitung, 'treffleitung');
    await u.click(await screen.findByRole('button', { name: 'Als CSV exportieren' }));
    const jahr = new Date().getFullYear();
    expect(datei.ladeHerunter).toHaveBeenCalledTimes(1);
    const [name, inhalt] = vi.mocked(datei.ladeHerunter).mock.calls[0]!;
    expect(name).toBe(`Tagesprotokolle-Treff-Nord-${jahr}.csv`);
    expect(inhalt).toContain('Treff Nord;');
    expect(inhalt).toContain('"Basteln; Malen"');
  });
});
