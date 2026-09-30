import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider } from './auth';
import { useAuth } from './auth-kontext';

// Supabase wird durch eine Attrappe ersetzt: Das Verhalten der App wird geprüft, nicht der Server.
const mocks = vi.hoisted(() => {
  const user = { id: 'u1', user_metadata: { muss_passwort_aendern: true } };
  const session = { user };
  const ergebnis = <T,>(result: T) => {
    const o: Record<string, unknown> = {};
    o.select = () => o;
    o.eq = () => o;
    o.maybeSingle = async () => result;
    o.then = (res: (v: T) => unknown) => Promise.resolve(result).then(res);
    return o;
  };
  return {
    user, session, ergebnis,
    updateUser: vi.fn(),
    refreshSession: vi.fn(),
  };
});

vi.mock('./supabase', () => ({
  konfiguriert: true,
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: mocks.session } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
      signInWithPassword: async () => ({ error: null }),
      updateUser: mocks.updateUser,
      refreshSession: mocks.refreshSession,
      signOut: async () => undefined,
    },
    from: (tabelle: string) =>
      tabelle === 'personen'
        ? mocks.ergebnis({ data: { id: 'p1', vorname: 'Anna', nachname: 'A', mail: 'a@a.de', kategorie: 'TeamerIn', ist_koordination: false }, error: null })
        : mocks.ergebnis({ data: [], error: null }),
  },
}));

let letzteAntwort: string | null | undefined;

function Sonde() {
  const { status, mussPasswortAendern, passwortAendern } = useAuth();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="muss">{String(mussPasswortAendern)}</span>
      <button onClick={async () => { letzteAntwort = await passwortAendern('ein-neues-passwort'); }}>ändern</button>
    </div>
  );
}

async function starten() {
  render(<AuthProvider><Sonde /></AuthProvider>);
  await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('bereit'));
}

beforeEach(() => {
  letzteAntwort = undefined;
  mocks.updateUser.mockReset();
  mocks.refreshSession.mockReset().mockResolvedValue({ data: {}, error: null });
});

describe('Passwortänderung nach dem Startpasswort', () => {
  it('die App verlangt die Änderung, solange das Flag im Konto steht', async () => {
    await starten();
    expect(screen.getByTestId('muss')).toHaveTextContent('true');
  });

  it('nach erfolgreicher Änderung ist die Pflicht sofort erledigt – auch wenn die Sitzung noch das alte Flag trägt', async () => {
    mocks.updateUser.mockResolvedValue({
      data: { user: { id: 'u1', user_metadata: { muss_passwort_aendern: false } } }, error: null,
    });
    await starten();
    await userEvent.click(screen.getByText('ändern'));
    await waitFor(() => expect(screen.getByTestId('muss')).toHaveTextContent('false'));
    expect(letzteAntwort).toBeNull();
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: 'ein-neues-passwort', data: { muss_passwort_aendern: false } });
  });

  it('setzt das Flag gezielt nach, wenn die Antwort es noch als "muss ändern" zeigt', async () => {
    mocks.updateUser
      .mockResolvedValueOnce({ data: { user: { id: 'u1', user_metadata: { muss_passwort_aendern: true } } }, error: null })
      .mockResolvedValueOnce({ data: { user: { id: 'u1', user_metadata: { muss_passwort_aendern: false } } }, error: null });
    await starten();
    await userEvent.click(screen.getByText('ändern'));
    await waitFor(() => expect(screen.getByTestId('muss')).toHaveTextContent('false'));
    expect(mocks.updateUser).toHaveBeenCalledTimes(2);
    expect(mocks.updateUser).toHaveBeenLastCalledWith({ data: { muss_passwort_aendern: false } });
  });

  it('meldet einen Fehler, wenn das Flag auch nach dem Nachsetzen nicht gespeichert wird – und lässt die Pflicht bestehen', async () => {
    mocks.updateUser.mockResolvedValue({ data: { user: { id: 'u1', user_metadata: { muss_passwort_aendern: true } } }, error: null });
    await starten();
    await userEvent.click(screen.getByText('ändern'));
    await waitFor(() => expect(letzteAntwort).toMatch(/Bestätigung konnte nicht gespeichert werden/));
    expect(screen.getByTestId('muss')).toHaveTextContent('true');
  });

  it('gibt Serverfehler als verständlichen Text zurück und ändert nichts', async () => {
    mocks.updateUser.mockResolvedValue({ data: { user: null }, error: { message: 'New password should be different from the old password.' } });
    await starten();
    await userEvent.click(screen.getByText('ändern'));
    await waitFor(() => expect(letzteAntwort).toMatch(/unterscheiden/));
    expect(screen.getByTestId('muss')).toHaveTextContent('true');
  });
});
