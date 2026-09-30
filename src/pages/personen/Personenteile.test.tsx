import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PersonAnlegen } from './PersonAnlegen';
import { PersonenListe } from './PersonenListe';
import { Filterleiste } from './Filterleiste';
import { StartpasswortAnzeige, zugangsStatus } from './Startpasswort';
import type { PersonZeile } from '../../zuordnung/api';

const person = (id: string, vorname: string, o: Partial<PersonZeile> = {}): PersonZeile => ({
  id, vorname, nachname: 'Test', mail: `${vorname.toLowerCase()}@kijub.example`, kategorie: 'TeamerIn', aktiv: true, ist_freizeitkoordination: false, ist_treffkoordination: false,
  auth_user_id: 'u', eingeladen_am: null, ...o,
});

describe('PersonAnlegen', () => {
  it('der Knopf ist gesperrt, bis Vor-, Nachname und eine Mail-Adresse da sind', async () => {
    render(<PersonAnlegen anlegen={async () => true} />);
    const knopf = screen.getByRole('button', { name: 'Person anlegen' });
    expect(knopf).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Vorname'), 'Anna');
    await userEvent.type(screen.getByLabelText('Nachname'), 'Adler');
    await userEvent.type(screen.getByLabelText('Mail-Adresse'), 'anna');
    expect(knopf).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Mail-Adresse'), '@kijub.example');
    expect(knopf).toBeEnabled();
  });

  it('übergibt die Eingaben (Kategorie wählbar) und leert das Formular nur, wenn es geklappt hat', async () => {
    const anlegen = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
    render(<PersonAnlegen anlegen={anlegen} />);
    await userEvent.type(screen.getByLabelText('Vorname'), 'Anna');
    await userEvent.type(screen.getByLabelText('Nachname'), 'Adler');
    await userEvent.type(screen.getByLabelText('Mail-Adresse'), 'anna@kijub.example');
    await userEvent.selectOptions(screen.getByLabelText('Kategorie'), 'TZK');
    await userEvent.click(screen.getByRole('button', { name: 'Person anlegen' }));
    expect(anlegen).toHaveBeenCalledWith({ vorname: 'Anna', nachname: 'Adler', mail: 'anna@kijub.example', kategorie: 'TZK' });
    expect(screen.getByLabelText('Vorname')).toHaveValue('Anna');           // nicht geklappt: Eingaben bleiben
    await userEvent.click(screen.getByRole('button', { name: 'Person anlegen' }));
    expect(screen.getByLabelText('Vorname')).toHaveValue('');
    expect(screen.getByLabelText('Kategorie')).toHaveValue('TeamerIn');
  });
});

describe('PersonenListe', () => {
  const zeige = (personen: PersonZeile[], o: Partial<Parameters<typeof PersonenListe>[0]> = {}) => {
    const r = { oeffneZuordnung: vi.fn(), zugangEinrichten: vi.fn(), aktivieren: vi.fn(), entfernen: vi.fn() };
    render(<PersonenListe personen={personen} zusammenfassung={(p) => (p.id === 'a' ? '2 Freizeiten' : '')} ichId="ich" arbeitet={null} {...r} {...o} />);
    return r;
  };

  it('zeigt Mail, Kategorie, Zugangsstatus, Schilder der Koordination und die Kurzfassung der Zuordnungen', () => {
    zeige([person('a', 'Anna', { ist_freizeitkoordination: true, ist_treffkoordination: true, auth_user_id: null }), person('b', 'Ben', { aktiv: false })]);
    const anna = screen.getByText('Anna Test').closest('li')!;
    expect(anna).toHaveTextContent('anna@kijub.example');
    expect(anna).toHaveTextContent('Noch kein Zugang');
    expect(anna).toHaveTextContent('Freizeitenkoordination');
    expect(anna).toHaveTextContent('Treffkoordination');
    expect(anna).toHaveTextContent('2 Freizeiten');
    const ben = screen.getByText('Ben Test').closest('li')!;
    expect(ben).toHaveTextContent('Deaktiviert');
    expect(within(ben).getByRole('button', { name: 'Aktivieren' })).toBeInTheDocument();
    expect(within(ben).queryByRole('button', { name: /Zugang|Passwort/ })).not.toBeInTheDocument();
  });

  it('die Knöpfe je Person rufen das Richtige auf; „Zugang einrichten“ oder „Passwort zurücksetzen“ je nach Zugang', async () => {
    const r = zeige([person('a', 'Anna', { auth_user_id: null }), person('b', 'Ben')]);
    const anna = screen.getByText('Anna Test').closest('li')!;
    const ben = screen.getByText('Ben Test').closest('li')!;
    await userEvent.click(within(anna).getByRole('button', { name: 'Zugang einrichten' }));
    await userEvent.click(within(ben).getByRole('button', { name: 'Passwort zurücksetzen' }));
    await userEvent.click(within(ben).getByRole('button', { name: 'Zuordnungen von Ben Test' }));
    await userEvent.click(within(ben).getByRole('button', { name: 'Entfernen …' }));
    expect(r.zugangEinrichten.mock.calls.map((c) => (c[0] as PersonZeile).id)).toEqual(['a', 'b']);
    expect(r.oeffneZuordnung).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }));
    expect(r.entfernen).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }));
  });

  it('die eigene Person lässt sich nicht entfernen', () => {
    zeige([person('ich', 'Ich')]);
    expect(screen.queryByRole('button', { name: 'Entfernen …' })).not.toBeInTheDocument();
  });

  it('während ein Zugang eingerichtet wird, ist dessen Knopf beschäftigt', () => {
    zeige([person('a', 'Anna')], { arbeitet: 'a' });
    expect(screen.getByRole('button', { name: 'Passwort zurücksetzen' })).toHaveAttribute('aria-busy', 'true');
  });
});

