import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '../../freizeiten/api';
import { FreizeitDetail } from './FreizeitDetail';
import { renderMitAuth, type Szene } from '../../test-utils';
import { freizeitDetail, mitglied } from '../../test-daten';

vi.mock('../../freizeiten/api');

const detail = freizeitDetail({
  id: 'f1', name: 'Sommer-Sause', ferienzeitraum: 'sommer', ferienwoche: 1, ort_id: 'o', ort_name: 'Mörscher Au',
  ort_adresse: 'Au 1, Frankenthal', alter_von: 6, alter_bis: 11, max_teilnehmende: 48, arbeitsbeginn: '07:30', arbeitsende: '17:00',
  tags: ['Küche', 'Schwimmen/Wasser'], start_datum: '2027-07-05', ende_datum: '2027-07-09',
});

function zeige(szene: Szene, pfad = '/freizeiten/f1') {
  return renderMitAuth(<FreizeitDetail />, { ...szene, pfad, route: '/freizeiten/:id/*' });
}
const tabNamen = () => screen.getAllByRole('link').filter((l) => l.classList.contains('tabs__tab')).map((l) => l.textContent);

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.holeFreizeit).mockResolvedValue(detail);
  vi.mocked(api.holeVerpflegung).mockResolvedValue([
    { datum: null, mischkost: 50, vegetarisch: 3, allergiker: 3 },
    { datum: '2027-07-05', mischkost: 52, vegetarisch: 4, allergiker: 1 },
  ]);
  vi.mocked(api.holeMaterial).mockResolvedValue([{ id: 'm1', name: 'Bälle', einheit: 'Stück', menge: 10, notiz: null }]);
  vi.mocked(api.holeTeam).mockResolvedValue([]);
  vi.mocked(api.listePersonen).mockResolvedValue([]);
});

describe('Freizeit-Detail: Reiter je Rolle', () => {
  it('TeamerIn: Übersicht, Wochenplan, Hinweise, Team – ohne Lebensmittel', async () => {
    zeige({ freizeiten: [{ freizeit_id: 'f1', rolle: 'teamer' }] });
    await screen.findByRole('heading', { name: 'Sommer-Sause' });
    expect(tabNamen()).toEqual(['Übersicht', 'Wochenplan', 'Hinweise', 'Team']);
    expect(screen.getByText('Team', { selector: '.badge' })).toBeInTheDocument();
  });

  it('Leitung: zusätzlich Lebensmittel', async () => {
    zeige({ ich: { kategorie: 'Hauptamtliche*r' }, freizeiten: [{ freizeit_id: 'f1', rolle: 'leitung' }] });
    await screen.findByRole('heading', { name: 'Sommer-Sause' });
    expect(tabNamen()).toEqual(['Übersicht', 'Wochenplan', 'Hinweise', 'Lebensmittel', 'Team']);
    expect(screen.getByText('Leitung', { selector: '.badge' })).toBeInTheDocument();
  });

  it('Koordination: alle Reiter und „Bearbeiten"', async () => {
    zeige({ ich: { ist_koordination: true, kategorie: 'Hauptamtliche*r' } });
    await screen.findByRole('heading', { name: 'Sommer-Sause' });
    expect(tabNamen()).toHaveLength(5);
    expect(screen.getByRole('link', { name: 'Bearbeiten' })).toHaveAttribute('href', '/freizeiten/f1/bearbeiten');
  });

  it('Gast (nur Bewerbende): nur die Übersicht, keine Reiter, kein Bearbeiten, keine Verpflegung', async () => {
    zeige({});
    await screen.findByRole('heading', { name: 'Sommer-Sause' });
    expect(screen.queryByRole('navigation', { name: 'Bereiche der Freizeit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Bearbeiten' })).not.toBeInTheDocument();
    expect(screen.queryByText('Verpflegung')).not.toBeInTheDocument();
    expect(api.holeVerpflegung).not.toHaveBeenCalled();
  });

  it('Gast wird von gesperrten Reitern zur Übersicht zurückgeleitet', async () => {
    zeige({}, '/freizeiten/f1/team');
    expect(await screen.findByRole('heading', { name: 'Stammdaten' })).toBeInTheDocument();
    expect(api.holeTeam).not.toHaveBeenCalled();
  });

  it('TeamerIn erreicht Lebensmittel nicht, auch nicht per Adresse', async () => {
    zeige({ freizeiten: [{ freizeit_id: 'f1', rolle: 'teamer' }] }, '/freizeiten/f1/lebensmittel');
    expect(await screen.findByRole('heading', { name: 'Stammdaten' })).toBeInTheDocument();
  });

  it('nicht gefundene oder nicht erlaubte Freizeit: verständliche Meldung', async () => {
    vi.mocked(api.holeFreizeit).mockResolvedValue(null);
    zeige({});
    expect(await screen.findByText('Freizeit nicht gefunden')).toBeInTheDocument();
  });

  it('Ladefehler wird angezeigt', async () => {
    vi.mocked(api.holeFreizeit).mockRejectedValue(new Error('x'));
    zeige({});
    expect(await screen.findByRole('alert')).toHaveTextContent('konnten nicht geladen werden');
  });

  it('abgesagte Freizeit ist gekennzeichnet; KiJuKo-Hinweis nur für die Koordination', async () => {
    vi.mocked(api.holeFreizeit).mockResolvedValue({ ...detail, status: 'abgesagt', kijuko_entfallen_am: '2027-01-01T00:00:00Z' });
    zeige({ ich: { ist_koordination: true } });
    expect(await screen.findByText('Abgesagt')).toBeInTheDocument();
    expect(screen.getByText(/in der letzten KiJuKo-Sicherung nicht mehr enthalten/)).toBeInTheDocument();
  });
});

