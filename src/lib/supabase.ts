import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** false, solange .env nicht ausgefüllt ist – die App zeigt dann eine Einrichtungshilfe. */
export const konfiguriert = Boolean(url && key && !url.includes('DEIN-PROJEKT'));

export const supabase: SupabaseClient = createClient(
  url ?? 'http://localhost:54321',
  key ?? 'nicht-konfiguriert',
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } },
);