describe('Filterleiste', () => {
  const props = () => ({
    ansicht: 'liste' as const, setzeAnsicht: vi.fn(), suche: '', setzeSuche: vi.fn(), kategorie: '', setzeKategorie: vi.fn(), zeitraum: 'aktuell' as const, setzeZeitraum: vi.fn(),
    jahre: [2028, 2027], mitDeaktivierten: false, setzeMitDeaktivierten: vi.fn(),
  });

  it('Liste: Suche und Kategorie; Zeitraum und „auch deaktivierte“ nur in der Zuordnungsansicht', async () => {
    const p = props();
    const { rerender } = render(<Filterleiste {...p} />);
    expect(screen.getByRole('button', { name: 'Liste' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByLabelText('Freizeiten')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Auch deaktivierte Personen zeigen')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Zuordnungen' }));
    expect(p.setzeAnsicht).toHaveBeenCalledWith('zuordnung');
    rerender(<Filterleiste {...p} ansicht="zuordnung" />);
    expect(screen.getByLabelText('Freizeiten')).toBeInTheDocument();
    expect(screen.getByLabelText('Auch deaktivierte Personen zeigen')).toBeInTheDocument();
  });

  it('meldet Eingaben weiter: Suche, Kategorie, Jahr („aktuell“ oder Zahl), deaktivierte', async () => {
    const p = props();
    render(<Filterleiste {...p} ansicht="zuordnung" />);
    await userEvent.type(screen.getByLabelText('Suchen'), 'a');
    expect(p.setzeSuche).toHaveBeenCalledWith('a');
    await userEvent.selectOptions(screen.getByLabelText('Nach Kategorie filtern'), 'TZK');
    expect(p.setzeKategorie).toHaveBeenCalledWith('TZK');
    await userEvent.selectOptions(screen.getByLabelText('Freizeiten'), '2027');
    expect(p.setzeZeitraum).toHaveBeenCalledWith(2027);
    await userEvent.selectOptions(screen.getByLabelText('Freizeiten'), 'aktuell');
    expect(p.setzeZeitraum).toHaveBeenLastCalledWith('aktuell');
    await userEvent.click(screen.getByLabelText('Auch deaktivierte Personen zeigen'));
    expect(p.setzeMitDeaktivierten).toHaveBeenCalledWith(true);
  });
});

describe('Startpasswort', () => {
  it('Zugangsstatus aus den Daten', () => {
    expect(zugangsStatus({ auth_user_id: 'u' }).text).toBe('Zugang eingerichtet');
    expect(zugangsStatus({ auth_user_id: null }).text).toBe('Noch kein Zugang');
  });

  it('zeigt das Passwort einmal mit Hinweis, kopiert es und schließt', async () => {
    const schliessen = vi.fn();
    const schreibe = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: schreibe }, configurable: true });
    render(<StartpasswortAnzeige s={{ name: 'Anna Adler', mail: 'anna@kijub.example', passwort: 'Geheim-1234', neu: true }} schliessen={schliessen} />);
    expect(screen.getByRole('heading', { name: 'Zugang eingerichtet für Anna Adler' })).toBeInTheDocument();
    expect(screen.getByTestId('startpasswort')).toHaveTextContent('Geheim-1234');
    expect(screen.getByText(/nur jetzt angezeigt und nirgends gespeichert/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Passwort kopieren' }));
    expect(schreibe).toHaveBeenCalledWith('Geheim-1234');
    expect(await screen.findByRole('button', { name: 'Kopiert ✓' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Fertig' }));
    expect(schliessen).toHaveBeenCalled();
  });

  it('bei einem neuen Startpasswort einer bestehenden Person lautet die Überschrift anders', () => {
    render(<StartpasswortAnzeige s={{ name: 'Ben', mail: 'b@x.de', passwort: 'x', neu: false }} schliessen={() => undefined} />);
    expect(screen.getByRole('heading', { name: 'Neues Startpasswort für Ben' })).toBeInTheDocument();
  });
});
