-- KiJuB-Kompass · 0036: Dienstplan übersichtlicher planen und schneller einsehen
--
-- 1) Monatsplan veröffentlichen (dienstplan_monate): Solange ein Monat „in Planung“ ist, schickt die App bei Änderungen keine
--    Mitteilungen; mit „Veröffentlichen“ bekommt das Team eine einzige Mitteilung (Art 'dienstplan_veroeffentlicht'). Danach gibt es
--    wie bisher Mitteilungen bei Änderungen. Monate, in denen es vor dieser Migration schon Dienste gab, gelten als veröffentlicht.
-- 2) „Kann nicht“ (dienst_verhinderungen): Mitarbeitende markieren künftige Tage ihres Treffs, an denen sie nicht können. Das ist keine
--    Abwesenheit (die trägt die Treffleitung ein), sondern ein Hinweis für die Planung. Sehen dürfen es die Person selbst, die Treffleitung
--    und die Treffkoordination. Steht die Person an dem Tag schon im Dienst, bekommt die Treffleitung eine Mitteilung (Art 'verhindert').
-- 3) Mindestbesetzung je Treff (treffs.mindestbesetzung): Öffnungstage mit weniger Personen gelten als „unterbesetzt“.
--    Treffleitung und Treffkoordination ändern sie mit fn_mindestbesetzung_setzen.
-- 4) Seit wann jemand eingeteilt ist (dienst_zuteilungen.created_at): für „neu eingeteilt seit deinem letzten Besuch“.
--    Bestehende Einteilungen bleiben ohne Zeitpunkt (gelten nicht als neu).
-- 5) Kalender: fn_meine_dienste_ics liefert die eigenen Dienste als iCalendar-Text (Download); ein persönlicher Abo-Link
--    (kalender_abos, nur der Hash des Schlüssels wird gespeichert) erlaubt der Edge Function `kalender`, denselben Text ohne Anmeldung
--    auszuliefern. Der Link lässt sich jederzeit neu erzeugen (der alte wird ungültig) oder löschen.

-- ===== 1) Veröffentlichte Monate =====
create table dienstplan_monate (
  treff_id            uuid not null references treffs(id) on delete cascade,
  monat               date not null check (extract(day from monat) = 1),
  veroeffentlicht_von uuid references personen(id) on delete set null,
  veroeffentlicht_am  timestamptz not null default now(),
  primary key (treff_id, monat)
);

create function fn_dienstplan_monat_pruefen() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  new.veroeffentlicht_von := meine_person_id();
  new.veroeffentlicht_am := now();
  return new;
end $$;
revoke execute on function fn_dienstplan_monat_pruefen() from public, anon, authenticated;
create trigger dienstplan_monate_pruefen before insert on dienstplan_monate for each row execute function fn_dienstplan_monat_pruefen();

alter table dienstplan_monate enable row level security;
revoke all on dienstplan_monate from anon;
grant select, insert, delete on dienstplan_monate to authenticated;
create policy lesen on dienstplan_monate for select to authenticated using (ist_treffkoord() or ist_im_treff(treff_id));
create policy veroeffentlichen on dienstplan_monate for insert to authenticated with check (ist_treffkoord() or ist_treffleitung(treff_id));
create policy zuruecknehmen on dienstplan_monate for delete to authenticated using (ist_treffkoord() or ist_treffleitung(treff_id));

-- Bisherige Monate mit Diensten gelten als veröffentlicht (so ändert sich für laufende Pläne nichts)
insert into dienstplan_monate (treff_id, monat)
select distinct treff_id, date_trunc('month', datum)::date from dienste;

-- ===== 2) „Kann nicht“ =====
create table dienst_verhinderungen (
  treff_id   uuid not null references treffs(id) on delete cascade,
  person_id  uuid not null references personen(id) on delete cascade,
  datum      date not null,
  created_at timestamptz not null default now(),
  primary key (treff_id, person_id, datum)
);
create index dienst_verhinderungen_datum on dienst_verhinderungen (treff_id, datum);

alter table dienst_verhinderungen enable row level security;
revoke all on dienst_verhinderungen from anon;
grant select, insert, delete on dienst_verhinderungen to authenticated;
create policy lesen on dienst_verhinderungen for select to authenticated
  using (person_id = meine_person_id() or ist_treffkoord() or ist_treffleitung(treff_id));
create policy eintragen on dienst_verhinderungen for insert to authenticated
  with check (person_id = meine_person_id() and ist_im_treff(treff_id) and datum >= (now() at time zone 'Europe/Berlin')::date);
create policy zuruecknehmen on dienst_verhinderungen for delete to authenticated using (person_id = meine_person_id());

