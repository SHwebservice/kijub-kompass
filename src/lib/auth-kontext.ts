import { createContext, useContext } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Ich, Rollen } from './rollen';

export type AuthStatus = 'laedt' | 'abgemeldet' | 'keine_person' | 'bereit' | 'fehler';

export interface AuthWert {
  status: AuthStatus;
  session: Session | null;
  ich: Ich | null;
  rollen: Rollen | null;
  fehler: string | null;
  /** true, solange die Person noch das von der Koordination vergebene Startpasswort benutzt. */
  mussPasswortAendern: boolean;
  /** Die folgenden Funktionen liefern eine Fehlermeldung oder null bei Erfolg. */
  anmelden: (mail: string, passwort: string) => Promise<string | null>;
  passwortAendern: (neu: string) => Promise<string | null>;
  abmelden: () => Promise<void>;
}

export const AuthKontext = createContext<AuthWert | null>(null);

export function useAuth(): AuthWert {
  const v = useContext(AuthKontext);
  if (!v) throw new Error('useAuth außerhalb von AuthProvider verwendet');
  return v;
}
