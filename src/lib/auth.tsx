import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, konfiguriert } from './supabase';
import { AuthKontext, type AuthWert, type AuthStatus } from './auth-kontext';
import { authFehlerText } from './auth-fehler';
import {
  berechneRollen, type FreizeitZuordnung, type Ich, type Rollen, type TreffZuordnung,
} from './rollen';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(konfiguriert ? 'laedt' : 'abgemeldet');
  const [session, setSession] = useState<Session | null>(null);
  const [ich, setIch] = useState<Ich | null>(null);
  const [rollen, setRollen] = useState<Rollen | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  const laden = useCallback(async (s: Session | null) => {
    setSession(s);
    if (!s) { setIch(null); setRollen(null); setStatus('abgemeldet'); return; }
    const { data: person, error } = await supabase
      .from('personen')
      .select('id, vorname, nachname, mail, kategorie, ist_koordination')
      .eq('auth_user_id', s.user.id)
      .maybeSingle();
    if (error) { setFehler(error.message); setStatus('fehler'); return; }
    if (!person) { setIch(null); setRollen(null); setStatus('keine_person'); return; }
    const [fz, tf] = await Promise.all([
      supabase.from('freizeit_team').select('freizeit_id, rolle').eq('person_id', person.id),
      supabase.from('treff_team').select('treff_id, rolle').eq('person_id', person.id),
    ]);
    const teamFehler = fz.error ?? tf.error;
    if (teamFehler) { setFehler(teamFehler.message); setStatus('fehler'); return; }
    const p = person as Ich;
    setIch(p);
    setRollen(berechneRollen(p, (fz.data ?? []) as FreizeitZuordnung[], (tf.data ?? []) as TreffZuordnung[]));
    setFehler(null);
    setStatus('bereit');
  }, []);

  useEffect(() => {
    if (!konfiguriert) return;
    void supabase.auth.getSession().then(({ data }) => laden(data.session));
    const { data } = supabase.auth.onAuthStateChange((_ereignis, s) => {
      // Nicht innerhalb des Callbacks auf Supabase warten (Deadlock-Gefahr) – Aufgabe verschieben.
      setTimeout(() => { void laden(s); }, 0);
    });
    return () => data.subscription.unsubscribe();
  }, [laden]);

  const anmelden = useCallback(async (mail: string, passwort: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: mail.trim(), password: passwort });
    return error ? authFehlerText(error.message) : null;
  }, []);

  const passwortAendern = useCallback(async (neu: string) => {
    const { error } = await supabase.auth.updateUser({ password: neu, data: { muss_passwort_aendern: false } });
    return error ? authFehlerText(error.message) : null;
  }, []);

  const abmelden = useCallback(async () => { await supabase.auth.signOut(); }, []);

  const mussPasswortAendern = session?.user.user_metadata?.muss_passwort_aendern === true;

  const wert = useMemo<AuthWert>(
    () => ({ status, session, ich, rollen, fehler, mussPasswortAendern, anmelden, passwortAendern, abmelden }),
    [status, session, ich, rollen, fehler, mussPasswortAendern, anmelden, passwortAendern, abmelden],
  );
  return <AuthKontext.Provider value={wert}>{children}</AuthKontext.Provider>;
}
