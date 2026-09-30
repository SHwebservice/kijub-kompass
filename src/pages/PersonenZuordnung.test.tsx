import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as zApi from '../zuordnung/api';
import * as fzApi from '../freizeiten/api';
import * as treffApi from '../treffs/api';
import { Personen } from './Personen';
import { renderMitAuth } from '../test-utils';
import { freizeit, inTagen, treff } from '../test-daten';

vi.mock('../zuordnung/api');
vi.mock('../freizeiten/api');
vi.mock('../treffs/api');

const person = (id: string, vorname: string, nachname: string, o: Partial<zApi.PersonZeile> = {}): zApi.PersonZeile => ({
  id, vorname, nachname, mail: `${vorname.toLowerCase()}@kijub.example`, kategorie: 'TeamerIn', aktiv: true, ist_freizeitkoordination: false, ist_treffkoordination: false, auth_user_id: 'u', eingeladen_am: null, ...o,
});

const anna = person('anna', 'Anna', 'Adler');
const ben = person('ben', 'Ben', 'Baum', { kategorie: 'TZK' });
const carla = person('carla', 'Carla', 'Cord', { aktiv: false });

const sommer1 = freizeit({ id: 'f1', name: 'Sommer 1', start_datum: inTagen(5), ende_datum: inTagen(9) });
const sommer2 = freizeit({ id: 'f2', name: 'Sommer 2', start_datum: inTagen(7), ende_datum: inTagen(11) });      // überschneidet sich mit Sommer 1
const herbst = freizeit({ id: 'f3', name: 'Herbst', start_datum: inTagen(60), ende_datum: inTagen(64) });
const alt = freizeit({ id: 'f0', name: 'Frühjahr', start_datum: inTagen(-40), ende_datum: inTagen(-36) });

const nord = { ...treff({ id: 't1', name: 'Treff Nord' }), oeffnungszeiten: [] };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(zApi.listePersonenVoll).mockResolvedValue([anna, ben, carla]);
  vi.mocked(zApi.listeFreizeitTeams).mockResolvedValue([{ freizeit_id: 'f1', person_id: 'anna', rolle: 'leitung' }, { freizeit_id: 'f0', person_id: 'anna', rolle: 'teamer' }]);
  vi.mocked(zApi.listeTreffTeams).mockResolvedValue([{ treff_id: 't1', person_id: 'ben', rolle: 'betreuerin' }]);
  vi.mocked(zApi.setzeFreizeitRolle).mockResolvedValue(undefined);
  vi.mocked(zApi.setzeTreffRolle).mockResolvedValue(undefined);
  vi.mocked(zApi.setzeKoordination).mockResolvedValue(undefined);
  vi.mocked(fzApi.listeFreizeiten).mockResolvedValue([sommer1, sommer2, herbst, alt]);
  vi.mocked(treffApi.listeTreffs).mockResolvedValue([nord]);
});

const zeige = () => renderMitAuth(<Personen />, { ich: { ist_koordination: true, kategorie: 'Hauptamtliche*r' } });
const zurTabelle = async () => {
  const u = userEvent.setup();
  zeige();
  await screen.findByText('Anna Adler');
  await u.click(screen.getByRole('button', { name: 'Zuordnungen' }));
  await screen.findByRole('table');
  return u;
};
const zelle = (person: string, spalte: string) => screen.getByRole('combobox', { name: `${person}: ${spalte}` }) as HTMLSelectElement;

describe('Personen: Listenansicht', () => {
  it('zeigt alle Personen (auch deaktivierte) mit Kurzfassung der Zuordnungen', async () => {
    zeige();
    await screen.findByText('Anna Adler');
    expect(screen.getByText('Carla Cord')).toBeInTheDocument();
    expect(await screen.findByText('1 Freizeit')).toBeInTheDocument();          // Anna: Sommer 1 (Frühjahr ist vorbei)
    expect(screen.getByText('1 Treff')).toBeInTheDocument();
  });

  it('Kategorie-Filter und Suche', async () => {
    const u = userEvent.setup();
    zeige();
    await screen.findByText('Anna Adler');
    await u.selectOptions(screen.getByLabelText('Nach Kategorie filtern'), 'TZK');
    expect(screen.queryByText('Anna Adler')).not.toBeInTheDocument();
    expect(screen.getByText('Ben Baum')).toBeInTheDocument();
    await u.selectOptions(screen.getByLabelText('Nach Kategorie filtern'), '');
    await u.type(screen.getByLabelText('Suchen'), 'carl');
    expect(screen.queryByText('Ben Baum')).not.toBeInTheDocument();
    expect(screen.getByText('Carla Cord')).toBeInTheDocument();
  });
});

