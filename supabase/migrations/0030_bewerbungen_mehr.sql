-- KiJuB-Kompass · 0030: Bewerbungsfrist einstellbar, Freizeiten für Bewerbungen schließen, Bewerbung für Ferienzeit/-wochen
--
-- 1) Die Frist „Bewerbung bis n Tage vor Beginn“ (einstellungen.bewerbung_vorlauf_tage) ändert nur die Freizeitenkoordination, 0 bis 90 Tage.
-- 2) freizeiten.bewerbung_offen: Ist eine Freizeit voll, schließt die Freizeitenkoordination sie für Bewerbungen; neue Bewerbungen
--    lehnt die Datenbank dann ab (bestehende bleiben und werden wie bisher entschieden).
-- 3) bewerbungen_zeitraum: Mitarbeitende bewerben sich für eine Ferienzeit eines Jahres – optional nur für bestimmte Wochen –, ohne eine
--    Freizeit zu wählen. Die Freizeitenkoordination ordnet sie einer passenden Freizeit zu (fn_zeitraum_zuordnen); dabei entsteht eine
--    angenommene Bewerbung für diese Freizeit, sodass die Person wie gewohnt „Bewerbung angenommen“ erfährt. Mitteilung an die
--    Freizeitenkoordination bei neuer Zeitraum-Bewerbung; auf der Startseite zählen offene Zeitraum-Bewerbungen bei „Bewerbungen“ mit.

-- ===== 1) Bewerbungsfrist =====
do $$
declare r record;
begin
  for r in select policyname, qual, with_check from pg_policies where schemaname = 'public' and tablename = 'einstellungen' and policyname <> 'lesen' loop
    execute format('alter policy %I on public.einstellungen %s %s', r.policyname,
      case when r.qual is not null then format('using (%s)', replace(replace(r.qual, 'ist_koord()', 'ist_freizeitkoord()'), 'ist_treffkoord()', 'ist_freizeitkoord()')) else '' end,
      case when r.with_check is not null then format('with check (%s)', replace(replace(r.with_check, 'ist_koord()', 'ist_freizeitkoord()'), 'ist_treffkoord()', 'ist_freizeitkoord()')) else '' end);
  end loop;