-- Wer einen Treff verlässt, dessen künftige „kann nicht“ fallen weg (wie Dienste und Wünsche, Migration 0021)
create function fn_treff_team_verhinderungen_aufraeumen() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from dienst_verhinderungen where treff_id = old.treff_id and person_id = old.person_id;
  return old;
end $$;
revoke execute on function fn_treff_team_verhinderungen_aufraeumen() from public, anon, authenticated;
create trigger treff_team_verhinderungen_aufraeumen after delete on treff_team for each row execute function fn_treff_team_verhinderungen_aufraeumen();

-- ===== 3) Mindestbesetzung =====
alter table treffs add column mindestbesetzung smallint not null default 1 check (mindestbesetzung between 1 and 20);

create function fn_mindestbesetzung_setzen(p_treff uuid, p_anzahl integer) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not (ist_treffkoord() or ist_treffleitung(p_treff)) then
    raise exception 'Nur Treffleitung und Treffkoordination dürfen die Mindestbesetzung ändern' using errcode = '42501';
  end if;
  if p_anzahl is null or p_anzahl < 1 or p_anzahl > 20 then
    raise exception 'Die Mindestbesetzung muss zwischen 1 und 20 liegen' using errcode = 'check_violation';
  end if;
  update treffs set mindestbesetzung = p_anzahl where id = p_treff;
end $$;
revoke execute on function fn_mindestbesetzung_setzen(uuid, integer) from public, anon;
grant execute on function fn_mindestbesetzung_setzen(uuid, integer) to authenticated;

-- ===== 4) Zeitpunkt der Einteilung =====
alter table dienst_zuteilungen add column created_at timestamptz;
alter table dienst_zuteilungen alter column created_at set default now();

