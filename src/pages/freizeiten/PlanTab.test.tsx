import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '../../freizeiten/api';
import { PlanTab } from './PlanTab';
import { renderMitAuth } from '../../test-utils';
import { freizeitDetail, inTagen } from '../../test-daten';
import type { AngebotKurz, PlanEintrag, Slot } from '../../freizeiten/plan';
import type { RolleInFreizeit } from '../../lib/rollen';

vi.mock('../../freizeiten/api');

const tag1 = inTagen(1);
const tag2 = inTagen(2);
const f = freizeitDetail({ id: 'f1', start_datum: tag1, ende_datum: tag2 });
const slots: Slot[] = [{ id: 's1', name: 'Vormittag', position: 1 }, { id: 's2', name: 'Nachmittag', position: 2 }];
const eintrag = (o: Partial<PlanEintrag> & { id: string }): PlanEintrag => ({
  datum: tag1, slot_id: 's1', angebot_id: null, angebot_name: null, angebot_kategorie: null, freitext: null, notiz: null,
  erstellt_von: null, created_at: '2027-06-01T10:00:00Z', ...o,
});
const eintraege = [
  eintrag({ id: 'e1', angebot_id: 'a1', angebot_name: 'Fangen', angebot_kategorie: 'bewegung', notiz: 'Bälle mitbringen', erstellt_von: 'ich' }),
  eintrag({ id: 'e2', freitext: 'Ausflug ins Schwimmbad', erstellt_von: 'lea', created_at: '2027-06-02T10:00:00Z' }),
];
const katalog: AngebotKurz[] = [
  { id: 'a1', name: 'Fangen', kategorie: 'bewegung', dauer: '20 Min.', gruppe: null, wetter: null, alter_gruppen: [] },
  { id: 'a2', name: 'Schnitzeljagd', kategorie: 'highlight', dauer: null, gruppe: null, wetter: null, alter_gruppen: [] },
  { id: 'a3', name: 'Wasserbomben', kategorie: 'wasser', dauer: null, gruppe: null, wetter: null, alter_gruppen: [] },
];

function zeige(rolle: RolleInFreizeit, szene = {}) {
  return renderMitAuth(<PlanTab freizeit={f} rolle={rolle} />, szene);
}
const teamer = { freizeiten: [{ freizeit_id: 'f1', rolle: 'teamer' as const }] };
const leitung = { ich: { kategorie: 'Hauptamtliche*r' as const }, freizeiten: [{ freizeit_id: 'f1', rolle: 'leitung' as const }] };
const zelle = (tag: string, slot: string) => screen.getByRole('group', { name: new RegExp(`^${slot} am \\S+ ${tag.slice(8, 10)}\\.${tag.slice(5, 7)}\\.`) });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.listeSlots).mockResolvedValue(slots);
  vi.mocked(api.listeEintraege).mockResolvedValue(eintraege);
  vi.mocked(api.listeAngebote).mockResolvedValue(katalog);
  vi.mocked(api.holeNamen).mockResolvedValue({ ich: 'Anna Adler', lea: 'Lea Leitner' });
  for (const fn of [api.trageEin, api.aendereEintrag, api.loescheEintrag, api.slotHinzufuegen, api.slotPositionen] as const) {
    vi.mocked(fn as (...a: never[]) => Promise<void>).mockResolvedValue(undefined);
  }
});

