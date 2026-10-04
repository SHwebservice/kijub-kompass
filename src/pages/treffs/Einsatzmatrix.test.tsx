import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { axeVerstoesse } from '../../test-a11y';
import { Einsatzmatrix } from './Einsatzmatrix';
import { treffMitglied } from '../../test-daten';
import { tageskarten, type Dienst } from '../../treffs/dienstplan';

const mitglieder = [
  treffMitglied({ person_id: 'lea', vorname: 'Lea', nachname: 'Leitner', rolle: 'treffleitung', kategorie: 'Hauptamtliche*r' }),
  treffMitglied({ person_id: 'ich', vorname: 'Anna', nachname: 'Adler' }),
  treffMitglied({ person_id: 'ben', vorname: 'Ben', nachname: 'Baum' }),
];
const oeffnung = [{ wochentag: 1, von: '15:00', bis: '19:00' }, { wochentag: 3, von: '14:00', bis: '18:00' }];
const dienst = (o: Partial<Dienst> & { id: string; datum: string }): Dienst => ({ von: '15:00', bis: '19:00', ist_sonder: false, bezeichnung: null, personen: [], wuensche: [], ...o });
const tage = ['2027-03-01', '2027-03-03', '2027-03-08'];

const zeige = (dienste: Dienst[], o: { wuensche?: boolean; heute?: string } = {}) => {
  const karten = tageskarten(tage, oeffnung, dienste);
  return render(
    <Einsatzmatrix karten={karten} mitglieder={mitglieder} abwesenheiten={[{ id: 'x', person_id: 'ben', datum: '2027-03-08', typ: 'urlaub', notiz: null }]}
      feiertage={[]} treffId="t1" ichId="ich" heute={o.heute ?? '2027-03-02'} mitWuenschen={o.wuensche ?? false} zeitraum="Monat" />,
  );
};
const zeile = (name: string) => screen.getByRole('row', { name: new RegExp(name) });

describe('Einsatzmatrix', () => {
  it('zeigt Personen in den Zeilen und die Tage als Spalten', () => {
    zeige([]);
    const tabelle = screen.getByRole('table');
    expect(within(tabelle).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('Mo 1.'), expect.stringContaining('Mi 3.'), expect.stringContaining('Mo 8.')]));
    expect(within(tabelle).getAllByRole('rowheader').map((h) => h.textContent)).toEqual(['Lea Leitner (Leitung)', 'Anna Adler', 'Ben Baum', 'Besetzung']);
  });

  it('macht Einsätze, Sonderdienste und Abwesenheit auch für Hilfsmittel lesbar', () => {
    zeige([
      dienst({ id: 'a', datum: '2027-03-01', personen: ['ich', 'lea'] }),
      dienst({ id: 's', datum: '2027-03-03', ist_sonder: true, bezeichnung: 'Kinoabend', personen: ['ben'] }),
    ]);
    expect(within(zeile('Anna Adler')).getByText('eingeteilt')).toBeInTheDocument();
    expect(within(zeile('Ben Baum')).getByText('Sonderdienst: Kinoabend')).toBeInTheDocument();
    expect(within(zeile('Ben Baum')).getByText('abwesend: Urlaub')).toBeInTheDocument();
    expect(within(zeile('Lea Leitner')).getByText('eingeteilt')).toBeInTheDocument();
  });

  it('die eigene Zeile ist hervorgehoben, Summe der Tage und Besetzung je Tag stimmen', () => {
    zeige([dienst({ id: 'a', datum: '2027-03-01', personen: ['ich', 'lea'] }), dienst({ id: 'b', datum: '2027-03-03', personen: ['ich'] })]);
    expect(zeile('Anna Adler')).toHaveClass('einsatz__ich');
    expect(zeile('Lea Leitner')).not.toHaveClass('einsatz__ich');
    expect(within(zeile('Anna Adler')).getAllByRole('cell').at(-1)).toHaveTextContent('2');
    expect(within(zeile('Besetzung')).getAllByRole('cell').map((c) => c.textContent)).toEqual(['2', '1', '0', '']);
  });

  it('Öffnungstage ohne Besetzung: Warnung und rote Markierung – nur heute und später', () => {
    zeige([dienst({ id: 'a', datum: '2027-03-01', personen: ['ich'] })]);          // 03.03. und 08.03. offen
    expect(screen.getByText('2 Öffnungstage sind noch nicht besetzt (rot markiert).')).toBeInTheDocument();
    expect(within(zeile('Besetzung')).getAllByRole('cell')[1]).toHaveClass('einsatz__leer');
    expect(within(zeile('Besetzung')).getAllByRole('cell')[0]).not.toHaveClass('einsatz__leer');
  });

  it('der heutige Tag ist markiert', () => {
    zeige([], { heute: '2027-03-03' });
    expect(screen.getByRole('columnheader', { name: /Mi 3\. \(heute\)/ })).toHaveClass('einsatz__tag--heute');
  });

  it('Wünsche und ihre Erklärung erscheinen nur für die Verwaltung', () => {
    const d = dienst({ id: 'a', datum: '2027-03-01', wuensche: [{ person_id: 'ben', status: 'offen' }] });
    const { unmount } = zeige([d], { wuensche: true });
    expect(within(zeile('Ben Baum')).getByText('wünscht den Dienst')).toBeInTheDocument();
    expect(screen.getByText('Wunsch offen')).toBeInTheDocument();
    unmount();
    zeige([d]);
    expect(screen.queryByText('wünscht den Dienst')).not.toBeInTheDocument();
    expect(screen.queryByText('Wunsch offen')).not.toBeInTheDocument();
  });

  it('zeigt nichts ohne Tage oder ohne Team', () => {
    const { container } = render(<Einsatzmatrix karten={[]} mitglieder={mitglieder} abwesenheiten={[]} feiertage={[]} treffId="t1" ichId="ich" heute="2027-03-02" mitWuenschen={false} zeitraum="Woche" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('Barrierefreiheit (axe): keine Verstöße', async () => {
    const { container } = zeige([dienst({ id: 'a', datum: '2027-03-01', personen: ['ich'] })], { wuensche: true });
    expect(await axeVerstoesse(container)).toEqual([]);
  });
});
