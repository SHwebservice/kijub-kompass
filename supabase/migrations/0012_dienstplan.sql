-- KiJuB-Kompass · 0012 Dienstplan: Funktionen für Wünsche und Zuteilungen, Live-Aktualisierung
--
-- Ein Dienst-Datensatz für einen regulären Öffnungstag entsteht erst, wenn jemand zuteilt oder einen Dienst wünscht.
-- BetreuerInnen dürfen keine Dienste anlegen – sie wünschen über fn_dienst_wunsch, die den Tag bei Bedarf selbst anlegt.

-- Zuteilungen nur für Personen des Treffs (gilt auch für direkte Schreibzugriffe)
create function fn_zuteilung_pruefen() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from treff_team t join dienste d on d.treff_id = t.treff_id
                  where d.id = new.dienst_id and t.person_id = new.person_id) then
    raise exception 'Die Person gehört nicht zu diesem Treff' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger dienst_zuteilung_pruefen before insert or update on dienst_zuteilungen
  for each row execute function fn_zuteilung_pruefen();

-- Regulären Dienst für einen Öffnungstag anlegen (Zeiten werden aus den Öffnungszeiten kopiert); gibt die ID zurück.
create function fn_dienst_sicherstellen(p_treff uuid, p_datum date) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare oz treff_oeffnungszeiten; d_id uuid;
begin
  if not (ist_koord() or ist_treffleitung(p_treff)) then
    raise exception 'Nur Treffleitung oder Koordination dürfen den Dienstplan ändern' using errcode = '42501';
  end if;
  select id into d_id from dienste where treff_id = p_treff and datum = p_datum and not ist_sonder;
  if d_id is not null then return d_id; end if;
  select * into oz from treff_oeffnungszeiten where treff_id = p_treff and wochentag = extract(isodow from p_datum);
  if oz.treff_id is null then
    raise exception 'An diesem Tag ist der Treff nicht geöffnet' using errcode = 'check_violation';
  end if;
  insert into dienste (treff_id, datum, von, bis) values (p_treff, p_datum, oz.von, oz.bis) returning id into d_id;
  return d_id;
end $$;

-- Dienstwunsch der angemeldeten Person für einen Öffnungstag. Ein abgelehnter Wunsch kann erneut gestellt werden.
create function fn_dienst_wunsch(p_treff uuid, p_datum date) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare oz treff_oeffnungszeiten; d_id uuid; ich uuid := meine_person_id();
begin
  if ich is null or not ist_im_treff(p_treff) then
    raise exception 'Nur Personen aus dem Treff können einen Dienst wünschen' using errcode = '42501';
  end if;
  if p_datum < current_date then
    raise exception 'Für vergangene Tage kann kein Dienst gewünscht werden' using errcode = 'check_violation';
  end if;
  select * into oz from treff_oeffnungszeiten where treff_id = p_treff and wochentag = extract(isodow from p_datum);
  if oz.treff_id is null then
    raise exception 'An diesem Tag ist der Treff nicht geöffnet' using errcode = 'check_violation';
  end if;
  select id into d_id from dienste where treff_id = p_treff and datum = p_datum and not ist_sonder;
  if d_id is null then
    insert into dienste (treff_id, datum, von, bis) values (p_treff, p_datum, oz.von, oz.bis) returning id into d_id;
  end if;
  if exists (select 1 from dienst_zuteilungen where dienst_id = d_id and person_id = ich) then
    raise exception 'Du bist an diesem Tag schon eingeteilt' using errcode = 'check_violation';
  end if;
  insert into dienst_wuensche (dienst_id, person_id) values (d_id, ich)
  on conflict (dienst_id, person_id) do update
     set status = 'offen', entschieden_von = null, created_at = now()
   where dienst_wuensche.status = 'abgelehnt';
end $$;

-- Wunsch beantworten: bestätigen teilt die Person zugleich ein.
create function fn_wunsch_entscheiden(p_dienst uuid, p_person uuid, p_bestaetigen boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare tid uuid := treff_von_dienst(p_dienst);
begin
  if not (ist_koord() or ist_treffleitung(tid)) then
    raise exception 'Nur Treffleitung oder Koordination dürfen Wünsche beantworten' using errcode = '42501';
  end if;
  update dienst_wuensche
     set status = case when p_bestaetigen then 'bestaetigt'::wunsch_status else 'abgelehnt'::wunsch_status end,
         entschieden_von = meine_person_id()
   where dienst_id = p_dienst and person_id = p_person and status = 'offen';
  if not found then
    raise exception 'Wunsch nicht gefunden oder bereits beantwortet' using errcode = 'check_violation';
  end if;
  if p_bestaetigen then
    insert into dienst_zuteilungen (dienst_id, person_id) values (p_dienst, p_person) on conflict do nothing;
  end if;
end $$;

-- Live-Aktualisierung des Dienstplans (nur Zeilen, die die Person laut Zugriffsregeln sehen darf).
-- Abwesenheiten und Nachweise bleiben bewusst draußen: sie sind personenbezogen.
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['dienste', 'dienst_zuteilungen', 'dienst_wuensche', 'dienstplan_kommentare',
                             'feiertage', 'treff_team', 'treff_plan_eintraege'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- Ausführungsrechte wie bei den übrigen Funktionen (Migration 0007): nur angemeldete Personen
revoke execute on function fn_dienst_sicherstellen(uuid, date), fn_dienst_wunsch(uuid, date),
  fn_wunsch_entscheiden(uuid, uuid, boolean), fn_zuteilung_pruefen() from public, anon;
grant execute on function fn_dienst_sicherstellen(uuid, date), fn_dienst_wunsch(uuid, date),
  fn_wunsch_entscheiden(uuid, uuid, boolean) to authenticated;