describe('Freizeit-Übersicht', () => {
  it('zeigt Stammdaten', async () => {
    zeige({ freizeiten: [{ freizeit_id: 'f1', rolle: 'teamer' }] });
    const karte = (await screen.findByRole('heading', { name: 'Stammdaten' })).closest('section')!;
    expect(within(karte).getByText('05.07.2027 – 09.07.2027 (5 Tage)')).toBeInTheDocument();
    expect(within(karte).getByText('Au 1, Frankenthal')).toBeInTheDocument();
    expect(within(karte).getByText('07:30 – 17:00 Uhr')).toBeInTheDocument();
    expect(within(karte).getByText('6–11 Jahre')).toBeInTheDocument();
    expect(within(karte).getByText('48')).toBeInTheDocument();
    expect(within(karte).getByText('Küche')).toBeInTheDocument();
  });

  it('TeamerIn sieht keine Verpflegung und kein Material (nur Leitung und Koordination)', async () => {
    zeige({ freizeiten: [{ freizeit_id: 'f1', rolle: 'teamer' }] });
    await screen.findByRole('heading', { name: 'Stammdaten' });
    expect(screen.queryByRole('heading', { name: 'Verpflegung' })).not.toBeInTheDocument();
    expect(api.holeVerpflegung).not.toHaveBeenCalled();
    expect(api.holeMaterial).not.toHaveBeenCalled();
  });

  it('Leitung sieht Verpflegung (gesamt und pro Tag) und Material', async () => {
    zeige({ ich: { kategorie: 'Hauptamtliche*r' }, freizeiten: [{ freizeit_id: 'f1', rolle: 'leitung' }] });
    expect(await screen.findByText(/50 Mischkost · 3 vegetarisch · 3 Allergiker/)).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Mo 05\.07\.\s*52\s*4\s*1/ })).toBeInTheDocument();
    expect(screen.getByText('Bälle')).toBeInTheDocument();
    expect(screen.getAllByText(/Aus KiJuKo übernommen/)).toHaveLength(2);
  });
});