describe('Wochenplan: Anzeige', () => {
  it('zeigt jeden Tag mit allen Zeitabschnitten und den Einträgen', async () => {
    zeige('teamer', teamer);
    expect(await screen.findAllByRole('heading', { level: 2 })).toHaveLength(2);
    const vm = zelle(tag1, 'Vormittag');
    expect(within(vm).getByText(/Fangen/)).toBeInTheDocument();
    expect(within(vm).getByText('📝 Bälle mitbringen')).toBeInTheDocument();
    expect(await within(vm).findByText('von Anna Adler')).toBeInTheDocument();
    expect(within(vm).getByText(/Ausflug ins Schwimmbad/)).toBeInTheDocument();
    expect(await within(vm).findByText('von Lea Leitner')).toBeInTheDocument();
    expect(within(zelle(tag2, 'Nachmittag')).queryByRole('button', { name: /Fangen/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole('group')).toHaveLength(4);
  });

  it('Einträge erscheinen in der Reihenfolge des Eintragens', async () => {
    zeige('teamer', teamer);
    const vm = await screen.findAllByRole('group').then(() => zelle(tag1, 'Vormittag'));
    const titel = within(vm).getAllByRole('button').map((b) => b.textContent);
    expect(titel[0]).toContain('Fangen');
    expect(titel[1]).toContain('Ausflug');
  });

  it('zeigt Ladefehler', async () => {
    vi.mocked(api.listeEintraege).mockRejectedValue(new Error('x'));
    zeige('teamer', teamer);
    expect(await screen.findByRole('alert')).toHaveTextContent('konnten nicht geladen werden');
  });
});

describe('Wochenplan: TeamerIn', () => {
  it('trägt einen Katalog-Punkt ein; Freitext gibt es für TeamerInnen nicht', async () => {
    zeige('teamer', teamer);
    await screen.findByText(/Fangen/);
    await userEvent.click(within(zelle(tag2, 'Vormittag')).getByRole('button', { name: /Eintragen/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByRole('tab', { name: 'Freitext' })).not.toBeInTheDocument();
    await userEvent.click(await within(dialog).findByRole('button', { name: /Schnitzeljagd/ }));
    expect(api.trageEin).toHaveBeenCalledWith('f1', tag2, 's1', { angebot_id: 'a2', freitext: null, notiz: null });
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('sucht im Katalog und filtert nach Kategorie', async () => {
    zeige('teamer', teamer);
    await screen.findByText(/Fangen/);
    await userEvent.click(within(zelle(tag2, 'Vormittag')).getByRole('button', { name: /Eintragen/ }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByRole('button', { name: /Schnitzeljagd/ });
    await userEvent.type(within(dialog).getByLabelText('Suchen'), 'wasser');
    expect(within(dialog).getAllByRole('button', { name: /Wasserbomben|Schnitzeljagd|Fangen/ })).toHaveLength(1);
    await userEvent.clear(within(dialog).getByLabelText('Suchen'));
    await userEvent.click(within(within(dialog).getByRole('group', { name: 'Kategorie' })).getByRole('button', { name: /Highlights/ }));
    expect(within(dialog).getByRole('button', { name: /Schnitzeljagd/ })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /Wasserbomben/ })).not.toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText('Suchen'), 'gibtesnicht');
    expect(within(dialog).getByText('Nichts gefunden.')).toBeInTheDocument();
  });

  it('ändert Notiz und entfernt den EIGENEN Eintrag', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    zeige('teamer', teamer);
    await userEvent.click(await screen.findByRole('button', { name: /Fangen/ }));
    const dialog = await screen.findByRole('dialog');
    const notiz = within(dialog).getByLabelText('Notiz');
    expect(notiz).toHaveValue('Bälle mitbringen');
    expect(within(dialog).getByRole('button', { name: 'Notiz speichern' })).toBeDisabled();
    await userEvent.clear(notiz);
    await userEvent.type(notiz, 'Treffpunkt Wiese');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Notiz speichern' }));
    expect(api.aendereEintrag).toHaveBeenCalledWith('e1', { notiz: 'Treffpunkt Wiese' });
  });

  it('eine geleerte Notiz wird als „keine Notiz" gespeichert', async () => {
    zeige('teamer', teamer);
    await userEvent.click(await screen.findByRole('button', { name: /Fangen/ }));
    await userEvent.clear(within(await screen.findByRole('dialog')).getByLabelText('Notiz'));
    await userEvent.click(screen.getByRole('button', { name: 'Notiz speichern' }));
    expect(api.aendereEintrag).toHaveBeenCalledWith('e1', { notiz: null });
  });

  it('entfernt nach Rückfrage; bei „Nein" bleibt alles', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    zeige('teamer', teamer);
    await userEvent.click(await screen.findByRole('button', { name: /Fangen/ }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Entfernen' }));
    expect(api.loescheEintrag).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Entfernen' }));
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(api.loescheEintrag).toHaveBeenCalledWith('e1');
  });

  it('ein FREMDER Eintrag ist nur lesbar: keine Änderungs-Knöpfe, Hinweis', async () => {
    zeige('teamer', teamer);
    await userEvent.click(await screen.findByRole('button', { name: /Ausflug ins Schwimmbad/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Du kannst nur deine eigenen Einträge ändern.')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Entfernen' })).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText('Notiz')).not.toBeInTheDocument();
    expect(within(dialog).getByText(/eingetragen von Lea Leitner/)).toBeInTheDocument();
  });

  it('keine Verwaltung der Zeitabschnitte', async () => {
    zeige('teamer', teamer);
    await screen.findByText(/Fangen/);
    expect(screen.queryByRole('button', { name: /Abend-Slot/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /nach oben/ })).not.toBeInTheDocument();
  });

  it('leerer Katalog: verständlicher Hinweis statt leerer Liste', async () => {
    vi.mocked(api.listeAngebote).mockResolvedValue([]);
    zeige('teamer', teamer);
    await screen.findByText(/Fangen/);
    await userEvent.click(within(zelle(tag2, 'Vormittag')).getByRole('button', { name: /Eintragen/ }));
    expect(await screen.findByText('Der Katalog ist noch leer')).toBeInTheDocument();
    expect(screen.getByText(/Sobald die Koordination Programmpunkte angelegt hat/)).toBeInTheDocument();
  });

  it('zeigt Fehler beim Eintragen verständlich und lässt das Fenster offen', async () => {
    vi.mocked(api.trageEin).mockRejectedValue({ code: '42501', message: 'row-level security' });
    zeige('teamer', teamer);
    await screen.findByText(/Fangen/);
    await userEvent.click(within(zelle(tag2, 'Vormittag')).getByRole('button', { name: /Eintragen/ }));
    await userEvent.click(await screen.findByRole('button', { name: /Schnitzeljagd/ }));
    expect(await screen.findByText('Dafür fehlt die Berechtigung.')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('Escape schließt das Fenster', async () => {
    zeige('teamer', teamer);
    await screen.findByText(/Fangen/);
    await userEvent.click(within(zelle(tag2, 'Vormittag')).getByRole('button', { name: /Eintragen/ }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('Wochenplan: Leitung und Koordination', () => {
  it('trägt Freitext ein', async () => {
    zeige('leitung', leitung);
    await screen.findByText(/Fangen/);
    await userEvent.click(within(zelle(tag2, 'Nachmittag')).getByRole('button', { name: /Eintragen/ }));
    await userEvent.click(await screen.findByRole('tab', { name: 'Freitext' }));
    const knopf = screen.getByRole('button', { name: 'Eintragen' });
    expect(knopf).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Was steht an?'), '  Elterncafé ');
    await userEvent.click(knopf);
    expect(api.trageEin).toHaveBeenCalledWith('f1', tag2, 's2', { angebot_id: null, freitext: 'Elterncafé', notiz: null });
  });

  it('ändert und entfernt auch Einträge anderer', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    zeige('leitung', leitung);
    await userEvent.click(await screen.findByRole('button', { name: /Ausflug ins Schwimmbad/ }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Entfernen' }));
    expect(api.loescheEintrag).toHaveBeenCalledWith('e2');
  });

  it('tauscht den Programmpunkt eines Eintrags (Katalog → anderer Katalog-Punkt)', async () => {
    zeige('leitung', leitung);
    await userEvent.click(await screen.findByRole('button', { name: /Fangen/ }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Programmpunkt ändern' }));
    await userEvent.click(await screen.findByRole('button', { name: /Wasserbomben/ }));
    expect(api.aendereEintrag).toHaveBeenCalledWith('e1', { angebot_id: 'a3', freitext: null });
  });

  it('fügt den Abend-Zeitabschnitt hinzu, solange es ihn nicht gibt', async () => {
    zeige('leitung', leitung);
    await userEvent.click(await screen.findByRole('button', { name: '+ Abend-Slot hinzufügen' }));
    expect(api.slotHinzufuegen).toHaveBeenCalledWith('f1', 'Abend', 3);
  });

  it('kein Abend-Knopf, wenn es den Abend schon gibt', async () => {
    vi.mocked(api.listeSlots).mockResolvedValue([...slots, { id: 's3', name: 'Abend', position: 3 }]);
    zeige('leitung', leitung);
    await screen.findByText(/Fangen/);
    expect(screen.queryByRole('button', { name: /Abend-Slot/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole('group')).toHaveLength(6);
  });

  it('ändert die Reihenfolge der Zeitabschnitte; am Rand sind die Pfeile gesperrt', async () => {
    zeige('leitung', leitung);
    await screen.findByText(/Fangen/);
    expect(screen.getByRole('button', { name: 'Zeitabschnitt „Vormittag“ nach oben' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Zeitabschnitt „Nachmittag“ nach unten' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Zeitabschnitt „Vormittag“ nach unten' }));
    expect(api.slotPositionen).toHaveBeenCalledWith([{ id: 's1', position: 2 }, { id: 's2', position: 1 }]);
  });

  it('Koordination hat dieselben Möglichkeiten', async () => {
    zeige('koordination', { ich: { ist_koordination: true, kategorie: 'Hauptamtliche*r' as const } });
    await screen.findByText(/Fangen/);
    expect(screen.getByRole('button', { name: '+ Abend-Slot hinzufügen' })).toBeInTheDocument();
    await userEvent.click(within(zelle(tag2, 'Vormittag')).getByRole('button', { name: /Eintragen/ }));
    expect(await screen.findByRole('tab', { name: 'Freitext' })).toBeInTheDocument();
  });

  it('Fehler bei Zeitabschnitten erscheinen als Hinweis', async () => {
    vi.mocked(api.slotHinzufuegen).mockRejectedValue({ code: '23505', message: 'dup' });
    zeige('leitung', leitung);
    await userEvent.click(await screen.findByRole('button', { name: '+ Abend-Slot hinzufügen' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Das gibt es schon.');
  });
});
