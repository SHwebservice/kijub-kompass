import { describe, it, expect, vi, beforeEach } from 'vitest';
import { axeVerstoesse } from '../../test-a11y';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '../../freizeiten/api';
import { sendePush } from '../../mitteilungen/senden';
import { FreizeitenListe } from './FreizeitenListe';
import { renderMitAuth } from '../../test-utils';
import { freizeit, inTagen } from '../../test-daten';

vi.mock('../../freizeiten/api');

const liste = [
  freizeit({ id: 'meine', name: 'Meine Sommerfreizeit', ferienzeitraum: 'sommer', ferienwoche: 1, ort_name: 'Mörscher Au' }),
  freizeit({ id: 'fremd', name: 'Fremde Freizeit', ferienzeitraum: 'sommer', ferienwoche: 2, start_datum: inTagen(40), ende_datum: inTagen(44) }),
  freizeit({ id: 'bald', name: 'Zu kurzfristig', start_datum: inTagen(3), ende_datum: inTagen(7) }),
  freizeit({ id: 'abgesagt', name: 'Abgesagte Freizeit', status: 'abgesagt', start_datum: inTagen(50), ende_datum: inTagen(54) }),
  freizeit({ id: 'alt', name: 'Alte Freizeit', start_datum: inTagen(-40), ende_datum: inTagen(-36) }),
  freizeit({ id: 'laeuft', name: 'Laufende Freizeit', start_datum: inTagen(-1), ende_datum: inTagen(2) }),
];

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.listeFreizeiten).mockResolvedValue(liste);
  vi.mocked(api.meineBewerbungen).mockResolvedValue([]);
  vi.mocked(api.holeVorlaufTage).mockResolvedValue(7);
  vi.mocked(api.bewerben).mockResolvedValue(undefined);
  vi.mocked(api.bewerbungZurueckziehen).mockResolvedValue(undefined);
});

const teamerMitZuordnung = { freizeiten: [{ freizeit_id: 'meine', rolle: 'teamer' as const }, { freizeit_id: 'alt', rolle: 'teamer' as const }] };