describe('Team-Reiter', () => {
  const team = [
    mitglied({ person_id: 'p1', vorname: 'Tom', nachname: 'Zeh', rolle: 'teamer' }),
    mitglied({ person_id: 'p2', vorname: 'Lea', nachname: 'Leitner', rolle: 'leitung', mail: 'lea@test.example', telefon: '0170 123', ernaehrung: 'Vegan', notizen: 'Nussallergie' }),
  ];

  it('zeigt die Leitung zuerst; Kontaktdaten nur, wenn die Datenbank sie mitliefert', async () => {
    vi.mocked(api.holeTeam).mockResolvedValue(team);
    zeige({ ich: { kategorie: 'Hauptamtliche*r' }, freizeiten: [{ freizeit_id: 'f1', rolle: 'leitung' }] }, '/freizeiten/f1/team');
    const eintraege = await screen.findAllByRole('listitem');
    expect(within(eintraege[0]!).getByText('Lea Leitner')).toBeInTheDocument();
    expect(within(eintraege[0]!).getByRole('link', { name: 'lea@test.example' })).toHaveAttribute('href', 'mailto:lea@test.example');
    expect(within(eintraege[0]!).getByRole('link', { name: '0170 123' })).toHaveAttribute('href', 'tel:0170123');
    expect(within(eintraege[0]!).getByText('Nussallergie')).toBeInTheDocument();
    expect(within(eintraege[1]!).getByText('Tom Zeh')).toBeInTheDocument();
  });

  it('TeamerIn sieht Namen, aber keine Kontaktdaten und keine Verwaltung', async () => {
    vi.mocked(api.holeTeam).mockResolvedValue([mitglied({ person_id: 'p1', vorname: 'Tom', nachname: 'Zeh' }), mitglied({ person_id: 'p2', vorname: 'Lea', nachname: 'Leitner', rolle: 'leitung' })]);
    zeige({ freizeiten: [{ freizeit_id: 'f1', rolle: 'teamer' }] }, '/freizeiten/f1/team');
    await screen.findByText('Lea Leitner');
    expect(screen.queryByRole('link', { name: /@/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Kontaktdaten der anderen sehen nur die Leitung/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Entfernen' })).not.toBeInTheDocument();
    expect(screen.queryByText('Person zuordnen')).not.toBeInTheDocument();
    expect(api.listePersonen).not.toHaveBeenCalled();
  });

  it('Koordination ordnet zu (nur aktive, noch nicht im Team), ändert die Rolle und entfernt', async () => {
    vi.mocked(api.holeTeam).mockResolvedValue(team);
    vi.mocked(api.listePersonen).mockResolvedValue([
      { id: 'p1', vorname: 'Tom', nachname: 'Zeh', kategorie: 'TeamerIn', aktiv: true },
      { id: 'p3', vorname: 'Ida', nachname: 'Neu', kategorie: 'FSJ', aktiv: true },
      { id: 'p4', vorname: 'Inge', nachname: 'Inaktiv', kategorie: 'TeamerIn', aktiv: false },
    ]);
    vi.mocked(api.teamHinzufuegen).mockResolvedValue(undefined);
    vi.mocked(api.teamRolleAendern).mockResolvedValue(undefined);
    vi.mocked(api.teamEntfernen).mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    zeige({ ich: { ist_koordination: true, kategorie: 'Hauptamtliche*r' } }, '/freizeiten/f1/team');
    await screen.findByText('Tom Zeh');

    const auswahl = screen.getByLabelText('Person');
    expect(within(auswahl).getAllByRole('option').map((o) => o.textContent)).toEqual(['– bitte wählen –', 'Neu, Ida (FSJ)']);
    const zuordnen = screen.getByRole('button', { name: 'Zuordnen' });
    expect(zuordnen).toBeDisabled();
    await userEvent.selectOptions(auswahl, 'p3');
    await userEvent.selectOptions(screen.getByLabelText('Rolle'), 'leitung');
    await userEvent.click(zuordnen);
    expect(api.teamHinzufuegen).toHaveBeenCalledWith('f1', 'p3', 'leitung');

    await userEvent.selectOptions(screen.getByLabelText('Rolle von Tom Zeh'), 'leitung');
    expect(api.teamRolleAendern).toHaveBeenCalledWith('f1', 'p1', 'leitung');

    const tom = screen.getByText('Tom Zeh').closest('li')!;
    await userEvent.click(within(tom).getByRole('button', { name: 'Entfernen' }));
    expect(api.teamEntfernen).toHaveBeenCalledWith('f1', 'p1');
  });

  it('Entfernen wird abgebrochen, wenn die Rückfrage verneint wird', async () => {
    vi.mocked(api.holeTeam).mockResolvedValue(team);
    vi.mocked(api.listePersonen).mockResolvedValue([]);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    zeige({ ich: { ist_koordination: true } }, '/freizeiten/f1/team');
    await userEvent.click(within((await screen.findByText('Tom Zeh')).closest('li')!).getByRole('button', { name: 'Entfernen' }));
    expect(api.teamEntfernen).not.toHaveBeenCalled();
  });

  it('zeigt Fehler beim Zuordnen verständlich', async () => {
    vi.mocked(api.holeTeam).mockResolvedValue([]);
    vi.mocked(api.listePersonen).mockResolvedValue([{ id: 'p3', vorname: 'Ida', nachname: 'Neu', kategorie: 'FSJ', aktiv: true }]);
    vi.mocked(api.teamHinzufuegen).mockRejectedValue({ code: '42501', message: 'row-level security' });
    zeige({ ich: { ist_koordination: true } }, '/freizeiten/f1/team');
    await userEvent.selectOptions(await screen.findByLabelText('Person'), 'p3');
    await userEvent.click(screen.getByRole('button', { name: 'Zuordnen' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Dafür fehlt die Berechtigung.');
  });
});
