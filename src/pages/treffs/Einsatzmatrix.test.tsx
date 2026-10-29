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

const ohneLeer = (t: string | null) => (t ?? '').replace(/\s/g, '');
/** Spalte einer Person (Kopfzeile: Tag, Personen …, Besetzung). */
const spalte = (name: string) => within(screen.getByRole('table')).getAllByRole('columnheader').findIndex((h) => ohneLeer(h.textContent).includes(ohneLeer(name)));
/** Zeile eines Tages („Mo 1.“) oder der Summen („Tage“, „Std.“). */
const zeile = (tag: RegExp | string) => screen.getByRole('rowheader', { name: tag }).closest('tr')!;
const zelle = (tag: RegExp | string, name: string) => zeile(tag).children[spalte(name)] as HTMLElement;
const besetzung = (tag: RegExp) => zeile(tag).lastElementChild as HTMLElement;
const MO1 = /^Mo 1\./; const MI3 = /^Mi 3\./; const MO8 = /^Mo 8\./;

describe('Einsatzmatrix', () => {
  it('Tage links in den Zeilen, Mitarbeitende oben in den Spalten (die eigene Spalte zuerst)', () => {
    zeige([]);
    const tabelle = screen.getByRole('table');
    expect(within(tabelle).getAllByRole('rowheader').map((h) => ohneLeer(h.textContent).slice(0, 4))).toEqual(['Mo1.', 'Mi3.', 'Mo8.', 'Tage']);
    const kopf = within(tabelle).getAllByRole('columnheader');
    expect(kopf[0]).toHaveTextContent('Tag');
    expect([spalte('Anna Adler'), spalte('Lea Leitner'), spalte('Ben Baum')]).toEqual([1, 2, 3]);
    expect(kopf[1]).toHaveTextContent('du');
    expect(kopf[2]).toHaveTextContent('Leitung');
    expect(kopf.at(-1)).toHaveTextContent('Besetzung');
  });

  it('macht Einsätze, Sonderdienste und Abwesenheit auch für Hilfsmittel lesbar', () => {
    zeige([
      dienst({ id: 'a', datum: '2027-03-01', personen: ['ich', 'lea'] }),
      dienst({ id: 's', datum: '2027-03-03', ist_sonder: true, bezeichnung: 'Kinoabend', personen: ['ben'] }),
    ]);
    expect(within(zelle(MO1, 'Anna Adler')).getByText('eingeteilt')).toBeInTheDocument();
    expect(within(zelle(MI3, 'Ben Baum')).getByText('Sonderdienst: Kinoabend')).toBeInTheDocument();
    expect(within(zelle(MO8, 'Ben Baum')).getByText('abwesend: Urlaub')).toBeInTheDocument();
    expect(within(zelle(MO1, 'Lea Leitner')).getByText('eingeteilt')).toBeInTheDocument();
  });

  it('die eigene Spalte ist hervorgehoben, Tage je Person und Besetzung je Tag stimmen', () => {
    zeige([dienst({ id: 'a', datum: '2027-03-01', personen: ['ich', 'lea'] }), dienst({ id: 'b', datum: '2027-03-03', personen: ['ich'] })]);
    expect(zelle(MO1, 'Anna Adler')).toHaveClass('einsatz__zelle--ich');
    expect(zelle(MO1, 'Lea Leitner')).not.toHaveClass('einsatz__zelle--ich');
    expect(zelle('Tage', 'Anna Adler')).toHaveTextContent('2');
    expect(zelle('Tage', 'Lea Leitner')).toHaveTextContent('1');
    expect([besetzung(MO1), besetzung(MI3), besetzung(MO8)].map((c) => c.textContent)).toEqual(['2', '1', '0']);
  });

  it('Öffnungstage ohne Besetzung: Warnung und rote Markierung – nur heute und später', () => {
    zeige([dienst({ id: 'a', datum: '2027-03-01', personen: ['ich'] })]);          // 03.03. und 08.03. offen
    expect(screen.getByText('2 Öffnungstage sind noch nicht besetzt (rot markiert).')).toBeInTheDocument();
    expect(besetzung(MI3)).toHaveClass('einsatz__leer');
    expect(besetzung(MO1)).not.toHaveClass('einsatz__leer');
    expect(screen.getByRole('rowheader', { name: /^Mi 3\..*noch nicht besetzt/ })).toHaveClass('einsatz__tag--leer');
  });

  it('der heutige Tag ist markiert', () => {
    zeige([], { heute: '2027-03-03' });
    expect(screen.getByRole('rowheader', { name: /Mi 3\. \(heute\)/ })).toHaveClass('einsatz__tag--heute');
  });

  it('Wünsche und ihre Erklärung erscheinen nur für die Verwaltung', () => {
    const d = dienst({ id: 'a', datum: '2027-03-01', wuensche: [{ person_id: 'ben', status: 'offen' }] });
    const { unmount } = zeige([d], { wuensche: true });
    expect(within(zelle(MO1, 'Ben Baum')).getByText('wünscht den Dienst')).toBeInTheDocument();
    expect(screen.getByText('Wunsch offen')).toBeInTheDocument();
    unmount();
    zeige([d]);
    expect(screen.queryByText('wünscht den Dienst')).not.toBeInTheDocument();
    expect(screen.queryByText('Wunsch offen')).not.toBeInTheDocument();
  });

  it('unterbesetzte Tage (unter der Mindestbesetzung) sind orange und werden gemeldet', () => {
    const karten = tageskarten(tage, oeffnung, [dienst({ id: 'a', datum: '2027-03-03', personen: ['ich'] }), dienst({ id: 'b', datum: '2027-03-08', personen: ['ich', 'ben'] })]);
    render(<Einsatzmatrix karten={karten} mitglieder={mitglieder} abwesenheiten={[]} feiertage={[]} treffId="t1" ichId="ich" heute="2027-03-02" mitWuenschen={false} zeitraum="Monat" mindestbesetzung={2} />);
    expect(screen.getByText('Ein Öffnungstag hat weniger als 2 Personen (orange markiert).')).toBeInTheDocument();
    expect(besetzung(MI3)).toHaveClass('einsatz__knapp');
  });

  it('„kann nicht“ erscheint mit ✕ und in der Zeichenerklärung', () => {
    const karten = tageskarten(tage, oeffnung, []);
    render(<Einsatzmatrix karten={karten} mitglieder={mitglieder} abwesenheiten={[{ id: 'v', person_id: 'ben', datum: '2027-03-03', typ: 'verhindert', notiz: null }]}
      feiertage={[]} treffId="t1" ichId="ich" heute="2027-03-02" mitWuenschen zeitraum="Monat" />);
    expect(within(zelle(MI3, 'Ben Baum')).getByText('kann nicht')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Zeichenerklärung' })).getByText(/kann nicht/)).toBeInTheDocument();
  });

  it('Stunden mit Höchststunden (Zeile „Std.“ unten): rot, wenn darüber', () => {
    const team = mitglieder.map((m) => (m.person_id === 'ben' ? { ...m, tzk_max_stunden: 5 } : m));
    const karten = tageskarten(tage, oeffnung, [dienst({ id: 'a', datum: '2027-03-01', personen: ['ben'] }), dienst({ id: 'b', datum: '2027-03-03', von: '14:00', bis: '18:00', personen: ['ben'] })]);
    render(<Einsatzmatrix karten={karten} mitglieder={team} abwesenheiten={[]} feiertage={[]} treffId="t1" ichId="ich" heute="2027-03-02" mitWuenschen zeitraum="Monat" stunden={{ mitHoechst: true }} />);
    const std = zelle('Std.', 'Ben Baum');
    expect(std).toHaveTextContent('8 h / 5 h');
    expect(std).toHaveClass('einsatz__zuviel');
  });

  it('linke Spalte: Tage sind Knöpfe, wenn ein Tagesfenster geöffnet werden kann', () => {
    const geoeffnet: string[] = [];
    render(<Einsatzmatrix karten={tageskarten(tage, oeffnung, [])} mitglieder={mitglieder} abwesenheiten={[]} feiertage={[]} treffId="t1" ichId="ich" heute="2027-03-02"
      mitWuenschen={false} zeitraum="Monat" tagOeffnen={(d) => geoeffnet.push(d)} />);
    screen.getByRole('button', { name: /^Mi 03\.03\. öffnen/ }).click();
    expect(geoeffnet).toEqual(['2027-03-03']);
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