describe('Freizeiten-Liste: Teamer mit Zuordnung', () => {
  it('zeigt zuerst nur die eigenen, kommenden Freizeiten mit Rolle', async () => {
    renderMitAuth(<FreizeitenListe />, teamerMitZuordnung);
    expect(await screen.findByText('Meine Sommerfreizeit')).toBeInTheDocument();
    expect(screen.queryByText('Fremde Freizeit')).not.toBeInTheDocument();
    expect(screen.queryByText('Alte Freizeit')).not.toBeInTheDocument();
    expect(screen.getByText('Team')).toBeInTheDocument();
    expect(screen.getByText('Mörscher Au')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sommer' })).toBeInTheDocument();
  });

  it('jede Freizeit hat ihren Farbstreifen; eine gewählte Farbe geht vor', async () => {
    vi.mocked(api.listeFreizeiten).mockResolvedValue([{ ...liste[0]!, farbe: 'petrol' }, ...liste.slice(1)]);
    renderMitAuth(<FreizeitenListe />, teamerMitZuordnung);
    const eintrag = (await screen.findByText('Meine Sommerfreizeit')).closest('li')!;
    expect(eintrag).toHaveClass('fz-streifen');
    expect(eintrag.style.getPropertyValue('--fz-farbe')).toBe('#2C7DA0');
  });

  it('die Reiter: Meine, Alle kommenden, Vergangene', async () => {
    renderMitAuth(<FreizeitenListe />, teamerMitZuordnung);
    await screen.findByText('Meine Sommerfreizeit');
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Meine', 'Alle kommenden', 'Vergangene']);
    await userEvent.click(screen.getByRole('tab', { name: 'Vergangene' }));
    expect(screen.getByText('Alte Freizeit')).toBeInTheDocument();
    expect(screen.queryByText('Meine Sommerfreizeit')).not.toBeInTheDocument();
  });

  it('Alle kommenden: Bewerben nur, wo es erlaubt ist (nicht zu kurzfristig, nicht abgesagt, nicht schon im Team)', async () => {
    renderMitAuth(<FreizeitenListe />, teamerMitZuordnung);
    await userEvent.click(await screen.findByRole('tab', { name: 'Alle kommenden' }));
    const zeile = (name: string) => screen.getByText(name).closest('li')!;
    expect(within(zeile('Fremde Freizeit')).getByRole('button', { name: 'Bewerben' })).toBeInTheDocument();
    expect(within(zeile('Zu kurzfristig')).queryByRole('button', { name: 'Bewerben' })).not.toBeInTheDocument();
    expect(within(zeile('Abgesagte Freizeit')).queryByRole('button', { name: 'Bewerben' })).not.toBeInTheDocument();
    expect(within(zeile('Abgesagte Freizeit')).getByText('Abgesagt')).toBeInTheDocument();
    expect(within(zeile('Meine Sommerfreizeit')).queryByRole('button', { name: 'Bewerben' })).not.toBeInTheDocument();
    expect(within(zeile('Laufende Freizeit')).getByText('Läuft')).toBeInTheDocument();
    expect(within(zeile('Zu kurzfristig')).getByText(/Startet in 3 Tagen/)).toBeInTheDocument();
  });

  it('bewirbt sich mit Nachricht', async () => {
    renderMitAuth(<FreizeitenListe />, teamerMitZuordnung);
    await userEvent.click(await screen.findByRole('tab', { name: 'Alle kommenden' }));
    await userEvent.click(within(screen.getByText('Fremde Freizeit').closest('li')!).getByRole('button', { name: 'Bewerben' }));
    await userEvent.type(screen.getByLabelText(/Nachricht an die Koordination/), 'Gern in Woche 2');
    await userEvent.click(screen.getByRole('button', { name: 'Bewerbung senden' }));
    expect(api.bewerben).toHaveBeenCalledWith('fremd', 'ich', 'Gern in Woche 2');
    expect(sendePush).toHaveBeenCalledWith('bewerbung', 'fremd');                   // die Koordination erfährt von der Bewerbung
    expect(await screen.findByText(/Bewerbung für „Fremde Freizeit" ist eingegangen/)).toBeInTheDocument();
  });

  it('zeigt Fehler der Bewerbung verständlich', async () => {
    vi.mocked(api.bewerben).mockRejectedValue({ code: '23505', message: 'duplicate key' });      // misslungene Bewerbung: keine Mitteilung
    renderMitAuth(<FreizeitenListe />, teamerMitZuordnung);
    await userEvent.click(await screen.findByRole('tab', { name: 'Alle kommenden' }));
    await userEvent.click(within(screen.getByText('Fremde Freizeit').closest('li')!).getByRole('button', { name: 'Bewerben' }));
    await userEvent.click(screen.getByRole('button', { name: 'Bewerbung senden' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Das gibt es schon.');
  });

  it('offene Bewerbung: Badge und Zurückziehen mit Rückfrage; keine zweite Bewerbung möglich', async () => {
    vi.mocked(api.meineBewerbungen).mockResolvedValue([{ freizeit_id: 'fremd', status: 'offen' }]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderMitAuth(<FreizeitenListe />, teamerMitZuordnung);
    await userEvent.click(await screen.findByRole('tab', { name: 'Alle kommenden' }));
    const z = screen.getByText('Fremde Freizeit').closest('li')!;
    expect(within(z).getByText('Beworben')).toBeInTheDocument();
    expect(within(z).queryByRole('button', { name: 'Bewerben' })).not.toBeInTheDocument();
    await userEvent.click(within(z).getByRole('button', { name: 'Zurückziehen' }));
    expect(api.bewerbungZurueckziehen).toHaveBeenCalledWith('fremd', 'ich');
    expect(await screen.findByText('Die Bewerbung wurde zurückgezogen.')).toBeInTheDocument();
  });

  it('abgelehnte Bewerbung wird angezeigt, ohne erneut bewerben zu können', async () => {
    vi.mocked(api.meineBewerbungen).mockResolvedValue([{ freizeit_id: 'fremd', status: 'abgelehnt' }]);
    renderMitAuth(<FreizeitenListe />, teamerMitZuordnung);
    await userEvent.click(await screen.findByRole('tab', { name: 'Alle kommenden' }));
    const z = screen.getByText('Fremde Freizeit').closest('li')!;
    expect(within(z).getByText('Bewerbung abgelehnt')).toBeInTheDocument();
    expect(within(z).queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('Freizeiten-Liste: andere Rollen', () => {
  it('TeamerIn ohne Zuordnung startet bei „Alle kommenden"', async () => {
    renderMitAuth(<FreizeitenListe />);
    expect(await screen.findByText('Fremde Freizeit')).toBeInTheDocument();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Alle kommenden', 'Vergangene']);
  });

  it('Hauptamtliche ohne Zuordnung bewerben sich nicht und sehen nur „Meine"', async () => {
    renderMitAuth(<FreizeitenListe />, { ich: { kategorie: 'Hauptamtliche*r' } });
    expect(await screen.findByText('Du bist noch keiner Freizeit zugeordnet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bewerben' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Alle kommenden' })).not.toBeInTheDocument();
  });

  it('Leitung sieht die eigene Freizeit mit Rolle Leitung', async () => {
    renderMitAuth(<FreizeitenListe />, { ich: { kategorie: 'Hauptamtliche*r' }, freizeiten: [{ freizeit_id: 'meine', rolle: 'leitung' }] });
    await screen.findByText('Meine Sommerfreizeit');
    expect(screen.getByText('Leitung')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Neue Freizeit' })).not.toBeInTheDocument();
  });

  it('Koordination sieht alle Freizeiten, den Knopf „Neue Freizeit" und kann sich nicht bewerben', async () => {
    renderMitAuth(<FreizeitenListe />, { ich: { ist_koordination: true, kategorie: 'Hauptamtliche*r' } });
    expect(await screen.findByText('Fremde Freizeit')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Neue Freizeit' })).toHaveAttribute('href', '/freizeiten/neu');
    expect(screen.queryByRole('button', { name: 'Bewerben' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Vergangene' }));
    expect(screen.getByText('Alte Freizeit')).toBeInTheDocument();
  });

  it('zeigt Ladefehler', async () => {
    vi.mocked(api.listeFreizeiten).mockRejectedValue(new Error('x'));
    renderMitAuth(<FreizeitenListe />);
    expect(await screen.findByRole('alert')).toHaveTextContent('konnten nicht geladen werden');
  });
});

describe('Barrierefreiheit (axe)', () => {
  it('keine Verstöße gegen gängige Regeln', async () => {
    renderMitAuth(<FreizeitenListe />, teamerMitZuordnung);
    await screen.findByText('Meine Sommerfreizeit');
    expect(await axeVerstoesse(document.body)).toEqual([]);
  });
});
