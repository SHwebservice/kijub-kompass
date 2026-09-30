-- KiJuB-Kompass · 0008 Standardrechte für künftige Objekte
-- Supabase vergibt für neu angelegte Tabellen und Funktionen im Schema "public" automatisch Rechte an
-- die Rolle "anon" (nicht angemeldet). Das wird hier abgestellt, damit auch künftige Migrationen
-- nicht versehentlich anonym zugänglich sind. Angemeldete Personen bekommen Rechte weiterhin
-- ausdrücklich pro Migration (grant) – ohne Policy sehen sie trotzdem nichts.
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on functions from anon;
alter default privileges in schema public revoke all on sequences from anon;
