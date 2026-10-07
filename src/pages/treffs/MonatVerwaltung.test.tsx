import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '../../treffs/api';
import { sendePush } from '../../mitteilungen/senden';
import { MonatTab } from './MonatTab';
import { VerwaltungTab } from './VerwaltungTab';
import { renderMitAuth, type Szene } from '../../test-utils';
import { treff, treffMitglied } from '../../test-daten';
import { addTage, isoWochentag, monatErster, monatTage, monatText, monatVersatz, type Dienst } from '../../treffs/dienstplan';
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
const monat = monatErster(heute);
const dienst = (o: Partial<Dienst> & { id: string; datum: string }): Dienst => ({
  von: '15:00', bis: '19:00', ist_sonder: false, bezeichnung: null, personen: [], wuensche: [], ...o,
});

const betreuerin: Szene = { ich: { kategorie: 'TZK' }, treffs: [{ treff_id: 't1', rolle: 'betreuerin' }] };
const leitung: Szene = { ich: { id: 'lea', kategorie: 'Hauptamtliche*r' }, treffs: [{ treff_id: 't1', rolle: 'treffleitung' }] };
const koord: Szene = { ich: { ist_koordination: true, kategorie: 'Hauptamtliche*r' } };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.holeTreffTeam).mockResolvedValue(team);
  vi.mocked(api.listeDienste).mockResolvedValue([]);
  vi.mocked(api.listeFeiertage).mockResolvedValue([]);
  vi.mocked(api.listeSchliesszeiten).mockResolvedValue([]);
  vi.mocked(api.listeAbwesenheiten).mockResolvedValue([]);
  vi.mocked(api.dienstStatistik).mockResolvedValue([]);
  vi.mocked(api.wendeDienstplanAn).mockResolvedValue({ zugeteilt: 8, entfernt: 0 });
  for (const fn of [api.speichereAbwesenheit, api.loescheAbwesenheiten, api.speichereFeiertag, api.loescheFeiertag] as const) {
    vi.mocked(fn as (...a: never[]) => Promise<void>).mockResolvedValue(undefined);
  }
});

describe('Monat: Übersicht und Statistik', () => {
  it('zeigt den Monat, die Dienste und die Statistik', async () => {
    const erster = monatTage1();
    vi.mocked(api.listeDienste).mockResolvedValue([dienst({ id: 'd', datum: erster, personen: ['lea', 'ben'] })]);
    vi.mocked(api.dienstStatistik).mockResolvedValue([{ person_id: 'lea', dienste: 4, stunden: 16 }, { person_id: 'ben', dienste: 2, stunden: 7.5 }]);
    renderMitAuth(<MonatTab treff={nord} rolle="betreuerin" />, betreuerin);
    expect(await screen.findByText(monatText(monat))).toBeInTheDocument();
    const liste = await screen.findByRole('list', { name: 'Dienste im Monat' });
    expect(within(liste).getByText('Lea Leitner')).toBeInTheDocument();
    expect(within(liste).getByText('Ben Baum')).toBeInTheDocument();
    const tabelle = await screen.findByRole('table', { name: 'Dienste und Stunden je Person' });
    expect(within(tabelle).getByRole('row', { name: /Ben Baum 2 7,5 h/ })).toBeInTheDocument();
    expect(within(tabelle).getByRole('row', { name: /Lea Leitner 4 16 h/ })).toBeInTheDocument();
    expect(screen.getByText(/nur deine/)).toBeInTheDocument();
    expect(screen.queryByText('Monat einteilen')).not.toBeInTheDocument();
  });

  it('blättert die Monate', async () => {
    renderMitAuth(<MonatTab treff={nord} rolle="betreuerin" />, betreuerin);
    await screen.findByText(monatText(monat));
    await userEvent.click(screen.getByRole('button', { name: 'Nächster Monat' }));
    expect(await screen.findByText(monatText(monatVersatz(monat, 1)))).toBeInTheDocument();
    expect(api.dienstStatistik).toHaveBeenLastCalledWith('t1', monatVersatz(monat, 1));
  });
});