end $$;
alter table einstellungen add constraint einstellungen_vorlauf_check
  check (schluessel <> 'bewerbung_vorlauf_tage' or (jsonb_typeof(wert) = 'number' and (wert #>> '{}')::numeric between 0 and 90 and (wert #>> '{}')::numeric = trunc((wert #>> '{}')::numeric)));

-- ===== 2) Freizeit für Bewerbungen schließen =====
alter table freizeiten add column bewerbung_offen boolean not null default true;

drop policy anlegen on bewerbungen;
create policy anlegen on bewerbungen for insert to authenticated
  with check (
    person_id = meine_person_id() and ist_bewerbend() and status = 'offen'
    and not ist_im_team(freizeit_id)
    and exists (select 1 from freizeiten f
                 where f.id = freizeit_id and f.status = 'geplant' and f.bewerbung_offen
                   and f.start_datum >= current_date +
                       coalesce((select (wert #>> '{}')::int from einstellungen
                                  where schluessel = 'bewerbung_vorlauf_tage'), 7)));

-- ===== 3) Bewerbung für eine Ferienzeit =====
create table bewerbungen_zeitraum (
  id              uuid primary key default gen_random_uuid(),
  person_id       uuid not null references personen(id) on delete cascade,
  jahr            int  not null check (jahr between 2020 and 2100),
  ferienzeitraum  ferienzeitraum_t not null,
  wochen          smallint[] not null default '{}',              -- leer = jede Woche der Ferienzeit
  notiz           text check (notiz is null or length(notiz) <= 2000),
  status          text not null default 'offen' check (status in ('offen', 'erledigt')),
  erledigt_von    uuid references personen(id) on delete set null,
  erledigt_am     timestamptz,
  created_at      timestamptz not null default now(),
  unique (person_id, jahr, ferienzeitraum),
  check (wochen <@ array[1,2,3,4,5,6]::smallint[]
         and (ferienzeitraum = 'sommer' or wochen <@ array[1,2]::smallint[]))
);
create index bewerbungen_zeitraum_offen on bewerbungen_zeitraum (status, jahr);

create function fn_zeitraum_pruefen() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now(); new.erledigt_von := null; new.erledigt_am := null;
    if not ist_freizeitkoord() then new.status := 'offen'; end if;
  else
    if new.person_id is distinct from old.person_id or new.jahr is distinct from old.jahr or new.ferienzeitraum is distinct from old.ferienzeitraum then
      raise exception 'Person, Jahr und Ferienzeit einer Bewerbung lassen sich nicht ändern' using errcode = 'check_violation';
    end if;
    new.created_at := old.created_at;
    if new.status is distinct from old.status then
      new.erledigt_von := case when new.status = 'erledigt' then meine_person_id() end;
      new.erledigt_am := case when new.status = 'erledigt' then now() end;
    else
      new.erledigt_von := old.erledigt_von; new.erledigt_am := old.erledigt_am;
    end if;
  end if;
  new.wochen := array(select distinct w from unnest(new.wochen) w order by w);
  return new;
end $$;
revoke execute on function fn_zeitraum_pruefen() from public, anon;
create trigger bewerbungen_zeitraum_pruefen before insert or update on bewerbungen_zeitraum for each row execute function fn_zeitraum_pruefen();

alter table bewerbungen_zeitraum enable row level security;
revoke all on bewerbungen_zeitraum from anon;
grant select, insert, update, delete on bewerbungen_zeitraum to authenticated;
create policy lesen on bewerbungen_zeitraum for select to authenticated using (person_id = meine_person_id() or ist_freizeitkoord());
create policy anlegen on bewerbungen_zeitraum for insert to authenticated
  with check (person_id = meine_person_id() and ist_bewerbend() and status = 'offen'
              and jahr >= extract(year from current_date)::int and jahr <= extract(year from current_date)::int + 1);
create policy aendern on bewerbungen_zeitraum for update to authenticated
  using ((person_id = meine_person_id() and status = 'offen') or ist_freizeitkoord())
  with check ((person_id = meine_person_id() and status = 'offen') or ist_freizeitkoord());
create policy zurueckziehen on bewerbungen_zeitraum for delete to authenticated
  using ((person_id = meine_person_id() and status = 'offen') or ist_freizeitkoord());

-- Zuordnen: Die Person kommt ins Team der Freizeit (Rolle wählbar); für die Freizeit entsteht eine angenommene Bewerbung
-- (Grundlage der Mitteilung „Bewerbung angenommen“). Die Zeitraum-Bewerbung bleibt offen, bis die Koordination sie als erledigt markiert.
-- Ergebnis: ID der angenommenen Bewerbung.
create function fn_zeitraum_zuordnen(p_zeitraum uuid, p_freizeit uuid, p_rolle freizeit_rolle default 'teamer') returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare z bewerbungen_zeitraum; f freizeiten; b_id uuid;
begin
  if not ist_freizeitkoord() then raise exception 'Nur die Freizeitenkoordination darf Bewerbungen entscheiden' using errcode = '42501'; end if;
  select * into z from bewerbungen_zeitraum where id = p_zeitraum;
  if z.id is null then raise exception 'Bewerbung nicht gefunden' using errcode = 'check_violation'; end if;
  select * into f from freizeiten where id = p_freizeit;
  if f.id is null or f.status <> 'geplant' then raise exception 'Die Freizeit gibt es nicht oder sie ist abgesagt' using errcode = 'check_violation'; end if;
  insert into bewerbungen (person_id, freizeit_id, notiz, status, entschieden_von, entschieden_am)
  values (z.person_id, f.id, z.notiz, 'angenommen', meine_person_id(), now())
  on conflict (person_id, freizeit_id) do update
     set status = 'angenommen', entschieden_von = excluded.entschieden_von, entschieden_am = excluded.entschieden_am
  returning id into b_id;
  insert into freizeit_team (freizeit_id, person_id, rolle) values (f.id, z.person_id, coalesce(p_rolle, 'teamer'))
    on conflict (freizeit_id, person_id)
    do update set rolle = case when excluded.rolle = 'leitung' then 'leitung'::freizeit_rolle else freizeit_team.rolle end;
  return b_id;
end $$;
revoke execute on function fn_zeitraum_zuordnen(uuid, uuid, freizeit_rolle) from public, anon;
grant execute on function fn_zeitraum_zuordnen(uuid, uuid, freizeit_rolle) to authenticated;

-- Text einer Zeitraum-Bewerbung: „Sommer 2027 (Woche 1, 3)“ bzw. „Ostern 2027“
create function zeitraum_text(z bewerbungen_zeitraum) returns text
language sql immutable set search_path = public, pg_temp as $$
  select case z.ferienzeitraum when 'ostern' then 'Ostern' when 'sommer' then 'Sommer' else 'Herbst' end || ' ' || z.jahr
         || case when cardinality(z.wochen) = 0 then '' else ' (Woche ' || array_to_string(z.wochen, ', ') || ')' end
$$;
revoke execute on function zeitraum_text(bewerbungen_zeitraum) from public, anon;

-- ===== Mitteilung bei neuer Zeitraum-Bewerbung =====
-- Damit die Edge Function unverändert bleibt, behandelt fn_push_vorbereiten die neue Art selbst und reicht alles andere weiter.
alter function fn_push_vorbereiten(text, uuid, jsonb) rename to fn_push_vorbereiten_basis;
revoke execute on function fn_push_vorbereiten_basis(text, uuid, jsonb) from public, anon, authenticated;
create function fn_push_vorbereiten(p_art text, p_ref uuid default null, p_extra jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare z bewerbungen_zeitraum; ich uuid := meine_person_id();
begin
  if p_art = 'bewerbung_zeitraum' then
    select * into z from bewerbungen_zeitraum where id = p_ref and person_id = ich and created_at >= now() - interval '10 minutes';
    if z.id is null then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    return jsonb_build_object(
      'empfaenger', to_jsonb(array(select id from personen where ist_freizeitkoordination and aktiv)),
      'titel', 'Neue Bewerbung', 'text', fn_push_name(ich) || ' bewirbt sich für ' || zeitraum_text(z) || '.', 'url', '/bewerbungen');
  end if;
  return fn_push_vorbereiten_basis(p_art, p_ref, p_extra);
end $$;
revoke execute on function fn_push_vorbereiten(text, uuid, jsonb) from public, anon;
grant execute on function fn_push_vorbereiten(text, uuid, jsonb) to authenticated;

-- ===== Startseite: offene Zeitraum-Bewerbungen zählen bei „Bewerbungen“ mit =====
alter function fn_heute(date, jsonb) rename to fn_heute_basis;
revoke execute on function fn_heute_basis(date, jsonb) from public, anon;          -- fn_heute läuft mit den Rechten der Person und ruft sie auf
create function fn_heute(p_heute date, p_anfrage jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare r jsonb;
begin
  r := fn_heute_basis(p_heute, p_anfrage);
  if coalesce((p_anfrage ->> 'bewerbungen')::boolean, false) then
    r := r || jsonb_build_object('bewerbungen', coalesce((r ->> 'bewerbungen')::int, 0) + (select count(*) from bewerbungen_zeitraum where status = 'offen'));
  end if;
  return r;
end $$;
revoke execute on function fn_heute(date, jsonb) from public, anon;
grant execute on function fn_heute(date, jsonb) to authenticated;