describe('Personen: Tabelle mit Zuordnungen', () => {
  it('Spalten: laufende und kommende Freizeiten und alle Treffs; vergangene und deaktivierte erst auf Wunsch', async () => {
    const u = await zurTabelle();
    const kopf = within(screen.getByRole('table')).getAllByRole('columnheader').map((h) => h.textContent);
    expect(kopf.some((t) => t?.startsWith('Sommer 1'))).toBe(true);
    expect(kopf.some((t) => t?.startsWith('Sommer 2'))).toBe(true);
    expect(kopf.some((t) => t?.startsWith('Herbst'))).toBe(true);
    expect(kopf.some((t) => t?.startsWith('Treff Nord'))).toBe(true);
    expect(kopf.some((t) => t?.startsWith('Frühjahr'))).toBe(false);
    expect(screen.queryByRole('button', { name: /Zuordnungen von Carla Cord/ })).not.toBeInTheDocument();
    await u.click(screen.getByLabelText('Auch deaktivierte Personen zeigen'));
    expect(screen.getByRole('button', { name: /Zuordnungen von Carla Cord/ })).toBeInTheDocument();
  });

  it('die Zellen zeigen die Rolle; Kopf nennt Anzahl und fehlende Leitung', async () => {
    await zurTabelle();
    expect(zelle('Anna Adler', 'Sommer 1').value).toBe('leitung');
    expect(zelle('Ben Baum', 'Sommer 1').value).toBe('');
    expect(zelle('Ben Baum', 'Treff Nord').value).toBe('betreuerin');
    const kopf = screen.getByRole('columnheader', { name: /Sommer 1/ });
    expect(kopf).toHaveTextContent('1 Leitung · 0 Team');
    expect(kopf).not.toHaveTextContent('Keine Leitung');
    expect(screen.getByRole('columnheader', { name: /Herbst/ })).toHaveTextContent('Keine Leitung');
  });

  it('eine Zelle ändern ordnet zu, wechselt die Rolle und entfernt – die Anzeige folgt sofort', async () => {
    const u = await zurTabelle();
    await u.selectOptions(zelle('Ben Baum', 'Herbst'), 'teamer');
    expect(zApi.setzeFreizeitRolle).toHaveBeenLastCalledWith('f3', 'ben', 'teamer');
    expect(zelle('Ben Baum', 'Herbst').value).toBe('teamer');
    expect(screen.getByRole('columnheader', { name: /Herbst/ })).toHaveTextContent('0 Leitung · 1 Team');

    await u.selectOptions(zelle('Ben Baum', 'Herbst'), 'leitung');
    expect(zApi.setzeFreizeitRolle).toHaveBeenLastCalledWith('f3', 'ben', 'leitung');
    expect(screen.getByRole('columnheader', { name: /Herbst/ })).not.toHaveTextContent('Keine Leitung');

    await u.selectOptions(zelle('Ben Baum', 'Herbst'), '');
    expect(zApi.setzeFreizeitRolle).toHaveBeenLastCalledWith('f3', 'ben', null);
    expect(zelle('Ben Baum', 'Herbst').value).toBe('');
  });

  it('Treffs: Rolle setzen; Kategorien, die nicht in einen Treff dürfen, sind gesperrt', async () => {
    const u = await zurTabelle();
    await u.selectOptions(zelle('Ben Baum', 'Treff Nord'), 'treffleitung');
    expect(zApi.setzeTreffRolle).toHaveBeenCalledWith('t1', 'ben', 'treffleitung');
    expect(zelle('Anna Adler', 'Treff Nord')).toBeDisabled();              // TeamerIn darf in keinen Treff
    expect(zelle('Anna Adler', 'Treff Nord').title).toMatch(/TeamerIn.*keinem Treff/);
  });

  it('warnt bei Überschneidung: Markierung, Hinweis beim Zuordnen, Text an der Zelle', async () => {
    const u = await zurTabelle();
    expect(screen.queryByText('Überschneidung')).not.toBeInTheDocument();
    await u.selectOptions(zelle('Anna Adler', 'Sommer 2'), 'teamer');
    expect(await screen.findByText(/Achtung: Anna Adler ist zur selben Zeit auch eingeteilt in Sommer 1/)).toBeInTheDocument();
    expect(zelle('Anna Adler', 'Sommer 1').title).toMatch(/Überschneidet sich mit: Sommer 2/);
    expect(screen.getByText('Überschneidung')).toBeInTheDocument();
    await u.selectOptions(zelle('Anna Adler', 'Sommer 2'), '');
    expect(screen.queryByText('Überschneidung')).not.toBeInTheDocument();
  });

  it('ein Fehler beim Speichern wird angezeigt, die Anzeige bleibt beim alten Stand', async () => {
    vi.mocked(zApi.setzeFreizeitRolle).mockRejectedValue({ code: '42501', message: 'row-level security' });
    const u = await zurTabelle();
    await u.selectOptions(zelle('Ben Baum', 'Herbst'), 'teamer');
    expect(await screen.findByRole('alert')).toHaveTextContent('Dafür fehlt die Berechtigung.');
    expect(zelle('Ben Baum', 'Herbst').value).toBe('');
  });

  it('Zeitraum wechseln: alle Freizeiten eines Jahres, auch vergangene', async () => {
    const u = await zurTabelle();
    const jahr = inTagen(-40).slice(0, 4);
    await u.selectOptions(screen.getByLabelText('Freizeiten'), jahr);
    expect(screen.getByRole('columnheader', { name: /Frühjahr/ })).toBeInTheDocument();
    expect(zelle('Anna Adler', 'Frühjahr').value).toBe('teamer');
  });

  it('Filter gelten auch in der Tabelle', async () => {
    const u = await zurTabelle();
    await u.selectOptions(screen.getByLabelText('Nach Kategorie filtern'), 'TZK');
    expect(screen.queryByRole('button', { name: /Zuordnungen von Anna Adler/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Zuordnungen von Ben Baum/ })).toBeInTheDocument();
  });
});