-- ===== 5) Kalender =====
create table kalender_abos (
  person_id  uuid primary key references personen(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now()
);
alter table kalender_abos enable row level security;
revoke all on kalender_abos from anon, authenticated;
-- Kein direkter Zugriff: Anlegen, Prüfen und Löschen nur über die Funktionen unten.

create function fn_ics_text(t text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select replace(replace(replace(replace(replace(coalesce(t, ''), '\', '\\'), ';', '\;'), ',', '\,'), chr(13), ''), chr(10), '\n')
$$;
revoke execute on function fn_ics_text(text) from public, anon, authenticated;

-- iCalendar-Text mit den Diensten einer Person (60 Tage zurück bis ein Jahr voraus). Monate „in Planung“ erscheinen als vorläufig.
create function fn_ics_fuer_person(p_person uuid) returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  nl text := chr(13) || chr(10);
  r record; ics text; ort text; titel text;
  stempel text := to_char(now() at time zone 'utc', 'YYYYMMDD"T"HH24MISS"Z"');
begin
  ics := 'BEGIN:VCALENDAR' || nl || 'VERSION:2.0' || nl || 'PRODID:-//KiJuB-Kompass//Dienste//DE' || nl || 'CALSCALE:GREGORIAN' || nl
    || 'METHOD:PUBLISH' || nl || 'X-WR-CALNAME:Meine Dienste (KiJuB-Kompass)' || nl || 'X-WR-TIMEZONE:Europe/Berlin' || nl
    || 'REFRESH-INTERVAL;VALUE=DURATION:PT6H' || nl || 'X-PUBLISHED-TTL:PT6H' || nl
    || 'BEGIN:VTIMEZONE' || nl || 'TZID:Europe/Berlin' || nl
    || 'BEGIN:DAYLIGHT' || nl || 'TZOFFSETFROM:+0100' || nl || 'TZOFFSETTO:+0200' || nl || 'TZNAME:CEST' || nl
    || 'DTSTART:19700329T020000' || nl || 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU' || nl || 'END:DAYLIGHT' || nl
    || 'BEGIN:STANDARD' || nl || 'TZOFFSETFROM:+0200' || nl || 'TZOFFSETTO:+0100' || nl || 'TZNAME:CET' || nl
    || 'DTSTART:19701025T030000' || nl || 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU' || nl || 'END:STANDARD' || nl
    || 'END:VTIMEZONE' || nl;
  for r in
    select d.id, d.datum, d.von, d.bis, d.ist_sonder, d.bezeichnung, t.name as treff, t.adresse_abw, o.name as ort_name, o.adresse as ort_adresse,
           exists (select 1 from dienstplan_monate m where m.treff_id = d.treff_id and m.monat = date_trunc('month', d.datum)::date) as fest
      from dienst_zuteilungen z join dienste d on d.id = z.dienst_id join treffs t on t.id = d.treff_id left join orte o on o.id = t.ort_id
     where z.person_id = p_person and d.datum between current_date - 60 and current_date + 366
     order by d.datum, d.von nulls first
  loop
    titel := case when r.ist_sonder then 'Sonderdienst: ' || r.bezeichnung || ' · ' || r.treff else 'Dienst · ' || r.treff end;
    ort := coalesce(nullif(trim(r.adresse_abw), ''), nullif(concat_ws(', ', r.ort_name, nullif(trim(r.ort_adresse), '')), ''));
    ics := ics || 'BEGIN:VEVENT' || nl || 'UID:' || r.id || '@kijub-kompass' || nl || 'DTSTAMP:' || stempel || nl;
    if r.von is not null and r.bis is not null then
      ics := ics || 'DTSTART;TZID=Europe/Berlin:' || to_char(r.datum, 'YYYYMMDD') || 'T' || to_char(r.von, 'HH24MISS') || nl
                 || 'DTEND;TZID=Europe/Berlin:' || to_char(r.datum, 'YYYYMMDD') || 'T' || to_char(r.bis, 'HH24MISS') || nl;
    else
      ics := ics || 'DTSTART;VALUE=DATE:' || to_char(r.datum, 'YYYYMMDD') || nl || 'DTEND;VALUE=DATE:' || to_char(r.datum + 1, 'YYYYMMDD') || nl;
    end if;
    ics := ics || 'SUMMARY:' || fn_ics_text(left(titel, 120)) || nl;
    if ort is not null then ics := ics || 'LOCATION:' || fn_ics_text(left(ort, 200)) || nl; end if;
    if not r.fest then ics := ics || 'DESCRIPTION:' || fn_ics_text('Vorläufig: Der Dienstplan dieses Monats ist noch in Planung.') || nl; end if;
    ics := ics || 'STATUS:' || case when r.fest then 'CONFIRMED' else 'TENTATIVE' end || nl || 'END:VEVENT' || nl;
  end loop;
  return ics || 'END:VCALENDAR' || nl;
end $$;
revoke execute on function fn_ics_fuer_person(uuid) from public, anon, authenticated;

create function fn_meine_dienste_ics() returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare ich uuid := meine_person_id();
begin
  if ich is null or not ist_aktive_person() then raise exception 'Nicht angemeldet' using errcode = '42501'; end if;
  return fn_ics_fuer_person(ich);
end $$;
revoke execute on function fn_meine_dienste_ics() from public, anon;
grant execute on function fn_meine_dienste_ics() to authenticated;

-- Neuer Abo-Link: gibt den Schlüssel einmalig zurück; ein vorhandener Link wird damit ungültig.
create function fn_kalender_link_erneuern() returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare ich uuid := meine_person_id(); schluessel text;
begin
  if ich is null or not ist_aktive_person() then raise exception 'Nicht angemeldet' using errcode = '42501'; end if;
  schluessel := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into kalender_abos (person_id, token_hash) values (ich, encode(sha256(convert_to(schluessel, 'UTF8')), 'hex'))
  on conflict (person_id) do update set token_hash = excluded.token_hash, created_at = now();
  return schluessel;
end $$;

create function fn_kalender_link_entfernen() returns void
language sql security definer set search_path = public, pg_temp as $$
  delete from kalender_abos where person_id = meine_person_id()
$$;

-- Seit wann es einen Abo-Link gibt (null = keiner)
create function fn_kalender_link_seit() returns timestamptz
language sql stable security definer set search_path = public, pg_temp as $$
  select created_at from kalender_abos where person_id = meine_person_id()
$$;

revoke execute on function fn_kalender_link_erneuern(), fn_kalender_link_entfernen(), fn_kalender_link_seit() from public, anon;
grant execute on function fn_kalender_link_erneuern(), fn_kalender_link_entfernen(), fn_kalender_link_seit() to authenticated;

-- Für die Edge Function `kalender` (nur mit dem Service-Schlüssel): Kalender zum Schlüssel, null bei unbekanntem Schlüssel oder inaktiver Person.
create function fn_kalender_ics(p_token text) returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare pid uuid;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return null; end if;
  select a.person_id into pid from kalender_abos a join personen p on p.id = a.person_id
   where a.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') and p.aktiv;
  if pid is null then return null; end if;
  return fn_ics_fuer_person(pid);
end $$;
revoke execute on function fn_kalender_ics(text) from public, anon, authenticated;
grant execute on function fn_kalender_ics(text) to service_role;

-- ===== Live-Aktualisierung: veröffentlichte Monate (keine personenbezogenen Daten) =====
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'dienstplan_monate') then
    alter publication supabase_realtime add table public.dienstplan_monate;
  end if;
end $$;

-- ===== Mitteilungen: Plan veröffentlicht (ans Team), „kann nicht“ trotz Einteilung (an die Treffleitung) =====
create or replace function fn_push_vorbereiten(p_art text, p_ref uuid default null, p_extra jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare z bewerbungen_zeitraum; a materialliste_abgabe; f freizeiten; tp treff_teamprotokolle; t treffs; ich uuid := meine_person_id();
  m dienstplan_monate; v dienst_verhinderungen; v_monat date; v_datum date;
  monate text[] := array['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
begin
  if p_art = 'bewerbung_zeitraum' then
    select * into z from bewerbungen_zeitraum where id = p_ref and person_id = ich and created_at >= now() - interval '10 minutes';
    if z.id is null then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    return jsonb_build_object(
      'empfaenger', to_jsonb(array(select id from personen where ist_freizeitkoordination and aktiv)),
      'titel', 'Neue Bewerbung', 'text', fn_push_name(ich) || ' bewirbt sich für ' || zeitraum_text(z) || '.', 'url', '/bewerbungen');
  elsif p_art = 'materialliste' then
    select * into a from materialliste_abgabe where freizeit_id = p_ref and abgegeben_von = ich and abgegeben_am >= now() - interval '10 minutes';
    if a.freizeit_id is null then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    select * into f from freizeiten where id = p_ref;
    return jsonb_build_object(
      'empfaenger', to_jsonb(array(select id from personen where ist_freizeitkoordination and aktiv and id <> ich)),
      'titel', 'Materialliste · ' || f.name, 'text', fn_push_name(ich) || ' hat die Materialliste abgegeben (' ||
        (select count(*) from freizeit_materialliste where freizeit_id = f.id) || ' Positionen).', 'url', '/freizeiten/' || f.id || '/material');
  elsif p_art = 'teamprotokoll' then
    select * into tp from treff_teamprotokolle where id = p_ref and erstellt_von = ich and created_at >= now() - interval '10 minutes';
    if tp.id is null then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    select * into t from treffs where id = tp.treff_id;
    return jsonb_build_object(
      'empfaenger', to_jsonb(array(select tm.person_id from treff_team tm join personen p on p.id = tm.person_id
                                   where tm.treff_id = t.id and p.aktiv and tm.person_id <> ich)),
      'titel', 'Neues Teamprotokoll · ' || t.name,
      'text', tp.titel || ' (' || to_char(tp.datum, 'DD.MM.YYYY') || ') – bitte lesen.',
      'url', '/treffs/' || t.id || '/teamprotokolle');
  elsif p_art = 'dienstplan_veroeffentlicht' then
    v_monat := (p_extra ->> 'monat')::date;
    select * into m from dienstplan_monate where treff_id = p_ref and monat = v_monat and veroeffentlicht_von = ich and veroeffentlicht_am >= now() - interval '10 minutes';
    if m.treff_id is null then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    select * into t from treffs where id = p_ref;
    return jsonb_build_object(
      'empfaenger', to_jsonb(array(select tm.person_id from treff_team tm join personen p on p.id = tm.person_id
                                   where tm.treff_id = t.id and p.aktiv and tm.person_id <> ich)),
      'titel', 'Dienstplan · ' || t.name,
      'text', 'Der Dienstplan für ' || monate[extract(month from v_monat)::int] || ' ' || extract(year from v_monat)::int || ' steht. Schau nach, wann du eingeteilt bist.',
      'url', '/treffs/' || t.id || '/dienstplan?ansicht=monat&datum=' || to_char(v_monat, 'YYYY-MM-DD'));
  elsif p_art = 'verhindert' then
    v_datum := (p_extra ->> 'datum')::date;
    select * into v from dienst_verhinderungen where treff_id = p_ref and person_id = ich and datum = v_datum and created_at >= now() - interval '10 minutes';
    if v.treff_id is null or not exists (select 1 from dienst_zuteilungen dz join dienste d on d.id = dz.dienst_id
                                          where d.treff_id = p_ref and d.datum = v_datum and dz.person_id = ich) then
      raise exception 'Mitteilung nicht zulässig' using errcode = '42501';
    end if;
    select * into t from treffs where id = p_ref;
    return jsonb_build_object(
      'empfaenger', to_jsonb(array(select tm.person_id from treff_team tm join personen p on p.id = tm.person_id
                                   where tm.treff_id = t.id and tm.rolle = 'treffleitung' and p.aktiv and tm.person_id <> ich)),
      'titel', 'Kann nicht · ' || t.name,
      'text', fn_push_name(ich) || ' kann am ' || to_char(v_datum, 'DD.MM.YYYY') || ' nicht, ist aber eingeteilt.',
      'url', '/treffs/' || t.id || '/dienstplan?datum=' || to_char(v_datum, 'YYYY-MM-DD'));
  end if;
  return fn_push_vorbereiten_basis(p_art, p_ref, p_extra);
end $$;
