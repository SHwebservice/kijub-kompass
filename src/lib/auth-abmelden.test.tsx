import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider } from './auth';
import { useAuth } from './auth-kontext';

const ablauf = vi.hoisted(() => ({ schritte: [] as string[] }));

vi.mock('../mitteilungen/geraet', () => ({ schalteAus: async (id: string) => { ablauf.schritte.push(`geraet-ab:${id}`); } }));
vi.mock('./supabase', () => {
  const ergebnis = <T,>(result: T) => { const o: Record<string, unknown> = {}; o.select = () => o; o.eq = () => o; o.maybeSingle = async () => result; o.then = (r: (v: T) => unknown) => Promise.resolve(result).then(r); return o; };
  return {
    konfiguriert: true,
    supabase: {
      auth: {
        getSession: async () => ({ data: { session: { user: { id: 'u1', user_metadata: {} } } } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
        signOut: async () => { ablauf.schritte.push('signOut'); },
      },
      from: (t: string) => (t === 'personen' ? ergebnis({ data: { id: 'p1', vorname: 'A', nachname: 'B', mail: 'a@b.de', kategorie: 'TeamerIn', ist_koordination: false }, error: null }) : ergebnis({ data: [], error: null })),
    },
  };
});

function Sonde() {
  const { status, abmelden } = useAuth();
  return <div><span data-testid="status">{status}</span><button onClick={() => void abmelden()}>raus</button></div>;
}

describe('Abmelden', () => {
  it('meldet zuerst das Gerät für Mitteilungen der Person ab und dann die Person selbst', async () => {
    render(<AuthProvider><Sonde /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('bereit'));
    await userEvent.click(screen.getByText('raus'));
    await waitFor(() => expect(ablauf.schritte).toEqual(['geraet-ab:p1', 'signOut']));
  });
});