describe('Personen: Fenster mit den Zuordnungen einer Person', () => {
  it('zeigt Freizeiten (ohne vergangene) und Treffs der Person und ändert Zuordnungen', async () => {
    const u = userEvent.setup();
    zeige();
    await screen.findByText('Anna Adler');
    await u.click(screen.getByRole('button', { name: 'Zuordnungen von Anna Adler' }));
    const dialog = await screen.findByRole('dialog', { name: 'Zuordnungen · Anna Adler' });
    const freizeiten = within(within(dialog).getByRole('list', { name: 'Freizeiten' }));
    expect(freizeiten.getAllByRole('listitem').map((l) => l.textContent)).toEqual([
      expect.stringContaining('Frühjahr'), expect.stringContaining('Sommer 1'), expect.stringContaining('Sommer 2'), expect.stringContaining('Herbst'),
    ]);                                                                        // Frühjahr ist vorbei, aber Anna ist zugeordnet
    await u.selectOptions(within(dialog).getByLabelText('Herbst'), 'teamer');
    expect(zApi.setzeFreizeitRolle).toHaveBeenCalledWith('f3', 'anna', 'teamer');
    expect(within(dialog).getByLabelText('Treff Nord')).toBeDisabled();       // TeamerIn kann in keinen Treff
    expect(within(dialog).getByText(/kann keinem Treff zugeordnet werden/)).toBeInTheDocument();
  });

  it('vergangene Freizeiten auf Wunsch', async () => {
    const u = userEvent.setup();
    zeige();
    await screen.findByText('Ben Baum');
    await u.click(screen.getByRole('button', { name: 'Zuordnungen von Ben Baum' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByLabelText('Frühjahr')).not.toBeInTheDocument();
    await u.click(within(dialog).getByLabelText('Vergangene Freizeiten anzeigen'));
    expect(within(dialog).getByLabelText('Frühjahr')).toBeInTheDocument();
    await u.selectOptions(within(dialog).getByLabelText('Treff Nord'), 'treffleitung');
    expect(zApi.setzeTreffRolle).toHaveBeenCalledWith('t1', 'ben', 'treffleitung');
  });

  it('die Tabelle öffnet das Fenster über den Namen der Person', async () => {
    const u = await zurTabelle();
    await u.click(screen.getByRole('button', { name: 'Zuordnungen von Ben Baum öffnen' }));
    expect(await screen.findByRole('dialog', { name: 'Zuordnungen · Ben Baum' })).toBeInTheDocument();
  });
});

describe('Personen: Koordination je Bereich', () => {
  it('die Liste zeigt, wer Freizeiten- und wer Treffkoordination ist', async () => {
    vi.mocked(zApi.listePersonenVoll).mockResolvedValue([
      person('k1', 'Kim', 'Kopf', { ist_freizeitkoordination: true }),
      person('k2', 'Tom', 'Tief', { ist_treffkoordination: true }),
      person('k3', 'Bea', 'Beide', { ist_freizeitkoordination: true, ist_treffkoordination: true }),
      anna,
    ]);
    zeige();
    await screen.findByText('Kim Kopf');
    const zeile = (n: string) => screen.getByText(n).closest('li')!;
    expect(within(zeile('Kim Kopf')).getByText('Freizeitenkoordination')).toBeInTheDocument();
    expect(within(zeile('Kim Kopf')).queryByText('Treffkoordination')).not.toBeInTheDocument();
    expect(within(zeile('Tom Tief')).getByText('Treffkoordination')).toBeInTheDocument();
    expect(within(zeile('Tom Tief')).queryByText('Freizeitenkoordination')).not.toBeInTheDocument();
    expect(within(zeile('Bea Beide')).getByText('Freizeitenkoordination')).toBeInTheDocument();
    expect(within(zeile('Bea Beide')).getByText('Treffkoordination')).toBeInTheDocument();
    expect(within(zeile('Anna Adler')).queryByText(/koordination/i)).not.toBeInTheDocument();
  });

  it('im Fenster der Person lässt sich jeder Bereich einzeln vergeben und zurücknehmen', async () => {
    vi.mocked(zApi.listePersonenVoll).mockResolvedValue([person('k1', 'Kim', 'Kopf', { ist_freizeitkoordination: true }), anna]);
    const u = userEvent.setup();
    zeige();
    await screen.findByText('Kim Kopf');
    await u.click(screen.getByRole('button', { name: 'Zuordnungen von Kim Kopf' }));
    const dialog = await screen.findByRole('dialog');
    const fk = within(dialog).getByRole('checkbox', { name: /Freizeitenkoordination/ });
    const tk = within(dialog).getByRole('checkbox', { name: /Treffkoordination/ });
    expect(fk).toBeChecked();
    expect(tk).not.toBeChecked();
    await u.click(tk);
    expect(zApi.setzeKoordination).toHaveBeenLastCalledWith('k1', 'treffs', true);
    await u.click(fk);
    expect(zApi.setzeKoordination).toHaveBeenLastCalledWith('k1', 'freizeiten', false);
  });

  it('die letzte Koordination eines Bereichs lässt sich nicht abgeben – die Meldung der Datenbank erscheint', async () => {
    vi.mocked(zApi.listePersonenVoll).mockResolvedValue([person('k1', 'Kim', 'Kopf', { ist_treffkoordination: true }), anna]);
    vi.mocked(zApi.setzeKoordination).mockRejectedValue({ code: '23514', message: 'Die letzte aktive Koordination der Treffs kann nicht gelöscht, deaktiviert oder herabgestuft werden' });
    const u = userEvent.setup();
    zeige();
    await screen.findByText('Kim Kopf');
    await u.click(screen.getByRole('button', { name: 'Zuordnungen von Kim Kopf' }));
    await u.click(within(await screen.findByRole('dialog')).getByRole('checkbox', { name: /Treffkoordination/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/letzte aktive Koordination der Treffs/);
  });

  it('deaktivierte Personen lassen sich nicht zur Koordination machen', async () => {
    vi.mocked(zApi.listePersonenVoll).mockResolvedValue([carla, anna]);
    const u = userEvent.setup();
    zeige();
    await screen.findByText('Carla Cord');
    await u.click(screen.getByRole('button', { name: 'Zuordnungen von Carla Cord' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('checkbox', { name: /Freizeitenkoordination/ })).toBeDisabled();
    expect(within(dialog).getByRole('checkbox', { name: /Treffkoordination/ })).toBeDisabled();
  });
});

describe('Personen: Entfernen aus einem Treff mit Warnung', () => {
  const zurTreffZelle = async () => {
    const u = userEvent.setup();
    zeige();
    await screen.findByText('Ben Baum');
    await u.click(screen.getByRole('button', { name: 'Zuordnungen' }));
    await screen.findByRole('table');
    return u;
  };

  it('vor dem Entfernen wird gefragt und die Zahl künftiger Dienste genannt; bei „Abbrechen“ bleibt alles', async () => {
    vi.mocked(treffApi.zaehleZukuenftigeDienste).mockResolvedValue(2);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const u = await zurTreffZelle();
    const zelle = () => screen.getByRole('combobox', { name: 'Ben Baum: Treff Nord' }) as HTMLSelectElement;
    await u.selectOptions(zelle(), '');
    expect(confirm.mock.calls[0]![0]).toMatch(/noch in 2 künftigen Diensten/);
    expect(zApi.setzeTreffRolle).not.toHaveBeenCalled();
    expect(zelle().value).toBe('betreuerin');
    await u.selectOptions(zelle(), '');
    expect(zApi.setzeTreffRolle).toHaveBeenCalledWith('t1', 'ben', null);
    confirm.mockRestore();
  });

  it('eine andere Rolle zu wählen fragt nicht nach', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    const u = await zurTreffZelle();
    await u.selectOptions(screen.getByRole('combobox', { name: 'Ben Baum: Treff Nord' }), 'treffleitung');
    expect(confirm).not.toHaveBeenCalled();
    expect(zApi.setzeTreffRolle).toHaveBeenCalledWith('t1', 'ben', 'treffleitung');
    confirm.mockRestore();
  });
});
