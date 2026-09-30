-- KiJuB-Kompass · 0011 Live-Aktualisierung (Supabase Realtime)
-- Die Tabellen der Freizeiten melden Änderungen an angemeldete Geräte, damit Wochenplan, Hinweise, Team und
-- Lebensmittel bei allen sofort aktuell sind. Es werden nur Zeilen geliefert, die die jeweilige Person laut
-- Zugriffsregeln (RLS) auch lesen darf. In Umgebungen ohne Realtime (z. B. den lokalen Tests) passiert nichts.
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['plan_eintraege', 'freizeit_slots', 'notizen', 'notiz_bestaetigungen', 'notiz_kommentare',
                             'freizeit_team', 'lebensmittel_eingang', 'lebensmittel_verbrauch'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