/** Erster Tag des Monats, an dem der Treff offen ist (Montag oder Mittwoch). */
function monatTage1(): string {
  for (let i = 0; i < 7; i++) {
    const d = addTage(monat, i);
    const w = new Date(`${d}T00:00:00Z`).getUTCDay() || 7;
    if (w === 1 || w === 3) return d;
  }
  throw new Error('unerreichbar');
}

describe('Monat einteilen: Wochentage je Person', () => {
  const tageMit = (wochentag: number) => monatTage(monat).filter((d) => isoWochentag(d) === wochentag);
  const montage = tageMit(1);
  const mittwoche = tageMit(3);
  const ersterMontag = montage[0]!;
  const zeige = (szene: Szene = leitung, rolle: 'treffleitung' | 'koordination' | 'betreuerin' = 'treffleitung') => renderMitAuth(<MonatTab treff={nord} rolle={rolle} />, szene);
  const kreuze = async (...namen: string[]) => { for (const n of namen) await userEvent.click(await screen.findByLabelText(n)); };
  const speichern = () => userEvent.click(screen.getByRole('button', { name: /Einteilungen? speichern/ }));
  const aufruf = () => vi.mocked(api.wendeDienstplanAn).mock.calls.at(-1)!;

  it('teilt je Person die gewählten Wochentage für den ganzen Monat ein und meldet das Ergebnis', async () => {
    zeige();
    await screen.findByText('Monat einteilen');
    await kreuze('Anna Adler: Montag', 'Ben Baum: Montag', 'Ben Baum: Mittwoch');
    const erwartet = montage.length * 2 + mittwoche.length;
    await speichern();
    const [treffId, m, zuteilen, entfernen] = aufruf();
    expect([treffId, m]).toEqual(['t1', monat]);
    expect(zuteilen).toHaveLength(erwartet);
    expect(zuteilen.filter((x) => x.datum === ersterMontag).map((x) => x.person).sort()).toEqual(['ben', 'ich']);
    expect(entfernen).toEqual([]);
    expect(await screen.findByText('8 Einteilungen gespeichert.')).toBeInTheDocument();
    expect(sendePush).toHaveBeenCalledWith('dienstplan', 't1', { personen: ['ben', 'ich'] });          // wer neu eingeteilt ist, erfährt es
    expect(screen.getByLabelText('Anna Adler: Montag')).not.toBeChecked();                             // die Auswahl ist danach leer
  });

  it('die Vorschau sagt vorher, wie viele Einteilungen an wie vielen Tagen entstehen', async () => {
    zeige();
    await screen.findByText('Monat einteilen');
    expect(screen.getByText('Wähle Wochentage, dann siehst du hier, was passiert.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Einteilung speichern' })).toBeDisabled();
    await kreuze('Anna Adler: Montag');
    expect(await screen.findByText(`${montage.length} neue Einteilungen`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `${montage.length} Einteilungen speichern` })).toBeEnabled();
  });

  it('vorhandene Einteilungen bleiben: weitere Personen kommen dazu, schon Eingetragene werden nicht doppelt gesendet', async () => {
    vi.mocked(api.listeDienste).mockResolvedValue([dienst({ id: 'd1', datum: ersterMontag, personen: ['lea'] }), dienst({ id: 'd2', datum: montage[1]!, personen: ['ben'] })]);
    zeige();
    await screen.findByText('Monat einteilen');
    await kreuze('Lea Leitner: Montag', 'Ben Baum: Montag');
    expect(await screen.findByText(/2 Einteilungen sind schon eingetragen und bleiben/)).toBeInTheDocument();
    await speichern();
    const [, , zuteilen, entfernen] = aufruf();
    expect(zuteilen.some((x) => x.datum === ersterMontag && x.person === 'lea')).toBe(false);
    expect(zuteilen.some((x) => x.datum === ersterMontag && x.person === 'ben')).toBe(true);           // zweite Person am selben Tag
    expect(entfernen).toEqual([]);
  });

  it('Urlaub und Krankheit: ohne Entscheidung wird ausgelassen; wer „trotzdem einteilen“ wählt, teilt ein', async () => {
    vi.mocked(api.listeAbwesenheiten).mockResolvedValue([{ id: 'u', person_id: 'ben', datum: ersterMontag, typ: 'urlaub', notiz: null }]);
    zeige();
    await screen.findByText('Monat einteilen');
    await kreuze('Ben Baum: Montag');
    expect(await screen.findByText(/Ben Baum ist am .* im Urlaub/)).toBeInTheDocument();
    expect(screen.getByText('1 Einteilung wird wegen eines Konflikts ausgelassen.')).toBeInTheDocument();
    await speichern();
    expect(aufruf()[2]).toHaveLength(montage.length - 1);
    expect(aufruf()[2].some((x) => x.datum === ersterMontag)).toBe(false);

    await kreuze('Ben Baum: Montag');
    await userEvent.click(await screen.findByRole('checkbox', { name: /Ben Baum ist am .* im Urlaub/ }));
    await speichern();
    expect(aufruf()[2]).toHaveLength(montage.length);
  });

  it('Feiertag: eine Entscheidung für den ganzen Tag; „Alle trotzdem einteilen“ und „Keine einteilen“', async () => {
    vi.mocked(api.listeFeiertage).mockResolvedValue([{ id: 'f', treff_id: null, datum: ersterMontag, bezeichnung: 'Stadtfest' }]);
    zeige();
    await screen.findByText('Monat einteilen');
    await kreuze('Anna Adler: Montag', 'Ben Baum: Montag');
    expect(await screen.findByText(/ist ein Feiertag \(Stadtfest\)/)).toBeInTheDocument();
    expect(screen.getByText(/\(2 Einteilungen\)/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Alle trotzdem einteilen' }));
    expect(screen.getByRole('checkbox', { name: /Feiertag/ })).toBeChecked();
    await speichern();
    expect(aufruf()[2]).toHaveLength(montage.length * 2);
  });

  it('„ersetzen“ entfernt andere Personen der betroffenen Tage – nach Rückfrage', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(api.listeDienste).mockResolvedValue([dienst({ id: 'd1', datum: ersterMontag, personen: ['ben', 'lea'] })]);
    zeige();
    await screen.findByText('Monat einteilen');
    await userEvent.click(screen.getByLabelText(/Bisherige Einteilung der betroffenen Tage ersetzen/));
    await kreuze('Lea Leitner: Montag');
    expect(await screen.findByText('1 bisherige Einteilung wird entfernt.')).toBeInTheDocument();
    await speichern();
    expect(window.confirm).toHaveBeenCalledWith('1 bisherige Einteilung wird entfernt. Fortfahren?');
    expect(aufruf()[3]).toEqual([{ datum: ersterMontag, person: 'ben' }]);
    expect(await screen.findByText(/gespeichert/)).toBeInTheDocument();
  });

  it('ohne Zustimmung zur Rückfrage wird nichts gespeichert', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    vi.mocked(api.listeDienste).mockResolvedValue([dienst({ id: 'd1', datum: ersterMontag, personen: ['ben'] })]);
    zeige();
    await screen.findByText('Monat einteilen');
    await userEvent.click(screen.getByLabelText(/Bisherige Einteilung der betroffenen Tage ersetzen/));
    await kreuze('Lea Leitner: Montag');
    await speichern();
    expect(api.wendeDienstplanAn).not.toHaveBeenCalled();
  });

  it('Im Modus „zusätzlich“ gibt es keine Rückfrage', async () => {
    const bestaetigen = vi.spyOn(window, 'confirm');
    zeige();
    await screen.findByText('Monat einteilen');
    await kreuze('Anna Adler: Montag');
    await speichern();
    expect(bestaetigen).not.toHaveBeenCalled();
  });

  it('„Zurücksetzen“ leert die Auswahl', async () => {
    zeige();
    await screen.findByText('Monat einteilen');
    await kreuze('Anna Adler: Montag');
    await userEvent.click(screen.getByRole('button', { name: 'Zurücksetzen' }));
    expect(screen.getByLabelText('Anna Adler: Montag')).not.toBeChecked();
  });

  it('Koordination darf auch; Teilzeitkräfte sehen „Monat einteilen“ nicht', async () => {
    const { unmount } = zeige(koord, 'koordination');
    expect(await screen.findByText('Monat einteilen')).toBeInTheDocument();
    unmount();
    zeige(betreuerin, 'betreuerin');
    await screen.findByText(monatText(monat));
    expect(screen.queryByText('Monat einteilen')).not.toBeInTheDocument();
  });

  it('beim Blättern in einen anderen Monat beginnt die Auswahl neu', async () => {
    zeige();
    await screen.findByText('Monat einteilen');
    await kreuze('Anna Adler: Montag');
    await userEvent.click(screen.getByRole('button', { name: 'Nächster Monat' }));
    await screen.findByText(monatText(monatVersatz(monat, 1)));
    expect(await screen.findByLabelText('Anna Adler: Montag')).not.toBeChecked();
  });

  it('zeigt Fehler der Datenbank und behält die Auswahl', async () => {
    vi.mocked(api.wendeDienstplanAn).mockRejectedValue(new Error('x'));
    zeige();
    await screen.findByText('Monat einteilen');
    await kreuze('Anna Adler: Montag');
    await speichern();
    expect(await screen.findByText('Der Dienstplan konnte nicht gespeichert werden.')).toBeInTheDocument();
    expect(screen.getByLabelText('Anna Adler: Montag')).toBeChecked();
  });

  it('Regeltage und Höchststunden der Teilzeitkraft stehen als Hinweis dabei', async () => {
    vi.mocked(api.holeTreffTeam).mockResolvedValue([...team.slice(0, 1), { ...team[1]!, tzk_regeltage: 'Mo, Mi', tzk_max_stunden: 40 }, ...team.slice(2)]);
    zeige();
    expect(await screen.findByText('Regeltage: Mo, Mi · höchstens 40 Std./Monat')).toBeInTheDocument();
  });
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

  it('Schließzeit eintragen: Zeitraum und Grund; „bis“ wird mit „von“ vorbelegt', async () => {
    vi.mocked(api.speichereSchliesszeit).mockResolvedValue(undefined);
    await zeige(leitung);
    await userEvent.type(screen.getByLabelText('Geschlossen von'), morgen);
    expect(screen.getByLabelText('Geschlossen bis')).toHaveValue(morgen);
    await userEvent.type(screen.getByLabelText('Grund (optional)'), 'Sommerpause');
    await userEvent.click(screen.getByRole('button', { name: 'Schließzeit eintragen' }));
    expect(api.speichereSchliesszeit).toHaveBeenCalledWith('t1', morgen, morgen, 'Sommerpause');
  });

  it('Schließzeit: Ende vor Beginn wird abgelehnt; vorhandene lassen sich löschen', async () => {
    vi.mocked(api.loescheSchliesszeit).mockResolvedValue(undefined);
    vi.mocked(api.listeSchliesszeiten).mockResolvedValue([{ id: 's1', treff_id: 't1', von: '2030-07-01', bis: '2030-07-21', grund: 'Sommerpause' }]);
    await zeige(leitung);
    expect(await screen.findByText('Sommerpause')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Geschlossen von'), addTage(heute, 5));
    await userEvent.clear(screen.getByLabelText('Geschlossen bis'));
    await userEvent.type(screen.getByLabelText('Geschlossen bis'), addTage(heute, 2));
    await userEvent.click(screen.getByRole('button', { name: 'Schließzeit eintragen' }));
    expect(screen.getByText('Das Ende darf nicht vor dem Beginn liegen.')).toBeInTheDocument();
    expect(api.speichereSchliesszeit).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /^Schließzeit .* löschen$/ }));
    expect(api.loescheSchliesszeit).toHaveBeenCalledWith('s1');
  });

  it('verlangt Datum und Bezeichnung für Feiertage', async () => {
    await zeige(leitung);
    await userEvent.click(screen.getByRole('button', { name: 'Feiertag eintragen' }));
    expect(screen.getByText('Bitte Datum und Bezeichnung angeben.')).toBeInTheDocument();
    expect(api.speichereFeiertag).not.toHaveBeenCalled();
  });
});
